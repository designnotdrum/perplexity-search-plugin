// plugins/shared-memory/src/chess-timer/session-store.ts

import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type {
  WorkSession,
  WorkSegment,
  WorkMetrics,
  SessionStatus,
  WorkType,
  ListSessionsInput,
} from './types';

export interface CreateSessionInput {
  feature_id: string;
  description: string;
  scope: string;
  work_type?: WorkType;
}

export interface AddMetricsInput {
  files_touched?: number;
  lines_added?: number;
  lines_removed?: number;
  complexity_rating?: number;
  work_type: WorkType;
}

export interface CompleteSessionInput {
  satisfaction?: number;
  notes?: string;
  metrics?: {
    files_touched?: number;
    lines_added?: number;
    lines_removed?: number;
    complexity_rating?: number;
    work_type?: WorkType;
  };
}

interface DbWorkSession {
  id: string;
  feature_id: string;
  feature_description: string;
  scope: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  total_active_seconds: number;
  satisfaction: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DbWorkSegment {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  trigger_start: string;
  trigger_end: string | null;
}

interface DbWorkMetrics {
  id: string;
  session_id: string;
  files_touched: number;
  lines_added: number;
  lines_removed: number;
  complexity_rating: number;
  work_type: string;
  recorded_at: string;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS work_sessions (
        id TEXT PRIMARY KEY,
        feature_id TEXT NOT NULL,
        feature_description TEXT NOT NULL,
        scope TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        total_active_seconds INTEGER NOT NULL DEFAULT 0,
        satisfaction INTEGER,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_segments (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        trigger_start TEXT NOT NULL,
        trigger_end TEXT,
        FOREIGN KEY (session_id) REFERENCES work_sessions(id)
      );

      CREATE TABLE IF NOT EXISTS work_metrics (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        files_touched INTEGER NOT NULL DEFAULT 0,
        lines_added INTEGER NOT NULL DEFAULT 0,
        lines_removed INTEGER NOT NULL DEFAULT 0,
        complexity_rating INTEGER NOT NULL DEFAULT 3,
        work_type TEXT NOT NULL DEFAULT 'other',
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES work_sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_scope ON work_sessions(scope);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON work_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_segments_session ON work_segments(session_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_session ON work_metrics(session_id);
    `);
  }

  createSession(input: CreateSessionInput): WorkSession {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_sessions
        (id, feature_id, feature_description, scope, status, started_at, total_active_seconds, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, 0, ?, ?)
    `);

    stmt.run(id, input.feature_id, input.description, input.scope, now, now, now);

    // Create initial segment
    this.createSegmentInternal(id, 'session_start');

    // Create initial metrics if work_type provided
    if (input.work_type) {
      this.createMetricsInternal(id, { work_type: input.work_type });
    }

    return this.getSession(id)!;
  }

  getSession(id: string): WorkSession | null {
    const stmt = this.db.prepare('SELECT * FROM work_sessions WHERE id = ?');
    const row = stmt.get(id) as DbWorkSession | undefined;
    return row ? this.toSession(row) : null;
  }

  getActiveSession(scope: string): WorkSession | null {
    const stmt = this.db.prepare(`
      SELECT * FROM work_sessions
      WHERE scope = ? AND status IN ('active', 'paused')
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    const row = stmt.get(scope) as DbWorkSession | undefined;
    return row ? this.toSession(row) : null;
  }

  getSegments(sessionId: string): WorkSegment[] {
    const stmt = this.db.prepare('SELECT * FROM work_segments WHERE session_id = ? ORDER BY started_at');
    const rows = stmt.all(sessionId) as DbWorkSegment[];
    return rows.map((r) => this.toSegment(r));
  }

  getMetrics(sessionId: string): WorkMetrics[] {
    const stmt = this.db.prepare('SELECT * FROM work_metrics WHERE session_id = ? ORDER BY recorded_at');
    const rows = stmt.all(sessionId) as DbWorkMetrics[];
    return rows.map((r) => this.toMetrics(r));
  }

  updateSessionStatus(sessionId: string, status: SessionStatus): void {
    const now = new Date().toISOString();

    if (status === 'completed' || status === 'abandoned') {
      const stmt = this.db.prepare(`
        UPDATE work_sessions
        SET status = ?, completed_at = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(status, now, now, sessionId);
    } else {
      const stmt = this.db.prepare(`
        UPDATE work_sessions
        SET status = ?, updated_at = ?
        WHERE id = ?
      `);
      stmt.run(status, now, sessionId);
    }
  }

  updateTotalActiveSeconds(sessionId: string, totalSeconds: number): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE work_sessions
      SET total_active_seconds = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(totalSeconds, now, sessionId);
  }

