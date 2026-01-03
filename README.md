# brain-jar 🧠🫙

Claude Code plugins for enhanced agent memory and search.

## Plugins

### perplexity-search

Web search via Perplexity AI with smart context detection.

[Documentation](./plugins/perplexity-search/README.md)

### shared-memory

Persistent memory across agents with semantic search. Memories travel with you across sessions, devices, and other AI agents.

[Documentation](./plugins/shared-memory/README.md)

### forensics

Reverse engineer black-box systems: APIs, protocols, features, and data formats. Guided workflows adapt to your skill level.

[Documentation](./plugins/forensics/skills/investigate/SKILL.md)

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
