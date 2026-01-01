# Perplexity Search MCP Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an MCP server that provides Perplexity search with personalized context enrichment and a skill that defines when to use it automatically.

**Architecture:** TypeScript MCP server exposing a `perplexity_search` tool that loads user profile, enriches queries with personal context, and calls Perplexity API. Automatic profile refresh every 2 days via episodic memory search. Smart detection updates profile when user mentions preferences.

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, @perplexity-ai/perplexity_ai, Node.js fs/promises

---

## Task 1: TypeScript Types and Interfaces

**Files:**
- Create: `src/types.ts`

**Step 1: Write the type definitions**

```typescript
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
```

**Step 2: Verify TypeScript compilation**

Run: `npm run typecheck`
Expected: No errors

**Step 3: Commit types**

```bash
git add src/types.ts
git commit -m "feat: add TypeScript types for profile, config, and search results"
```

---

## Task 2: Profile Manager - CRUD Operations

**Files:**
- Create: `src/profile/manager.ts`

**Step 1: Write test for profile manager**

Create: `src/profile/manager.test.ts`

```typescript
// src/profile/manager.test.ts
import { ProfileManager } from './manager';
import { UserProfile } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('ProfileManager', () => {
  let tempDir: string;
  let profilePath: string;
  let manager: ProfileManager;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'profile-test-'));
    profilePath = path.join(tempDir, 'user-profile.json');
    manager = new ProfileManager(profilePath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates default profile if none exists', async () => {
    const profile = await manager.load();

    expect(profile.version).toBe('1.0');
    expect(profile.profile.technicalPreferences.languages).toEqual([]);
    expect(profile.profile.workingStyle.explanationPreference).toBe('');
  });

  it('loads existing profile', async () => {
    const testProfile: UserProfile = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      profile: {
        technicalPreferences: {
          languages: ['TypeScript'],
          frameworks: ['React'],
          tools: ['Git'],
          patterns: ['Type safety first']
        },
        workingStyle: {
          explanationPreference: 'concise',
          communicationStyle: 'direct',
          priorities: ['quality']
        },
        projectContext: {
          domains: ['B2B SaaS'],
          currentProjects: ['test-project'],
          commonTasks: ['debugging']
        },
        knowledgeLevel: {
          expert: ['TypeScript'],
          proficient: ['React'],
          learning: []
        }
      }
    };

    await fs.writeFile(profilePath, JSON.stringify(testProfile, null, 2));

    const loaded = await manager.load();
    expect(loaded.profile.technicalPreferences.languages).toContain('TypeScript');
  });

  it('saves profile updates', async () => {
    const profile = await manager.load();
    profile.profile.technicalPreferences.languages.push('Python');

    await manager.save(profile);

    const reloaded = await manager.load();
    expect(reloaded.profile.technicalPreferences.languages).toContain('Python');
  });

  it('checks if profile needs refresh', async () => {
    const profile = await manager.load();

    // Fresh profile should not need refresh
    expect(await manager.needsRefresh()).toBe(false);

    // Set lastRefresh to 3 days ago
    profile.lastRefresh = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await manager.save(profile);

    expect(await manager.needsRefresh()).toBe(true);
  });
});
```

**Step 2: Install test dependencies**

Run: `npm install -D jest @types/jest ts-jest`

Add to package.json scripts:
```json
"test": "jest",
"test:watch": "jest --watch"
```

Create: `jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/types.ts']
};
```

**Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Cannot find module './manager'"

**Step 4: Implement ProfileManager**

Create: `src/profile/manager.ts`

```typescript
// src/profile/manager.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { UserProfile } from '../types';

export class ProfileManager {
  constructor(private profilePath: string) {}

  async load(): Promise<UserProfile> {
    try {
      const data = await fs.readFile(this.profilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return this.createDefaultProfile();
      }
      throw error;
    }
  }

  async save(profile: UserProfile): Promise<void> {
    const dir = path.dirname(this.profilePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.profilePath, JSON.stringify(profile, null, 2));
  }

  async needsRefresh(): Promise<boolean> {
    try {
      const profile = await this.load();
      const lastRefresh = new Date(profile.lastRefresh);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      return lastRefresh < twoDaysAgo;
    } catch {
      return false;
    }
  }

  private createDefaultProfile(): UserProfile {
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      profile: {
        technicalPreferences: {
          languages: [],
          frameworks: [],
          tools: [],
          patterns: []
        },
        workingStyle: {
          explanationPreference: '',
          communicationStyle: '',
          priorities: []
        },
        projectContext: {
          domains: [],
          currentProjects: [],
          commonTasks: []
        },
        knowledgeLevel: {
          expert: [],
          proficient: [],
          learning: []
        }
      }
    };
  }
}
```

