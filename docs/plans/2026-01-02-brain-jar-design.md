# brain-jar Design

A Claude Code plugin registry providing enhanced agent memory and search capabilities.

## Overview

**brain-jar** is a monorepo containing Claude Code plugins:
- `perplexity-search` - Web search via Perplexity AI (existing, migrated)
- `shared-memory` - Persistent memory across agents (new)

The shared-memory plugin creates a universal memory layer that travels with the user across Claude Code sessions, devices, and other AI agents.

## Goals

1. **Cross-agent context** - Remember facts and preferences across Claude Code, ChatGPT, custom agents
2. **Project knowledge base** - Store codebase insights, decisions, and patterns
3. **Personal second brain** - Long-term memory of conversations, learnings, and preferences
4. **Seamless experience** - Users don't think about saving; it happens automatically

## Architecture

### Hybrid Storage Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Local SQLite                             │
│  Working memory: searches, interactions, session data       │
│  Unlimited storage, fast retrieval, no API calls            │
└─────────────────────┬───────────────────────────────────────┘
                      │ End of session
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Consolidation Layer                            │
│  - Summarize session into high-level memories               │
│  - Extract key decisions, preferences, directions           │
│  - Merge related searches into themes                       │
└─────────────────────┬───────────────────────────────────────┘
                      │ Sync summaries + key insights
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Mem0 Cloud                               │
│  Persistent memory: summaries, decisions, preferences       │
│  Semantic search, cross-session, portable to other agents   │
└─────────────────────────────────────────────────────────────┘
```

**Local SQLite** = Working memory (ephemeral, unlimited, fast)
**Mem0 Cloud** = Persistent memory (summarized, portable, semantic search)

### Data Flow

**During a session:**
1. Every search, decision, and interaction saves to local SQLite
2. No API calls, no limits, instant writes

**End of session:**
1. Consolidation layer summarizes the session
2. Extracts key decisions, preferences, and directions
3. Syncs summaries to Mem0 Cloud

**New machine setup:**
1. Pull summaries and key memories from Mem0 Cloud
2. Seed local SQLite with persistent context
3. Resume work with full historical awareness

### Why Mem0 Cloud?

Mem0 handles embeddings, vector storage, and semantic search. Users provide one API key and get:
- 10,000 memories (free tier)
- 1,000 retrieval calls/month
- Semantic search across all memories
- Access from other agents via Mem0's API/MCP

No Vercel. No Neon. No pgvector setup. Just works.

## Memory Model

### Structure

```typescript
interface Memory {
  id: string;
  content: string;           // Enriched content with context/sentiment
  scope: 'global' | string;  // 'global' or 'project:<name>'
  tags: string[];            // User-defined categorization
  source: {
    agent: string;           // 'claude-code', 'perplexity', 'manual'
    action?: string;         // 'search', 'decision', 'insight', 'summary'
  };
  created_at: Date;
  updated_at: Date;
}
```

### Scope Hierarchy

- `global` - Personal preferences, general learnings, cross-project knowledge
- `project:<name>` - Project-specific context (detected from working directory)

### Enriched Content

Memories capture sentiment, personality, and the "why" behind decisions:

```json
{
  "content": "User rejected building custom embedding logic ('fuck that') - strongly prefers leveraging existing tools over DIY complexity. Values pragmatism and time-efficiency over control.",
  "scope": "global",
  "tags": ["preference", "architecture", "personality"],
  "source": { "agent": "claude-code", "action": "decision" }
}
```

```json
{
  "content": "Session summary: Designed brain-jar plugin architecture. Key decisions: (1) Chose Mem0 Cloud over self-hosted pgvector for simplicity, (2) Hybrid local+cloud storage to manage API limits, (3) Session summaries over granular search logging. User excited about contextual recall UX.",
  "scope": "project:brain-jar",
  "tags": ["session-summary", "architecture"],
  "source": { "agent": "claude-code", "action": "summary" }
}
```

## MCP Tools

### shared-memory tools

```typescript
// Store a memory
add_memory(
  content: string,      // Enriched content with context/sentiment
  scope?: string,       // Default: 'global'
  tags?: string[]       // Optional categorization
)

