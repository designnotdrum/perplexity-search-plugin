#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ExplainConceptTool } from './tools/explain-concept.js';
import { AnalyzeCaptureTool } from './tools/analyze-capture.js';
import {
  SuggestNextStepTool,
  InvestigationContext,
} from './tools/suggest-next-step.js';
import { BuildSpecTool, BuildSpecOptions } from './tools/build-spec.js';
import { InvestigationManager, StartInvestigationOptions } from './tools/investigation-manager.js';
import { InvestigationMode, InvestigationStatus } from './interop/index.js';

// Initialize tools
const explainConceptTool = new ExplainConceptTool();
const analyzeCaptureTool = new AnalyzeCaptureTool();
const suggestNextStepTool = new SuggestNextStepTool();
const buildSpecTool = new BuildSpecTool();
const investigationManager = new InvestigationManager();

async function main() {
  const server = new Server(
    {
      name: 'forensics',
      version: '0.2.1',
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
          name: 'explain_concept',
          description:
            "Explain a technical concept at the user's level. Covers concepts like HAR files, mitmproxy, protobuf, WebSockets, JWT, and more.",
          inputSchema: {
            type: 'object',
            properties: {
              concept: {
                type: 'string',
                description:
                  'The concept to explain (e.g., "mitmproxy", "HAR file", "protobuf")',
              },
            },
            required: ['concept'],
          },
        },
        {
          name: 'analyze_capture',
          description:
            'Analyze a network capture (HAR file, curl output, etc.) to extract endpoints, authentication patterns, and API structure.',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description:
                  'The raw content of the capture file (HAR JSON, curl verbose output, etc.)',
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'suggest_next_step',
          description:
            'Get context-aware guidance for your investigation. Suggests the next step based on your current mode and progress, with verbosity adapted to your skill level.',
          inputSchema: {
            type: 'object',
            properties: {
              mode: {
                type: 'string',
                enum: ['protocol', 'feature', 'codebase', 'decision', 'format'],
                description:
                  'The investigation mode: protocol (API reverse engineering), feature (feature analysis), codebase (code exploration), decision (understanding past decisions), format (binary format analysis)',
              },
              skillLevel: {
                type: 'string',
                enum: ['beginner', 'intermediate', 'advanced'],
                description:
                  'Your skill level for verbosity adjustment. Beginners get detailed commands and tips.',
                default: 'beginner',
              },
              hasCapture: {
                type: 'boolean',
                description:
                  'Whether you have captured network traffic (protocol mode)',
              },
              hasSpec: {
                type: 'boolean',
                description:
                  'Whether you have documented the API specification (protocol mode)',
              },
              hasResearch: {
                type: 'boolean',
                description:
                  'Whether you have completed competitive research (feature mode)',
              },
              targetFeature: {
                type: 'string',
                description: 'The feature being investigated (feature mode)',
              },
              targetCodebase: {
                type: 'string',
                description: 'The codebase being explored (codebase mode)',
              },
            },
            required: ['mode'],
          },
        },
        {
          name: 'build_spec',
          description:
            'Generate an API specification from investigation findings. Outputs JSON, OpenAPI 3.0, or TypeScript client code.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name for the API specification',
              },
              version: {
                type: 'string',
                description: 'Version string (default: 1.0.0)',
              },
              baseUrl: {
                type: 'string',
                description: 'Base URL for the API (inferred from endpoints if not provided)',
              },
              format: {
                type: 'string',
                enum: ['json', 'openapi', 'typescript'],
                description: 'Output format (default: json)',
              },
              investigationId: {
                type: 'string',
                description: 'Investigation ID to build from (uses active investigation if not provided)',
              },
            },
            required: ['name'],
          },
        },
        {
          name: 'start_investigation',
          description:
            'Start a new forensics investigation. Creates a persistent investigation that tracks findings across sessions.',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Name for the investigation (e.g., "Spotify API", "Smart Lock Protocol")',
              },
              mode: {
                type: 'string',
                enum: ['protocol', 'feature', 'codebase', 'decision', 'format'],
                description: 'Investigation mode',
              },
              target: {
                type: 'string',
                description: 'What is being investigated (e.g., device name, API name, codebase URL)',
              },
            },
            required: ['name', 'mode'],
          },
        },
        {
          name: 'list_investigations',
          description:
            'List all forensics investigations, optionally filtered by status.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['active', 'paused', 'complete'],
                description: 'Filter by status (omit for all)',
              },
            },
          },
        },
        {
          name: 'get_investigation',
          description:
            'Get details of the current active investigation or a specific investigation by ID.',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Investigation ID (omit to get current active investigation)',
              },
            },
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name } = request.params;

    if (name === 'explain_concept') {
      const { concept } = request.params.arguments as { concept: string };
      const result = await explainConceptTool.explain(concept);

      let response = `## ${result.concept}\n\n${result.explanation}`;

      if (result.relatedConcepts.length > 0) {
        response += `\n\n**Related concepts:** ${result.relatedConcepts.join(', ')}`;
      }

      if (result.suggestSearch) {
        response += `\n\n*Tip: Use perplexity search for more information about this concept.*`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'analyze_capture') {
      const { content } = request.params.arguments as { content: string };
      const result = await analyzeCaptureTool.analyze(content);

      return {
        content: [
          {
            type: 'text',
            text: result.formatted,
          },
        ],
      };
    }

    if (name === 'suggest_next_step') {
      const args = request.params.arguments as {
        mode: InvestigationContext['mode'];
        skillLevel?: InvestigationContext['skillLevel'];
        hasCapture?: boolean;
        hasSpec?: boolean;
        hasResearch?: boolean;
        targetFeature?: string;
        targetCodebase?: string;
      };

      const context: InvestigationContext = {
        mode: args.mode,
        skillLevel: args.skillLevel, // Now optional, will use profile if not provided
        hasCapture: args.hasCapture,
        hasSpec: args.hasSpec,
        hasResearch: args.hasResearch,
        targetFeature: args.targetFeature,
        targetCodebase: args.targetCodebase,
      };

      const result = await suggestNextStepTool.suggest(context);

      let response = `## Next Step: ${result.step}\n\n${result.explanation}`;

      if (result.commands && result.commands.length > 0) {
        response += `\n\n**Commands:**\n${result.commands.map((cmd: string) => `- \`${cmd}\``).join('\n')}`;
      }

      if (result.tips && result.tips.length > 0) {
        response += `\n\n**Tips:**\n${result.tips.map((tip: string) => `- ${tip}`).join('\n')}`;
      }

      if (result.userStack && (result.userStack.languages.length > 0 || result.userStack.frameworks.length > 0)) {
        response += `\n\n*Your stack: ${[...result.userStack.languages, ...result.userStack.frameworks].join(', ')}*`;
      }

      return {
        content: [
          {
            type: 'text',
            text: response,
          },
        ],
      };
    }

    if (name === 'build_spec') {
      const args = request.params.arguments as unknown as BuildSpecOptions;

      try {
        const result = await buildSpecTool.build(args);

        let response = `## API Specification: ${result.spec.name}\n\n`;
        response += `**Version:** ${result.spec.version}\n`;
        response += `**Format:** ${result.outputFormat}\n`;
        response += `**Endpoints:** ${result.spec.endpoints.length}\n`;

        if (result.storedToMemory) {
          response += `\n*Specification saved to memory*\n`;
        }

        response += `\n### Output\n\n\`\`\`${result.outputFormat === 'typescript' ? 'typescript' : 'json'}\n`;
        response += result.formatted;
        response += `\n\`\`\``;

        return {
          content: [
            {
              type: 'text',
              text: response,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error building spec: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (name === 'start_investigation') {
      const args = request.params.arguments as unknown as StartInvestigationOptions;

      try {
        const investigation = await investigationManager.start(args);

        return {
          content: [
            {
              type: 'text',
              text: investigationManager.formatInfo(investigation),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error starting investigation: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (name === 'list_investigations') {
      const args = request.params.arguments as { status?: InvestigationStatus };

      try {
        const investigations = await investigationManager.list(args?.status);

        if (investigations.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'No investigations found. Use `start_investigation` to begin one.',
              },
            ],
          };
        }

        const lines = ['## Investigations\n'];
        for (const inv of investigations) {
          const statusIcon = inv.status === 'active' ? '🔵' : inv.status === 'paused' ? '⏸️' : '✅';
          lines.push(`${statusIcon} **${inv.name}** (${inv.mode})`);
          lines.push(`   ID: ${inv.id}`);
          lines.push(`   Updated: ${inv.updated}`);
          if (inv.mode === 'protocol') {
            lines.push(`   Endpoints: ${inv.endpointCount}, Auth: ${inv.hasAuth ? '✓' : '○'}, Spec: ${inv.hasSpec ? '✓' : '○'}`);
          }
          lines.push('');
        }

        return {
          content: [
            {
              type: 'text',
              text: lines.join('\n'),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing investigations: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    if (name === 'get_investigation') {
      const args = request.params.arguments as { id?: string };

      try {
        let investigation;
        if (args?.id) {
          investigation = await investigationManager.resume(args.id);
        } else {
          investigation = await investigationManager.getCurrent();
        }

        if (!investigation) {
          return {
            content: [
              {
                type: 'text',
                text: 'No active investigation found. Use `start_investigation` to begin one.',
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: investigationManager.formatInfo(investigation),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error getting investigation: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[forensics MCP Server] Running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