**Step 5: Run test to verify it passes**

Run: `npm test`
Expected: All tests PASS

**Step 6: Commit profile manager**

```bash
git add src/profile/manager.ts src/profile/manager.test.ts jest.config.js package.json
git commit -m "feat: implement profile manager with CRUD operations and refresh check"
```

---

## Task 3: Smart Detection Pattern Matcher

**Files:**
- Create: `src/profile/smart-detection.ts`
- Create: `src/profile/smart-detection.test.ts`

**Step 1: Write test for smart detection**

```typescript
// src/profile/smart-detection.test.ts
import { SmartDetector } from './smart-detection';
import { UserProfile } from '../types';

describe('SmartDetector', () => {
  let detector: SmartDetector;
  let profile: UserProfile;

  beforeEach(() => {
    detector = new SmartDetector();
    profile = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      profile: {
        technicalPreferences: {
          languages: [],
          frameworks: [],
          tools: [],
          patterns: []
        },
        workingStyle: {
          explanationPreference: '',
          communicationStyle: '',
          priorities: []
        },
        projectContext: {
          domains: [],
          currentProjects: [],
          commonTasks: []
        },
        knowledgeLevel: {
          expert: [],
          proficient: [],
          learning: []
        }
      }
    };
  });

  it('detects language preferences', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I prefer TypeScript over JavaScript for type safety"
    );

    expect(updated.profile.technicalPreferences.languages).toContain('TypeScript');
    expect(updated.profile.technicalPreferences.patterns).toContain('prefer TypeScript over JavaScript');
  });

  it('detects learning goals', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I'm trying to learn Rust for systems programming"
    );

    expect(updated.profile.knowledgeLevel.learning).toContain('Rust');
  });

  it('detects current projects', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I'm working on a B2B SaaS application"
    );

    expect(updated.profile.projectContext.domains).toContain('B2B SaaS');
  });

  it('detects tools and frameworks', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I use React and Next.js for all my projects"
    );

    expect(updated.profile.technicalPreferences.frameworks).toContain('React');
    expect(updated.profile.technicalPreferences.frameworks).toContain('Next.js');
  });

  it('detects expertise levels', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I'm an expert in TypeScript but learning Rust"
    );

    expect(updated.profile.knowledgeLevel.expert).toContain('TypeScript');
    expect(updated.profile.knowledgeLevel.learning).toContain('Rust');
  });

  it('detects avoidance patterns', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "I avoid using Python because I prefer static typing"
    );

    expect(updated.profile.technicalPreferences.patterns).toContain('avoid Python');
  });

  it('updates lastUpdated timestamp', () => {
    const before = new Date(profile.lastUpdated);
    const updated = detector.detectAndUpdate(
      profile,
      "I prefer TypeScript"
    );
    const after = new Date(updated.lastUpdated);

    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('returns unchanged profile for non-preference statements', () => {
    const updated = detector.detectAndUpdate(
      profile,
      "What is the weather today?"
    );

    expect(updated).toEqual(profile);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Cannot find module './smart-detection'"

**Step 3: Implement SmartDetector**

```typescript
// src/profile/smart-detection.ts
import { UserProfile } from '../types';

interface Pattern {
  regex: RegExp;
  category: 'language' | 'framework' | 'tool' | 'pattern' | 'learning' | 'expert' | 'proficient' | 'domain' | 'project';
  extract: (match: RegExpMatchArray) => string[];
}