  endCurrentSegment(sessionId: string, triggerEnd: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE work_segments
      SET ended_at = ?, trigger_end = ?
      WHERE session_id = ? AND ended_at IS NULL
    `);
    stmt.run(now, triggerEnd, sessionId);
  }

  createNewSegment(sessionId: string, triggerStart: string): WorkSegment {
    return this.createSegmentInternal(sessionId, triggerStart);
  }

  listSessions(input: ListSessionsInput): WorkSession[] {
    let query = 'SELECT * FROM work_sessions WHERE 1=1';
    const params: (string | number)[] = [];

    if (input.scope) {
      query += ' AND scope = ?';
      params.push(input.scope);
    }

    if (input.status) {
      query += ' AND status = ?';
      params.push(input.status);
    }

    query += ' ORDER BY updated_at DESC';

    if (input.limit) {
      query += ' LIMIT ?';
      params.push(input.limit);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as DbWorkSession[];
    return rows.map((r) => this.toSession(r));
  }

  updateSessionNotes(sessionId: string, notes: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE work_sessions
      SET notes = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(notes, now, sessionId);
  }

  updateSessionSatisfaction(sessionId: string, satisfaction: number): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE work_sessions
      SET satisfaction = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(satisfaction, now, sessionId);
  }

  addMetrics(sessionId: string, input: AddMetricsInput): WorkMetrics {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_metrics
        (id, session_id, files_touched, lines_added, lines_removed, complexity_rating, work_type, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      sessionId,
      input.files_touched ?? 0,
      input.lines_added ?? 0,
      input.lines_removed ?? 0,
      input.complexity_rating ?? 3,
      input.work_type,
      now
    );

    return {
      id,
      session_id: sessionId,
      files_touched: input.files_touched ?? 0,
      lines_added: input.lines_added ?? 0,
      lines_removed: input.lines_removed ?? 0,
      complexity_rating: input.complexity_rating ?? 3,
      work_type: input.work_type,
      recorded_at: new Date(now),
    };
  }

  pauseSession(sessionId: string, reason: string): WorkSession {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'active') {
      throw new Error(`Cannot pause session with status: ${session.status}`);
    }

    // End the current segment
    this.endCurrentSegment(sessionId, reason);

    // Calculate total active time
    const totalSeconds = this.calculateTotalActiveSeconds(sessionId);
    this.updateTotalActiveSeconds(sessionId, totalSeconds);

    // Update status
    this.updateSessionStatus(sessionId, 'paused');

    return this.getSession(sessionId)!;
  }

  resumeSession(sessionId: string): WorkSession {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    if (session.status !== 'paused') {
      throw new Error(`Cannot resume session with status: ${session.status}`);
    }

    // Create a new segment
    this.createNewSegment(sessionId, 'resume');

    // Update status
    this.updateSessionStatus(sessionId, 'active');

    return this.getSession(sessionId)!;
  }

  completeSession(sessionId: string, input: CompleteSessionInput): WorkSession {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // End the current segment if one is open
    const segments = this.getSegments(sessionId);
    const openSegment = segments.find((s) => s.ended_at === null);
    if (openSegment) {
      this.endCurrentSegment(sessionId, 'session_complete');
    }

    // Calculate total active time
    const totalSeconds = this.calculateTotalActiveSeconds(sessionId);
    this.updateTotalActiveSeconds(sessionId, totalSeconds);

    // Update satisfaction if provided
    if (input.satisfaction !== undefined) {
      this.updateSessionSatisfaction(sessionId, input.satisfaction);
    }

    // Update notes if provided
    if (input.notes !== undefined) {
      this.updateSessionNotes(sessionId, input.notes);
    }

    // Add metrics if provided
    if (input.metrics && input.metrics.work_type) {
      this.addMetrics(sessionId, {
        files_touched: input.metrics.files_touched,
        lines_added: input.metrics.lines_added,
        lines_removed: input.metrics.lines_removed,
        complexity_rating: input.metrics.complexity_rating,
        work_type: input.metrics.work_type,
      });
    }

    // Update status to completed
    this.updateSessionStatus(sessionId, 'completed');

    return this.getSession(sessionId)!;
  }

  close(): void {
    this.db.close();
  }

  private calculateTotalActiveSeconds(sessionId: string): number {
    const segments = this.getSegments(sessionId);
    let totalSeconds = 0;

    for (const segment of segments) {
      const startTime = segment.started_at.getTime();
      const endTime = segment.ended_at ? segment.ended_at.getTime() : Date.now();
      totalSeconds += Math.floor((endTime - startTime) / 1000);
    }

    return totalSeconds;
  }

  private createSegmentInternal(sessionId: string, triggerStart: string): WorkSegment {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_segments (id, session_id, started_at, trigger_start)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, sessionId, now, triggerStart);
    return {
      id,
      session_id: sessionId,
      started_at: new Date(now),
      ended_at: null,
      trigger_start: triggerStart,
      trigger_end: null,
    };
  }

  private createMetricsInternal(sessionId: string, input: { work_type: WorkType }): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_metrics (id, session_id, work_type, recorded_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, sessionId, input.work_type, now);
  }

  private toSession(row: DbWorkSession): WorkSession {
    return {
      id: row.id,
      feature_id: row.feature_id,
      feature_description: row.feature_description,
      scope: row.scope,
      status: row.status as SessionStatus,
      started_at: new Date(row.started_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      total_active_seconds: row.total_active_seconds,
      satisfaction: row.satisfaction,
      notes: row.notes,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  private toSegment(row: DbWorkSegment): WorkSegment {
    return {
      id: row.id,
      session_id: row.session_id,
      started_at: new Date(row.started_at),
      ended_at: row.ended_at ? new Date(row.ended_at) : null,
      trigger_start: row.trigger_start,
      trigger_end: row.trigger_end,
    };
  }

  private toMetrics(row: DbWorkMetrics): WorkMetrics {
    return {
      id: row.id,
      session_id: row.session_id,
      files_touched: row.files_touched,
      lines_added: row.lines_added,
      lines_removed: row.lines_removed,
      complexity_rating: row.complexity_rating,
      work_type: row.work_type as WorkType,
      recorded_at: new Date(row.recorded_at),
    };
  }
}
