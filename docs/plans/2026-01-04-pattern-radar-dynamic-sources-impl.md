# Pattern Radar v2: Dynamic Sources Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve pattern-radar from hardcoded sources to dynamic topic-based source discovery with pluggable adapters.

**Architecture:** Source Registry holds adapter templates. Topic→Source Mapper resolves topics to source instances via curated mappings, learned mappings (shared-memory), or LLM discovery fallback. Adapters implement a common interface; custom adapters load from user config directory.

**Tech Stack:** TypeScript, MCP SDK, shared-memory integration, Perplexity for LLM discovery

**Design Doc:** `docs/plans/2026-01-04-pattern-radar-dynamic-sources.md`

---

## Phase 1: Adapter Interface + Refactor Existing Sources

### Task 1.1: Define Core Interfaces

**Files:**
- Create: `plugins/pattern-radar/src/adapters/types.ts`

**Step 1: Create the adapter interface file**

```typescript
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
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/types.ts
git commit -m "feat(pattern-radar): add adapter interface types"
```

---

### Task 1.2: Create Adapter Registry

**Files:**
- Create: `plugins/pattern-radar/src/adapters/registry.ts`

**Step 1: Create the registry implementation**

```typescript
/**
 * Adapter registry - manages available source adapters
 */

import { SourceAdapter, AdapterRegistry } from './types.js';

class AdapterRegistryImpl implements AdapterRegistry {
  adapters: Map<string, SourceAdapter> = new Map();

  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.type)) {
      console.warn(`Adapter ${adapter.type} already registered, overwriting`);
    }
    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): SourceAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// Singleton registry
export const registry = new AdapterRegistryImpl();

/**
 * Register a source adapter
 */
export function registerAdapter(adapter: SourceAdapter): void {
  registry.register(adapter);
}

/**
 * Get an adapter by type
 */
export function getAdapter(type: string): SourceAdapter | undefined {
  return registry.get(type);
}

/**
 * List all registered adapters
 */
export function listAdapters(): SourceAdapter[] {
  return registry.list();
}
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/registry.ts
git commit -m "feat(pattern-radar): add adapter registry"
```

---

### Task 1.3: Refactor HackerNews to Adapter Pattern

**Files:**
- Create: `plugins/pattern-radar/src/adapters/hackernews.ts`
- Modify: `plugins/pattern-radar/src/sources/hackernews.ts` (keep for backwards compat, re-export)

**Step 1: Create HN adapter**

