# pattern-radar

**Find your edge.**

Trends are everywhere. Opportunities hide at intersections—where your knowledge meets emerging patterns. Pattern-radar scans tech, community, and markets to surface what matters to you.

## The Problem

Staying current is exhausting:
- HN front page is interesting but generic
- GitHub trending shows popular, not relevant
- You miss connections between your domains and new developments
- Same scanning, different day, no personalization

## The Solution

Pattern-radar does three things:

1. **Scans sources** — HN, GitHub, and (via perplexity) Reddit, Twitter, arXiv
2. **Detects patterns** — Clusters signals, finds themes
3. **Scores relevance** — Matches to your profile domains

## What Changes

| Before | After |
|--------|-------|
| Browse HN hoping something's relevant | Digest filtered to your domains |
| Miss cross-domain opportunities | Intersection detection surfaces overlaps |
| "That's interesting" but no action | Actionable suggestions: learn, build, explore |
| Generic trending repos | Repos scored by relevance to your stack |

## Quick Start

```bash
# Install from brain-jar marketplace
/plugin → brain-jar → pattern-radar

# Get your personalized digest
/pattern-radar:digest
```

## Tools

| Tool | Purpose |
|------|---------|
| `scan_trends` | Search HN + GitHub for a topic |
| `get_radar_digest` | Personalized trend briefing |
| `configure_sources` | Set domains, weights, and filters |
| `explore_pattern` | Deep dive on a specific pattern |
| `get_intersections` | Find where your domains overlap in trends |
| `suggest_actions` | Get actionable suggestions |

## Skills

### `/pattern-radar:scan`

On-demand trend scan for any topic:
- Searches HN and GitHub
- Detects patterns across sources
- Scores relevance to your profile
- Suggests next steps

### `/pattern-radar:digest`

Your personalized briefing:
- Patterns matching your domains
- Intersection alerts (multiple domains converging)
- Suggested deep-dives

### `/pattern-radar:configure`

Tune your radar:
- Enable/disable sources
- Set domain priorities
- Adjust source weights

## How It Works

```
┌─────────────────────────────────────────────────────┐
│              Your Profile                            │
│   [TypeScript, AI, distributed systems]             │
└─────────────────────────┬───────────────────────────┘
                          ↓
        ┌─────────────────────────────────┐
        │           Sources               │
        │   HN Algolia  │  GitHub API    │
        │   (free)      │  (free/token)  │
        └─────────────────────────────────┘
                          ↓
        ┌─────────────────────────────────┐
        │      Pattern Detection          │
        │   Cluster signals by theme      │
        │   Score relevance to domains    │
        └─────────────────────────────────┘
                          ↓
        ┌─────────────────────────────────┐
        │      Actionable Output          │
        │   Learn │ Build │ Explore       │
        └─────────────────────────────────┘
```

## Integration with brain-jar

### shared-memory (recommended)

When installed, pattern-radar reads your profile automatically:
- **technical.languages** → Language relevance
- **technical.frameworks** → Framework matching
- **knowledge.domains** → Expertise areas
- **knowledge.interests** → Curiosity topics

No manual configuration needed—your radar adapts to your profile.

### perplexity-search

For deeper analysis beyond HN and GitHub:
- Pattern-radar generates ready-to-use Perplexity queries
- Covers Reddit, Twitter, arXiv, financial news
- Synthesizes insights across sources

### visual-thinking

Capture trend maps and pattern relationships as persistent diagrams.

## Example: Finding Your Edge

```
> /pattern-radar:digest

Your domains: TypeScript, AI, distributed systems

## Relevant Patterns

### "LLM inference optimization"
*Relevance: 85% | Signals: 7*

HN discussions + GitHub repos around faster LLM serving.
Intersects your AI + distributed systems expertise.

**Actions:**
- [learn] Deep dive into vLLM architecture
- [build] Explore TypeScript bindings for inference servers

### "Edge compute for AI"
*Relevance: 72% | Signals: 4*

...
```

## Requirements

- Claude Code CLI
- Node.js 18+
- Optional: GitHub token (for higher rate limits)
- Optional: shared-memory (for profile integration)

## Privacy

- HN and GitHub searches are public API calls
- No data sent to brain-jar maintainers
- Profile stays on your machine (or in your Mem0 account via shared-memory)

## License

MIT
