/**
 * Quality tier from quick scan
 */
export type SignalTier = 'verified' | 'unverified' | 'dead';

/**
 * Quick scan result (attached to Signal during digest)
 */
export interface QuickScanResult {
  tier: SignalTier;
  engagement: {
    points: number;
    comments: number;
    passesThreshold: boolean;
  };
  age: {
    days: number;
    isStale: boolean;
  };
}

/**
 * Site health check result
 */
export interface SiteHealthResult {
  status: number | null;
  isLive: boolean;
  checkedAt: string;
}

/**
 * Product signal detection result
 */
export interface ProductSignalsResult {
  method: 'heuristics' | 'perplexity' | 'both';
  isProduct: boolean | null;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  redFlags: string[];
}

/**
 * Deep validation result (on-demand)
 */
export interface ValidationResult {
  siteHealth: SiteHealthResult;
  recency: {
    isStale: boolean;
    daysSincePost: number;
  };
  productSignals: ProductSignalsResult;
  overallVerdict: 'verified' | 'caution' | 'dead';
}

/**
 * A signal from a source (HN story, GitHub repo, etc.)
 */
export interface Signal {
  id: string;
  source: 'hackernews' | 'github' | 'perplexity' | 'reddit' | 'rss';
  title: string;
  url?: string;
  content?: string;
  score: number;
  timestamp: string;
  metadata: Record<string, unknown>;
  quickScan?: QuickScanResult;
  validation?: ValidationResult;
}

/**
 * A detected pattern (cluster of related signals)
 */
export interface Pattern {
  id: string;
  title: string;
  description: string;
  signals: Signal[];
  relevanceScore: number;
  domains: string[];
  detectedAt: string;
  actionable: ActionableInsight[];
}

/**
 * An actionable insight derived from a pattern
 */
export interface ActionableInsight {
  type: 'learn' | 'build' | 'invest' | 'explore';
  suggestion: string;
  effort: 'low' | 'medium' | 'high';
  reason: string;
}

/**
 * User's radar configuration
 */
export interface RadarConfig {
  sources: {
    hackernews: { enabled: boolean; weight: number };
    github: { enabled: boolean; languages: string[]; weight: number };
    perplexity: { enabled: boolean; weight: number };
  };
  domains: string[];
  alertThreshold: number;
  digestFrequency: 'daily' | 'weekly' | 'manual';
}

/**
 * User profile (subset relevant to pattern-radar)
 */
export interface UserProfile {
  identity?: {
    name?: string;
    role?: string;
    experienceLevel?: string;
  };
  technical?: {
    languages?: string[];
    frameworks?: string[];
    domains?: string[];
  };
  knowledge?: {
    domains?: string[];
    interests?: string[];
  };
}

/**
 * GitHub trending repo
 */
export interface GitHubRepo {
  name: string;
  fullName: string;
  description: string;
  url: string;
  stars: number;
  starsToday: number;
  language: string;
  topics: string[];
}

/**
 * Hacker News story
 */
export interface HNStory {
  id: number;
  title: string;
  url?: string;
  points: number;
  numComments: number;
  author: string;
  createdAt: string;
}

/**
 * Scan result from a source
 */
export interface ScanResult {
  source: string;
  signals: Signal[];
  scannedAt: string;
  error?: string;
}

/**
 * Radar digest result
 */
export interface DigestResult {
  patterns: Pattern[];
  topSignals: Signal[];
  domains: string[];
  generatedAt: string;
}

/**
 * Default radar configuration
 */
export function getDefaultConfig(): RadarConfig {
  return {
    sources: {
      hackernews: { enabled: true, weight: 1.0 },
      github: { enabled: true, languages: [], weight: 1.0 },
      perplexity: { enabled: true, weight: 1.0 },
    },
    domains: [],
    alertThreshold: 0.7,
    digestFrequency: 'manual',
  };
}
