---
name: digest
description: "Get your personalized trend briefing based on profile domains."
allowed-tools:
  - mcp__pattern-radar__get_radar_digest
  - mcp__pattern-radar__get_intersections
  - mcp__pattern-radar__suggest_actions
---

# Radar Digest

Get a personalized briefing of trends relevant to your expertise.

## When to Use

- Daily/weekly check-in on your domains
- Finding opportunities at the intersection of your skills
- Getting actionable suggestions based on trends

## Get Your Digest

```
get_radar_digest()
```

Or specify timeframe:
```
get_radar_digest(timeframe: "daily")
get_radar_digest(timeframe: "weekly")
```

## What You Get

1. **Relevant Patterns** — Trends that match your profile domains
2. **Actionable Suggestions** — What to learn, build, or explore
3. **Other Trending** — General trends outside your domains

## Domain Intersections

Find where multiple of your domains overlap:
```
get_intersections()
```

Example: If your domains include "TypeScript" and "AI", this finds signals relevant to both.

## Action-Focused

Get specific suggestions:
```
suggest_actions()                    # All types
suggest_actions(focus: "learn")      # Learning opportunities
suggest_actions(focus: "build")      # Build opportunities
suggest_actions(focus: "explore")    # Exploration ideas
```

## Profile Integration

Digest quality depends on your profile. Install shared-memory and populate:
- **technical.languages**: Programming languages you know
- **technical.frameworks**: Frameworks you use
- **knowledge.domains**: Your expertise areas
- **knowledge.interests**: Topics you're curious about

Or configure domains directly:
```
configure_sources(domains: ["TypeScript", "AI", "distributed systems"])
```

## Making It Routine

Consider adding to your workflow:
- Morning: `get_radar_digest(timeframe: "daily")`
- Monday: `get_radar_digest(timeframe: "weekly")`
- When exploring: `get_intersections()`
