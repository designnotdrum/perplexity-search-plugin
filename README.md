# brain-jar 🧠🫙

Claude Code plugins for enhanced agent memory and search.

## Plugins

| Plugin | Version | Description |
|--------|---------|-------------|
| [perplexity-search](./plugins/perplexity-search/README.md) | 1.0.0 | Web search via Perplexity AI with smart context detection |
| [shared-memory](./plugins/shared-memory/README.md) | 1.3.1 | Persistent memory with semantic search, user profiles, and auto-summaries |
| [forensics](./plugins/forensics/skills/investigate/SKILL.md) | 0.1.0 | Reverse engineer black-box systems: APIs, protocols, features |

### shared-memory highlights (v1.3.1)

- **Profile sync fixed** - Uses `infer: false` to store raw JSON in Mem0 (v1.2.0 was disabled)
- **Memory timeline** - Query memories by date range with `get_memory_timeline`
- **Auto-summaries** - Activity summaries generated automatically based on activity threshold
- **Profile history** - Track how your preferences evolve over time via `get_profile_history`

## Installation

Add this repository as a marketplace in Claude Code:

```
/plugin
→ Add Marketplace
→ designnotdrum/brain-jar
```

Then install individual plugins:

```
/plugin
→ brain-jar
→ Select plugin to install
```

## Architecture

Each plugin is self-contained under `plugins/`:

```
brain-jar/
├── .claude-plugin/
│   └── marketplace.json      # Registry manifest
├── plugins/
│   ├── perplexity-search/    # Web search plugin
│   ├── shared-memory/        # Memory plugin
│   └── forensics/            # Reverse engineering plugin
└── README.md
```

## License

MIT
