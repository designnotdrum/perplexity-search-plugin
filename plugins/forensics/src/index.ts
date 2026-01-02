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

// Initialize tools
const explainConceptTool = new ExplainConceptTool();
const analyzeCaptureTool = new AnalyzeCaptureTool();
const suggestNextStepTool = new SuggestNextStepTool();

async function main() {
  const server = new Server(
    {
      name: 'forensics',
      version: '0.1.0',
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
        skillLevel: args.skillLevel || 'beginner',
        hasCapture: args.hasCapture,
        hasSpec: args.hasSpec,
        hasResearch: args.hasResearch,
        targetFeature: args.targetFeature,
        targetCodebase: args.targetCodebase,
      };

      const result = suggestNextStepTool.suggest(context);

      let response = `## Next Step: ${result.step}\n\n${result.explanation}`;

      if (result.commands && result.commands.length > 0) {
        response += `\n\n**Commands:**\n${result.commands.map((cmd) => `- \`${cmd}\``).join('\n')}`;
      }

      if (result.tips && result.tips.length > 0) {
        response += `\n\n**Tips:**\n${result.tips.map((tip) => `- ${tip}`).join('\n')}`;
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
