// src/types.ts
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

export interface PerplexityConfig {
  apiKey: string;
  defaultMaxResults?: number;
}

export interface PerplexitySearchParams {
  query: string;
  max_results?: number;
  include_profile_context?: boolean;
}

export interface PerplexitySearchResult {
  id: string;
  server_time: number;
  results: Array<{
    title: string;
    url: string;
    snippet: string;
    date?: string;
    last_updated?: string;
  }>;
}
