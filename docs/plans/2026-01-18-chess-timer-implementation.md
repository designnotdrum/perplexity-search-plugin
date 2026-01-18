# Chess Timer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add self-calibrating time estimation to shared-memory that tracks coding sessions, learns patterns, and predicts duration for similar work.

**Architecture:** Extend shared-memory's SQLite database with three new tables (work_sessions, work_segments, work_metrics). Add a SessionStore class for CRUD, a Predictor class for estimates, and 7 new MCP tools. Configuration flags allow opt-out.

**Tech Stack:** TypeScript, SQLite (better-sqlite3), Zod schemas, Jest tests

---

## Task 1: Types and Interfaces

**Files:**
- Create: `plugins/shared-memory/src/chess-timer/types.ts`
- Test: N/A (type definitions only)

**Step 1: Create types file**

```typescript
// plugins/shared-memory/src/chess-timer/types.ts

export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned';
export type WorkType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'other';
export type PauseReason = 'context_switch' | 'break' | 'end_of_day' | 'unknown';

export interface WorkSession {
  id: string;
  feature_id: string;
  feature_description: string;
  scope: string;
  status: SessionStatus;
  started_at: Date;
  completed_at: Date | null;
  total_active_seconds: number;
  satisfaction: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkSegment {
  id: string;
  session_id: string;
  started_at: Date;
  ended_at: Date | null;
  trigger_start: string;
  trigger_end: string | null;
}

export interface WorkMetrics {
  id: string;
  session_id: string;
  files_touched: number;
  lines_added: number;
  lines_removed: number;
  complexity_rating: number;
  work_type: WorkType;
  recorded_at: Date;
}

export interface StartSessionInput {
  feature_id?: string;
  description?: string;
  work_type?: WorkType;
  scope?: string;
}

export interface PauseSessionInput {
  session_id?: string;
  reason?: PauseReason;
}

export interface ResumeSessionInput {
  session_id?: string;
}

export interface CompleteSessionInput {
  session_id?: string;
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

export interface EstimateInput {
  feature_id?: string;
  description?: string;
  work_type?: WorkType;
}

export interface ListSessionsInput {
  scope?: string;
  status?: SessionStatus;
  limit?: number;
}

export interface Estimate {
  min_seconds: number;
  max_seconds: number;
  confidence: 'low' | 'medium' | 'high';
  sample_count: number;
  similar_sessions: Array<{
    feature_id: string;
    description: string;
    duration_seconds: number;
  }>;
  message: string;
}

export interface ChessTimerConfig {
  enabled: boolean;
  auto_detect: boolean;
  include_in_pr_description: boolean;
  verbosity: 'quiet' | 'normal' | 'verbose';
}
```

**Step 2: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/types.ts
git commit -m "feat(chess-timer): add type definitions"
```

---

## Task 2: Session Store - Schema and Basic CRUD

**Files:**
- Create: `plugins/shared-memory/src/chess-timer/session-store.ts`
- Create: `plugins/shared-memory/src/chess-timer/session-store.test.ts`

**Step 1: Write failing tests for session creation**

```typescript
// plugins/shared-memory/src/chess-timer/session-store.test.ts

