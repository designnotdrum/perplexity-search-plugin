# Subagent Architecture Design for Brain-Jar Plugins

**Date:** 2026-01-04
**Status:** Approved
**Inspired by:** [obra/superpowers](https://github.com/obra/superpowers) agent/subagent patterns

## Overview

This design applies Jesse Obra's subagent-driven development pattern to brain-jar plugins. The core insight: **fresh subagents per task with context isolation prevents pollution and enables parallel-safe execution.**

## The Pattern

```
Main Context (Opus)     →  Orchestrate, decide, talk to user
Subagents (Haiku)       →  Fetch, filter, summarize, return concise results
MCP Tools               →  Raw data access (unchanged)
Skills                  →  Workflow orchestration with subagent dispatch
```

**Key principle:** MCP tools stay simple (raw data access), but **skills** become orchestration layers that dispatch subagents for heavy lifting.

## Plugin-Specific Recommendations

### shared-memory (Moderate Changes)

**Current:** 19 MCP tools, returns raw data to main context

**Changes:**
- Add optional `summarize: boolean` parameter to `search_memory` and `list_memories`
- Create new `/memory-digest` skill that uses Haiku subagent to produce condensed insights
- Keep raw tools unchanged for when full data is needed

**Subagent opportunities:**
| Operation | With Subagent |
|-----------|--------------|
| `search_memory` | Haiku filters to top 3-5 most relevant, summarizes |
| `list_memories` | Haiku summarizes patterns/themes instead of raw list |
| `get_profile_history` | Haiku extracts "what changed" narrative |

---

### perplexity-search (Light Changes)

**Current:** 1 MCP tool, sends profile context with every query

**Changes:**
- Wrap in Haiku subagent for model efficiency (cheaper than Opus orchestrating)
- Add TL;DR line at top of results for quick scanning
- Keep full results and full profile enrichment (serendipity is the feature)

**What Haiku does:**
- Execute the Perplexity query with full profile context
- Light formatting/contextualization
- Prepend 1-line TL;DR

**What Haiku does NOT do:**
- Aggressive summarization (preserves serendipity)
- Citation filtering
- Removing "irrelevant" sections

---

### forensics (Significant Changes)

**Current:** 7 MCP tools, multi-step investigation workflows

**Changes:**
- Refactor `/investigate` skill to subagent-per-phase pattern
- Keep raw tools for direct access when user wants full output
- Investigation state stores everything, main context gets summaries

**Proposed flow:**
```
Main Context (Opus): "Investigating Spotify API"
  ↓
Subagent 1 (Haiku): Analyze HAR capture
  → Returns: "Found 12 endpoints, OAuth2 bearer auth, JSON responses"
  ↓
Subagent 2 (Haiku): Build OpenAPI spec
  → Returns: "Generated spec at docs/spotify-api.yaml (47 endpoints)"
  ↓
Subagent 3 (Haiku): Generate TypeScript client
  → Returns: "Client at src/spotify-client.ts with full typing"
```

---

### pattern-radar (Moderate Changes)

**Current:** 6 MCP tools, scans HN + GitHub, deterministic pattern matching

**Changes:**
- `/digest` skill uses Haiku subagent for personalized narrative generation
- Raw `scan_trends` tool stays for full unfiltered access
- **Serendipity mode = default** (focused mode is opt-in)
- Include "wildcard" section for interesting-but-unexpected signals

**Proposed `/digest` flow:**
```
Main Context: "What's trending that matters to me?"
  ↓
Haiku Subagent:
  1. Fetch user profile + recent memories
  2. Scan HN + GitHub
  3. Cross-reference: what intersects?
  4. Generate personalized narrative + wildcards
  → Returns: 300-word digest with 3-5 actionable insights
```

---

### visual-thinking (Minimal Changes)

**Current:** 9 MCP tools, Mermaid diagram CRUD

**Changes:**
- Keep CRUD tools as-is (diagrams must be returned in full)
- `/capture` skill optionally uses Haiku to draft from conversation context
- Make drafting opt-in: "Want me to draft from our conversation, or start blank?"

**Low priority:** This plugin is structural, not analytical. Subagent pattern has limited benefit here.

---

## Implementation Priority

Ordered by impact/effort ratio:

1. **Principles documentation** — Immediate, low effort, high alignment value ✅
2. **Perplexity TL;DR + Haiku wrapper** — Quick win, visible UX improvement
3. **Forensics subagent workflow** — High impact for complex investigations
4. **Pattern-radar personalized digest** — Leverages existing profile data
5. **Shared-memory summarization** — Nice-to-have, lower urgency

---

## Core Principles (Codified)

### 1. Automagic UX ("Don't Make Me Think")
- Plugins work immediately after install with zero manual config
- Prompt for config only when needed, allow skipping with graceful degradation
- Prefer sensible defaults over configuration options
- Skills orchestrate complexity away from the user

### 2. Token Optimization
- Never pollute main context with data that could be summarized
- Use subagents (Haiku) for fetch/filter/format operations
- Reserve Opus for decisions, orchestration, and user interaction
- Return concise summaries to main context, store full data in persistent state

### 3. Context Isolation
- Fresh subagent per task prevents cross-contamination
- Skills orchestrate multi-step workflows across isolated subagents
- MCP tools stay simple (raw data access), skills handle orchestration

### 4. Security & Self-Ownership
- All sensitive data stays under user's control (local files, user-owned cloud accounts)
- Never phone home to brain-jar infrastructure
- Use latest package versions unless blocked by dependencies
- Mem0 API keys are user's own—brain-jar never sees their data

### 5. Serendipity by Default
- Don't over-filter or over-summarize
- Surface unexpected connections and tangential insights
- Focused/minimal modes are opt-in, not default