export class SmartDetector {
  private patterns: Pattern[] = [
    // Preference patterns
    {
      regex: /I prefer (\w+)/gi,
      category: 'pattern',
      extract: (m) => [`prefer ${m[1]}`]
    },
    {
      regex: /I like (\w+)/gi,
      category: 'pattern',
      extract: (m) => [`like ${m[1]}`]
    },
    {
      regex: /I avoid (\w+)/gi,
      category: 'pattern',
      extract: (m) => [`avoid ${m[1]}`]
    },
    {
      regex: /I don't like (\w+)/gi,
      category: 'pattern',
      extract: (m) => [`don't like ${m[1]}`]
    },

    // Learning patterns
    {
      regex: /I'm (?:trying to )?learn(?:ing)? (\w+)/gi,
      category: 'learning',
      extract: (m) => [m[1]]
    },
    {
      regex: /I'm new to (\w+)/gi,
      category: 'learning',
      extract: (m) => [m[1]]
    },

    // Expertise patterns
    {
      regex: /I'm an expert in (\w+)/gi,
      category: 'expert',
      extract: (m) => [m[1]]
    },
    {
      regex: /I know (\w+) well/gi,
      category: 'expert',
      extract: (m) => [m[1]]
    },
    {
      regex: /I'm familiar with (\w+)/gi,
      category: 'proficient',
      extract: (m) => [m[1]]
    },

    // Activity patterns
    {
      regex: /I'm (?:trying to|working on|building) (?:a |an )?(.+?)(?:\.|$)/gi,
      category: 'project',
      extract: (m) => [m[1].trim()]
    },

    // Tool/Framework patterns
    {
      regex: /I use (\w+)/gi,
      category: 'tool',
      extract: (m) => [m[1]]
    },
    {
      regex: /I work with (\w+)/gi,
      category: 'tool',
      extract: (m) => [m[1]]
    },

    // Common tech names
    {
      regex: /\b(TypeScript|JavaScript|Python|Rust|Go|Java|C\+\+|Ruby|PHP|Swift|Kotlin)\b/g,
      category: 'language',
      extract: (m) => [m[1]]
    },
    {
      regex: /\b(React|Vue|Angular|Next\.js|Svelte|Node\.js|Express|Django|Flask|Rails)\b/gi,
      category: 'framework',
      extract: (m) => [m[1]]
    },
    {
      regex: /\b(B2B SaaS|full-stack|frontend|backend|mobile|web app)\b/gi,
      category: 'domain',
      extract: (m) => [m[1]]
    }
  ];