import { SessionStore } from './session-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SessionStore', () => {
  let store: SessionStore;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-sessions-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('createSession', () => {
    it('should create a session with a new segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
        work_type: 'feature',
      });

      expect(session.id).toBeDefined();
      expect(session.feature_id).toBe('feature/auth');
      expect(session.status).toBe('active');
      expect(session.total_active_seconds).toBe(0);
    });

    it('should create an initial segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
      });

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(1);
      expect(segments[0].ended_at).toBeNull();
    });
  });

  describe('getActiveSession', () => {
    it('should return null when no active session', () => {
      const session = store.getActiveSession('project:myapp');
      expect(session).toBeNull();
    });

    it('should return the active session for scope', () => {
      store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const session = store.getActiveSession('project:myapp');
      expect(session).not.toBeNull();
      expect(session?.status).toBe('active');
    });
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=session-store
```

Expected: FAIL with "Cannot find module './session-store'"

**Step 3: Implement SessionStore with schema**

```typescript
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
} from './types';

interface CreateSessionInput {
  feature_id: string;
  description: string;
  scope: string;
  work_type?: WorkType;
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
    this.createSegment(id, 'session_start');

    // Create initial metrics if work_type provided
    if (input.work_type) {
      this.createMetrics(id, { work_type: input.work_type });
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

  private createSegment(sessionId: string, triggerStart: string): WorkSegment {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_segments (id, session_id, started_at, trigger_start)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, sessionId, now, triggerStart);
    return { id, session_id: sessionId, started_at: new Date(now), ended_at: null, trigger_start: triggerStart, trigger_end: null };
  }

  private createMetrics(sessionId: string, input: { work_type: WorkType }): void {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO work_metrics (id, session_id, work_type, recorded_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, sessionId, input.work_type, now);
  }

  close(): void {
    this.db.close();
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
}
```

**Step 4: Run tests**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=session-store
```

Expected: PASS

**Step 5: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/
git commit -m "feat(chess-timer): add SessionStore with schema and basic CRUD"
```

---

## Task 3: Session Store - Pause, Resume, Complete

**Files:**
- Modify: `plugins/shared-memory/src/chess-timer/session-store.ts`
- Modify: `plugins/shared-memory/src/chess-timer/session-store.test.ts`

**Step 1: Write failing tests for pause/resume/complete**

Add to `session-store.test.ts`:

```typescript
  describe('pauseSession', () => {
    it('should end the current segment and update status', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      // Wait a bit to accumulate time
      const paused = store.pauseSession(session.id, 'break');

      expect(paused.status).toBe('paused');
      expect(paused.total_active_seconds).toBeGreaterThanOrEqual(0);

      const segments = store.getSegments(session.id);
      expect(segments[0].ended_at).not.toBeNull();
      expect(segments[0].trigger_end).toBe('break');
    });
  });

  describe('resumeSession', () => {
    it('should create a new segment and set status to active', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.pauseSession(session.id, 'break');
      const resumed = store.resumeSession(session.id);

      expect(resumed.status).toBe('active');

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(2);
      expect(segments[1].trigger_start).toBe('resume');
    });
  });

  describe('completeSession', () => {
    it('should finalize the session with metrics', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const completed = store.completeSession(session.id, {
        satisfaction: 4,
        notes: 'Went well',
        metrics: {
          files_touched: 5,
          lines_added: 120,
          lines_removed: 30,
          complexity_rating: 3,
          work_type: 'feature',
        },
      });

      expect(completed.status).toBe('completed');
      expect(completed.completed_at).not.toBeNull();
      expect(completed.satisfaction).toBe(4);
      expect(completed.notes).toBe('Went well');

      const metrics = store.getMetrics(session.id);
      expect(metrics).not.toBeNull();
      expect(metrics?.files_touched).toBe(5);
    });
  });

  describe('listSessions', () => {
    it('should list sessions filtered by scope and status', () => {
      store.createSession({ feature_id: 'f1', description: 'Test 1', scope: 'project:a' });
      store.createSession({ feature_id: 'f2', description: 'Test 2', scope: 'project:b' });

      const results = store.listSessions({ scope: 'project:a' });
      expect(results).toHaveLength(1);
      expect(results[0].feature_id).toBe('f1');
    });
  });
```

**Step 2: Run tests to verify failure**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=session-store
```

Expected: FAIL

**Step 3: Implement pause, resume, complete, list methods**

Add to `SessionStore` class:

```typescript
  pauseSession(sessionId: string, reason: string = 'unknown'): WorkSession {
    const now = new Date();

    // End current segment
    const segmentStmt = this.db.prepare(`
      UPDATE work_segments
      SET ended_at = ?, trigger_end = ?
      WHERE session_id = ? AND ended_at IS NULL
    `);
    segmentStmt.run(now.toISOString(), reason, sessionId);

    // Calculate accumulated time
    const totalSeconds = this.calculateTotalSeconds(sessionId);

    // Update session
    const sessionStmt = this.db.prepare(`
      UPDATE work_sessions
      SET status = 'paused', total_active_seconds = ?, updated_at = ?
      WHERE id = ?
    `);
    sessionStmt.run(totalSeconds, now.toISOString(), sessionId);

    return this.getSession(sessionId)!;
  }

  resumeSession(sessionId: string): WorkSession {
    const now = new Date().toISOString();

    // Create new segment
    this.createSegment(sessionId, 'resume');

    // Update session status
    const stmt = this.db.prepare(`
      UPDATE work_sessions SET status = 'active', updated_at = ? WHERE id = ?
    `);
    stmt.run(now, sessionId);

    return this.getSession(sessionId)!;
  }

  completeSession(sessionId: string, input: {
    satisfaction?: number;
    notes?: string;
    metrics?: {
      files_touched?: number;
      lines_added?: number;
      lines_removed?: number;
      complexity_rating?: number;
      work_type?: WorkType;
    };
  }): WorkSession {
    const now = new Date();

    // End current segment if open
    const segmentStmt = this.db.prepare(`
      UPDATE work_segments
      SET ended_at = ?, trigger_end = 'complete'
      WHERE session_id = ? AND ended_at IS NULL
    `);
    segmentStmt.run(now.toISOString(), sessionId);

    // Calculate total time
    const totalSeconds = this.calculateTotalSeconds(sessionId);

    // Update session
    const sessionStmt = this.db.prepare(`
      UPDATE work_sessions
      SET status = 'completed',
          completed_at = ?,
          total_active_seconds = ?,
          satisfaction = ?,
          notes = ?,
          updated_at = ?
      WHERE id = ?
    `);
    sessionStmt.run(
      now.toISOString(),
      totalSeconds,
      input.satisfaction ?? null,
      input.notes ?? null,
      now.toISOString(),
      sessionId
    );

    // Update or create metrics
    if (input.metrics) {
      this.upsertMetrics(sessionId, input.metrics);
    }

    return this.getSession(sessionId)!;
  }

  getMetrics(sessionId: string): WorkMetrics | null {
    const stmt = this.db.prepare('SELECT * FROM work_metrics WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1');
    const row = stmt.get(sessionId) as DbWorkMetrics | undefined;
    return row ? this.toMetrics(row) : null;
  }

  listSessions(input: { scope?: string; status?: SessionStatus; limit?: number } = {}): WorkSession[] {
    let sql = 'SELECT * FROM work_sessions WHERE 1=1';
    const params: (string | number)[] = [];

    if (input.scope) {
      sql += ' AND scope = ?';
      params.push(input.scope);
    }

    if (input.status) {
      sql += ' AND status = ?';
      params.push(input.status);
    }

    sql += ' ORDER BY updated_at DESC';

    if (input.limit) {
      sql += ' LIMIT ?';
      params.push(input.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as DbWorkSession[];
    return rows.map((r) => this.toSession(r));
  }

  private calculateTotalSeconds(sessionId: string): number {
    const segments = this.getSegments(sessionId);
    let total = 0;

    for (const seg of segments) {
      const end = seg.ended_at || new Date();
      const diff = Math.floor((end.getTime() - seg.started_at.getTime()) / 1000);
      total += diff;
    }

    return total;
  }

  private upsertMetrics(sessionId: string, input: {
    files_touched?: number;
    lines_added?: number;
    lines_removed?: number;
    complexity_rating?: number;
    work_type?: WorkType;
  }): void {
    const existing = this.getMetrics(sessionId);
    const now = new Date().toISOString();

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE work_metrics SET
          files_touched = COALESCE(?, files_touched),
          lines_added = COALESCE(?, lines_added),
          lines_removed = COALESCE(?, lines_removed),
          complexity_rating = COALESCE(?, complexity_rating),
          work_type = COALESCE(?, work_type),
          recorded_at = ?
        WHERE id = ?
      `);
      stmt.run(
        input.files_touched ?? null,
        input.lines_added ?? null,
        input.lines_removed ?? null,
        input.complexity_rating ?? null,
        input.work_type ?? null,
        now,
        existing.id
      );
    } else {
      const id = crypto.randomUUID();
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
        input.work_type ?? 'other',
        now
      );
    }
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
```

Also add the missing interface at the top:

```typescript
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
```

**Step 4: Run tests**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=session-store
```

Expected: PASS

**Step 5: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/
git commit -m "feat(chess-timer): add pause, resume, complete, list to SessionStore"
```

---

## Task 4: Prediction Engine

**Files:**
- Create: `plugins/shared-memory/src/chess-timer/predictor.ts`
- Create: `plugins/shared-memory/src/chess-timer/predictor.test.ts`

**Step 1: Write failing tests**

```typescript
// plugins/shared-memory/src/chess-timer/predictor.test.ts

