# Forensics Subagent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `/investigate` skill to use subagent-per-phase pattern, keeping main context clean while subagents do heavy lifting.

**Architecture:** The skill dispatches fresh Haiku subagents for each investigation phase (capture analysis, spec generation). Subagents have full access to tools but return only concise summaries to main context. Full data stays in investigation state (Mem0).

**Tech Stack:** Claude Code Task tool, Haiku model, existing MCP tools unchanged

---

## Current vs Target Architecture

```
CURRENT:
Main Context (Opus) → calls tools directly → receives full output → context bloat

TARGET:
Main Context (Opus) → dispatches Haiku subagent → subagent calls tools
                    ← receives 2-3 line summary ← full data in Mem0
```

---

## Task 1: Create Subagent Dispatch Helper

**Files:**
- Create: `plugins/forensics/src/subagent/dispatch.ts`

**Step 1: Create dispatch utility**

```typescript
// plugins/forensics/src/subagent/dispatch.ts

export interface SubagentResult {
  summary: string;
  details?: Record<string, unknown>;
  nextStep?: string;
}

export interface SubagentTask {
  phase: 'analyze' | 'build-spec' | 'suggest';
  investigationId: string;
  input?: string;
}

/**
 * Dispatch instructions for a Haiku subagent.
 * Returns a prompt that the skill can pass to Task tool.
 */
export function buildSubagentPrompt(task: SubagentTask): string {
  const baseInstructions = `You are a forensics investigation assistant.
Your job is to complete ONE specific task and return a CONCISE summary (2-3 sentences max).
Store full details in the investigation state - the main context only needs the summary.

Investigation ID: ${task.investigationId}

IMPORTANT:
- Use the forensics MCP tools to complete your task
- Return ONLY a brief summary of what you found/did
- Full data is automatically stored in investigation state`;

  switch (task.phase) {
    case 'analyze':
      return `${baseInstructions}

TASK: Analyze the provided network capture.

INPUT:
${task.input}

STEPS:
1. Call analyze_capture with the HAR/curl content
2. Review the extracted endpoints and auth patterns
3. Return a 2-3 sentence summary like:
   "Found X endpoints using [auth type]. Key APIs: [list 2-3 main ones]. Ready for spec generation."`;

    case 'build-spec':
      return `${baseInstructions}

TASK: Generate API specification from investigation findings.

STEPS:
1. Call build_spec with format 'openapi' and investigationId '${task.investigationId}'
2. Return a summary like:
   "Generated OpenAPI spec with X endpoints. Spec saved to investigation. Key operations: [list 2-3]."`;

    case 'suggest':
      return `${baseInstructions}

TASK: Determine the next step for this investigation.

STEPS:
1. Call suggest_next_step with the investigation context
2. Return a brief summary of what the user should do next`;

    default:
      return baseInstructions;
  }
}

/**
 * Parse subagent response into structured result.
 * Extracts summary from agent's natural language response.
 */
export function parseSubagentResponse(response: string): SubagentResult {
  // The response IS the summary - subagent was instructed to be concise
  return {
    summary: response.trim().slice(0, 500), // Safety cap
  };
}
```

**Step 2: Create index export**

```typescript
// plugins/forensics/src/subagent/index.ts

export * from './dispatch';
```

**Step 3: Verify files exist**

Run: `ls plugins/forensics/src/subagent/`
Expected: `dispatch.ts  index.ts`

**Step 4: Commit**

```bash
git add plugins/forensics/src/subagent/
git commit -m "feat(forensics): add subagent dispatch helpers"
```

---

## Task 2: Update Skill to Use Subagent Pattern

**Files:**
- Modify: `plugins/forensics/skills/investigate/SKILL.md`

**Step 1: Read current skill**

Run: `cat plugins/forensics/skills/investigate/SKILL.md`

**Step 2: Rewrite skill with subagent dispatch**

Replace the entire SKILL.md with:

```markdown
---
name: investigate
description: Guided workflow for reverse engineering black-box systems. Use when a user wants to decode a defunct API, replicate a competitor's feature, understand unfamiliar code, or crack a data format.
---

# Forensics Investigation (Subagent-Driven)

This skill orchestrates multi-phase investigations using fresh subagents per phase. Main context stays clean; subagents do heavy lifting.

## Architecture

```
You (Opus) → Dispatch Haiku subagent → Subagent uses tools → Returns summary
           ← 2-3 sentence summary   ← Full data in Mem0
```

## Phase 1: Check for Existing Investigation

First, check if there's a resumable investigation:

```
Call get_investigation tool (no params = gets active investigation)
```

**If investigation exists:** Ask user "Found investigation '[name]' in progress. Resume or start new?"

**If no investigation:** Proceed to Phase 2.

## Phase 2: Start New Investigation

Ask ONE question: "What are we investigating today?"

From their answer, determine the mode:
- **protocol**: API, network traffic, REST endpoints, authentication
- **feature**: Competitor feature, UI behavior, product capability
- **codebase**: Legacy code, unfamiliar repo, architecture
- **decision**: Why was this built this way? Git archaeology
- **format**: Binary format, data structure, file format

Confirm: "This sounds like a [mode] investigation. Starting '[name]'..."

```
Call start_investigation with:
- name: descriptive name from user's answer
- mode: detected mode
- target: what they're investigating
```

## Phase 3: Mode-Specific Workflow with Subagents

### Protocol Mode

**Step 1: Capture Guidance**

If user hasn't captured traffic yet:
```
Call suggest_next_step with mode='protocol', hasCapture=false
```
Return the guidance directly (it's already concise).

**Step 2: Analyze Capture (SUBAGENT)**

When user provides HAR/curl output:

```
Use Task tool to dispatch Haiku subagent:
- subagent_type: "general-purpose"
- model: "haiku"
- prompt: [Use buildSubagentPrompt('analyze', investigationId, userInput)]