  detectAndUpdate(profile: UserProfile, text: string): UserProfile {
    let updated = false;
    const newProfile = JSON.parse(JSON.stringify(profile)) as UserProfile;

    for (const pattern of this.patterns) {
      const matches = text.matchAll(pattern.regex);

      for (const match of matches) {
        const values = pattern.extract(match);

        for (const value of values) {
          if (!value) continue;

          updated = true;

          switch (pattern.category) {
            case 'language':
              if (!newProfile.profile.technicalPreferences.languages.includes(value)) {
                newProfile.profile.technicalPreferences.languages.push(value);
              }
              break;
            case 'framework':
              if (!newProfile.profile.technicalPreferences.frameworks.includes(value)) {
                newProfile.profile.technicalPreferences.frameworks.push(value);
              }
              break;
            case 'tool':
              if (!newProfile.profile.technicalPreferences.tools.includes(value)) {
                newProfile.profile.technicalPreferences.tools.push(value);
              }
              break;
            case 'pattern':
              if (!newProfile.profile.technicalPreferences.patterns.includes(value)) {
                newProfile.profile.technicalPreferences.patterns.push(value);
              }
              break;
            case 'learning':
              if (!newProfile.profile.knowledgeLevel.learning.includes(value)) {
                newProfile.profile.knowledgeLevel.learning.push(value);
              }
              break;
            case 'expert':
              if (!newProfile.profile.knowledgeLevel.expert.includes(value)) {
                newProfile.profile.knowledgeLevel.expert.push(value);
              }
              break;
            case 'proficient':
              if (!newProfile.profile.knowledgeLevel.proficient.includes(value)) {
                newProfile.profile.knowledgeLevel.proficient.push(value);
              }
              break;
            case 'domain':
              if (!newProfile.profile.projectContext.domains.includes(value)) {
                newProfile.profile.projectContext.domains.push(value);
              }
              break;
            case 'project':
              if (!newProfile.profile.projectContext.currentProjects.includes(value)) {
                newProfile.profile.projectContext.currentProjects.push(value);
              }
              break;
          }
        }
      }
    }

    if (updated) {
      newProfile.lastUpdated = new Date().toISOString();
    }

    return newProfile;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit smart detection**

```bash
git add src/profile/smart-detection.ts src/profile/smart-detection.test.ts
git commit -m "feat: implement smart pattern detection for profile updates"
```

---

## Task 4: Perplexity Search Tool

**Files:**
- Create: `src/tools/perplexity-search.ts`
- Create: `src/tools/perplexity-search.test.ts`

**Step 1: Write test for Perplexity search tool**

```typescript
// src/tools/perplexity-search.test.ts
import { PerplexitySearchTool } from './perplexity-search';
import { UserProfile } from '../types';
import { ProfileManager } from '../profile/manager';

// Mock Perplexity client
jest.mock('@perplexity-ai/perplexity_ai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      search: {
        create: jest.fn().mockResolvedValue({
          id: 'search_123',
          server_time: Date.now(),
          results: [
            {
              title: 'Test Result',
              url: 'https://example.com',
              snippet: 'Test snippet',
              date: '2026-01-01',
              last_updated: '2026-01-01'
            }
          ]
        })
      }
    }))
  };
});

describe('PerplexitySearchTool', () => {
  let tool: PerplexitySearchTool;
  let mockProfileManager: jest.Mocked<ProfileManager>;

  beforeEach(() => {
    mockProfileManager = {
      load: jest.fn(),
      save: jest.fn(),
      needsRefresh: jest.fn()
    } as any;

    tool = new PerplexitySearchTool('test-api-key', mockProfileManager);
  });

  it('searches without profile context', async () => {
    const result = await tool.search({
      query: 'test query',
      include_profile_context: false
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Test Result');
    expect(mockProfileManager.load).not.toHaveBeenCalled();
  });

  it('enriches query with profile context', async () => {
    const mockProfile: UserProfile = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      lastRefresh: new Date().toISOString(),
      profile: {
        technicalPreferences: {
          languages: ['TypeScript'],
          frameworks: ['React'],
          tools: ['Git'],
          patterns: ['Type safety first']
        },
        workingStyle: {
          explanationPreference: 'concise',
          communicationStyle: 'direct',
          priorities: ['quality']
        },
        projectContext: {
          domains: ['B2B SaaS'],
          currentProjects: [],
          commonTasks: []
        },
        knowledgeLevel: {
          expert: ['TypeScript'],
          proficient: ['React'],
          learning: []
        }
      }
    };

    mockProfileManager.load.mockResolvedValue(mockProfile);

    const result = await tool.search({
      query: 'how to optimize performance',
      include_profile_context: true
    });

    expect(mockProfileManager.load).toHaveBeenCalled();
    expect(result.results).toHaveLength(1);
  });

  it('handles API errors gracefully', async () => {
    const failingTool = new PerplexitySearchTool('invalid-key', mockProfileManager);

    await expect(
      failingTool.search({ query: 'test' })
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with "Cannot find module './perplexity-search'"

**Step 3: Implement PerplexitySearchTool**

```typescript
// src/tools/perplexity-search.ts
import Perplexity from '@perplexity-ai/perplexity_ai';
import { PerplexitySearchParams, PerplexitySearchResult } from '../types';
import { ProfileManager } from '../profile/manager';

export class PerplexitySearchTool {
  private client: Perplexity;

  constructor(
    apiKey: string,
    private profileManager: ProfileManager
  ) {
    this.client = new Perplexity({ apiKey });
  }

  async search(params: PerplexitySearchParams): Promise<PerplexitySearchResult> {
    const maxResults = params.max_results || 5;
    const includeProfile = params.include_profile_context !== false;

    let query = params.query;

    if (includeProfile) {
      try {
        const profile = await this.profileManager.load();
        const context = this.buildContextString(profile);
        if (context) {
          query = `Context about me: ${context}\n\nQuery: ${params.query}`;
        }
      } catch (error) {
        console.error('Failed to load profile, continuing without context:', error);
      }
    }

    const result = await this.client.search.create({
      query,
      maxResults
    });

    return result as PerplexitySearchResult;
  }

  private buildContextString(profile: any): string {
    const parts: string[] = [];

    const { technicalPreferences, workingStyle, projectContext, knowledgeLevel } = profile.profile;

    if (technicalPreferences.languages.length > 0) {
      parts.push(`Languages: ${technicalPreferences.languages.join(', ')}`);
    }

    if (technicalPreferences.frameworks.length > 0) {
      parts.push(`Frameworks: ${technicalPreferences.frameworks.join(', ')}`);
    }

    if (technicalPreferences.tools.length > 0) {
      parts.push(`Tools: ${technicalPreferences.tools.join(', ')}`);
    }

    if (technicalPreferences.patterns.length > 0) {
      parts.push(`Preferences: ${technicalPreferences.patterns.join('; ')}`);
    }

    if (workingStyle.explanationPreference) {
      parts.push(`Explanation style: ${workingStyle.explanationPreference}`);
    }

    if (projectContext.domains.length > 0) {
      parts.push(`Domains: ${projectContext.domains.join(', ')}`);
    }

    if (knowledgeLevel.expert.length > 0) {
      parts.push(`Expert in: ${knowledgeLevel.expert.join(', ')}`);
    }

    if (knowledgeLevel.learning.length > 0) {
      parts.push(`Learning: ${knowledgeLevel.learning.join(', ')}`);
    }

    return parts.join('. ');
  }
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: All tests PASS

**Step 5: Commit Perplexity tool**

```bash
git add src/tools/perplexity-search.ts src/tools/perplexity-search.test.ts
git commit -m "feat: implement Perplexity search tool with profile enrichment"
```

---

## Task 5: MCP Server Implementation

**Files:**
- Create: `src/index.ts`

**Step 1: Implement MCP server entry point**

```typescript
// src/index.ts
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { PerplexitySearchTool } from './tools/perplexity-search.js';
import { ProfileManager } from './profile/manager.js';
import { SmartDetector } from './profile/smart-detection.js';
import { PerplexityConfig } from './types.js';

async function loadConfig(): Promise<PerplexityConfig> {
  const configDir = path.join(os.homedir(), '.claude', 'perplexity-search');
  const configPath = path.join(configDir, 'config.json');

  try {
    const data = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // Try environment variable
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Perplexity API key not found. Set PERPLEXITY_API_KEY environment variable or create ~/.claude/perplexity-search/config.json'
        );
      }
      return { apiKey };
    }
    throw error;
  }
}

async function main() {
  const config = await loadConfig();

  const profileDir = path.join(os.homedir(), '.claude', 'perplexity-search');
  const profilePath = path.join(profileDir, 'user-profile.json');

  const profileManager = new ProfileManager(profilePath);
  const searchTool = new PerplexitySearchTool(config.apiKey, profileManager);
  const smartDetector = new SmartDetector();

  const server = new Server(
    {
      name: 'perplexity-search',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'perplexity_search',
          description: 'Search the web using Perplexity AI with personalized context enrichment. Returns search results with superior citations.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query'
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
                default: 5
              },
              include_profile_context: {
                type: 'boolean',
                description: 'Whether to enrich the query with user profile context (default: true)',
                default: true
              }
            },
            required: ['query']
          }
        }
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === 'perplexity_search') {
      const { query, max_results, include_profile_context } = request.params.arguments as any;

      try {
        // Check if profile needs refresh (async, non-blocking)
        profileManager.needsRefresh().then(async (needsRefresh) => {
          if (needsRefresh) {
            console.error('[Perplexity] Profile needs refresh (>2 days old). Consider implementing episodic memory refresh.');
          }
        }).catch((error) => {
          console.error('[Perplexity] Error checking profile refresh:', error);
        });

        // Perform search
        const result = await searchTool.search({
          query,
          max_results,
          include_profile_context
        });

        // Format results for Claude
        const formattedResults = result.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          date: r.date,
          last_updated: r.last_updated
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: query,
                results: formattedResults,
                total_results: formattedResults.length
              }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: `Error performing Perplexity search: ${error.message}`
            }
          ],
          isError: true
        };
      }
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Perplexity MCP Server] Running on stdio');
}

main().catch((error) => {
  console.error('[Perplexity MCP Server] Fatal error:', error);
  process.exit(1);
});
```

**Step 2: Build the project**

Run: `npm run build`
Expected: TypeScript compiles successfully to dist/

**Step 3: Test MCP server manually**

Run: `npm run dev`
Expected: Server starts and logs "Running on stdio"

Press Ctrl+C to stop

**Step 4: Commit MCP server**

```bash
git add src/index.ts
git commit -m "feat: implement MCP server with perplexity_search tool"
```

---

## Task 6: Create Skill File

**Files:**
- Create: `~/.claude/skills/using-perplexity-for-context.md`

**Step 1: Write skill markdown**

Create the skill file at: `~/.claude/skills/using-perplexity-for-context.md`

```markdown
---
name: using-perplexity-for-context
description: Automatically use Perplexity search for personalized context enrichment
---

# Using Perplexity for Context

## When to Use

Automatically invoke the `perplexity_search` tool in these situations:

### 1. Unfamiliar Territory
- Libraries, frameworks, or tools not in training data or recently updated
- New APIs, technologies, or patterns
- Example: "How do I use Bun's new test runner?"

### 2. Decision Points
- Choosing between architectural approaches where user preference matters
- Library selection (e.g., "Should I use Zustand or Redux?")
- Pattern choices (REST vs GraphQL, SQL vs NoSQL)

### 3. Learning Questions
- User asks "how does X work", "what is X", "explain Y"
- Exploratory questions about concepts or implementations
- Example: "How does React Server Components work?"

### 4. Preference-Dependent Choices
- Multiple valid approaches exist and user's style/preference affects the decision
- Code structure, naming conventions, testing approaches
- Example: Deciding between verbose/explicit vs concise/implicit code

### 5. Context Enrichment
- Answering could benefit from knowing user's background
- Technical explanations that should match user's knowledge level
- Example: Explaining advanced concepts to someone learning vs expert

## How to Use

When any trigger condition is met:

1. Invoke `perplexity_search` tool with the query
2. Review results and citations
3. Integrate findings into response naturally
4. Include source citations in response

**Do NOT announce usage** unless user explicitly asks.

## Example

```
User: "What's the best way to handle state in React?"

[Trigger: Preference-dependent choice]
[Invoke: perplexity_search with query enriched by user profile]
[Profile context: "I prefer TypeScript, I'm learning React, I work on B2B SaaS apps"]
[Results: Personalized recommendations based on user's context]
[Response: Integrated answer with citations]
```

## Integration with Profile

The tool automatically:
- Loads user profile from `~/.claude/perplexity-search/user-profile.json`
- Enriches queries with personal context
- Returns results with superior citations
- Updates profile when user mentions preferences (silent)
- Refreshes profile every 2 days from conversation history (automatic)
```

**Step 2: Install skill**

Run:
```bash
mkdir -p ~/.claude/skills
cp ~/.claude/skills/using-perplexity-for-context.md ~/.claude/skills/
```

Expected: Skill file created

**Step 3: Commit skill file to project docs**

```bash
mkdir -p docs/skills
cp ~/.claude/skills/using-perplexity-for-context.md docs/skills/
git add docs/skills/using-perplexity-for-context.md
git commit -m "feat: add using-perplexity-for-context skill definition"
```

---

## Task 7: Add .gitignore for config files

**Files:**
- Modify: `.gitignore`

**Step 1: Add config files to gitignore**

Add to `.gitignore`:
```
# User-specific config
config.json
user-profile.json

# Dependencies
node_modules/
dist/

# Test coverage
coverage/

# Logs
*.log
npm-debug.log*

# IDE
.vscode/
.idea/
*.swp
*.swo
```

**Step 2: Commit gitignore**

```bash
git add .gitignore
git commit -m "chore: add gitignore for config and build artifacts"
```

---

## Task 8: Create README with setup instructions

**Files:**
- Modify: `README.md`

**Step 1: Write comprehensive README**

```markdown
# Perplexity Search MCP for Claude Code

An MCP server that provides Perplexity AI search with personalized context enrichment for Claude Code.

## Features

- **Personalized Search**: Enriches queries with your technical preferences, working style, and knowledge levels
- **Automatic Profile Updates**: Silently detects and updates your profile when you mention preferences
- **Periodic Refresh**: Automatically refreshes profile every 2 days from conversation history
- **Superior Citations**: Returns Perplexity's high-quality search results with source citations

## Installation

### 1. Clone and Build

```bash
cd ~/.claude/plugins
git clone <repo-url> perplexity-search
cd perplexity-search
npm install
npm run build
```

### 2. Configure API Key

Create `~/.claude/perplexity-search/config.json`:

```json
{
  "apiKey": "pplx-xxxxx",
  "defaultMaxResults": 5
}
```

Or set environment variable:

```bash
export PERPLEXITY_API_KEY="pplx-xxxxx"
```

### 3. Install Skill

```bash
cp docs/skills/using-perplexity-for-context.md ~/.claude/skills/
```

### 4. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude/config.json`):

```json
{
  "mcpServers": {
    "perplexity-search": {
      "command": "node",
      "args": ["/Users/YOU/.claude/plugins/perplexity-search/dist/index.js"],
      "env": {}
    }
  }
}
```

## Usage

Once installed, the tool automatically triggers when Claude Code detects:
- Unfamiliar libraries or technologies
- Decision points requiring user preferences
- Learning questions
- Preference-dependent choices
- Context that benefits from personalization

No manual invocation needed - it works silently in the background.

## User Profile

Your profile is stored at `~/.claude/perplexity-search/user-profile.json` and contains:

- **Technical Preferences**: Languages, frameworks, tools, patterns
- **Working Style**: Explanation preferences, communication style, priorities
- **Project Context**: Domains, current projects, common tasks
- **Knowledge Levels**: Expert, proficient, learning

### Manual Editing

You can edit your profile directly:

```bash
nano ~/.claude/perplexity-search/user-profile.json
```

### Automatic Updates

The profile automatically updates when you mention:
- "I prefer X", "I like X", "I avoid X"
- "I'm trying to X", "I'm working on X"
- "I'm learning X", "I'm an expert in X"
- "I use X", "I switched to X"

## Development

```bash
# Run tests
npm test

# Run in dev mode
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

## Architecture

- **TypeScript** - Type-safe implementation
- **@modelcontextprotocol/sdk** - MCP server framework
- **@perplexity-ai/perplexity_ai** - Official Perplexity client
- **Profile Management** - CRUD operations, smart detection, refresh logic

## License

MIT
```

**Step 2: Commit README**

```bash
git add README.md
git commit -m "docs: add comprehensive README with setup instructions"
```

---

## Task 9: Final Integration Test

**Step 1: Build the project**

Run: `npm run build`
Expected: Clean build, no errors

**Step 2: Run all tests**

Run: `npm test`
Expected: All tests PASS

**Step 3: Verify package.json scripts**

Check that all scripts work:
```bash
npm run typecheck  # Should pass
npm run build      # Should build to dist/
npm test           # Should run tests
```

**Step 4: Create example config**

Create: `config.example.json`

```json
{
  "apiKey": "pplx-your-api-key-here",
  "defaultMaxResults": 5
}
```

**Step 5: Final commit**

```bash
git add config.example.json
git commit -m "chore: add example config file"
```

---

## Task 10: Tag Release

**Step 1: Create git tag**

```bash
git tag -a v1.0.0 -m "Initial release: Perplexity MCP with personalized context"
```

**Step 2: Verify worktree is ready**

```bash
git log --oneline
git status
```

Expected: Clean working directory, all commits present

---

## Completion Checklist

- [ ] TypeScript types defined
- [ ] Profile manager with CRUD operations
- [ ] Smart detection for profile updates
- [ ] Perplexity search tool with enrichment
- [ ] MCP server implementation
- [ ] Skill markdown file
- [ ] Comprehensive README
- [ ] All tests passing
- [ ] Clean build
- [ ] Git tagged for release

## Next Steps After Plan Execution

1. **Test with real API key**: Set up Perplexity API key and test search
2. **Install in Claude Code**: Follow README installation steps
3. **Test automatic triggers**: Verify skill triggers correctly
4. **Iterate on detection patterns**: Improve smart detection based on usage
5. **Add episodic memory refresh**: Implement actual episodic memory search for profile refresh