import { Predictor } from './predictor';
import { SessionStore } from './session-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Predictor', () => {
  let store: SessionStore;
  let predictor: Predictor;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-predictor-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
    predictor = new Predictor(store);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('getEstimate', () => {
    it('should return low confidence with no history', () => {
      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.confidence).toBe('low');
      expect(estimate.sample_count).toBe(0);
      expect(estimate.message).toContain('new territory');
    });

    it('should return medium confidence with some history', () => {
      // Create 5 completed sessions
      for (let i = 0; i < 5; i++) {
        const session = store.createSession({
          feature_id: `feature/test-${i}`,
          description: 'Test feature',
          scope: 'project:test',
          work_type: 'feature',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'feature', complexity_rating: 3 },
        });
      }

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.confidence).toBe('medium');
      expect(estimate.sample_count).toBe(5);
    });

    it('should filter by work_type', () => {
      // Create sessions with different work types
      const bugfix = store.createSession({
        feature_id: 'fix/bug1',
        description: 'Bug fix',
        scope: 'project:test',
        work_type: 'bugfix',
      });
      store.completeSession(bugfix.id, { metrics: { work_type: 'bugfix' } });

      const feature = store.createSession({
        feature_id: 'feature/f1',
        description: 'Feature',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(feature.id, { metrics: { work_type: 'feature' } });

      const estimate = predictor.getEstimate({ work_type: 'bugfix' });

      expect(estimate.sample_count).toBe(1);
      expect(estimate.similar_sessions[0].feature_id).toBe('fix/bug1');
    });
  });
});
```

**Step 2: Run tests to verify failure**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=predictor
```

Expected: FAIL

**Step 3: Implement Predictor**

```typescript
// plugins/shared-memory/src/chess-timer/predictor.ts

import type { SessionStore } from './session-store';
import type { Estimate, WorkType } from './types';

interface EstimateInput {
  feature_id?: string;
  description?: string;
  work_type?: WorkType;
  complexity_rating?: number;
}

export class Predictor {
  constructor(private store: SessionStore) {}

  getEstimate(input: EstimateInput): Estimate {
    // Get completed sessions
    const allSessions = this.store.listSessions({ status: 'completed', limit: 100 });

    // Filter by work type if specified
    let similar = allSessions;
    if (input.work_type) {
      similar = allSessions.filter((s) => {
        const metrics = this.store.getMetrics(s.id);
        return metrics?.work_type === input.work_type;
      });
    }

    // Filter by complexity if specified (within ±1)
    if (input.complexity_rating) {
      similar = similar.filter((s) => {
        const metrics = this.store.getMetrics(s.id);
        if (!metrics) return false;
        return Math.abs(metrics.complexity_rating - input.complexity_rating!) <= 1;
      });
    }

    // Weight recent sessions higher (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSessions = similar.filter((s) => s.completed_at && s.completed_at > thirtyDaysAgo);

    // Use recent if we have enough, otherwise use all
    const sessionsToUse = recentSessions.length >= 3 ? recentSessions : similar;

    const sampleCount = sessionsToUse.length;
    const confidence = this.getConfidence(sampleCount);

    if (sampleCount === 0) {
      return {
        min_seconds: 0,
        max_seconds: 0,
        confidence: 'low',
        sample_count: 0,
        similar_sessions: [],
        message: "Hard to say—this is new territory for us.",
      };
    }

    // Calculate duration statistics
    const durations = sessionsToUse.map((s) => s.total_active_seconds);
    const sorted = [...durations].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    // Build estimate range based on confidence
    let minEstimate: number;
    let maxEstimate: number;
    let message: string;

    if (confidence === 'low') {
      minEstimate = min;
      maxEstimate = max;
      message = `Similar work has taken anywhere from ${this.formatDuration(min)} to ${this.formatDuration(max)}`;
    } else if (confidence === 'medium') {
      const p25 = sorted[Math.floor(sorted.length * 0.25)];
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      minEstimate = p25;
      maxEstimate = p75;
      message = `Based on ${sampleCount} similar sessions, probably ${this.formatDuration(p25)} to ${this.formatDuration(p75)}`;
    } else {
      // High confidence - tight range around median
      const stdDev = this.calculateStdDev(durations, median);
      minEstimate = Math.max(0, median - stdDev);
      maxEstimate = median + stdDev;
      message = `This usually takes about ${this.formatDuration(median)}`;
    }

    return {
      min_seconds: Math.round(minEstimate),
      max_seconds: Math.round(maxEstimate),
      confidence,
      sample_count: sampleCount,
      similar_sessions: sessionsToUse.slice(0, 3).map((s) => ({
        feature_id: s.feature_id,
        description: s.feature_description,
        duration_seconds: s.total_active_seconds,
      })),
      message,
    };
  }

  private getConfidence(sampleCount: number): 'low' | 'medium' | 'high' {
    if (sampleCount < 5) return 'low';
    if (sampleCount < 15) return 'medium';
    return 'high';
  }

  private calculateStdDev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const squareDiffs = values.map((v) => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
    return Math.sqrt(avgSquareDiff);
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds} seconds`;
    const minutes = Math.round(seconds / 60);
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours}h ${remainingMins}m`;
  }
}
```

