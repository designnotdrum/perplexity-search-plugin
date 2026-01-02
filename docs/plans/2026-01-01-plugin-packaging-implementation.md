# Perplexity Search Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the existing Perplexity MCP server into a Claude Code plugin with one-command installation.

**Architecture:** Plugin uses `.claude-plugin/plugin.json` manifest, bundled skill in `skills/` directory, and MCP server in `dist/`. Setup wizard runs on first MCP connection when no config exists.

**Tech Stack:** TypeScript, Node.js, @modelcontextprotocol/sdk, @inquirer/prompts

---

## Task 1: Create Plugin Manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

**Step 1: Create the .claude-plugin directory**

```bash
mkdir -p .claude-plugin
```

**Step 2: Write plugin.json manifest**

Create `.claude-plugin/plugin.json`:

```json
{
  "name": "perplexity-search",
  "version": "1.0.0",
  "description": "Web search via Perplexity AI with smart context detection",
  "author": {
    "name": "Nick Mason"
  },
  "license": "MIT",
  "keywords": ["perplexity", "search", "mcp", "web-search"],
  "mcpServers": {
    "perplexity-search": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]
    }
  },
  "skills": "./skills/"
}
```

**Step 3: Verify manifest is valid JSON**

```bash
cat .claude-plugin/plugin.json | python3 -c "import json,sys; json.load(sys.stdin); print('Valid JSON')"
```

Expected: `Valid JSON`

**Step 4: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: add Claude Code plugin manifest"
```

---

## Task 2: Move and Rename Skill File

**Files:**
- Move: `docs/skills/using-perplexity-for-context.md` → `skills/using-perplexity-for-context/SKILL.md`

**Step 1: Create skills directory structure**

```bash
mkdir -p skills/using-perplexity-for-context
```

**Step 2: Move and rename skill file**

```bash
mv docs/skills/using-perplexity-for-context.md skills/using-perplexity-for-context/SKILL.md
```

**Step 3: Update frontmatter for Claude Code format**

Edit `skills/using-perplexity-for-context/SKILL.md` frontmatter:

```yaml
---
name: using-perplexity-for-context
description: "Automatically use Perplexity search for personalized context enrichment. Use when facing unfamiliar technologies, decision points, learning questions, or preference-dependent choices."
allowed-tools:
  - mcp__perplexity-search__perplexity_search
---
```

**Step 4: Verify skill structure**

```bash
ls -la skills/using-perplexity-for-context/
cat skills/using-perplexity-for-context/SKILL.md | head -10
```

Expected: SKILL.md exists with updated frontmatter

**Step 5: Remove empty docs/skills directory**

```bash
rmdir docs/skills 2>/dev/null || true
```

**Step 6: Commit**

```bash
git add skills/ docs/
git commit -m "feat: move skill to plugin structure"
```

---

## Task 3: Simplify MCP Server Startup

**Files:**
- Modify: `src/index.ts`

The current MCP server runs an interactive wizard if no config exists. This won't work as a Claude Code MCP subprocess. Instead, log a clear error message directing users to run setup.

**Step 1: Write test for missing config behavior**

Create `src/startup.test.ts`:

```typescript
import { checkConfig, ConfigStatus } from './startup.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

jest.mock('fs/promises');

