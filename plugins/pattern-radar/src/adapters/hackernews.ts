/**
 * HackerNews adapter - wraps existing HN source as adapter
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';
import { HackerNewsSource } from '../sources/hackernews.js';

interface HNInstanceConfig extends InstanceConfig {
  searchQuery?: string;
}

class HNSourceInstance implements SourceInstance {
  id: string;
  adapter = 'hackernews';
  topic: string;
  config: HNInstanceConfig;
  private source: HackerNewsSource;

  constructor(topic: string, config: HNInstanceConfig) {
    this.topic = topic;
    this.config = config;
    this.id = config.searchQuery
      ? `hackernews:search:${config.searchQuery}`
      : `hackernews:${topic}`;
    this.source = new HackerNewsSource();
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const query = this.config.searchQuery || this.topic;
    const limit = options?.limit || 20;
    const result = await this.source.search(query, limit);
    return result.signals;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const result = await this.source.search('test', 1);
      return {
        healthy: !result.error,
        message: result.error || 'HN API responding',
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

export const hackernewsAdapter: SourceAdapter = {
  type: 'hackernews',
  name: 'Hacker News',
  capabilities: ['search', 'trending'],
  requiresAuth: false,
  freeTierAvailable: true,

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    return new HNSourceInstance(topic, config as HNInstanceConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    return { valid: true };
  }
};
