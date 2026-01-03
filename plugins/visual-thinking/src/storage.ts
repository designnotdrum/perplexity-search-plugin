import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import {
  Diagram,
  DiagramRow,
  DiagramType,
  DiagramVersion,
  CreateDiagramInput,
  UpdateDiagramInput,
  ListDiagramsInput,
} from './types';

const DIAGRAMS_DIR = path.join(os.homedir(), '.config', 'brain-jar', 'diagrams');
const DB_PATH = path.join(DIAGRAMS_DIR, 'diagrams.db');

/**
 * Local storage for diagrams using SQLite
 */
export class DiagramStorage {
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
      CREATE TABLE IF NOT EXISTS diagrams (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        mermaid TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT 'global',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        versions_json TEXT NOT NULL DEFAULT '[]',
        tags_json TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_diagrams_scope ON diagrams(scope);
      CREATE INDEX IF NOT EXISTS idx_diagrams_type ON diagrams(type);
      CREATE INDEX IF NOT EXISTS idx_diagrams_updated ON diagrams(updated_at);
    `);
  }

  private rowToDiagram(row: DiagramRow): Diagram {
    return {
      id: row.id,
      title: row.title,
      type: row.type as DiagramType,
      mermaid: row.mermaid,
      context: row.context,
      scope: row.scope,
      created: row.created_at,
      updated: row.updated_at,
      versions: JSON.parse(row.versions_json) as DiagramVersion[],
      tags: JSON.parse(row.tags_json) as string[],
    };
  }

  /**
   * Create a new diagram
   */
  create(input: CreateDiagramInput): Diagram {
    const id = uuidv4();
    const now = new Date().toISOString();
    const scope = input.scope || 'global';
    const tags = input.tags || [];

    // Initial version is empty - current state is always mermaid field
    const versions: DiagramVersion[] = [];

    const stmt = this.db.prepare(`
      INSERT INTO diagrams (id, title, type, mermaid, context, scope, created_at, updated_at, versions_json, tags_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.title,
      input.type,
      input.mermaid,
      input.context,
      scope,
      now,
      now,
      JSON.stringify(versions),
      JSON.stringify(tags)
    );

    return {
      id,
      title: input.title,
      type: input.type,
      mermaid: input.mermaid,
      context: input.context,
      scope,
      created: now,
      updated: now,
      versions,
      tags,
    };
  }

  /**
   * Get a diagram by ID
   */
  get(id: string): Diagram | null {
    const stmt = this.db.prepare('SELECT * FROM diagrams WHERE id = ?');
    const row = stmt.get(id) as DiagramRow | undefined;
    return row ? this.rowToDiagram(row) : null;
  }

  /**
   * Get a diagram by title (fuzzy match)
   */
  getByTitle(title: string): Diagram | null {
    const stmt = this.db.prepare('SELECT * FROM diagrams WHERE title LIKE ? LIMIT 1');
    const row = stmt.get(`%${title}%`) as DiagramRow | undefined;
    return row ? this.rowToDiagram(row) : null;
  }

  /**
   * Update a diagram
   */
  update(input: UpdateDiagramInput): Diagram | null {
    const existing = this.get(input.id);
    if (!existing) return null;

    const now = new Date().toISOString();
    let versions = existing.versions;

    // If mermaid content changed, save current state to versions
    if (input.mermaid && input.mermaid !== existing.mermaid) {
      versions = [
        ...versions,
        {
          mermaid: existing.mermaid,
          timestamp: existing.updated,
          note: input.note,
        },
      ];
    }

    const newTitle = input.title ?? existing.title;
    const newMermaid = input.mermaid ?? existing.mermaid;
    const newContext = input.context ?? existing.context;
    const newTags = input.tags ?? existing.tags;

    const stmt = this.db.prepare(`
      UPDATE diagrams
      SET title = ?, mermaid = ?, context = ?, updated_at = ?, versions_json = ?, tags_json = ?
      WHERE id = ?
    `);

    stmt.run(
      newTitle,
      newMermaid,
      newContext,
      now,
      JSON.stringify(versions),
      JSON.stringify(newTags),
      input.id
    );

    return {
      ...existing,
      title: newTitle,
      mermaid: newMermaid,
      context: newContext,
      updated: now,
      versions,
      tags: newTags,
    };
  }

  /**
   * Delete a diagram
   */
  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM diagrams WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * List diagrams with optional filters
   */
  list(input: ListDiagramsInput = {}): Diagram[] {
    let sql = 'SELECT * FROM diagrams WHERE 1=1';
    const params: unknown[] = [];

    if (input.scope) {
      sql += ' AND scope = ?';
      params.push(input.scope);
    }

    if (input.type) {
      sql += ' AND type = ?';
      params.push(input.type);
    }

    if (input.tags && input.tags.length > 0) {
      // Match any of the tags
      const tagConditions = input.tags.map(() => "tags_json LIKE ?").join(' OR ');
      sql += ` AND (${tagConditions})`;
      for (const tag of input.tags) {
        params.push(`%"${tag}"%`);
      }
    }

    sql += ' ORDER BY updated_at DESC';

    if (input.limit) {
      sql += ' LIMIT ?';
      params.push(input.limit);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as DiagramRow[];
    return rows.map((row) => this.rowToDiagram(row));
  }

  /**
   * Search diagrams by text (title, context, mermaid content)
   */
  search(query: string, limit: number = 10): Diagram[] {
    const stmt = this.db.prepare(`
      SELECT * FROM diagrams
      WHERE title LIKE ? OR context LIKE ? OR mermaid LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);
    const pattern = `%${query}%`;
    const rows = stmt.all(pattern, pattern, pattern, limit) as DiagramRow[];
    return rows.map((row) => this.rowToDiagram(row));
  }

  /**
   * Export a diagram as a Mermaid file
   */
  exportAsMermaid(id: string): string | null {
    const diagram = this.get(id);
    if (!diagram) return null;

    // Add metadata as comments
    const header = [
      `%% Title: ${diagram.title}`,
      `%% Type: ${diagram.type}`,
      `%% Context: ${diagram.context}`,
      `%% Created: ${diagram.created}`,
      `%% Updated: ${diagram.updated}`,
      `%% Tags: ${diagram.tags.join(', ')}`,
      '',
    ].join('\n');

    return header + diagram.mermaid;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
