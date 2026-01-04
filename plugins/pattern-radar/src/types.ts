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
  digestId?: string;  // Provenance: which digest this signal belongs to
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
  digestId?: string;  // Provenance: which digest this pattern belongs to
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
 * Radar digest result (ephemeral, returned from tools)
 */
export interface DigestResult {
  patterns: Pattern[];
  topSignals: Signal[];
  domains: string[];
  generatedAt: string;
}

/**
 * Digest lifecycle status
 */
export type DigestStatus = 'fresh' | 'actioned' | 'stale';

/**
 * A persisted radar digest with lifecycle management
 */
export interface RadarDigest {
  id: string;
  scope: 'global';              // Always global (forward-looking tool)
  generatedAt: string;          // ISO timestamp
  status: DigestStatus;
  lastActionedAt?: string;      // When user explored/validated a signal
  expiresAt: string;            // generatedAt + 30 days
  domains: string[];            // User's domains at generation time
  signalCount: number;
  patternCount: number;
  // Summary for display without loading full data
  topPatternTitles: string[];
  topSignalTitles: string[];
}

/**
 * Full digest data stored separately (to keep digest list lightweight)
 */
export interface RadarDigestData {
  digestId: string;
  signals: Signal[];
  patterns: Pattern[];
}

/**
 * Row format in SQLite for digests
 */
export interface DigestRow {
  id: string;
  scope: string;
  generated_at: string;
  status: string;
  last_actioned_at: string | null;
  expires_at: string;
  domains_json: string;
  signal_count: number;
  pattern_count: number;
  top_pattern_titles_json: string;
  top_signal_titles_json: string;
}

/**
 * Row format in SQLite for digest data
 */
export interface DigestDataRow {
  digest_id: string;
  signals_json: string;
  patterns_json: string;
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
