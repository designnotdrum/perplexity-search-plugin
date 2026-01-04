# Memory Quality Improvements Design

**Date:** 2026-01-03
**Status:** Approved
**Author:** Claude + Nick

## Problem

Brain-jar's Mem0 integration has memory quality issues:

1. **Profile snapshot explosion** - 8+ copies of full profile JSON from append-only sync
2. **Semantic fragments** - Profile facts extracted as separate memories
3. **Search query noise** - Perplexity queries polluting main memory pool

## Solution

Four interconnected improvements leveraging Mem0's cookbook patterns.

---

## 1. Entity Partitioning

Use Mem0's `agent_id` parameter to isolate content types.

```
┌─────────────────────────────────────────────────────────────┐
│                     Mem0 Storage                            │
├─────────────────┬─────────────────┬─────────────────────────┤
│ agent_id: null  │ agent_id:       │ agent_id:               │
│ (default)       │ "profile-mgr"   │ "perplexity"            │
├─────────────────┼─────────────────┼─────────────────────────┤
│ Regular         │ Profile         │ Search history          │
│ memories from   │ snapshots for   │ for context enrichment  │
│ conversations   │ "You, Wrapped"  │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

### Rules

- **Shared pool (no agent_id):** Real memories users would search later
- **Partitioned:** Internal/operational data for specific plugins

### Implementation

- Add optional `agentId` parameter to `Mem0Client.add()`
- `ProfileManager.pushSnapshot()` uses `agent_id: "profile-mgr"`
- `perplexity-search` uses `agent_id: "perplexity"` for search history
- Search defaults to no agent_id filter (regular memories only)

---

## 2. Profile Snapshot Pruning

Keep one snapshot per day max. Preserves growth story, eliminates noise.

### Algorithm

```
On pushSnapshot(profile):
  1. Get existing snapshots for today (filter by agent_id + date prefix)
  2. If any exist:
     - Delete the older ones from today
     - Save the new one
  3. If none exist:
     - Save the new one (first of the day)
```

### One-Time Migration

Add `pruneProfileHistory()` method:
- On first run after upgrade, consolidate existing snapshots to one-per-day
- Keep the latest snapshot from each day

### Before/After

```
Before:
  2026-01-03T16:43:35 → snapshot
  2026-01-03T17:42:17 → snapshot
  2026-01-03T22:49:36 → snapshot
  2026-01-03T23:05:49 → snapshot

After:
  2026-01-03T23:05:49 → snapshot (latest of the day)
```

---

## 3. Custom Instructions

Project-level Mem0 instructions to filter what gets stored.

### Default Instructions

```
Brain-jar memory assistant rules:

STORE:
- Decisions and their rationale
- User preferences explicitly stated
- Project-specific context and learnings
- Technical discoveries and solutions
- Workflow patterns that worked well

IGNORE:
- Facts about user identity, skills, or preferences (route to profile)
- Search queries (handled by perplexity namespace)
- Transient debugging context
- Speculation (might, maybe, possibly)
- Duplicate information already stored

CONSOLIDATE:
- If a fact updates an existing memory, update rather than add
- Prefer specific over general ("uses TypeScript 5.3" over "uses TypeScript")
```

### Configuration

Hybrid approach:
- Sensible defaults hardcoded in `Mem0Client`
- User can override in `~/.config/brain-jar/mem0-instructions.txt`

---

## 4. Memory Stats Tool

MCP tool for quick health checks with minimal token cost.

### Tool: `get_memory_stats`

**Returns:**

```json
{
  "local": {
    "total": 47,
    "by_scope": {
      "global": 32,
      "project:brain-jar": 15
    },
    "by_tag": {
      "preferences": 8,
      "workflow": 5,
      "debugging": 3
    },
    "date_range": {
      "oldest": "2026-01-02",
      "newest": "2026-01-03"
    }
  },
  "mem0": {
    "total": 52,
    "by_agent": {
      "shared-memory": 35,
      "profile-mgr": 12,
      "perplexity": 5
    }
  },
  "health": {
    "duplicates_detected": 0,
    "profile_snapshots": 12,
    "last_prune": "2026-01-03T00:00:00Z"
  }
}
```

---

## Implementation Order

| Order | Component | Effort | Files |
|-------|-----------|--------|-------|
| 1 | Entity partitioning in Mem0Client | Small | `packages/core/src/mem0-client.ts` |
| 2 | Update ProfileManager to use agent_id | Small | `plugins/shared-memory/src/profile/manager.ts` |
| 3 | Update perplexity-search to use agent_id | Small | `plugins/perplexity-search/src/index.ts` |
| 4 | Profile pruning logic | Medium | `packages/core/src/mem0-client.ts` |
| 5 | One-time migration | Small | `plugins/shared-memory/src/index.ts` |
| 6 | Custom instructions (defaults + config) | Medium | `packages/core/src/mem0-client.ts` |
| 7 | `get_memory_stats` tool | Small | `plugins/shared-memory/src/index.ts` |

---

## Success Criteria

- [ ] Profile snapshots isolated from regular memory search
- [ ] Only one profile snapshot per day
- [ ] Existing duplicate snapshots cleaned up
- [ ] Search queries don't appear in `search_memory` results
- [ ] `get_memory_stats` returns accurate counts by namespace
- [ ] Custom instructions prevent profile-facts from becoming memories
