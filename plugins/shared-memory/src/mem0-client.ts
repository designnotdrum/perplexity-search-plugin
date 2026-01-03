import { Memory } from './types';
import { UserProfile } from './profile/types';

// Mem0 SDK types (simplified)
interface Mem0Memory {
  id: string;
  memory: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface Mem0SearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
}

// Result from add() operation (v2 uses async processing with event_id)
interface Mem0AddResult {
  id?: string;
  event_id?: string;
  status?: string;
  message?: string;
  memory?: string;
  metadata?: Record<string, unknown>;
}

// Profile snapshot stored in Mem0
export interface ProfileSnapshot {
  profile: UserProfile;
  timestamp: string;
  mem0Id?: string;
}

// Activity summary stored in Mem0
export interface ActivitySummary {
  content: string;
  scope: string;
  periodStart: string;
  periodEnd: string;
  memoryCount: number;
  timestamp: string;
  mem0Id?: string;
}

export class Mem0Client {
  private client: any; // mem0ai client
  private userId: string;

  constructor(apiKey: string, userId: string = 'default') {
    // Dynamic import to handle optional dependency
    const { MemoryClient } = require('mem0ai');
    // Note: MemoryClient expects 'apiKey' (camelCase), not 'api_key'
    this.client = new MemoryClient({ apiKey });
    this.userId = userId;
  }

