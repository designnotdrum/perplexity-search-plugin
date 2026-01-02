# Perplexity Search MCP for Claude Code

An MCP server that provides Perplexity AI search with personalized context enrichment for Claude Code.

## Features

- **Personalized Search**: Enriches queries with your technical preferences, working style, and knowledge levels
- **Automatic Profile Updates**: Silently detects and updates your profile when you mention preferences
- **Periodic Refresh**: Automatically refreshes profile every 2 days from conversation history
- **Superior Citations**: Returns Perplexity's high-quality search results with source citations

## How It Works

```mermaid
flowchart TD
    Start([User asks Claude Code a question]) --> Detect{Trigger detected?<br/>Unfamiliar tech,<br/>decision point,<br/>learning question}

    Detect -->|No| Normal[Standard Claude response]
    Detect -->|Yes| LoadProfile[Load user profile<br/>~/.claude/perplexity-search/user-profile.json]

    LoadProfile --> CheckStale{Profile older<br/>than 2 days?}
    CheckStale -->|Yes| QueueRefresh[Queue background refresh<br/>from conversation history]
    CheckStale -->|No| BuildContext
    QueueRefresh --> BuildContext

    BuildContext[Build context string from profile:<br/>- Technical preferences<br/>- Working style<br/>- Knowledge levels<br/>- Current projects]

    BuildContext --> EnrichQuery[Enrich search query:<br/>Context about me: ...<br/>Query: ...]

    EnrichQuery --> Perplexity[Send to Perplexity AI API]
    Perplexity --> Results[Get results with citations]

    Results --> SmartDetect[Smart detection scans<br/>conversation for preferences]

    SmartDetect --> Patterns{Detect patterns?<br/>I prefer...<br/>I'm learning...<br/>I use...}

    Patterns -->|Yes| UpdateProfile[Silently update profile<br/>with new preferences]
    Patterns -->|No| Return
    UpdateProfile --> Return[Return enriched results<br/>to Claude Code]

    Return --> Response([Claude Code responds with<br/>personalized context])
    Normal --> Response

    style Start fill:#e1f5ff
    style Response fill:#e1f5ff
    style LoadProfile fill:#fff4e1
    style BuildContext fill:#fff4e1
    style EnrichQuery fill:#fff4e1
    style Perplexity fill:#ffe1f5
    style Results fill:#ffe1f5
    style SmartDetect fill:#e1ffe1
    style UpdateProfile fill:#e1ffe1
```

### Profile Memory System

```mermaid
flowchart LR
    subgraph Profile Storage
        File[(~/.claude/perplexity-search/<br/>user-profile.json)]
    end

    subgraph Automatic Updates
        Conversation[Conversation text] --> Detect[Pattern detection]
        Detect --> Extract[Extract preferences:<br/>- Languages & frameworks<br/>- Working style<br/>- Knowledge levels<br/>- Current projects]
        Extract --> Update[Update profile]
        Update --> File
    end

    subgraph Periodic Refresh
        Timer[Every 2 days] --> Check{Need refresh?}
        Check -->|Yes| History[Scan conversation<br/>history]
        History --> Rebuild[Rebuild profile<br/>from patterns]
        Rebuild --> File
    end

    subgraph Search Enhancement
        File --> Load[Load profile]
        Load --> Context[Build context string]
        Context --> Query[Enrich search query]
        Query --> API[Perplexity API]
        API --> Results[Personalized results]
    end

    style File fill:#ffe1f5
    style Detect fill:#e1ffe1
    style Update fill:#e1ffe1
    style Context fill:#fff4e1
    style Results fill:#e1f5ff
```

## Installation

### 1. Clone and Build

```bash
cd ~/.claude/plugins
git clone <repo-url> perplexity-search
cd perplexity-search
npm install
npm run build
```

### 2. Configure API Key

Create `~/.claude/perplexity-search/config.json`:

```json
{
  "apiKey": "pplx-xxxxx",
  "defaultMaxResults": 5
}
```

Or set environment variable:

```bash
export PERPLEXITY_API_KEY="pplx-xxxxx"
```

### 3. Install Skill

```bash
cp docs/skills/using-perplexity-for-context.md ~/.claude/skills/
```

### 4. Configure Claude Code

Add to your Claude Code MCP settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "perplexity-search": {
      "command": "node",
      "args": ["/Users/YOU/.claude/plugins/perplexity-search/dist/index.js"],
      "env": {}
    }
  }
}
```

## Usage

Once installed, the tool automatically triggers when Claude Code detects:
- Unfamiliar libraries or technologies
- Decision points requiring user preferences
- Learning questions
- Preference-dependent choices
- Context that benefits from personalization

No manual invocation needed - it works silently in the background.

## User Profile

Your profile is stored at `~/.claude/perplexity-search/user-profile.json` and contains:

- **Technical Preferences**: Languages, frameworks, tools, patterns
- **Working Style**: Explanation preferences, communication style, priorities
- **Project Context**: Domains, current projects, common tasks
- **Knowledge Levels**: Expert, proficient, learning

### Manual Editing

You can edit your profile directly:

```bash
nano ~/.claude/perplexity-search/user-profile.json
```

### Automatic Updates

The profile automatically updates when you mention:
- "I prefer X", "I like X", "I avoid X"
- "I'm trying to X", "I'm working on X"
- "I'm learning X", "I'm an expert in X"
- "I use X", "I switched to X"

## Development

```bash
# Run tests
npm test

# Run in dev mode
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

## Architecture

- **TypeScript** - Type-safe implementation
- **@modelcontextprotocol/sdk** - MCP server framework
- **@perplexity-ai/perplexity_ai** - Official Perplexity client
- **Profile Management** - CRUD operations, smart detection, refresh logic

## License

MIT
