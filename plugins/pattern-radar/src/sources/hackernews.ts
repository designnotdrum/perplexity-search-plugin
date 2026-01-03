import { Signal, HNStory, ScanResult } from '../types';

const HN_ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';

/**
 * Hacker News source adapter using Algolia API
 */
export class HackerNewsSource {
  /**
   * Get front page stories
   */
  async getFrontPage(limit: number = 30): Promise<ScanResult> {
    try {
      const response = await fetch(`${HN_ALGOLIA_BASE}/search?tags=front_page&hitsPerPage=${limit}`);
      if (!response.ok) {
        throw new Error(`HN API error: ${response.status}`);
      }

      const data = await response.json() as { hits: unknown[] };
      const stories = data.hits.map((hit: unknown) => this.parseStory(hit as Record<string, unknown>));
      const signals = stories.map((s) => this.storyToSignal(s));

      return {
        source: 'hackernews',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'hackernews',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search HN for a topic
   */
  async search(query: string, limit: number = 20): Promise<ScanResult> {
    try {
      const encoded = encodeURIComponent(query);
      const response = await fetch(
        `${HN_ALGOLIA_BASE}/search?query=${encoded}&tags=story&hitsPerPage=${limit}`
      );
      if (!response.ok) {
        throw new Error(`HN API error: ${response.status}`);
      }

      const data = await response.json() as { hits: unknown[] };
      const stories = data.hits.map((hit: unknown) => this.parseStory(hit as Record<string, unknown>));
      const signals = stories.map((s) => this.storyToSignal(s));

      return {
        source: 'hackernews',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'hackernews',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get recent stories (last 24h with high engagement)
   */
  async getRecent(minPoints: number = 50, limit: number = 30): Promise<ScanResult> {
    try {
      const yesterday = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const response = await fetch(
        `${HN_ALGOLIA_BASE}/search?tags=story&numericFilters=points>=${minPoints},created_at_i>${yesterday}&hitsPerPage=${limit}`
      );
      if (!response.ok) {
        throw new Error(`HN API error: ${response.status}`);
      }

      const data = await response.json() as { hits: unknown[] };
      const stories = data.hits.map((hit: unknown) => this.parseStory(hit as Record<string, unknown>));
      const signals = stories.map((s) => this.storyToSignal(s));

      return {
        source: 'hackernews',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'hackernews',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseStory(hit: Record<string, unknown>): HNStory {
    return {
      id: hit.objectID as number,
      title: hit.title as string || '',
      url: hit.url as string | undefined,
      points: hit.points as number || 0,
      numComments: hit.num_comments as number || 0,
      author: hit.author as string || '',
      createdAt: hit.created_at as string || new Date().toISOString(),
    };
  }

  private storyToSignal(story: HNStory): Signal {
    return {
      id: `hn-${story.id}`,
      source: 'hackernews',
      title: story.title,
      url: story.url,
      score: story.points,
      timestamp: story.createdAt,
      metadata: {
        comments: story.numComments,
        author: story.author,
        hnUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      },
    };
  }
}