  // Helper to extract results array from API response (v2 wraps in {results: [...]})
  private extractResults<T>(response: T[] | { results: T[] }): T[] {
    if (Array.isArray(response)) {
      return response;
    }
    return response?.results || [];
  }

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    // v2 API: add() expects messages array as first param
    const messages = [{ role: 'user', content }];
    const result = await this.client.add(messages, {
      user_id: this.userId,
      metadata,
    });
    // v2 returns array with event_id for async processing, or id for sync
    const results = this.extractResults<Mem0AddResult>(result);
    const firstResult = results[0];
    // Return id if available, otherwise event_id for async tracking
    return firstResult?.id || firstResult?.event_id || result?.id || result?.event_id || '';
  }

  async search(query: string, limit: number = 10): Promise<Memory[]> {
    // v2 API: search() uses user_id at top level
    const response = await this.client.search(query, {
      user_id: this.userId,
      limit,
    });
    const results: Mem0SearchResult[] = this.extractResults(response);

    return results.map((r) => ({
      id: r.id,
      content: r.memory,
      scope: (r.metadata?.scope as string) || 'global',
      tags: (r.metadata?.tags as string[]) || [],
      source: {
        agent: (r.metadata?.source_agent as string) || 'unknown',
        action: r.metadata?.source_action as string | undefined,
      },
      created_at: new Date(),
      updated_at: new Date(),
    }));
  }

  async getAll(): Promise<Memory[]> {
    // v2 API: getAll() uses user_id at top level
    const response = await this.client.getAll({
      user_id: this.userId,
    });
    const results: Mem0Memory[] = this.extractResults(response);

    return results.map((r) => ({
      id: r.id,
      content: r.memory,
      scope: (r.metadata?.scope as string) || 'global',
      tags: (r.metadata?.tags as string[]) || [],
      source: {
        agent: (r.metadata?.source_agent as string) || 'unknown',
        action: r.metadata?.source_action as string | undefined,
      },
      created_at: r.created_at ? new Date(r.created_at) : new Date(),
      updated_at: r.updated_at ? new Date(r.updated_at) : new Date(),
    }));
  }

  async delete(memoryId: string): Promise<boolean> {
    try {
      await this.client.delete(memoryId);
      return true;
    } catch {
      return false;
    }
  }

  // --- Profile Snapshot Methods ---

  /**
   * Gets the latest profile snapshot from Mem0.
   * Returns null if no profile exists.
   */
  async getLatestProfile(): Promise<ProfileSnapshot | null> {
    try {
      const response = await this.client.getAll({
        user_id: this.userId,
      });
      const results: Mem0Memory[] = this.extractResults(response);

      // Filter to profile snapshots and sort by timestamp descending
      const profileSnapshots = results
        .filter((r) => r.metadata?.type === 'profile-snapshot')
        .sort((a, b) => {
          const tsA = (a.metadata?.timestamp as string) || '';
          const tsB = (b.metadata?.timestamp as string) || '';
          return tsB.localeCompare(tsA); // Descending
        });

      if (profileSnapshots.length === 0) {
        return null;
      }

      const latest = profileSnapshots[0];
      try {
        const profile = JSON.parse(latest.memory) as UserProfile;
        return {
          profile,
          timestamp: (latest.metadata?.timestamp as string) || latest.created_at || new Date().toISOString(),
          mem0Id: latest.id,
        };
      } catch {
        console.warn('Failed to parse profile snapshot from Mem0');
        return null;
      }
    } catch (error) {
      console.warn('Failed to fetch profile from Mem0:', error);
      return null;
    }
  }

  /**
   * Saves a new profile snapshot to Mem0.
   * Always creates a new memory (append-only).
   */
  async saveProfileSnapshot(profile: UserProfile): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString();
      // v2 API: add() expects messages array
      const messages = [{ role: 'user', content: JSON.stringify(profile) }];
      const result = await this.client.add(messages, {
        user_id: this.userId,
        infer: false, // Store raw JSON without semantic extraction
        metadata: {
          type: 'profile-snapshot',
          timestamp,
          version: profile.version || '1.0.0',
          scope: 'global',
        },
      });
      const results = this.extractResults<Mem0AddResult>(result);
      const firstResult = results[0];
      return firstResult?.id || firstResult?.event_id || result?.id || result?.event_id || null;
    } catch (error) {
      console.warn('Failed to save profile snapshot to Mem0:', error);
      return null;
    }
  }

  /**
   * Gets profile history from Mem0.
   * Returns all snapshots, optionally filtered by date.
   */
  async getProfileHistory(since?: Date, limit?: number): Promise<ProfileSnapshot[]> {
    try {
      const response = await this.client.getAll({
        user_id: this.userId,
      });
      const results: Mem0Memory[] = this.extractResults(response);

      // Filter to profile snapshots
      let snapshots: ProfileSnapshot[] = results
        .filter((r) => r.metadata?.type === 'profile-snapshot')
        .map((r): ProfileSnapshot | null => {
          try {
            const profile = JSON.parse(r.memory) as UserProfile;
            return {
              profile,
              timestamp: (r.metadata?.timestamp as string) || r.created_at || '',
              mem0Id: r.id,
            };
          } catch {
            return null;
          }
        })
        .filter((s): s is ProfileSnapshot => s !== null)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first

      // Filter by date if provided
      if (since) {
        const sinceIso = since.toISOString();
        snapshots = snapshots.filter((s) => s.timestamp >= sinceIso);
      }

      // Apply limit if provided
      if (limit && limit > 0) {
        snapshots = snapshots.slice(0, limit);
      }

      return snapshots;
    } catch (error) {
      console.warn('Failed to fetch profile history from Mem0:', error);
      return [];
    }
  }

  // --- Activity Summary Methods ---

  /**
   * Saves an activity summary to Mem0.
   */
  async saveSummary(
    scope: string,
    content: string,
    periodStart: Date,
    periodEnd: Date,
    memoryCount: number
  ): Promise<string | null> {
    try {
      const timestamp = new Date().toISOString();
      // v2 API: add() expects messages array
      const messages = [{ role: 'user', content }];
      const result = await this.client.add(messages, {
        user_id: this.userId,
        metadata: {
          type: 'activity-summary',
          scope,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          memory_count: memoryCount,
          timestamp,
        },
      });
      const results = this.extractResults<Mem0AddResult>(result);
      const firstResult = results[0];
      return firstResult?.id || firstResult?.event_id || result?.id || result?.event_id || null;
    } catch (error) {
      console.warn('Failed to save activity summary to Mem0:', error);
      return null;
    }
  }

  /**
   * Gets activity summaries from Mem0.
   */
  async getSummaries(scope?: string, since?: Date, limit?: number): Promise<ActivitySummary[]> {
    try {
      const response = await this.client.getAll({
        user_id: this.userId,
      });
      const results: Mem0Memory[] = this.extractResults(response);

      // Filter to activity summaries
      let summaries: ActivitySummary[] = results
        .filter((r) => r.metadata?.type === 'activity-summary')
        .filter((r) => !scope || r.metadata?.scope === scope)
        .map((r): ActivitySummary => ({
          content: r.memory,
          scope: (r.metadata?.scope as string) || 'global',
          periodStart: (r.metadata?.period_start as string) || '',
          periodEnd: (r.metadata?.period_end as string) || '',
          memoryCount: (r.metadata?.memory_count as number) || 0,
          timestamp: (r.metadata?.timestamp as string) || r.created_at || '',
          mem0Id: r.id,
        }))
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // Newest first

      // Filter by date if provided
      if (since) {
        const sinceIso = since.toISOString();
        summaries = summaries.filter((s) => s.timestamp >= sinceIso);
      }

      // Apply limit if provided
      if (limit && limit > 0) {
        summaries = summaries.slice(0, limit);
      }

      return summaries;
    } catch (error) {
      console.warn('Failed to fetch activity summaries from Mem0:', error);
      return [];
    }
  }

  /**
   * Gets the most recent summary for a scope.
   */
  async getLatestSummary(scope: string): Promise<ActivitySummary | null> {
    const summaries = await this.getSummaries(scope, undefined, 1);
    return summaries.length > 0 ? summaries[0] : null;
  }
}