// Semantic search
search_memory(
  query: string,        // Natural language query
  scope?: string,       // 'global', 'project:x', or 'all'
  limit?: number        // Default: 10
)

// List recent memories
list_memories(
  scope?: string,
  tags?: string[],
  since?: Date,
  limit?: number
)

// Remove a memory
delete_memory(id: string)

// Trigger session summary (usually automatic)
summarize_session()
```

### Integration with perplexity-search

When both plugins are installed:
1. perplexity-search detects shared-memory is available
2. Searches save to local SQLite automatically
3. Session summaries include search themes and outcomes

## Memory Recall UX

Memories surface with context and relevance, not raw data dumps.

**Example recall:**

```
User: "I need to add a database to this project"

Agent: "Remember when you were working on brain-jar, you chose
Neon for Postgres hosting because the free tier was more generous
than Supabase. You also strongly preferred managed solutions over
self-hosting.

For this project, Neon would give you the same benefits - want me
to set it up the same way?"
```

**Recall principles:**
- Connect past decisions to current work
- Frame as helpful context, not constraints
- Explain the why, not just the what
- Use natural language ("remember when..." not "memory ID 47")

## Repository Structure

```
brain-jar/
├── .claude-plugin/
│   └── marketplace.json        # Registry manifest
├── plugins/
│   ├── perplexity-search/
│   │   ├── plugin.json
│   │   ├── package.json
│   │   ├── src/
│   │   └── skills/
│   │       └── using-perplexity-for-context/
│   │           └── SKILL.md
│   └── shared-memory/
│       ├── plugin.json
│       ├── package.json
│       ├── src/
│       │   ├── index.ts        # MCP server
│       │   ├── local-store.ts  # SQLite operations
│       │   ├── mem0-client.ts  # Mem0 SDK wrapper
│       │   └── consolidate.ts  # Session summarization
│       └── skills/
│           └── managing-memory/
│               └── SKILL.md
├── README.md
└── package.json                # Workspace root
```

### marketplace.json

```json
{
  "name": "brain-jar",
  "description": "Claude Code plugins for enhanced agent memory and search",
  "owner": { "name": "Nick Mason" },
  "plugins": [
    {
      "name": "perplexity-search",
      "description": "Web search via Perplexity AI with smart context detection",
      "source": "./plugins/perplexity-search"
    },
    {
      "name": "shared-memory",
      "description": "Persistent memory across agents with semantic search",
      "source": "./plugins/shared-memory"
    }
  ]
}
```

## Setup Flow

### First-time setup

```
$ claude
> Plugin 'shared-memory' requires configuration.
>
> 🧠 Mem0 API Key Setup
>
> To get your API key:
> 1. Go to https://app.mem0.ai
> 2. Sign up (free tier: 10,000 memories)
> 3. Navigate to Settings → API Keys
> 4. Create and copy your key
>
> Enter your Mem0 API key: ▊
>
> ✓ API key saved
> ✓ Connection verified
> ✓ Ready to store memories!
```

### Config file

```json
{
  "mem0_api_key": "m0-xxx...",
  "default_scope": "global",
  "auto_summarize": true
}
```

## Cost Analysis

**Mem0 Cloud free tier:**
- 10,000 memories - Plenty for summaries and key decisions
- 1,000 retrieval calls/month - ~33/day, managed by local-first retrieval

**Strategy to stay free:**
- Local SQLite handles granular data (unlimited)
- Only summaries sync to Mem0 (fewer memories)
- Check local first, Mem0 for semantic/cross-session (fewer API calls)

## Future Considerations

1. **Self-hosted option** - Mem0 open-source + Neon for power users
2. **Browser extension** - Inject memory context into web-based agents
3. **Memory sharing** - Share project memories with team members
4. **Memory export** - Backup/migrate memories to other systems

## Summary

brain-jar creates a seamless memory layer for Claude Code:
- Users don't think about saving - it happens automatically
- Local working memory keeps things fast and unlimited
- Persistent summaries travel across sessions and devices
- Contextual recall helps agents connect past decisions to current work
- One API key, same setup pattern as perplexity-search
