/**
 * Persistent storage for radar digests using SQLite.
 * Follows the same pattern as visual-thinking's storage.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  RadarDigest,
  RadarDigestData,
  DigestRow,
  DigestDataRow,
  DigestStatus,
  Signal,
  Pattern,
} from './types';

const RADAR_DIR = path.join(os.homedir(), '.config', 'brain-jar', 'radar');
const DB_PATH = path.join(RADAR_DIR, 'digests.db');

// 30 days in milliseconds
const DIGEST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Local storage for radar digests using SQLite
 */
export class DigestStorage {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      -- Main digest metadata (lightweight for listing)
      CREATE TABLE IF NOT EXISTS digests (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL DEFAULT 'global',
        generated_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'fresh',
        last_actioned_at TEXT,
        expires_at TEXT NOT NULL,
        domains_json TEXT NOT NULL DEFAULT '[]',
        signal_count INTEGER NOT NULL DEFAULT 0,
        pattern_count INTEGER NOT NULL DEFAULT 0,
        top_pattern_titles_json TEXT NOT NULL DEFAULT '[]',
        top_signal_titles_json TEXT NOT NULL DEFAULT '[]'
      );

      -- Full digest data (stored separately for efficiency)
      CREATE TABLE IF NOT EXISTS digest_data (
        digest_id TEXT PRIMARY KEY,
        signals_json TEXT NOT NULL DEFAULT '[]',
        patterns_json TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (digest_id) REFERENCES digests(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_digests_status ON digests(status);
      CREATE INDEX IF NOT EXISTS idx_digests_expires ON digests(expires_at);
      CREATE INDEX IF NOT EXISTS idx_digests_generated ON digests(generated_at);
    `);
  }

  private rowToDigest(row: DigestRow): RadarDigest {
    return {
      id: row.id,
      scope: 'global',
      generatedAt: row.generated_at,
      status: row.status as DigestStatus,
      lastActionedAt: row.last_actioned_at || undefined,
      expiresAt: row.expires_at,
      domains: JSON.parse(row.domains_json) as string[],
      signalCount: row.signal_count,
      patternCount: row.pattern_count,
      topPatternTitles: JSON.parse(row.top_pattern_titles_json) as string[],
      topSignalTitles: JSON.parse(row.top_signal_titles_json) as string[],
    };
  }

  /**
   * Create a new digest from signals and patterns
   */
  create(
    signals: Signal[],
    patterns: Pattern[],
    domains: string[]
  ): RadarDigest {
    const id = uuidv4();
    const now = new Date();
    const generatedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + DIGEST_TTL_MS).toISOString();

    // Attach digestId to signals and patterns for provenance
    const signalsWithId = signals.map(s => ({ ...s, digestId: id }));
    const patternsWithId = patterns.map(p => ({
      ...p,
      digestId: id,
      signals: p.signals.map(s => ({ ...s, digestId: id })),
    }));

    // Extract top titles for summary
    const topSignalTitles = signalsWithId.slice(0, 5).map(s => s.title);
    const topPatternTitles = patternsWithId.slice(0, 3).map(p => p.title);

    const digest: RadarDigest = {
      id,
      scope: 'global',
      generatedAt,
      status: 'fresh',
      expiresAt,
      domains,
      signalCount: signalsWithId.length,
      patternCount: patternsWithId.length,
      topPatternTitles,
      topSignalTitles,
    };

    // Insert digest metadata
    const insertDigest = this.db.prepare(`
      INSERT INTO digests (
        id, scope, generated_at, status, expires_at, domains_json,
        signal_count, pattern_count, top_pattern_titles_json, top_signal_titles_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDigest.run(
      id,
      'global',
      generatedAt,
      'fresh',
      expiresAt,
      JSON.stringify(domains),
      signalsWithId.length,
      patternsWithId.length,
      JSON.stringify(topPatternTitles),
      JSON.stringify(topSignalTitles)
    );

    // Insert full data
    const insertData = this.db.prepare(`
      INSERT INTO digest_data (digest_id, signals_json, patterns_json)
      VALUES (?, ?, ?)
    `);

    insertData.run(
      id,
      JSON.stringify(signalsWithId),
      JSON.stringify(patternsWithId)
    );

    return digest;
  }

  /**
   * Get a digest by ID (metadata only)
   */
  get(id: string): RadarDigest | null {
    const stmt = this.db.prepare('SELECT * FROM digests WHERE id = ?');
    const row = stmt.get(id) as DigestRow | undefined;
    return row ? this.rowToDigest(row) : null;
  }

  /**
   * Get full digest data (signals and patterns)
   */
  getData(digestId: string): RadarDigestData | null {
    const stmt = this.db.prepare('SELECT * FROM digest_data WHERE digest_id = ?');
    const row = stmt.get(digestId) as DigestDataRow | undefined;

    if (!row) return null;

    return {
      digestId: row.digest_id,
      signals: JSON.parse(row.signals_json) as Signal[],
      patterns: JSON.parse(row.patterns_json) as Pattern[],
    };
  }

  /**
   * Mark a digest as actioned (user explored/validated a signal)
   */
  markActioned(digestId: string): boolean {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE digests
      SET status = 'actioned', last_actioned_at = ?
      WHERE id = ? AND status != 'actioned'
    `);
    const result = stmt.run(now, digestId);
    return result.changes > 0;
  }

  /**
   * Mark a digest as actioned by signal ID
   */
  markActionedBySignal(signalId: string): boolean {
    // Find digest containing this signal
    const stmt = this.db.prepare(`
      SELECT digest_id FROM digest_data
      WHERE signals_json LIKE ?
    `);
    const row = stmt.get(`%"id":"${signalId}"%`) as { digest_id: string } | undefined;

    if (!row) return false;
    return this.markActioned(row.digest_id);
  }

  /**
   * List digests with optional status filter
   */
  list(status?: DigestStatus, limit: number = 20): RadarDigest[] {
    let sql = 'SELECT * FROM digests';
    const params: unknown[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY generated_at DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as DigestRow[];
    return rows.map(row => this.rowToDigest(row));
  }

  /**
   * Get the most recent digest
   */
  getLatest(): RadarDigest | null {
    const stmt = this.db.prepare(`
      SELECT * FROM digests ORDER BY generated_at DESC LIMIT 1
    `);
    const row = stmt.get() as DigestRow | undefined;
    return row ? this.rowToDigest(row) : null;
  }

  /**
   * Mark stale digests (past expiration, not actioned)
   */
  markStaleDigests(): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE digests
      SET status = 'stale'
      WHERE status = 'fresh' AND expires_at < ?
    `);
    const result = stmt.run(now);
    return result.changes;
  }

  /**
   * Prune stale digests (delete them and their data)
   */
  pruneStaleDigests(): number {
    // First mark any that should be stale
    this.markStaleDigests();

    // Then delete stale ones
    const stmt = this.db.prepare(`
      DELETE FROM digests WHERE status = 'stale'
    `);
    const result = stmt.run();
    return result.changes;
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    total: number;
    fresh: number;
    actioned: number;
    stale: number;
    oldestDigest?: string;
    newestDigest?: string;
  } {
    const countStmt = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'fresh' THEN 1 ELSE 0 END) as fresh,
        SUM(CASE WHEN status = 'actioned' THEN 1 ELSE 0 END) as actioned,
        SUM(CASE WHEN status = 'stale' THEN 1 ELSE 0 END) as stale
      FROM digests
    `);
    const counts = countStmt.get() as {
      total: number;
      fresh: number;
      actioned: number;
      stale: number;
    };

    const oldestStmt = this.db.prepare(
      'SELECT generated_at FROM digests ORDER BY generated_at ASC LIMIT 1'
    );
    const oldest = oldestStmt.get() as { generated_at: string } | undefined;

    const newestStmt = this.db.prepare(
      'SELECT generated_at FROM digests ORDER BY generated_at DESC LIMIT 1'
    );
    const newest = newestStmt.get() as { generated_at: string } | undefined;

    return {
      ...counts,
      oldestDigest: oldest?.generated_at,
      newestDigest: newest?.generated_at,
    };
  }

  /**
   * Delete a specific digest
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM digests WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
