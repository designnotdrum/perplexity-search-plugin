import { Signal, GitHubRepo, ScanResult } from '../types';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * GitHub source adapter
 */
export class GitHubSource {
  private token?: string;

  constructor(token?: string) {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'pattern-radar-mcp',
    };
    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }
    return headers;
  }

  /**
   * Search for trending repos by stars gained recently
   */
  async getTrending(
    language?: string,
    since: 'daily' | 'weekly' | 'monthly' = 'weekly',
    limit: number = 20
  ): Promise<ScanResult> {
    try {
      // Calculate date range
      const daysAgo = since === 'daily' ? 1 : since === 'weekly' ? 7 : 30;
      const dateStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      let query = `created:>${dateStr}`;
      if (language) {
        query += ` language:${language}`;
      }

      const response = await fetch(
        `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json() as { items: unknown[] };
      const repos = data.items.map((item: unknown) => this.parseRepo(item as Record<string, unknown>));
      const signals = repos.map((r) => this.repoToSignal(r));

      return {
        source: 'github',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'github',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search repos by topic
   */
  async searchByTopic(topic: string, limit: number = 20): Promise<ScanResult> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/search/repositories?q=topic:${encodeURIComponent(topic)}&sort=stars&order=desc&per_page=${limit}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json() as { items: unknown[] };
      const repos = data.items.map((item: unknown) => this.parseRepo(item as Record<string, unknown>));
      const signals = repos.map((r) => this.repoToSignal(r));

      return {
        source: 'github',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'github',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Search repos by query
   */
  async search(query: string, limit: number = 20): Promise<ScanResult> {
    try {
      const response = await fetch(
        `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json() as { items: unknown[] };
      const repos = data.items.map((item: unknown) => this.parseRepo(item as Record<string, unknown>));
      const signals = repos.map((r) => this.repoToSignal(r));

      return {
        source: 'github',
        signals,
        scannedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        source: 'github',
        signals: [],
        scannedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private parseRepo(item: Record<string, unknown>): GitHubRepo {
    return {
      name: item.name as string || '',
      fullName: item.full_name as string || '',
      description: item.description as string || '',
      url: item.html_url as string || '',
      stars: item.stargazers_count as number || 0,
      starsToday: 0, // Not available from search API
      language: item.language as string || 'Unknown',
      topics: (item.topics as string[]) || [],
    };
  }

  private repoToSignal(repo: GitHubRepo): Signal {
    return {
      id: `gh-${repo.fullName}`,
      source: 'github',
      title: repo.fullName,
      url: repo.url,
      content: repo.description,
      score: repo.stars,
      timestamp: new Date().toISOString(),
      metadata: {
        language: repo.language,
        topics: repo.topics,
        starsToday: repo.starsToday,
      },
    };
  }
}
