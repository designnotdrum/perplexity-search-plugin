/**
 * GitHub adapter - wraps existing GitHub source as adapter
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';
import { GitHubSource } from '../sources/github.js';

interface GitHubInstanceConfig extends InstanceConfig {
  searchQuery?: string;
  language?: string;
  token?: string;
}

class GitHubSourceInstance implements SourceInstance {
  id: string;
  adapter = 'github';
  topic: string;
  config: GitHubInstanceConfig;
  private source: GitHubSource;

  constructor(topic: string, config: GitHubInstanceConfig) {
    this.topic = topic;
    this.config = config;
    const suffix = config.language ? `:${config.language}` : '';
    this.id = `github:${topic}${suffix}`;
    this.source = new GitHubSource(config.token);
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const query = this.config.searchQuery || this.topic;
    const limit = options?.limit || 20;

    // If language specified, add to query
    let searchQuery = query;
    if (this.config.language) {
      searchQuery += ` language:${this.config.language}`;
    }

    const result = await this.source.search(searchQuery, limit);
    return result.signals;
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const result = await this.source.search('test', 1);
      return {
        healthy: !result.error,
        message: result.error || 'GitHub API responding',
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

export const githubAdapter: SourceAdapter = {
  type: 'github',
  name: 'GitHub',
  capabilities: ['search', 'trending', 'repos'],
  requiresAuth: false,
  freeTierAvailable: true,
  authSetupUrl: 'https://github.com/settings/tokens',

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    return new GitHubSourceInstance(topic, config as GitHubInstanceConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    return { valid: true };
  }
};
