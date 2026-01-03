#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { Mem0Client, checkConfig, loadConfig } from '@brain-jar/core';
import { DiagramStorage } from './storage';
import {
  DiagramType,
  CreateDiagramInput,
  UpdateDiagramInput,
  ListDiagramsInput,
  ExportDiagramInput,
} from './types';

const DIAGRAM_TYPES: DiagramType[] = [
  'mindmap',
  'flowchart',
  'sequence',
  'architecture',
  'erd',
  'classDiagram',
  'stateDiagram',
  'gantt',
  'other',
];

async function main(): Promise<void> {
  // Check configuration (shared with other brain-jar plugins)
  const configStatus = checkConfig();
  const isConfigured = configStatus.status !== 'missing';
  const config = isConfigured ? loadConfig()! : null;

  // Initialize storage
  const storage = new DiagramStorage();

  // Mem0 client for cloud sync (if configured)
  const mem0Client = config ? new Mem0Client(config.mem0_api_key) : null;

  if (!isConfigured) {
    console.error('[visual-thinking] No Mem0 config found. Using local-only storage.');
  }

  // Create MCP server
  const server = new McpServer({
    name: 'visual-thinking',
    version: '0.2.0',
  });

  // --- Diagram Tools ---

  server.tool(
    'create_diagram',
    'Create a new Mermaid diagram with title, type, and context',
    {
      title: z.string().describe('Title for the diagram'),
      type: z.enum(DIAGRAM_TYPES as [DiagramType, ...DiagramType[]]).describe('Type of diagram'),
      mermaid: z.string().describe('Mermaid diagram syntax'),
      context: z.string().describe('What this diagram represents and why it was created'),
      scope: z.string().optional().describe('Scope: "global" or "project:<name>"'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async (args: CreateDiagramInput) => {
      const diagram = storage.create(args);

      // Sync to Mem0 if configured
      if (mem0Client) {
        try {
          await mem0Client.add(
            `Diagram "${diagram.title}" (${diagram.type}): ${diagram.context}`,
            {
              scope: diagram.scope,
              tags: ['diagram', diagram.type, ...(args.tags || [])],
              source_agent: 'visual-thinking',
              source_action: 'create_diagram',
            }
          );
        } catch (error) {
          console.error('[visual-thinking] Mem0 sync failed:', error);
        }
      }

      const syncNote = mem0Client ? '' : ' (local only)';
      return {
        content: [
          {
            type: 'text' as const,
            text: `Diagram created (id: ${diagram.id})${syncNote}\n\nTitle: ${diagram.title}\nType: ${diagram.type}\n\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\``,
          },
        ],
      };
    }
  );

  server.tool(
    'list_diagrams',
    'List saved diagrams with optional filters',
    {
      scope: z.string().optional().describe('Filter by scope'),
      type: z.enum(DIAGRAM_TYPES as [DiagramType, ...DiagramType[]]).optional().describe('Filter by diagram type'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      limit: z.number().optional().describe('Maximum results (default: all)'),
    },
    async (args: ListDiagramsInput) => {
      const diagrams = storage.list(args);

      if (diagrams.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No diagrams found.',
            },
          ],
        };
      }

      const formatted = diagrams.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        scope: d.scope,
        tags: d.tags,
        updated: d.updated,
        versions: d.versions.length,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${diagrams.length} diagram(s):\n\n${JSON.stringify(formatted, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    'get_diagram',
    'Get a diagram by ID or title (for viewing/editing)',
    {
      id: z.string().optional().describe('Diagram ID'),
      title: z.string().optional().describe('Diagram title (fuzzy match)'),
      include_history: z.boolean().optional().describe('Include version history'),
    },
    async (args: { id?: string; title?: string; include_history?: boolean }) => {
      if (!args.id && !args.title) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Please provide either an ID or title to find the diagram.',
            },
          ],
        };
      }

      const diagram = args.id ? storage.get(args.id) : storage.getByTitle(args.title!);

      if (!diagram) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Diagram not found.`,
            },
          ],
        };
      }

      let result = `# ${diagram.title}\n\n`;
      result += `**Type:** ${diagram.type}\n`;
      result += `**Scope:** ${diagram.scope}\n`;
      result += `**Tags:** ${diagram.tags.join(', ') || 'none'}\n`;
      result += `**Created:** ${diagram.created}\n`;
      result += `**Updated:** ${diagram.updated}\n\n`;
      result += `**Context:** ${diagram.context}\n\n`;
      result += `## Current Diagram\n\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\`\n`;

      if (args.include_history && diagram.versions.length > 0) {
        result += `\n## Version History (${diagram.versions.length} previous versions)\n\n`;
        for (let i = diagram.versions.length - 1; i >= 0; i--) {
          const v = diagram.versions[i];
          result += `### Version ${i + 1} (${v.timestamp})${v.note ? ` - ${v.note}` : ''}\n\n`;
          result += `\`\`\`mermaid\n${v.mermaid}\n\`\`\`\n\n`;
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: result,
          },
        ],
      };
    }
  );

  server.tool(
    'update_diagram',
    'Update an existing diagram (tracks version history)',
    {
      id: z.string().describe('Diagram ID'),
      mermaid: z.string().optional().describe('New Mermaid syntax'),
      title: z.string().optional().describe('New title'),
      context: z.string().optional().describe('Updated context'),
      tags: z.array(z.string()).optional().describe('New tags (replaces existing)'),
      note: z.string().optional().describe('Note about what changed (for version history)'),
    },
    async (args: UpdateDiagramInput) => {
      const diagram = storage.update(args);

      if (!diagram) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Diagram ${args.id} not found.`,
            },
          ],
        };
      }

      // Sync update to Mem0 if configured
      if (mem0Client && args.mermaid) {
        try {
          await mem0Client.add(
            `Updated diagram "${diagram.title}": ${args.note || 'content updated'}`,
            {
              scope: diagram.scope,
              tags: ['diagram', 'update', diagram.type],
              source_agent: 'visual-thinking',
              source_action: 'update_diagram',
            }
          );
        } catch (error) {
          console.error('[visual-thinking] Mem0 sync failed:', error);
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Diagram updated.\n\nTitle: ${diagram.title}\nVersions: ${diagram.versions.length + 1}\n\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\``,
          },
        ],
      };
    }
  );

  server.tool(
    'delete_diagram',
    'Delete a diagram by ID',
    {
      id: z.string().describe('Diagram ID to delete'),
    },
    async (args: { id: string }) => {
      const deleted = storage.delete(args.id);

      return {
        content: [
          {
            type: 'text' as const,
            text: deleted
              ? `Diagram ${args.id} deleted.`
              : `Diagram ${args.id} not found.`,
          },
        ],
      };
    }
  );

  server.tool(
    'search_diagrams',
    'Search diagrams by text in title, context, or content',
    {
      query: z.string().describe('Search query'),
      limit: z.number().optional().describe('Maximum results (default: 10)'),
    },
    async (args: { query: string; limit?: number }) => {
      const diagrams = storage.search(args.query, args.limit || 10);

      if (diagrams.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No diagrams found matching "${args.query}".`,
            },
          ],
        };
      }

      const formatted = diagrams.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        context: d.context.substring(0, 100) + (d.context.length > 100 ? '...' : ''),
        updated: d.updated,
      }));

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${diagrams.length} diagram(s):\n\n${JSON.stringify(formatted, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    'export_diagram',
    'Export a diagram to various formats',
    {
      id: z.string().describe('Diagram ID'),
      format: z.enum(['mermaid', 'svg', 'drawio']).describe('Export format'),
    },
    async (args: ExportDiagramInput) => {
      const diagram = storage.get(args.id);

      if (!diagram) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Diagram ${args.id} not found.`,
            },
          ],
        };
      }

      if (args.format === 'mermaid') {
        const exported = storage.exportAsMermaid(args.id);
        return {
          content: [
            {
              type: 'text' as const,
              text: `# ${diagram.title}.mmd\n\n\`\`\`mermaid\n${exported}\n\`\`\`\n\nSave this content to a .mmd file.`,
            },
          ],
        };
      }

      if (args.format === 'svg') {
        return {
          content: [
            {
              type: 'text' as const,
              text: `SVG export requires the Mermaid CLI. Install with:\n\nnpm install -g @mermaid-js/mermaid-cli\n\nThen run:\nmmdc -i input.mmd -o ${diagram.title.replace(/\s+/g, '-').toLowerCase()}.svg\n\nMermaid content:\n\`\`\`mermaid\n${diagram.mermaid}\n\`\`\``,
            },
          ],
        };
      }

      if (args.format === 'drawio') {
        // Generate draw.io URL with Mermaid code pre-loaded
        // Format: ?create={"type":"mermaid","data":"<mermaid_code>"}
        const createObj = JSON.stringify({ type: 'mermaid', data: diagram.mermaid });
        const url = `https://app.diagrams.net/?create=${encodeURIComponent(createObj)}`;

        return {
          content: [
            {
              type: 'text' as const,
              text: `**Open in Draw.io:** ${url}\n\nClick the link to open and edit your diagram in diagrams.net.\nThe Mermaid code will be converted to editable shapes automatically.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Unknown format: ${args.format}`,
          },
        ],
      };
    }
  );

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[visual-thinking] MCP server running on stdio');
}

main().catch((error) => {
  console.error('[visual-thinking] Fatal error:', error);
  process.exit(1);
});
