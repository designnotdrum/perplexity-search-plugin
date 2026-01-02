import { Memory } from './types';

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

export class Mem0Client {
  private client: any; // mem0ai client
  private userId: string;

  constructor(apiKey: string, userId: string = 'default') {
    // Dynamic import to handle optional dependency
    const { MemoryClient } = require('mem0ai');
    this.client = new MemoryClient({ api_key: apiKey });
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
}
