/**
 * Topic → Source Mapper
 * Resolves topics to source instances via curated, learned, or discovered mappings
 */

import { getAdapter } from '../adapters/index.js';
import { SourceInstance } from '../adapters/types.js';
import { findMatchingDomain } from './mappings.js';
import { TopicConfig, TopicSource, TopicResolution, LearnedMapping } from './types.js';

// In-memory cache of learned mappings (will be synced to shared-memory)
let learnedMappings: LearnedMapping[] = [];

/**
 * Load learned mappings from shared-memory
 */
export async function loadLearnedMappings(mappings: LearnedMapping[]): Promise<void> {
  learnedMappings = mappings;
}

/**
 * Save a learned mapping
 */
export function saveLearnedMapping(mapping: LearnedMapping): void {
  const existing = learnedMappings.findIndex(m => m.topic === mapping.topic);
  if (existing >= 0) {
    learnedMappings[existing] = mapping;
  } else {
    learnedMappings.push(mapping);
  }
}

/**
 * Get all learned mappings (for persistence)
 */
export function getLearnedMappings(): LearnedMapping[] {
  return learnedMappings;
}

/**
 * Find learned mapping for a topic
 */
function findLearnedMapping(topic: string): LearnedMapping | undefined {
  const topicLower = topic.toLowerCase();
  return learnedMappings.find(m => m.topic.toLowerCase() === topicLower);
}

/**
 * Resolve a topic to source configurations
 * Priority: learned → curated → needs discovery
 */
export async function resolveTopic(topic: string): Promise<TopicResolution> {
  // 1. Check learned mappings first
  const learned = findLearnedMapping(topic);
  if (learned) {
    return {
      topic,
      sources: learned.sources,
      resolutionMethod: 'learned',
      matchedDomain: learned.matchedDomain
    };
  }

  // 2. Check curated mappings
  const domain = findMatchingDomain(topic);
  if (domain) {
    // For curated, we know source types but not specific instances
    // Return source types as hints - discovery will fill in specifics
    return {
      topic,
      sources: domain.sourceTypes.map(type => ({
        adapter: type,
        config: {},
        reason: `Curated mapping for ${domain.domain}`
      })),
      resolutionMethod: 'curated',
      matchedDomain: domain.domain
    };
  }

  // 3. No mapping found - needs LLM discovery
  return {
    topic,
    sources: [],
    resolutionMethod: 'discovered',
    matchedDomain: undefined
  };
}

/**
 * Create source instances from a topic config
 */
export function createInstancesForTopic(config: TopicConfig): SourceInstance[] {
  const instances: SourceInstance[] = [];

  for (const source of config.sources) {
    const adapter = getAdapter(source.adapter);
    if (!adapter) {
      console.warn(`Unknown adapter: ${source.adapter}`);
      continue;
    }

    try {
      const instance = adapter.createInstance(config.topic, source.config);
      instances.push(instance);
    } catch (error) {
      console.warn(`Failed to create ${source.adapter} instance:`, error);
    }
  }

  return instances;
}