Example prompt for subagent:
"You are a forensics investigation assistant. Analyze this HAR capture using the analyze_capture tool.
Return ONLY a 2-3 sentence summary of findings. Full data is stored automatically.

Investigation ID: [id]

HAR Content:
[user's HAR data]"
```

**What you tell the user:** The subagent's summary + "Full details stored in investigation."

**Step 3: Build Spec (SUBAGENT)**

After analysis:

```
Use Task tool to dispatch Haiku subagent:
- subagent_type: "general-purpose"
- model: "haiku"
- prompt: "Generate OpenAPI spec for investigation [id] using build_spec tool.
          Return 2-3 sentence summary of what was generated."
```

**What you tell the user:** The subagent's summary + offer to show spec or continue.

**Step 4: Implementation Guidance**

```
Call suggest_next_step with mode='protocol', hasCapture=true, hasSpec=true
```

Tailor to user's tech stack (fetched from profile automatically).

### Feature Mode

**Step 1: Research Phase (SUBAGENT)**

```
Dispatch Haiku subagent to research the feature:
- Search for similar implementations
- Document key UI flows
- Identify technical patterns
```

**Step 2: Component Mapping**

Guide user to map components to their codebase.

### Codebase / Decision / Format Modes

For these modes, use suggest_next_step directly (responses are already concise).
No subagent needed - these are guidance-heavy, not data-heavy.

## Phase 4: Progress & Resume

Investigation state is persisted. When user returns:

1. `get_investigation` retrieves full state
2. `suggest_next_step` knows where they left off
3. Continue from current phase

## Key Principles

1. **Subagents for data-heavy operations** - HAR parsing, spec generation
2. **Direct tools for guidance** - suggest_next_step already returns concise output
3. **Main context gets summaries** - "Found 12 endpoints with OAuth2 auth"
4. **Full data in Mem0** - Investigation state has everything
5. **Fresh subagent per phase** - No context pollution between phases

## Example Flow

User: "I want to reverse engineer the Spotify API"

You: "Starting a protocol investigation for 'Spotify API'. First, we need to capture some traffic..."
[Call suggest_next_step → returns capture guidance]

User: [Provides HAR file]

You: "Analyzing the capture..."
[Dispatch Haiku subagent → analyze_capture → returns summary]
"Found 47 endpoints using Bearer token auth. Key APIs: /v1/me, /v1/playlists, /v1/tracks. Ready to generate spec."

User: "Generate the spec"

You: "Building OpenAPI specification..."
[Dispatch Haiku subagent → build_spec → returns summary]
"Generated OpenAPI 3.0 spec with 47 endpoints. Includes OAuth2 security scheme. Saved to investigation."

User: "How do I implement this?"

You: [Call suggest_next_step → sees user's Python stack]
"Based on your profile, I'd suggest using httpx with Pydantic models..."
```

**Step 3: Verify skill updated**

Run: `head -50 plugins/forensics/skills/investigate/SKILL.md`

**Step 4: Commit**

```bash
git add plugins/forensics/skills/investigate/SKILL.md
git commit -m "feat(forensics): update /investigate to use subagent pattern"
```

---

## Task 3: Add Model Parameter Support to Task Dispatch

**Context:** The skill needs to specify `model: "haiku"` when dispatching. This is already supported by Claude Code's Task tool - just needs to be documented in the skill.

**Files:**
- No code changes needed
- Skill already shows correct Task tool usage

**Verification:**

The Task tool accepts these parameters:
- `subagent_type`: "general-purpose"
- `model`: "haiku" | "sonnet" | "opus"
- `prompt`: The task description

This is already in Claude Code - no implementation needed.

**Step 1: Commit documentation**

```bash
git add -A
git commit -m "docs(forensics): document subagent dispatch pattern"
```

---

## Task 4: Test the Subagent Flow

**Files:**
- Test manually (no automated test for skill behavior)

**Step 1: Clear any existing investigation**

```bash
# In Claude Code session
/investigate
# If investigation exists, complete or start fresh
```

**Step 2: Start protocol investigation**

```
User: "/investigate"
Expected: Skill asks what to investigate

User: "The GitHub API"
Expected: Skill starts protocol investigation, asks for traffic capture
```

**Step 3: Provide sample HAR**

```
User: [paste small HAR sample]
Expected:
- Skill dispatches Haiku subagent
- Subagent analyzes HAR
- You receive 2-3 sentence summary
- Full data in investigation state
```

**Step 4: Generate spec**

```
User: "Generate the spec"
Expected:
- Skill dispatches Haiku subagent
- Subagent generates OpenAPI
- You receive summary
```

**Step 5: Verify investigation state**

```
Call get_investigation
Expected: Full endpoints, auth, spec data stored
```

---

## Task 5: Release Plugin Update

**Files:**
- Version bump handled by /release skill

**Step 1: Run release**

```
/release forensics minor "add subagent-driven investigation workflow"
```

This handles:
- Build + typecheck
- Version bump (0.2.1 → 0.3.0)
- README update
- Commit + push

---

## Summary

| Task | What Changes | Files |
|------|-------------|-------|
| 1 | Subagent dispatch helpers | `src/subagent/dispatch.ts` |
| 2 | Skill rewrite for subagent pattern | `skills/investigate/SKILL.md` |
| 3 | Documentation only | N/A |
| 4 | Manual testing | N/A |
| 5 | Release | Version files |

**Total new code:** ~80 lines (dispatch helpers)
**Skill rewrite:** ~150 lines (clearer, subagent-aware)
**MCP tools:** Unchanged (they're already doing the right thing)
