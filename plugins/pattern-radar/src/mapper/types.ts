/**
 * Types for topic → source mapping
 */

import { InstanceConfig } from '../adapters/types.js';

/**
 * A configured source for a topic
 */
export interface TopicSource {
  adapter: string;
  config: InstanceConfig;
  reason?: string;
}

/**
 * Topic configuration with its sources
 */
export interface TopicConfig {
  topic: string;
  sources: TopicSource[];
  matchedDomain?: string;
  discoveredAt: string;
  lastUsed?: string;
  enabled: boolean;
}

/**
 * Learned mapping stored in shared-memory
 */
export interface LearnedMapping {
  topic: string;
  matchedDomain?: string;
  sources: TopicSource[];
  discoveredAt: string;
  lastUsed?: string;
}

/**
 * Result of topic resolution
 */
export interface TopicResolution {
  topic: string;
  sources: TopicSource[];
  resolutionMethod: 'curated' | 'learned' | 'discovered';
  matchedDomain?: string;
}