**Step 4: Run tests**

```bash
cd plugins/shared-memory && npm test -- --testPathPattern=predictor
```

Expected: PASS

**Step 5: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/
git commit -m "feat(chess-timer): add Predictor for time estimates"
```

---

## Task 5: Export Index and Integration

**Files:**
- Create: `plugins/shared-memory/src/chess-timer/index.ts`

**Step 1: Create barrel export**

```typescript
// plugins/shared-memory/src/chess-timer/index.ts

export * from './types';
export { SessionStore } from './session-store';
export { Predictor } from './predictor';
```

**Step 2: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/index.ts
git commit -m "feat(chess-timer): add barrel export"
```

---

## Task 6: MCP Tools - Start and Get Active

**Files:**
- Modify: `plugins/shared-memory/src/index.ts`

**Step 1: Import chess timer modules and add start_work_session tool**

Add imports at top of `index.ts`:

```typescript
import { SessionStore, Predictor } from './chess-timer';
import type { StartSessionInput, WorkType } from './chess-timer';
```

After `const localStore = new LocalStore(LOCAL_DB_PATH);` add:

```typescript
// Chess timer stores (use same DB for simplicity)
const sessionStore = new SessionStore(LOCAL_DB_PATH);
const predictor = new Predictor(sessionStore);
```

Add the tool after the existing tools:

```typescript
  // --- Chess Timer Tools ---

  server.tool(
    'start_work_session',
    'Start tracking time for a coding session. Returns estimate if similar work exists.',
    {
      feature_id: z.string().optional().describe('Branch name or feature identifier (auto-detects if omitted)'),
      description: z.string().optional().describe('What you are building'),
      work_type: z.enum(['feature', 'bugfix', 'refactor', 'docs', 'other']).optional().describe('Type of work'),
      scope: z.string().optional().describe('Project scope'),
    },
    async (args: StartSessionInput) => {
      const scope = args.scope || detectScope();
      const feature_id = args.feature_id || `work-${Date.now()}`;
      const description = args.description || 'Coding session';

      // Check for existing active session
      const existing = sessionStore.getActiveSession(scope);
      if (existing) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: 'Session already active',
              session: {
                id: existing.id,
                feature_id: existing.feature_id,
                status: existing.status,
                total_active_seconds: existing.total_active_seconds,
              },
            }, null, 2),
          }],
        };
      }

      // Create new session
      const session = sessionStore.createSession({
        feature_id,
        description,
        scope,
        work_type: args.work_type,
      });

      // Get estimate for similar work
      const estimate = predictor.getEstimate({
        work_type: args.work_type,
        description,
      });

      // Emit memory for cross-plugin visibility
      localStore.add({
        content: `Started work session: ${description} (${feature_id})`,
        scope,
        tags: ['chess-timer', 'session-start', args.work_type || 'other'],
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Session started',
            session: {
              id: session.id,
              feature_id: session.feature_id,
              description: session.feature_description,
              started_at: session.started_at.toISOString(),
            },
            estimate: estimate.sample_count > 0 ? {
              message: estimate.message,
              confidence: estimate.confidence,
              similar_count: estimate.sample_count,
            } : null,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_active_session',
    'Get the current active or paused work session',
    {
      scope: z.string().optional().describe('Project scope (auto-detects if omitted)'),
    },
    async (args: { scope?: string }) => {
      const scope = args.scope || detectScope();
      const session = sessionStore.getActiveSession(scope);

      if (!session) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No active session.',
          }],
        };
      }

      const segments = sessionStore.getSegments(session.id);
      const currentSeconds = session.status === 'active'
        ? session.total_active_seconds + Math.floor((Date.now() - segments[segments.length - 1].started_at.getTime()) / 1000)
        : session.total_active_seconds;

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            session: {
              id: session.id,
              feature_id: session.feature_id,
              description: session.feature_description,
              status: session.status,
              started_at: session.started_at.toISOString(),
              total_active_seconds: currentSeconds,
              segment_count: segments.length,
            },
          }, null, 2),
        }],
      };
    }
  );
```

