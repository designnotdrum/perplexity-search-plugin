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

// Profile snapshot stored in Mem0
export interface ProfileSnapshot {
  profile: UserProfile;
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

  async add(content: string, metadata: Record<string, unknown> = {}): Promise<string> {
    const result = await this.client.add(content, {
      user_id: this.userId,
      metadata,
    });
    return result.id;
  }

  async search(query: string, limit: number = 10): Promise<Memory[]> {
    const results: Mem0SearchResult[] = await this.client.search(query, {
      user_id: this.userId,
      limit,
    });

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
    const results: Mem0Memory[] = await this.client.getAll({
      user_id: this.userId,
    });

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
      const results: Mem0Memory[] = await this.client.getAll({
        user_id: this.userId,
      });

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
      const result = await this.client.add(JSON.stringify(profile), {
        user_id: this.userId,
        metadata: {
          type: 'profile-snapshot',
          timestamp,
          version: profile.version || '1.0.0',
          scope: 'global',
        },
      });
      return result.id;
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
      const results: Mem0Memory[] = await this.client.getAll({
        user_id: this.userId,
      });

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
}
