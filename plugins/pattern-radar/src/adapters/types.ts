/**
 * Core adapter interfaces for pattern-radar source system
 */

import { Signal } from '../types.js';

/**
 * Configuration for a source instance
 */
export interface InstanceConfig {
  [key: string]: unknown;
  authenticated?: boolean;
  rateLimitTier?: 'free' | 'authenticated';
}

/**
 * Options for fetching signals
 */
export interface FetchOptions {
  limit?: number;
  since?: Date;
  query?: string;
}

/**
 * Health check result
 */
export interface HealthStatus {
  healthy: boolean;
  message?: string;
  lastChecked: Date;
}

/**
 * Validation result for instance config
 */
export interface ConfigValidation {
  valid: boolean;
  errors?: string[];
}

/**
 * A configured source instance (e.g., reddit:r/reddevils)
 */
export interface SourceInstance {
  id: string;                        // "reddit:r/reddevils"
  adapter: string;                   // "reddit"
  topic: string;                     // "Manchester United"
  config: InstanceConfig;

  fetch(options?: FetchOptions): Promise<Signal[]>;
  healthCheck(): Promise<HealthStatus>;
}

/**
 * A source adapter template (e.g., reddit adapter)
 */
export interface SourceAdapter {
  type: string;                      // "reddit"
  name: string;                      // "Reddit"
  capabilities: string[];            // ["subreddit", "search", "user"]
  requiresAuth: boolean;
  freeTierAvailable: boolean;
  authSetupUrl?: string;

  createInstance(topic: string, config: InstanceConfig): SourceInstance;
  validateConfig(config: InstanceConfig): ConfigValidation;
}

/**
 * Registry of all available adapters
 */
export interface AdapterRegistry {
  adapters: Map<string, SourceAdapter>;
  register(adapter: SourceAdapter): void;
  get(type: string): SourceAdapter | undefined;
  list(): SourceAdapter[];
}