**Step 2: Build to verify**

```bash
cd plugins/shared-memory && npm run build
```

Expected: Success

**Step 3: Commit**

```bash
git add plugins/shared-memory/src/
git commit -m "feat(chess-timer): add start_work_session and get_active_session tools"
```

---

## Task 7: MCP Tools - Pause, Resume, Complete

**Files:**
- Modify: `plugins/shared-memory/src/index.ts`

**Step 1: Add remaining session management tools**

```typescript
  server.tool(
    'pause_work_session',
    'Pause the current work session (ends current segment)',
    {
      session_id: z.string().optional().describe('Session ID (uses active if omitted)'),
      reason: z.enum(['context_switch', 'break', 'end_of_day', 'unknown']).optional().describe('Why pausing'),
    },
    async (args: { session_id?: string; reason?: string }) => {
      const scope = detectScope();
      const session = args.session_id
        ? sessionStore.getSession(args.session_id)
        : sessionStore.getActiveSession(scope);

      if (!session) {
        return {
          content: [{ type: 'text' as const, text: 'No active session to pause.' }],
        };
      }

      if (session.status !== 'active') {
        return {
          content: [{ type: 'text' as const, text: `Session is already ${session.status}.` }],
        };
      }

      const paused = sessionStore.pauseSession(session.id, args.reason || 'unknown');

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Session paused',
            session: {
              id: paused.id,
              feature_id: paused.feature_id,
              total_active_seconds: paused.total_active_seconds,
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'resume_work_session',
    'Resume a paused work session',
    {
      session_id: z.string().optional().describe('Session ID (finds paused session if omitted)'),
    },
    async (args: { session_id?: string }) => {
      const scope = detectScope();
      const session = args.session_id
        ? sessionStore.getSession(args.session_id)
        : sessionStore.getActiveSession(scope);

      if (!session) {
        return {
          content: [{ type: 'text' as const, text: 'No paused session to resume.' }],
        };
      }

      if (session.status !== 'paused') {
        return {
          content: [{ type: 'text' as const, text: `Session is ${session.status}, not paused.` }],
        };
      }

      const resumed = sessionStore.resumeSession(session.id);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Session resumed',
            session: {
              id: resumed.id,
              feature_id: resumed.feature_id,
              total_active_seconds: resumed.total_active_seconds,
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'complete_work_session',
    'Complete a work session and record final metrics',
    {
      session_id: z.string().optional().describe('Session ID (uses active if omitted)'),
      satisfaction: z.number().min(1).max(5).optional().describe('How well it went (1-5)'),
      notes: z.string().optional().describe('Learnings or blockers'),
      files_touched: z.number().optional().describe('Number of files modified'),
      lines_added: z.number().optional().describe('Lines of code added'),
      lines_removed: z.number().optional().describe('Lines of code removed'),
      complexity_rating: z.number().min(1).max(5).optional().describe('Complexity (1-5)'),
      work_type: z.enum(['feature', 'bugfix', 'refactor', 'docs', 'other']).optional().describe('Type of work'),
    },
    async (args: {
      session_id?: string;
      satisfaction?: number;
      notes?: string;
      files_touched?: number;
      lines_added?: number;
      lines_removed?: number;
      complexity_rating?: number;
      work_type?: WorkType;
    }) => {
      const scope = detectScope();
      const session = args.session_id
        ? sessionStore.getSession(args.session_id)
        : sessionStore.getActiveSession(scope);

      if (!session) {
        return {
          content: [{ type: 'text' as const, text: 'No active session to complete.' }],
        };
      }

      if (session.status === 'completed') {
        return {
          content: [{ type: 'text' as const, text: 'Session already completed.' }],
        };
      }

      const completed = sessionStore.completeSession(session.id, {
        satisfaction: args.satisfaction,
        notes: args.notes,
        metrics: {
          files_touched: args.files_touched,
          lines_added: args.lines_added,
          lines_removed: args.lines_removed,
          complexity_rating: args.complexity_rating,
          work_type: args.work_type,
        },
      });

      // Emit memory for cross-plugin visibility
      const minutes = Math.round(completed.total_active_seconds / 60);
      localStore.add({
        content: `Completed: ${completed.feature_description} (${completed.feature_id}) - ${minutes} minutes`,
        scope: completed.scope,
        tags: ['chess-timer', 'session-complete', args.work_type || 'other'],
      });

      // Get comparison to similar sessions
      const estimate = predictor.getEstimate({ work_type: args.work_type });
      let comparison = '';
      if (estimate.sample_count > 0 && estimate.min_seconds > 0) {
        const avgSimilar = (estimate.min_seconds + estimate.max_seconds) / 2;
        const diff = ((completed.total_active_seconds - avgSimilar) / avgSimilar) * 100;
        if (diff < -10) {
          comparison = `About ${Math.abs(Math.round(diff))}% faster than similar work.`;
        } else if (diff > 10) {
          comparison = `About ${Math.round(diff)}% slower than similar work.`;
        } else {
          comparison = 'Right in line with similar work.';
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            message: 'Session completed',
            session: {
              id: completed.id,
              feature_id: completed.feature_id,
              description: completed.feature_description,
              total_active_seconds: completed.total_active_seconds,
              total_minutes: minutes,
              satisfaction: completed.satisfaction,
            },
            comparison: comparison || null,
          }, null, 2),
        }],
      };
    }
  );
```

