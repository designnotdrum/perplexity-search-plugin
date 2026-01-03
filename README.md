# brain-jar

**Claude Code plugins that remember, search, investigate, visualize, and discover.**

Claude is brilliant but forgetful. Every session starts from zero—no memory of your preferences, no context from yesterday, no accumulated knowledge. Brain-jar fixes that.

## The Plugins

| Plugin | What It Does |
|--------|--------------|
| [shared-memory](./plugins/shared-memory/README.md) | Persistent memory and user profiles across sessions |
| [perplexity-search](./plugins/perplexity-search/README.md) | Web search that knows your stack and history |
| [forensics](./plugins/forensics/README.md) | Guided reverse engineering for APIs, protocols, and code |
| [visual-thinking](./plugins/visual-thinking/README.md) | Persistent diagrams that Claude can read, build on, and export |
| [pattern-radar](./plugins/pattern-radar/README.md) | Personalized trend detection at the intersection of your knowledge |

## Why Brain-Jar?

### Before
```
Claude: What framework are you using?
You: React with TypeScript (for the 50th time)

Claude: Here's how to do authentication—
You: I already solved this last week, different project

Claude: Let me search for that...
[Returns Java tutorials when you use Node]
```

### After
```
Claude: I see you're using React/TypeScript. Based on your
        auth work last week, here's a pattern that fits...

[Searches return Node-specific results]

Claude: Your investigation from yesterday found 4 endpoints.
        Ready to build the OpenAPI spec?
```

## Installation

Add brain-jar as a Claude Code marketplace:

```
/plugin
→ Add Marketplace
→ designnotdrum/brain-jar
```

Install plugins individually:

```
/plugin
→ brain-jar
→ [Select plugin]
```

## The Stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            Claude Code                                   │
├─────────────────────────────────────────────────────────────────────────┤
│  shared-memory    perplexity-search    forensics                        │
│  ───────────────  ─────────────────    ──────────                       │
│  • User profiles  • Context-aware      • Investigations                 │
│  • Memory store   • Search history     • Traffic analysis               │
│  • Auto-summaries • Profile-enriched   • Spec generation                │
├─────────────────────────────────────────────────────────────────────────┤
│  visual-thinking                pattern-radar                           │
│  ───────────────                ─────────────                           │
│  • Mermaid diagrams             • HN/GitHub scanning                    │
│  • Version history              • Pattern detection                     │
│  • draw.io export               • Profile-aware relevance               │
└─────────────────────────────────────────────────────────────────────────┘
                                   ↓
                    ┌────────────────────────┐
                    │    @brain-jar/core     │
                    │    Shared Mem0 client  │
                    │    Common types        │
                    └────────────────────────┘
                                   ↓
                    ┌────────────────────────┐
                    │        Mem0 Cloud      │
                    │   Persistent storage   │
                    └────────────────────────┘
```

All plugins share the same user profile and memory infrastructure. Install shared-memory first for the best experience.

## Highlights

### shared-memory v2.0.1
- **15 MCP tools** for memory, profiles, and summaries
- **Profile learning** with inference confirmation
- **Auto-summaries** based on activity patterns
- **Mem0 sync** for cross-machine persistence
- **Bundled dependencies** for instant marketplace install

### perplexity-search v2.0.1
- **Profile-enriched queries** return stack-relevant results
- **Search memory** builds context over time
- **Perplexity Sonar** for real-time, cited answers
- **Bundled dependencies** for instant marketplace install

### forensics v0.2.1
- **Investigation persistence** across sessions
- **7 MCP tools** for analysis and spec generation
- **Skill-level adaptation** from beginner to expert
- **OpenAPI/TypeScript output** from captured traffic
- **Bundled dependencies** for instant marketplace install

### visual-thinking v0.1.3
- **Renamed /resume to /continue-diagram** to avoid Claude Code collision
- **7 MCP tools** for diagram CRUD and export
- **Mermaid diagrams** (mindmap, flowchart, sequence, ERD, etc.)
- **Version history** tracks diagram evolution
- **Bundled dependencies** for instant marketplace install

### pattern-radar v0.1.2
- **6 MCP tools** for trend scanning and pattern detection
- **HN + GitHub** real-time scanning
- **Profile-aware relevance** scores trends to your domains
- **Actionable suggestions** (learn, build, explore)
- **Bundled dependencies** for instant marketplace install

## Requirements

- Claude Code CLI
- Node.js 18+
- API keys (each plugin prompts on first run):
  - shared-memory: [Mem0](https://app.mem0.ai) (free tier: 10,000 memories)
  - perplexity-search: [Perplexity](https://www.perplexity.ai/settings/api)
  - forensics: Works locally, Mem0 optional for persistence
  - visual-thinking: Works locally, Mem0 optional via shared-memory
  - pattern-radar: Works without keys (GitHub token optional for higher rate limits)

## License

MIT
