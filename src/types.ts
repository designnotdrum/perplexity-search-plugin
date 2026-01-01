/**
 * Type definitions for the Perplexity Search Plugin.
 *
 * This file contains TypeScript interfaces for:
 * - User profile data stored in Claude Code's profile.json
 * - Perplexity API configuration and request/response types
 *
 * Used by:
 * - PerplexitySearchTool (src/index.ts): Main search tool implementation
 * - Profile manager (src/profileManager.ts): User profile operations
 */

/**
 * User profile structure stored in Claude Code's profile.json.
 * Contains technical preferences and context used to personalize search results.
 */
export interface UserProfile {
  version: string;
  lastUpdated: string;
  lastRefresh: string;
  profile: {
    technicalPreferences: {
      languages: string[];
      frameworks: string[];
      tools: string[];
      patterns: string[];
    };
    workingStyle: {
      explanationPreference: string;
      communicationStyle: string;
      priorities: string[];
    };
    projectContext: {
      domains: string[];
      currentProjects: string[];
      commonTasks: string[];
    };
    knowledgeLevel: {
      expert: string[];
      proficient: string[];
      learning: string[];
    };
  };
}

/**
 * Configuration for Perplexity API client.
 */
export interface PerplexityConfig {
  /**
   * Perplexity API key.
   * @security This field contains sensitive credentials and should never be logged or exposed.
   */
  apiKey: string;
  /**
   * Default maximum number of search results to return.
   * @range 1-10 (Perplexity API limitation)
   */
  defaultMaxResults?: number;
}

/**
 * Parameters for a Perplexity search request.
 */
export interface PerplexitySearchParams {
  query: string;
  /**
   * Maximum number of search results to return.
   * @range 1-10 (Perplexity API limitation)
   */
  max_results?: number;
  include_profile_context?: boolean;
}

/**
 * Individual search result item returned by Perplexity API.
 */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  last_updated?: string;
}

/**
 * Response structure from Perplexity search API.
 */
export interface PerplexitySearchResult {
  id: string;
  server_time: number;
  results: SearchResultItem[];
}