**Step 2: Build to verify**

```bash
cd plugins/shared-memory && npm run build
```

Expected: Success

**Step 3: Commit**

```bash
git add plugins/shared-memory/src/index.ts
git commit -m "feat(chess-timer): add pause, resume, complete tools"
```

---

## Task 8: MCP Tools - Get Estimate and List Sessions

**Files:**
- Modify: `plugins/shared-memory/src/index.ts`

**Step 1: Add estimate and list tools**

```typescript
  server.tool(
    'get_work_estimate',
    'Get a time estimate for upcoming work based on similar past sessions',
    {
      description: z.string().optional().describe('What you plan to build'),
      work_type: z.enum(['feature', 'bugfix', 'refactor', 'docs', 'other']).optional().describe('Type of work'),
      complexity_rating: z.number().min(1).max(5).optional().describe('Expected complexity (1-5)'),
    },
    async (args: { description?: string; work_type?: WorkType; complexity_rating?: number }) => {
      const estimate = predictor.getEstimate({
        description: args.description,
        work_type: args.work_type,
        complexity_rating: args.complexity_rating,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            estimate: {
              message: estimate.message,
              confidence: estimate.confidence,
              sample_count: estimate.sample_count,
              range_seconds: {
                min: estimate.min_seconds,
                max: estimate.max_seconds,
              },
              range_minutes: {
                min: Math.round(estimate.min_seconds / 60),
                max: Math.round(estimate.max_seconds / 60),
              },
              similar_sessions: estimate.similar_sessions.map((s) => ({
                feature_id: s.feature_id,
                description: s.description,
                minutes: Math.round(s.duration_seconds / 60),
              })),
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'list_work_sessions',
    'List past work sessions',
    {
      scope: z.string().optional().describe('Filter by project scope'),
      status: z.enum(['active', 'paused', 'completed', 'abandoned']).optional().describe('Filter by status'),
      limit: z.number().optional().describe('Maximum results (default: 10)'),
    },
    async (args: { scope?: string; status?: 'active' | 'paused' | 'completed' | 'abandoned'; limit?: number }) => {
      const sessions = sessionStore.listSessions({
        scope: args.scope,
        status: args.status,
        limit: args.limit || 10,
      });

      if (sessions.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No sessions found.' }],
        };
      }

      const formatted = sessions.map((s) => ({
        id: s.id,
        feature_id: s.feature_id,
        description: s.feature_description,
        status: s.status,
        minutes: Math.round(s.total_active_seconds / 60),
        started_at: s.started_at.toISOString().split('T')[0],
        completed_at: s.completed_at?.toISOString().split('T')[0] || null,
      }));

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ sessions: formatted }, null, 2),
        }],
      };
    }
  );
```

**Step 2: Build to verify**

```bash
cd plugins/shared-memory && npm run build
```

Expected: Success

**Step 3: Commit**

```bash
git add plugins/shared-memory/src/index.ts
git commit -m "feat(chess-timer): add get_work_estimate and list_work_sessions tools"
```

---

## Task 9: Status Skill

**Files:**
- Create: `plugins/shared-memory/skills/chess-timer-status.md`

**Step 1: Create the skill file**

