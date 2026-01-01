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

interface Config {
  apiKey?: string;
}

/**
 * Load configuration from config file or environment variable
 */
async function loadConfig(): Promise<Config> {
  const configPath = path.join(
    os.homedir(),
    '.claude',
    'perplexity-search',
    'config.json'
  );

  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    if (config.apiKey) {
      return config;
    }
  } catch (error) {
    // Config file doesn't exist or is invalid, fall through to env var
  }

  // Check environment variable
  if (process.env.PERPLEXITY_API_KEY) {
    return { apiKey: process.env.PERPLEXITY_API_KEY };
  }

  return {};
}

/**
 * Main function to start the MCP server
 */
async function main() {
  const config = await loadConfig();

  if (!config.apiKey) {
    console.error(
      'Perplexity API key not found. Set PERPLEXITY_API_KEY environment variable or create ~/.claude/perplexity-search/config.json'
    );
    process.exit(1);
  }

  // Initialize components
  const profilePath = path.join(
    os.homedir(),
    '.claude',
    'perplexity-search',
    'user-profile.json'
  );
  const profileManager = new ProfileManager(profilePath);
  const searchTool = new PerplexitySearchTool(config.apiKey, profileManager);

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
