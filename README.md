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

### shared-memory v2.2.1
- **Auto-install hooks** - Chess timer now bundles hookify rules via setup_chess_timer_hooks tool for fully automatic session management
- **Chess timer** - Self-calibrating time estimation that tracks how long you actually spend coding, predicts future feature duration based on complexity and work type
- **7 new MCP tools** - start_work_session, pause/resume/complete, get_work_estimate, list_work_sessions, get_active_session
- **Confidence levels** - Predictions improve with more samples (low <5, medium 5-14, high 15+)
- **24 MCP tools** for memory, profiles, summaries, diagnostics, and work sessions

### perplexity-search v2.0.2
- **Subagent pattern with TL;DR** - skill shows condensed summary + full Perplexity response
- **Profile-enriched queries** return stack-relevant results
- **Search memory** builds context over time
- **Perplexity Sonar** for real-time, cited answers
- **Bundled dependencies** for instant marketplace install

### forensics v0.4.0
- **Project-aware scope** - Investigations auto-detect project context using detectScope()
- **Subagent-driven investigations** keep main context clean with Haiku subagents for data-heavy operations
- **Investigation persistence** across sessions
- **7 MCP tools** for analysis and spec generation
- **Skill-level adaptation** from beginner to expert
- **OpenAPI/TypeScript output** from captured traffic

### visual-thinking v0.3.3
- **Auto-open on create** - diagrams now open in draw.io immediately when created (no extra export step)
- **Expanded trigger patterns** - hookify now catches "brainstorm", "let's design", "how should this work" and more
- **Project-aware scope** - diagrams now use detectScope() as default instead of 'global'
- **Optional Haiku drafting** - skill can use subagent to draft diagrams from complex conversations
- **Hookify integration** - Auto-suggests diagrams when discussing architecture, flows, or data models
- **One-click draw.io integration** - Mermaid diagrams converted to editable draw.io shapes
- **7 MCP tools** for diagram CRUD, export, and integration setup
- **Mermaid diagrams** (mindmap, flowchart, sequence, ERD, etc.)
- **Version history** tracks diagram evolution

### pattern-radar v0.5.0
- **Digest persistence** - Digests auto-save to SQLite with 30-day retention and auto-prune
- **Digest lifecycle** - Fresh → Actioned → Stale with tracking via explore/validate actions
- **Dynamic source architecture** - Pluggable adapter system for adding new source types
- **Reddit adapter** - Scan subreddits for trends and discussions
- **RSS adapter** - Monitor any RSS/Atom feed for signals
- **scan_topic tool** - Topic-based scanning with curated domain mappings
- **12 MCP tools** for trend scanning, pattern detection, signal validation, and digest management
- **HN + GitHub** real-time scanning with profile-aware relevance

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
