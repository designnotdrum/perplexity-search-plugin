/**
 * Reddit adapter - fetches posts from subreddits
 * Uses public JSON API (no auth required, rate-limited)
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';

interface RedditInstanceConfig extends InstanceConfig {
  subreddit: string;
  sort?: 'hot' | 'new' | 'top' | 'rising';
  timeframe?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    url: string;
    selftext: string;
    score: number;
    num_comments: number;
    author: string;
    created_utc: number;
    subreddit: string;
    permalink: string;
  };
}

class RedditSourceInstance implements SourceInstance {
  id: string;
  adapter = 'reddit';
  topic: string;
  config: RedditInstanceConfig;

  constructor(topic: string, config: RedditInstanceConfig) {
    this.topic = topic;
    this.config = config;
    this.id = `reddit:r/${config.subreddit}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const limit = options?.limit || 25;
    const sort = this.config.sort || 'hot';
    const subreddit = this.config.subreddit;

    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'pattern-radar/1.0 (brain-jar plugin)'
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Subreddit r/${subreddit} not found`);
      }
      throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json() as { data?: { children?: RedditPost[] } };
    const posts: RedditPost[] = data?.data?.children || [];

    return posts.map((post): Signal => ({
      id: `reddit:${post.data.id}`,
      source: 'reddit' as Signal['source'],
      title: post.data.title,
      url: post.data.url.startsWith('/')
        ? `https://reddit.com${post.data.url}`
        : post.data.url,
      content: post.data.selftext?.slice(0, 500),
      score: post.data.score,
      timestamp: new Date(post.data.created_utc * 1000).toISOString(),
      metadata: {
        subreddit: post.data.subreddit,
        author: post.data.author,
        numComments: post.data.num_comments,
        permalink: `https://reddit.com${post.data.permalink}`
      }
    }));
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const url = `https://www.reddit.com/r/${this.config.subreddit}/about.json`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'pattern-radar/1.0' }
      });

      if (response.status === 404) {
        return {
          healthy: false,
          message: `Subreddit r/${this.config.subreddit} not found`,
          lastChecked: new Date()
        };
      }

      return {
        healthy: response.ok,
        message: response.ok ? 'Subreddit accessible' : `HTTP ${response.status}`,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date()
      };
    }
  }
}

export const redditAdapter: SourceAdapter = {
  type: 'reddit',
  name: 'Reddit',
  capabilities: ['subreddit', 'search'],
  requiresAuth: false,
  freeTierAvailable: true,
  authSetupUrl: 'https://www.reddit.com/prefs/apps',

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    const redditConfig = config as RedditInstanceConfig;
    if (!redditConfig.subreddit) {
      throw new Error('Reddit adapter requires subreddit in config');
    }
    return new RedditSourceInstance(topic, redditConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    const redditConfig = config as RedditInstanceConfig;
    if (!redditConfig.subreddit) {
      return { valid: false, errors: ['subreddit is required'] };
    }
    if (!/^[a-zA-Z0-9_]+$/.test(redditConfig.subreddit)) {
      return { valid: false, errors: ['invalid subreddit name'] };
    }
    return { valid: true };
  }
};