describe('checkConfig', () => {
  const mockHomedir = '/mock/home';

  beforeEach(() => {
    jest.spyOn(os, 'homedir').mockReturnValue(mockHomedir);
    jest.clearAllMocks();
  });

  it('returns configured when config file exists with API key', async () => {
    (fs.readFile as jest.Mock).mockResolvedValue(
      JSON.stringify({ apiKey: 'pplx-test123' })
    );

    const result = await checkConfig();

    expect(result.status).toBe('configured');
    expect(result.apiKey).toBe('pplx-test123');
  });

  it('returns missing when config file does not exist', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

    const result = await checkConfig();

    expect(result.status).toBe('missing');
    expect(result.apiKey).toBeUndefined();
  });

  it('returns configured when env var is set', async () => {
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' });
    process.env.PERPLEXITY_API_KEY = 'pplx-envkey';

    const result = await checkConfig();

    expect(result.status).toBe('configured');
    expect(result.apiKey).toBe('pplx-envkey');

    delete process.env.PERPLEXITY_API_KEY;
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npm test -- src/startup.test.ts
```

Expected: FAIL (startup.js doesn't exist)

**Step 3: Create startup module**

Create `src/startup.ts`:

```typescript
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ConfigStatus {
  status: 'configured' | 'missing';
  apiKey?: string;
  configPath: string;
}

export async function checkConfig(): Promise<ConfigStatus> {
  const configPath = path.join(
    os.homedir(),
    '.claude',
    'perplexity-search',
    'config.json'
  );

  // Check environment variable first
  if (process.env.PERPLEXITY_API_KEY) {
    return {
      status: 'configured',
      apiKey: process.env.PERPLEXITY_API_KEY,
      configPath,
    };
  }

  // Check config file
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (config.apiKey) {
      return {
        status: 'configured',
        apiKey: config.apiKey,
        configPath,
      };
    }
  } catch {
    // Config doesn't exist or is invalid
  }

  return { status: 'missing', configPath };
}

export function getMissingConfigMessage(configPath: string): string {
  return `
[Perplexity Search] Configuration required.

To set up, run one of:

  1. Set environment variable:
     export PERPLEXITY_API_KEY=pplx-your-key-here

  2. Create config file at ${configPath}:
     {"apiKey": "pplx-your-key-here"}

  3. Run interactive setup:
     node ${process.argv[1]} --setup

Get your API key at: https://www.perplexity.ai/settings/api
`.trim();
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- src/startup.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/startup.ts src/startup.test.ts
git commit -m "feat: add config check module"
```

---

## Task 4: Update Index to Use Startup Module

**Files:**
- Modify: `src/index.ts`

**Step 1: Refactor index.ts to use checkConfig**

Replace the config loading and wizard code in `src/index.ts`. Keep the setup wizard but gate it behind `--setup` flag.

Update the imports at top of `src/index.ts`:

```typescript
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
import { ProfileManager } from './profile/manager.js';
import { PerplexitySearchTool } from './tools/perplexity-search.js';
import { checkConfig, getMissingConfigMessage } from './startup.js';
```

**Step 2: Update main function**

Replace the `main()` function in `src/index.ts`:

```typescript
async function main() {
  // Handle --setup flag
  if (process.argv.includes('--setup')) {
    await runSetupWizard();
    return;
  }

  // Check configuration
  const configStatus = await checkConfig();

  if (configStatus.status === 'missing') {
    console.error(getMissingConfigMessage(configStatus.configPath));
    process.exit(1);
  }

  const apiKey = configStatus.apiKey!;

  // Initialize components
  const profilePath = path.join(
    os.homedir(),
    '.claude',
    'perplexity-search',
    'user-profile.json'
  );
  const profileManager = new ProfileManager(profilePath);
  const searchTool = new PerplexitySearchTool(apiKey, profileManager);

  // Check if profile needs refresh (non-blocking)
  profileManager.needsRefresh().then((needs: boolean) => {
    if (needs) {
      console.error(
        '[Perplexity MCP Server] Profile data may be stale. Consider refreshing.'
      );
    }
  });

  // Create MCP server
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

  // Register tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'perplexity_search',
          description:
            'Search the web using Perplexity AI with smart context detection. Automatically adapts search parameters based on user profile and query type.',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
              mode: {
                type: 'string',
                enum: ['auto', 'quick', 'deep'],
                description:
                  'Search mode: auto (detect automatically), quick (fast results), deep (comprehensive research)',
                default: 'auto',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'perplexity_search') {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const { query, mode = 'auto' } = request.params.arguments as {
      query: string;
      mode?: 'auto' | 'quick' | 'deep';
    };

    // Execute search with profile context
    const results = await searchTool.search({
      query,
      include_profile_context: mode !== 'quick',
    });

    // Format results with metadata
    const formattedResults = `# Search Results for: ${query}

**Mode:** ${mode}

${results.content[0].text}
`;

    return {
      content: [
        {
          type: 'text',
          text: formattedResults,
        },
      ],
    };
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[Perplexity MCP Server] Running on stdio');
}
```

**Step 3: Remove old config functions**

Remove the `configExists()` and `loadConfig()` functions from `src/index.ts` (they're replaced by `checkConfig()`).

**Step 4: Build and test**

```bash
npm run build
npm test
```

Expected: All tests pass, build succeeds

**Step 5: Commit**

```bash
git add src/index.ts
git commit -m "refactor: use startup module for config check"
```

---

## Task 5: Update .gitignore for Plugin Structure

**Files:**
- Modify: `.gitignore`

**Step 1: Add plugin-specific ignores**

Add to `.gitignore`:

```
# Plugin packaging
release/
*.tgz
```

**Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: add plugin packaging ignores"
```

---

## Task 6: Add Build Script for Plugin Packaging

**Files:**
- Modify: `package.json`
- Create: `scripts/package-plugin.js`

**Step 1: Create scripts directory**

```bash
mkdir -p scripts
```

**Step 2: Write package-plugin.js**

Create `scripts/package-plugin.js`:

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const RELEASE_DIR = 'release';

// Files/directories to include in plugin
const INCLUDE = [
  '.claude-plugin',
  'dist',
  'skills',
  'package.json',
  'README.md',
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function main() {
  // Clean release directory
  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true });
  }
  fs.mkdirSync(RELEASE_DIR);

  // Copy included files
  for (const item of INCLUDE) {
    const src = path.join(process.cwd(), item);
    const dest = path.join(process.cwd(), RELEASE_DIR, item);

    if (fs.existsSync(src)) {
      copyRecursive(src, dest);
      console.log(`✓ Copied ${item}`);
    } else {
      console.warn(`⚠ Skipped ${item} (not found)`);
    }
  }

  // Read version from package.json
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

  console.log(`\n✅ Plugin packaged to ${RELEASE_DIR}/`);
  console.log(`   Version: ${pkg.version}`);
  console.log(`\nTo install locally:`);
  console.log(`   claude plugin install ${path.resolve(RELEASE_DIR)}`);
}

main();
```

**Step 3: Add build:plugin script to package.json**

Add to `package.json` scripts:

```json
{
  "scripts": {
    "build:plugin": "npm run build && node scripts/package-plugin.js"
  }
}
```

**Step 4: Test the build script**

```bash
npm run build:plugin
ls -la release/
```

Expected: `release/` contains `.claude-plugin/`, `dist/`, `skills/`, `package.json`, `README.md`

**Step 5: Commit**

```bash
git add scripts/package-plugin.js package.json
git commit -m "feat: add plugin packaging script"
```

---

## Task 7: Update README for Plugin Installation

**Files:**
- Modify: `README.md`

**Step 1: Update installation section**

Replace the installation section in `README.md`:

```markdown
## Installation

### As Claude Code Plugin (Recommended)

```bash
# Build the plugin
npm run build:plugin

# Install to Claude Code
claude plugin install ./release
```

After installation, restart Claude Code. On first use, if no API key is configured, you'll see instructions to set it up.

### API Key Setup

Set your Perplexity API key using one of these methods:

1. **Environment variable:**
   ```bash
   export PERPLEXITY_API_KEY=pplx-your-key-here
   ```

2. **Config file** (`~/.claude/perplexity-search/config.json`):
   ```json
   {"apiKey": "pplx-your-key-here"}
   ```

3. **Interactive setup:**
   ```bash
   node release/dist/index.js --setup
   ```

Get your API key at: https://www.perplexity.ai/settings/api

### Manual MCP Server Setup

If you prefer manual configuration, add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "perplexity-search": {
      "command": "node",
      "args": ["/path/to/perplexity-search-plugin/dist/index.js"]
    }
  }
}
```
```

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update installation instructions for plugin"
```

---

## Task 8: Full Integration Test

**Step 1: Run all tests**

```bash
npm test
```

Expected: All tests pass

**Step 2: Build plugin**

```bash
npm run build:plugin
```

Expected: Builds successfully, `release/` directory populated

**Step 3: Verify plugin structure**

```bash
ls -la release/
ls -la release/.claude-plugin/
ls -la release/skills/
cat release/.claude-plugin/plugin.json
```

Expected: All files present, manifest valid

**Step 4: Test MCP server startup without config**

```bash
# Temporarily move config if it exists
mv ~/.claude/perplexity-search/config.json ~/.claude/perplexity-search/config.json.bak 2>/dev/null || true

# Test startup - should show config instructions
node release/dist/index.js 2>&1 | head -20

# Restore config
mv ~/.claude/perplexity-search/config.json.bak ~/.claude/perplexity-search/config.json 2>/dev/null || true
```

Expected: Clear error message with setup instructions

**Step 5: Test setup wizard**

```bash
node release/dist/index.js --setup
```

Expected: Interactive wizard prompts for API key (cancel with Ctrl+C)

**Step 6: Final commit**

```bash
git add -A
git status
# If any uncommitted changes:
git commit -m "chore: final integration fixes"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create plugin manifest | `.claude-plugin/plugin.json` |
| 2 | Move skill to plugin structure | `skills/using-perplexity-for-context/SKILL.md` |
| 3 | Create startup module | `src/startup.ts`, `src/startup.test.ts` |
| 4 | Update index to use startup | `src/index.ts` |
| 5 | Update gitignore | `.gitignore` |
| 6 | Add build script | `scripts/package-plugin.js`, `package.json` |
| 7 | Update README | `README.md` |
| 8 | Integration test | (verification only) |
