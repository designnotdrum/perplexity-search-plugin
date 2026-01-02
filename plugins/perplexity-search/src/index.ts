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
import { input, confirm } from '@inquirer/prompts';

/**
 * Interactive setup wizard for first-time users
 */
async function runSetupWizard(): Promise<void> {
  console.error('\n🚀 Welcome to Perplexity Search MCP Setup!\n');
  console.error('Let\'s get you configured in just a few steps.\n');

  // Get API key
  const apiKey = await input({
    message: 'Enter your Perplexity API key (get one at https://www.perplexity.ai/settings/api):',
    validate: (value: string) => {
      if (!value || value.trim().length === 0) {
        return 'API key is required';
      }
      if (!value.startsWith('pplx-')) {
        return 'Perplexity API keys typically start with "pplx-"';
      }
      return true;
    },
  });

  // Create config directory and file
  const configDir = path.join(os.homedir(), '.claude', 'perplexity-search');
  const configPath = path.join(configDir, 'config.json');

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(
    configPath,
    JSON.stringify({ apiKey: apiKey.trim(), defaultMaxResults: 5 }, null, 2)
  );

  console.error('\n✅ Config file created at', configPath);

  // Offer to install skill file
  const installSkill = await confirm({
    message: 'Install the skill file to ~/.claude/skills/ (recommended)?',
    default: true,
  });

  if (installSkill) {
    const skillsDir = path.join(os.homedir(), '.claude', 'skills');
    const skillSource = path.join(
      process.cwd(),
      'skills',
      'using-perplexity-for-context',
      'SKILL.md'
    );
    const skillDest = path.join(skillsDir, 'using-perplexity-for-context.md');

    try {
      await fs.mkdir(skillsDir, { recursive: true });
      await fs.copyFile(skillSource, skillDest);
      console.error('✅ Skill file installed to', skillDest);
    } catch (error) {
      console.error('⚠️  Could not install skill file:', (error as Error).message);
      console.error('   You can manually copy it from skills/using-perplexity-for-context/SKILL.md');
    }
  }

  // Offer to update MCP config
  const updateMcpConfig = await confirm({
    message: 'Add Perplexity Search to your Claude Code MCP servers config?',
    default: true,
  });

  if (updateMcpConfig) {
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    const serverPath = path.join(process.cwd(), 'dist', 'index.js');

    try {
      let claudeConfig: any = {};

      // Try to read existing config
      try {
        const existing = await fs.readFile(claudeConfigPath, 'utf-8');
        claudeConfig = JSON.parse(existing);
      } catch {
        // Config doesn't exist, start fresh
      }

      // Ensure mcpServers object exists
      if (!claudeConfig.mcpServers) {
        claudeConfig.mcpServers = {};
      }

      // Add perplexity-search server
      claudeConfig.mcpServers['perplexity-search'] = {
        command: 'node',
        args: [serverPath],
        env: {},
      };

      // Write back with backup
      const backupPath = claudeConfigPath + '.backup';
      try {
        await fs.copyFile(claudeConfigPath, backupPath);
        console.error('📁 Backup created at', backupPath);
      } catch {
        // No existing file to backup
      }

      await fs.writeFile(claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
      console.error('✅ MCP config updated at', claudeConfigPath);
    } catch (error) {
      console.error('⚠️  Could not update MCP config:', (error as Error).message);
      console.error('\n   You can manually add this to ~/.claude.json:');
      console.error('   {');
      console.error('     "mcpServers": {');
      console.error('       "perplexity-search": {');
      console.error('         "command": "node",');
      console.error(`         "args": ["${serverPath}"],`);
      console.error('         "env": {}');
      console.error('       }');
      console.error('     }');
      console.error('   }');
    }
  }

  console.error('\n🎉 Setup complete!');
  console.error('\nNext steps:');
  console.error('  1. Restart Claude Code to load the MCP server');
  console.error('  2. Try asking Claude Code a technical question');
  console.error('  3. The Perplexity search will automatically trigger when helpful\n');

  process.exit(0);
}

/**
 * Main function to start the MCP server
 */
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

  // Initialize components - use shared brain-jar profile
  const profilePath = path.join(
    os.homedir(),
    '.config',
    'brain-jar',
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

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
