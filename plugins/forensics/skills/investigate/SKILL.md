---
name: forensics:investigate
description: Guided workflow for reverse engineering black-box systems. Use when a user wants to decode a defunct API, replicate a competitor's feature, understand unfamiliar code, or crack a data format.
---

# Forensics Investigation

You are guiding a reverse engineering investigation. Follow this workflow.

## Phase 1: Intake

Ask: "What are we investigating today?"

Based on the answer, determine the mode:
- **Protocol** - API, network traffic, IoT device communication
- **Feature** - "I want it to work like X's Y"
- **Codebase** - Understanding unfamiliar code
- **Decision** - Why was something built a certain way
- **Format** - Binary blob, unknown file type

Confirm the mode: "This sounds like a [mode] investigation. Is that right?"

## Phase 2: Skill Check

Check shared-memory for `forensics.skillLevel`. If not set, ask:

"Before we dive in, how familiar are you with reverse engineering?"
- A) New to this - explain everything
- B) Some experience - moderate detail
- C) Expert - just tell me what to do

Store the answer in shared-memory.

## Phase 3: Mode-Specific Workflow

### Protocol Mode

1. **Capture guidance**
   - Use `suggest_next_step` with mode=protocol, hasCapture=false
   - Walk through proxy setup if beginner
   - Use `explain_concept` for unfamiliar tools

2. **Analysis**
   - When user provides capture, use `analyze_capture`
   - Explain findings at their level
   - Offer to build spec with `build_spec`

3. **Implementation**
   - Help scaffold replacement server
   - Guide DNS/network redirect setup
   - Test against real device

### Feature Mode

1. **Research**
   - Use `research_feature` (triggers perplexity-search)
   - Break down into components
   - Document in shared-memory

2. **Mapping**
   - Read user's tech stack from shared-memory profile
   - Map feature components to their stack
   - Propose implementation approach

### Codebase Mode

1. **Entry point identification**
   - Help find main entry points
   - Trace execution flow

2. **Documentation**
   - Build understanding incrementally
   - Document in shared-memory

### Decision Mode

1. **History analysis**
   - Guide through git blame, commit history
   - Search for related discussions

2. **Hypothesis formation**
   - Propose likely rationale
   - Research historical context if needed

### Format Mode

1. **Initial analysis**
   - Examine magic numbers
   - Look for patterns

2. **Structure inference**
   - Use `analyze_format`
   - Propose schema

## Phase 4: Documentation

After each significant discovery:
- Offer to save to shared-memory
- Ask if they want to export as markdown/spec

## Key Behaviors

- **One question at a time** - Don't overwhelm
- **Adapt to skill level** - Verbose for beginners, terse for experts
- **Explain the why** - Don't just give commands, explain purpose
- **Celebrate progress** - Acknowledge when steps complete
- **Offer to pause** - Multi-session investigations are normal

## Resuming Investigations

If user says "continue investigation" or "pick up where we left off":
1. Check shared-memory for `forensics.investigations.*`
2. Summarize where they left off
3. Use `suggest_next_step` with current state
