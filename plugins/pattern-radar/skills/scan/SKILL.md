---
name: scan
description: "On-demand trend scan for a topic. Search HN and GitHub for what's happening now."
allowed-tools:
  - mcp__pattern-radar__scan_trends
  - mcp__pattern-radar__explore_pattern
  - mcp__perplexity-search__perplexity_search
---

# Trend Scanning

Scan current trends across Hacker News and GitHub for any topic.

## When to Use

- "What's happening in [domain]?"
- Research before starting a new project
- Staying current with technology trends
- Finding emerging tools and patterns

## Basic Scan

```
scan_trends(topic: "WebAssembly")
```

Returns:
- Signals from HN and GitHub
- Detected patterns across sources
- Relevance scoring based on your profile
- Actionable suggestions

## Targeted Scans

**HN only** (community discussions):
```
scan_trends(topic: "AI agents", sources: ["hackernews"])
```

**GitHub only** (code and repos):
```
scan_trends(topic: "rust CLI tools", sources: ["github"])
```

## Deep Dive

After finding interesting signals:
```
explore_pattern(topic: "specific-pattern")
```

## Perplexity Integration

For aggregated web search across Reddit, Twitter, arXiv, and more:
```
perplexity_search("your topic in the context of your domains")
```

Pattern-radar generates ready-to-use Perplexity queries in scan results.

## Understanding Results

**Signals**: Individual items (HN stories, GitHub repos)
- Score: Engagement level (HN points, GitHub stars)
- Source: Where it came from

**Patterns**: Clusters of related signals
- Relevance: How well it matches your domains
- Actions: Suggested next steps

## Tips

1. Scan broad topics first, then narrow down
2. Use your profile domains for automatic relevance scoring
3. Combine with perplexity_search for comprehensive coverage
4. Save interesting patterns to shared-memory