```markdown
# Chess Timer Status

Check the current state of work session tracking and prediction accuracy.

## When to Use

Use this skill when:
- User asks about active sessions or time tracking
- User wants to see session history
- User asks how accurate predictions have been

## Instructions

1. Call `get_active_session` to check for ongoing work
2. Call `list_work_sessions` with `status: completed` and `limit: 5` to get recent history
3. Summarize:
   - Current session status (if any)
   - Recent completed sessions with times
   - Brief note on prediction accuracy based on satisfaction ratings

## Example Response

> **Current:** Working on feature/auth (12 minutes so far)
>
> **Recent sessions:**
> - feature/notifications: 23 min
> - bugfix/login-error: 8 min
> - refactor/api-client: 45 min
>
> Predictions have been within range for 4 of the last 5 sessions.
```

**Step 2: Commit**

```bash
git add plugins/shared-memory/skills/
git commit -m "feat(chess-timer): add status skill"
```

---

## Task 10: Update Plugin Version and README

**Files:**
- Modify: `plugins/shared-memory/package.json`
- Modify: `plugins/shared-memory/.claude-plugin/plugin.json`
- Modify: `plugins/shared-memory/README.md`

**Step 1: Run release skill**

Use the `/release` skill to handle versioning:

```
/release shared-memory minor "add chess timer for self-calibrating time estimation"
```

This handles:
- Version bump in package.json and plugin.json
- README update
- Build verification
- Commit and push

---

## Task 11: Integration Tests

**Files:**
- Create: `plugins/shared-memory/src/chess-timer/integration.test.ts`

**Step 1: Write integration test**

```typescript
// plugins/shared-memory/src/chess-timer/integration.test.ts

import { SessionStore } from './session-store';
import { Predictor } from './predictor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Chess Timer Integration', () => {
  let store: SessionStore;
  let predictor: Predictor;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-integration-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
    predictor = new Predictor(store);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should track a complete session lifecycle', () => {
    // Start session
    const session = store.createSession({
      feature_id: 'feature/auth',
      description: 'Add authentication',
      scope: 'project:myapp',
      work_type: 'feature',
    });

    expect(session.status).toBe('active');

    // Pause for break
    const paused = store.pauseSession(session.id, 'break');
    expect(paused.status).toBe('paused');

    // Resume
    const resumed = store.resumeSession(session.id);
    expect(resumed.status).toBe('active');

    // Complete
    const completed = store.completeSession(session.id, {
      satisfaction: 5,
      notes: 'Went great',
      metrics: {
        files_touched: 10,
        lines_added: 200,
        work_type: 'feature',
        complexity_rating: 3,
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.satisfaction).toBe(5);

    // Verify segments
    const segments = store.getSegments(session.id);
    expect(segments.length).toBe(2); // Initial + after resume

    // Verify metrics
    const metrics = store.getMetrics(session.id);
    expect(metrics?.files_touched).toBe(10);
  });

  it('should improve estimates with more data', () => {
    // First estimate - no data
    const estimate1 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate1.confidence).toBe('low');

    // Add 5 sessions
    for (let i = 0; i < 5; i++) {
      const s = store.createSession({
        feature_id: `feature/test-${i}`,
        description: 'Test',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(s.id, { metrics: { work_type: 'feature' } });
    }

    // Second estimate - some data
    const estimate2 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate2.confidence).toBe('medium');
    expect(estimate2.sample_count).toBe(5);

    // Add 10 more
    for (let i = 5; i < 15; i++) {
      const s = store.createSession({
        feature_id: `feature/test-${i}`,
        description: 'Test',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(s.id, { metrics: { work_type: 'feature' } });
    }

    // Third estimate - lots of data
    const estimate3 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate3.confidence).toBe('high');
    expect(estimate3.sample_count).toBe(15);
  });
});
```

**Step 2: Run all tests**

```bash
cd plugins/shared-memory && npm test
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add plugins/shared-memory/src/chess-timer/
git commit -m "test(chess-timer): add integration tests"
```

---

## Summary

11 tasks total:
1. Types and interfaces
2. Session store - schema and basic CRUD
3. Session store - pause, resume, complete
4. Prediction engine
5. Export index
6. MCP tools - start and get active
7. MCP tools - pause, resume, complete
8. MCP tools - estimate and list
9. Status skill
10. Version bump and README
11. Integration tests

Each task is a focused commit. TDD throughout. Run tests after each change.

---

Plan complete and saved to `docs/plans/2026-01-18-chess-timer-implementation.md`.

**Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session in worktree with executing-plans, batch execution with checkpoints

Which approach?