```typescript
/**
 * HackerNews adapter - wraps existing HN source as adapter
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';
import { searchHN } from '../sources/hackernews.js';

interface HNInstanceConfig extends InstanceConfig {
  searchQuery?: string;
}

class HNSourceInstance implements SourceInstance {
  id: string;
  adapter = 'hackernews';
  topic: string;
  config: HNInstanceConfig;

  constructor(topic: string, config: HNInstanceConfig) {
    this.topic = topic;
    this.config = config;
    this.id = config.searchQuery
      ? `hackernews:search:${config.searchQuery}`
      : `hackernews:${topic}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const query = this.config.searchQuery || this.topic;
    const limit = options?.limit || 20;
    return searchHN(query, limit);
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const results = await searchHN('test', 1);
      return {
        healthy: true,
        message: `HN API responding`,
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
```

**Step 2: Update sources/hackernews.ts to export searchHN**

Modify `plugins/pattern-radar/src/sources/hackernews.ts` - ensure `searchHN` function is exported (it likely already is, just verify).

**Step 3: Commit**

```bash
git add plugins/pattern-radar/src/adapters/hackernews.ts
git commit -m "feat(pattern-radar): create HN adapter wrapper"
```

---

### Task 1.4: Refactor GitHub to Adapter Pattern

**Files:**
- Create: `plugins/pattern-radar/src/adapters/github.ts`

**Step 1: Create GitHub adapter**

```typescript
/**
 * GitHub adapter - wraps existing GitHub source as adapter
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';
import { searchGitHub } from '../sources/github.js';

interface GitHubInstanceConfig extends InstanceConfig {
  searchQuery?: string;
  language?: string;
}

class GitHubSourceInstance implements SourceInstance {
  id: string;
  adapter = 'github';
  topic: string;
  config: GitHubInstanceConfig;

  constructor(topic: string, config: GitHubInstanceConfig) {
    this.topic = topic;
    this.config = config;
    const suffix = config.language ? `:${config.language}` : '';
    this.id = `github:${topic}${suffix}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const query = this.config.searchQuery || this.topic;
    const limit = options?.limit || 20;
    return searchGitHub(query, this.config.language, limit);
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const results = await searchGitHub('test', undefined, 1);
      return {
        healthy: true,
        message: `GitHub API responding`,
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
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/github.ts
git commit -m "feat(pattern-radar): create GitHub adapter wrapper"
```

---

### Task 1.5: Create Adapters Index + Register Core Adapters

**Files:**
- Create: `plugins/pattern-radar/src/adapters/index.ts`

**Step 1: Create index that registers all core adapters**

```typescript
/**
 * Adapters index - exports registry and registers core adapters
 */

export * from './types.js';
export * from './registry.js';

import { registerAdapter } from './registry.js';
import { hackernewsAdapter } from './hackernews.js';
import { githubAdapter } from './github.js';

// Register core adapters
registerAdapter(hackernewsAdapter);
registerAdapter(githubAdapter);

// Re-export for convenience
export { hackernewsAdapter } from './hackernews.js';
export { githubAdapter } from './github.js';
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/index.ts
git commit -m "feat(pattern-radar): register core adapters on import"
```

---

### Task 1.6: Verify Build + Manual Test

**Step 1: Build the plugin**

Run: `npm run build:pattern-radar`
Expected: No errors

**Step 2: Commit phase 1 complete**

```bash
git commit --allow-empty -m "milestone: phase 1 complete - adapter interface"
```

---

## Phase 2: Add Reddit + RSS Adapters

### Task 2.1: Create Reddit Adapter

**Files:**
- Create: `plugins/pattern-radar/src/adapters/reddit.ts`

**Step 1: Create Reddit adapter**

```typescript
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

    const data = await response.json();
    const posts: RedditPost[] = data?.data?.children || [];

    return posts.map((post): Signal => ({
      id: `reddit:${post.data.id}`,
      source: 'reddit' as any, // Will update Signal type later
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
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/reddit.ts
git commit -m "feat(pattern-radar): add Reddit adapter"
```

---

### Task 2.2: Create RSS Adapter

**Files:**
- Create: `plugins/pattern-radar/src/adapters/rss.ts`

**Step 1: Create RSS adapter**

```typescript
/**
 * RSS adapter - fetches items from RSS/Atom feeds
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';

interface RSSInstanceConfig extends InstanceConfig {
  url: string;
  name?: string;
}

interface FeedItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

class RSSSourceInstance implements SourceInstance {
  id: string;
  adapter = 'rss';
  topic: string;
  config: RSSInstanceConfig;

  constructor(topic: string, config: RSSInstanceConfig) {
    this.topic = topic;
    this.config = config;
    const hostname = new URL(config.url).hostname;
    this.id = `rss:${config.name || hostname}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const limit = options?.limit || 20;

    const response = await fetch(this.config.url, {
      headers: {
        'User-Agent': 'pattern-radar/1.0 (brain-jar plugin)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`RSS fetch error: ${response.status}`);
    }

    const text = await response.text();
    const items = this.parseRSS(text);

    return items.slice(0, limit).map((item, i): Signal => ({
      id: `rss:${item.guid || `${this.config.url}:${i}`}`,
      source: 'rss' as any,
      title: item.title || 'Untitled',
      url: item.link,
      content: item.description?.replace(/<[^>]*>/g, '').slice(0, 500),
      score: 0, // RSS doesn't have scores
      timestamp: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
      metadata: {
        feedUrl: this.config.url,
        feedName: this.config.name
      }
    }));
  }

  private parseRSS(xml: string): FeedItem[] {
    // Simple regex-based RSS parser (works for most feeds)
    const items: FeedItem[] = [];
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ||
                        xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

    for (const itemXml of itemMatches) {
      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link') ||
                   this.extractAttr(itemXml, 'link', 'href');
      const description = this.extractTag(itemXml, 'description') ||
                          this.extractTag(itemXml, 'summary') ||
                          this.extractTag(itemXml, 'content');
      const pubDate = this.extractTag(itemXml, 'pubDate') ||
                      this.extractTag(itemXml, 'published') ||
                      this.extractTag(itemXml, 'updated');
      const guid = this.extractTag(itemXml, 'guid') ||
                   this.extractTag(itemXml, 'id');

      items.push({ title, link, description, pubDate, guid });
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
  }

  private extractAttr(xml: string, tag: string, attr: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
    return match?.[1];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'pattern-radar/1.0' }
      });

      return {
        healthy: response.ok,
        message: response.ok ? 'Feed accessible' : `HTTP ${response.status}`,
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

export const rssAdapter: SourceAdapter = {
  type: 'rss',
  name: 'RSS/Atom Feed',
  capabilities: ['feed'],
  requiresAuth: false,
  freeTierAvailable: true,

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    const rssConfig = config as RSSInstanceConfig;
    if (!rssConfig.url) {
      throw new Error('RSS adapter requires url in config');
    }
    return new RSSSourceInstance(topic, rssConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    const rssConfig = config as RSSInstanceConfig;
    if (!rssConfig.url) {
      return { valid: false, errors: ['url is required'] };
    }
    try {
      new URL(rssConfig.url);
      return { valid: true };
    } catch {
      return { valid: false, errors: ['invalid URL'] };
    }
  }
};
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/rss.ts
git commit -m "feat(pattern-radar): add RSS/Atom adapter"
```

---

### Task 2.3: Register New Adapters

**Files:**
- Modify: `plugins/pattern-radar/src/adapters/index.ts`

**Step 1: Add imports and register new adapters**

Add to `index.ts`:

```typescript
import { redditAdapter } from './reddit.js';
import { rssAdapter } from './rss.js';

// Register new adapters (add after existing registrations)
registerAdapter(redditAdapter);
registerAdapter(rssAdapter);

// Add to exports
export { redditAdapter } from './reddit.js';
export { rssAdapter } from './rss.js';
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/index.ts
git commit -m "feat(pattern-radar): register Reddit and RSS adapters"
```

---

### Task 2.4: Update Signal Type for New Sources

**Files:**
- Modify: `plugins/pattern-radar/src/types.ts`

**Step 1: Update Signal.source union type**

Find line with `source: 'hackernews' | 'github' | 'perplexity'` and update to:

```typescript
source: 'hackernews' | 'github' | 'perplexity' | 'reddit' | 'rss';
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/types.ts
git commit -m "feat(pattern-radar): add reddit and rss to Signal source type"
```

---

### Task 2.5: Build + Test New Adapters

**Step 1: Build**

Run: `npm run build:pattern-radar`
Expected: No errors

**Step 2: Quick manual test (optional)**

Create a test script `plugins/pattern-radar/test-adapters.js`:

```javascript
import { getAdapter } from './dist/adapters/index.js';

async function test() {
  // Test Reddit
  const reddit = getAdapter('reddit');
  const redditInstance = reddit.createInstance('Test', { subreddit: 'programming' });
  const redditSignals = await redditInstance.fetch({ limit: 3 });
  console.log('Reddit signals:', redditSignals.length);

  // Test RSS
  const rss = getAdapter('rss');
  const rssInstance = rss.createInstance('Test', { url: 'https://hnrss.org/frontpage' });
  const rssSignals = await rssInstance.fetch({ limit: 3 });
  console.log('RSS signals:', rssSignals.length);
}

test().catch(console.error);
```

Run: `node plugins/pattern-radar/test-adapters.js`

**Step 3: Commit milestone**

```bash
git commit --allow-empty -m "milestone: phase 2 complete - Reddit + RSS adapters"
```

---

## Phase 3: Topic → Source Mapper

### Task 3.1: Create Curated Mappings

**Files:**
- Create: `plugins/pattern-radar/src/mapper/mappings.ts`

**Step 1: Create curated domain mappings**

```typescript
/**
 * Curated domain → source type mappings
 * These ship with the plugin and provide reliable defaults
 */

export interface DomainMapping {
  domain: string;
  keywords: string[];
  sourceTypes: string[];
  discoveryHints: string;
}

export const CURATED_MAPPINGS: DomainMapping[] = [
  {
    domain: 'sports/football',
    keywords: ['football', 'soccer', 'premier league', 'la liga', 'champions league', 'bundesliga', 'serie a', 'world cup', 'uefa'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Look for team-specific subreddits (r/reddevils, r/gunners, r/LiverpoolFC), league subreddits (r/soccer, r/PremierLeague)'
  },
  {
    domain: 'sports/american-football',
    keywords: ['nfl', 'american football', 'super bowl', 'touchdown'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits (r/eagles, r/patriots, r/cowboys), r/nfl'
  },
  {
    domain: 'sports/basketball',
    keywords: ['nba', 'basketball', 'wnba'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits, r/nba'
  },
  {
    domain: 'sports/baseball',
    keywords: ['mlb', 'baseball', 'world series'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits, r/baseball'
  },
  {
    domain: 'finance/stocks',
    keywords: ['stocks', 'investing', 'trading', 'market', 'portfolio', 'dividend', 'etf'],
    sourceTypes: ['reddit', 'rss', 'hackernews'],
    discoveryHints: 'r/stocks, r/investing, r/wallstreetbets, Yahoo Finance RSS'
  },
  {
    domain: 'finance/crypto',
    keywords: ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'defi', 'nft', 'web3'],
    sourceTypes: ['reddit', 'rss', 'hackernews', 'github'],
    discoveryHints: 'r/cryptocurrency, r/bitcoin, r/ethereum, CoinDesk RSS'
  },
  {
    domain: 'gaming',
    keywords: ['gaming', 'video games', 'esports', 'playstation', 'xbox', 'nintendo', 'steam', 'pc gaming'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Game-specific subreddits, r/gaming, r/pcgaming, r/Games'
  },
  {
    domain: 'tech/programming',
    keywords: ['programming', 'software', 'coding', 'developer', 'engineering'],
    sourceTypes: ['hackernews', 'github', 'reddit'],
    discoveryHints: 'r/programming, r/learnprogramming, language-specific subs'
  },
  {
    domain: 'tech/ai',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'claude', 'neural network', 'deep learning'],
    sourceTypes: ['hackernews', 'github', 'reddit', 'rss'],
    discoveryHints: 'r/MachineLearning, r/LocalLLaMA, r/artificial, arXiv RSS'
  },
  {
    domain: 'tech/startups',
    keywords: ['startup', 'entrepreneur', 'founder', 'vc', 'venture capital', 'saas', 'b2b'],
    sourceTypes: ['hackernews', 'reddit', 'rss'],
    discoveryHints: 'r/startups, r/Entrepreneur, TechCrunch RSS'
  },
  {
    domain: 'entertainment/movies',
    keywords: ['movies', 'film', 'cinema', 'oscar', 'hollywood', 'streaming'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'r/movies, r/MovieDetails, r/boxoffice'
  },
  {
    domain: 'entertainment/tv',
    keywords: ['tv shows', 'television', 'streaming', 'netflix', 'hbo'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Show-specific subreddits, r/television'
  },
  {
    domain: 'science',
    keywords: ['science', 'research', 'physics', 'biology', 'chemistry', 'astronomy', 'space'],
    sourceTypes: ['reddit', 'rss', 'hackernews'],
    discoveryHints: 'r/science, r/space, r/physics, Nature RSS'
  }
];

/**
 * Find matching domain for a topic based on keywords
 */
export function findMatchingDomain(topic: string): DomainMapping | undefined {
  const topicLower = topic.toLowerCase();

  for (const mapping of CURATED_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (topicLower.includes(keyword)) {
        return mapping;
      }
    }
  }

  return undefined;
}
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/mappings.ts
git commit -m "feat(pattern-radar): add curated domain mappings"
```

---

### Task 3.2: Create Topic Config Types

**Files:**
- Create: `plugins/pattern-radar/src/mapper/types.ts`

**Step 1: Create mapper types**

```typescript
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
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/types.ts
git commit -m "feat(pattern-radar): add topic mapper types"
```

---

### Task 3.3: Create Topic Mapper

**Files:**
- Create: `plugins/pattern-radar/src/mapper/mapper.ts`

**Step 1: Create the mapper implementation**

```typescript
/**
 * Topic → Source Mapper
 * Resolves topics to source instances via curated, learned, or discovered mappings
 */

import { getAdapter } from '../adapters/index.js';
import { SourceInstance } from '../adapters/types.js';
import { CURATED_MAPPINGS, findMatchingDomain } from './mappings.js';
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
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/mapper.ts
git commit -m "feat(pattern-radar): add topic mapper with curated + learned resolution"
```

---

### Task 3.4: Create Mapper Index

**Files:**
- Create: `plugins/pattern-radar/src/mapper/index.ts`

**Step 1: Create index**

```typescript
/**
 * Mapper module exports
 */

export * from './types.js';
export * from './mappings.js';
export * from './mapper.js';
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/index.ts
git commit -m "feat(pattern-radar): add mapper module index"
```

---

### Task 3.5: Build + Verify

**Step 1: Build**

Run: `npm run build:pattern-radar`
Expected: No errors

**Step 2: Commit milestone**

```bash
git commit --allow-empty -m "milestone: phase 3 complete - topic mapper with curated mappings"
```

---

## Phase 4: LLM Discovery + Integration

### Task 4.1: Create Discovery Module

**Files:**
- Create: `plugins/pattern-radar/src/mapper/discovery.ts`

**Step 1: Create LLM discovery**

```typescript
/**
 * LLM-powered source discovery for novel topics
 * Uses Perplexity to find relevant sources for topics not in curated mappings
 */

import { TopicSource, LearnedMapping } from './types.js';
import { listAdapters } from '../adapters/index.js';

interface DiscoveryResult {
  sources: TopicSource[];
  domain?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Build the structured discovery prompt
 */
function buildDiscoveryPrompt(topic: string): string {
  const adapters = listAdapters();
  const adapterList = adapters
    .map(a => `- ${a.type}: ${a.capabilities.join(', ')}`)
    .join('\n');

  return `I need to find sources to track "${topic}".

Available source types:
${adapterList}

For each applicable source, provide specific configuration:
- reddit: { "subreddit": "exact_subreddit_name" }
- rss: { "url": "https://exact.feed.url/rss" }
- hackernews: { "searchQuery": "search terms" } (optional, defaults to topic)
- github: { "searchQuery": "search terms", "language": "optional" }

Return JSON only:
{
  "sources": [
    { "adapter": "reddit", "config": { "subreddit": "..." }, "reason": "..." }
  ],
  "domain": "category like sports/football or tech/ai",
  "confidence": "high" | "medium" | "low"
}

Only include sources you're confident exist. Verify subreddit names are real.`;
}

/**
 * Parse discovery response from LLM
 */
function parseDiscoveryResponse(response: string): DiscoveryResult | null {
  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.sources || !Array.isArray(parsed.sources)) {
      return null;
    }

    return {
      sources: parsed.sources.map((s: any) => ({
        adapter: s.adapter,
        config: s.config || {},
        reason: s.reason
      })),
      domain: parsed.domain,
      confidence: parsed.confidence || 'medium'
    };
  } catch {
    return null;
  }
}

/**
 * Discover sources for a topic using LLM
 * Returns null if discovery fails - caller should handle gracefully
 */
export async function discoverSourcesForTopic(
  topic: string,
  perplexitySearch: (query: string) => Promise<string>
): Promise<DiscoveryResult | null> {
  const prompt = buildDiscoveryPrompt(topic);

  try {
    const response = await perplexitySearch(prompt);
    return parseDiscoveryResponse(response);
  } catch (error) {
    console.error('Discovery failed:', error);
    return null;
  }
}

/**
 * Validate discovered sources by health-checking each one
 */
export async function validateDiscoveredSources(
  sources: TopicSource[]
): Promise<{ valid: TopicSource[]; invalid: TopicSource[] }> {
  const { getAdapter } = await import('../adapters/index.js');

  const valid: TopicSource[] = [];
  const invalid: TopicSource[] = [];

  for (const source of sources) {
    const adapter = getAdapter(source.adapter);
    if (!adapter) {
      invalid.push(source);
      continue;
    }

    try {
      const instance = adapter.createInstance('test', source.config);
      const health = await instance.healthCheck();

      if (health.healthy) {
        valid.push(source);
      } else {
        invalid.push(source);
      }
    } catch {
      invalid.push(source);
    }
  }

  return { valid, invalid };
}

/**
 * Full discovery flow: discover → validate → return
 */
export async function discoverAndValidate(
  topic: string,
  perplexitySearch: (query: string) => Promise<string>
): Promise<LearnedMapping | null> {
  const discovered = await discoverSourcesForTopic(topic, perplexitySearch);
  if (!discovered || discovered.sources.length === 0) {
    return null;
  }

  const { valid } = await validateDiscoveredSources(discovered.sources);
  if (valid.length === 0) {
    return null;
  }

  return {
    topic,
    sources: valid,
    matchedDomain: discovered.domain,
    discoveredAt: new Date().toISOString()
  };
}
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/discovery.ts
git commit -m "feat(pattern-radar): add LLM-powered source discovery"
```

---

### Task 4.2: Update Mapper Index

**Files:**
- Modify: `plugins/pattern-radar/src/mapper/index.ts`

**Step 1: Add discovery export**

```typescript
export * from './discovery.js';
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/mapper/index.ts
git commit -m "feat(pattern-radar): export discovery module"
```

---

### Task 4.3: Add scan_topic Tool

**Files:**
- Modify: `plugins/pattern-radar/src/index.ts`

**Step 1: Add new MCP tool for topic-based scanning**

Add this tool definition after existing tools:

```typescript
server.tool(
  'scan_topic',
  'Scan a specific topic across dynamically discovered sources',
  {
    topic: z.string().describe('The topic to scan (e.g., "Manchester United", "Korean baseball")'),
    limit: z.number().optional().default(20).describe('Max results per source'),
    discover: z.boolean().optional().default(true).describe('Use LLM to discover sources if not cached')
  },
  async ({ topic, limit, discover }) => {
    // Import mapper functions
    const { resolveTopic, createInstancesForTopic, saveLearnedMapping } = await import('./mapper/index.js');
    const { discoverAndValidate } = await import('./mapper/discovery.js');

    // Resolve topic to sources
    let resolution = await resolveTopic(topic);

    // If no sources and discovery enabled, try LLM discovery
    if (resolution.sources.length === 0 && discover) {
      // Use perplexity search for discovery
      const perplexitySearch = async (query: string) => {
        // This will be wired up to actual perplexity
        const { searchPerplexity } = await import('./sources/perplexity.js');
        return searchPerplexity(query);
      };

      const discovered = await discoverAndValidate(topic, perplexitySearch);
      if (discovered) {
        saveLearnedMapping(discovered);
        resolution = {
          topic,
          sources: discovered.sources,
          resolutionMethod: 'discovered',
          matchedDomain: discovered.matchedDomain
        };
      }
    }

    if (resolution.sources.length === 0) {
      return {
        content: [{
          type: 'text',
          text: `No sources found for "${topic}". Try adding specific sources manually.`
        }]
      };
    }

    // Create instances and fetch
    const config = {
      topic,
      sources: resolution.sources,
      discoveredAt: new Date().toISOString(),
      enabled: true
    };

    const instances = createInstancesForTopic(config);
    const allSignals: Signal[] = [];

    for (const instance of instances) {
      try {
        const signals = await instance.fetch({ limit });
        allSignals.push(...signals);
      } catch (error) {
        console.warn(`Failed to fetch from ${instance.id}:`, error);
      }
    }

    // Sort by score
    allSignals.sort((a, b) => b.score - a.score);

    // Format output
    const output = [
      `# Topic Scan: ${topic}`,
      ``,
      `Resolution: ${resolution.resolutionMethod}${resolution.matchedDomain ? ` (${resolution.matchedDomain})` : ''}`,
      `Sources: ${instances.map(i => i.id).join(', ')}`,
      ``,
      `## Top Signals`,
      ``,
      ...allSignals.slice(0, limit).map(s =>
        `- [${s.source}] ${s.title} (${s.score} pts) - ${s.url || 'no url'}`
      )
    ].join('\n');

    return {
      content: [{ type: 'text', text: output }]
    };
  }
);
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/index.ts
git commit -m "feat(pattern-radar): add scan_topic tool with dynamic discovery"
```

---

### Task 4.4: Build + Test

**Step 1: Build**

Run: `npm run build:pattern-radar`
Expected: No errors (may need import fixes)

**Step 2: Fix any import issues**

If build fails, fix imports and rebuild.

**Step 3: Commit milestone**

```bash
git commit --allow-empty -m "milestone: phase 4 complete - LLM discovery integration"
```

---

## Phase 5: /create-adapter Skill

### Task 5.1: Create Skill File

**Files:**
- Create: `plugins/pattern-radar/skills/create-adapter/SKILL.md`

**Step 1: Create the skill**

```markdown
---
name: create-adapter
description: Create a custom source adapter for pattern-radar
---

# Create Custom Adapter

Guide the user through creating a custom source adapter for pattern-radar.

## Process

1. **Ask what source they want to add**
   - Get the name and URL/API of the source

2. **Analyze the source**
   - Fetch the URL to understand its structure
   - Determine if it's RSS, JSON API, or needs scraping
   - Identify authentication requirements

3. **Generate the adapter**
   - Use the SourceAdapter interface from `plugins/pattern-radar/src/adapters/types.ts`
   - Create a TypeScript file with the adapter implementation
   - Include proper error handling and health check

4. **Test the adapter**
   - Create a test instance
   - Fetch a few signals to verify it works
   - Health check the source

5. **Save to user config**
   - Save to `~/.config/pattern-radar/adapters/<name>.ts`
   - Inform user how to use it

## Adapter Template

```typescript
import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';

interface MyInstanceConfig extends InstanceConfig {
  // Add config fields here
}

class MySourceInstance implements SourceInstance {
  id: string;
  adapter = 'my-source';
  topic: string;
  config: MyInstanceConfig;

  constructor(topic: string, config: MyInstanceConfig) {
    this.topic = topic;
    this.config = config;
    this.id = `my-source:${topic}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    // Implement fetching
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, lastChecked: new Date() };
  }
}

export const mySourceAdapter: SourceAdapter = {
  type: 'my-source',
  name: 'My Source',
  capabilities: ['search'],
  requiresAuth: false,
  freeTierAvailable: true,

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    return new MySourceInstance(topic, config as MyInstanceConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    return { valid: true };
  }
};
```

## Example Interaction

```
User: /create-adapter

Claude: What source do you want to add to pattern-radar?

User: There's a Korean baseball stats site at statiz.co.kr

Claude: Let me check that out...
[fetches site, analyzes structure]

I found statiz.co.kr has a news section with an RSS-like structure.
Should I create an RSS adapter configured for their news feed?

User: Yes

Claude: [generates adapter]
Created adapter at ~/.config/pattern-radar/adapters/statiz-kbo.ts
Testing... fetched 12 articles successfully!

The adapter is ready. It will be used when you add "Korean baseball" as a topic.
```
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/skills/create-adapter/SKILL.md
git commit -m "feat(pattern-radar): add /create-adapter skill"
```

---

### Task 5.2: Create Custom Adapter Loader

**Files:**
- Create: `plugins/pattern-radar/src/adapters/loader.ts`

**Step 1: Create loader for custom adapters**

```typescript
/**
 * Custom adapter loader
 * Loads user-created adapters from ~/.config/pattern-radar/adapters/
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { registerAdapter } from './registry.js';
import { SourceAdapter } from './types.js';

const CUSTOM_ADAPTERS_DIR = join(homedir(), '.config', 'pattern-radar', 'adapters');

/**
 * Load all custom adapters from user config directory
 */
export async function loadCustomAdapters(): Promise<string[]> {
  if (!existsSync(CUSTOM_ADAPTERS_DIR)) {
    return [];
  }

  const loaded: string[] = [];
  const files = readdirSync(CUSTOM_ADAPTERS_DIR).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const modulePath = join(CUSTOM_ADAPTERS_DIR, file);
      const module = await import(modulePath);

      // Look for exported adapter
      const adapter = module.default || Object.values(module).find(
        (v: any) => v?.type && v?.createInstance
      ) as SourceAdapter | undefined;

      if (adapter) {
        registerAdapter(adapter);
        loaded.push(adapter.type);
      }
    } catch (error) {
      console.warn(`Failed to load custom adapter ${file}:`, error);
    }
  }

  return loaded;
}
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/adapters/loader.ts
git commit -m "feat(pattern-radar): add custom adapter loader"
```

---

### Task 5.3: Wire Up Custom Loader in Main

**Files:**
- Modify: `plugins/pattern-radar/src/index.ts`

**Step 1: Load custom adapters on startup**

Add near the top of the file, after core adapter imports:

```typescript
import { loadCustomAdapters } from './adapters/loader.js';

// Load custom adapters
loadCustomAdapters().then(loaded => {
  if (loaded.length > 0) {
    console.error(`Loaded custom adapters: ${loaded.join(', ')}`);
  }
}).catch(err => {
  console.error('Failed to load custom adapters:', err);
});
```

**Step 2: Commit**

```bash
git add plugins/pattern-radar/src/index.ts
git commit -m "feat(pattern-radar): load custom adapters on startup"
```

---

### Task 5.4: Final Build + Version Bump

**Step 1: Build**

Run: `npm run build:pattern-radar`
Expected: No errors

**Step 2: Use /release skill**

Run: `/release pattern-radar minor "Dynamic source architecture with Reddit, RSS adapters and LLM discovery"`

---

## Summary

This plan implements the pattern-radar v2 dynamic sources feature in 5 phases:

1. **Adapter Interface** - Core types and refactor existing sources
2. **New Adapters** - Reddit and RSS adapters
3. **Topic Mapper** - Curated mappings and resolution logic
4. **LLM Discovery** - Perplexity-powered source discovery
5. **Custom Adapters** - /create-adapter skill and loader

Each phase builds on the previous and can be tested independently.
