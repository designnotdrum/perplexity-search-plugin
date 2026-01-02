# forensics Plugin Design

A brain-jar plugin for reverse engineering black-box systems.

## Overview

**forensics** helps users understand and replicate black-box systems - defunct IoT cloud APIs, competitor features, unfamiliar codebases, or mysterious data formats.

### Core Principles

1. **Meet users where they are** - Adapts guidance based on skill level stored in shared-memory. Beginners get hand-holding; experts get terse output.

2. **Auto-detect, confirm, proceed** - Infers what mode you need from context, confirms before diving deep.

3. **Document as you go** - Every discovery gets offered to shared-memory. Protocol specs, decoded formats, feature breakdowns accumulate into a reusable knowledge base.

4. **Leverage the suite** - Uses perplexity-search for external research. Stores findings in shared-memory. Suggests implementation patterns based on user's tech stack.

5. **Guided, not just tools** - The `forensics:investigate` skill walks users end-to-end. Individual tools exist for power users who want surgical precision.

## Modes

### Protocol Mode (`protocol`)

For decoding APIs, network protocols, IoT communications.

**Typical flow:**
1. User captures traffic (guided if needed: mitmproxy, Wireshark, browser DevTools)
2. Feeds HAR/pcap/curl to `analyze_capture`
3. Plugin identifies patterns: REST endpoints, auth headers, payload formats
4. Incrementally builds spec via `build_spec`
5. Suggests implementation: "Here's a Node.js client that speaks this protocol"

**Example:** Capture Neato vacuum app traffic, decode the scheduling API, build local replacement server.

### Feature Mode (`feature`)

For competitive analysis leading to implementation.

**Typical flow:**
1. User mentions "I want it to work like Notion's page sharing"
2. Plugin fires `research_feature` via perplexity-search
3. Returns breakdown: permissions model, link types, embed options, edge cases
4. Maps to user's stack: "In your Next.js + Supabase setup, here's how to achieve this"
5. Stores research in shared-memory for future reference

### Codebase Mode (`codebase`)

For understanding unfamiliar code.

**Typical flow:**
1. User points at repo/directory: "How does auth work in this codebase?"
2. Plugin traces through entry points, follows data flow
3. Documents findings: "Auth flow: middleware -> JWT validation -> role check -> handler"
4. Explains architectural decisions it can infer

### Decision Mode (`decision`)

For recovering rationale behind implementation choices.

**Typical flow:**
1. User asks "Why is this implemented with polling instead of websockets?"
2. Plugin examines code, git history, comments, related discussions
3. Hypothesizes rationale: "Likely due to X constraint, or Y was standard practice in 2019"
4. Can use perplexity to research historical context

### Format Mode (`format`)

For cracking data structures.

**Typical flow:**
1. User provides binary blob, weird JSON, proprietary file
2. Plugin analyzes: byte patterns, magic numbers, structure inference
3. Proposes schema: "This looks like length-prefixed records with a 4-byte header"
4. Can research known formats via perplexity

## MCP Tools

### `analyze_capture`

- **Input:** HAR file, pcap, curl output, raw HTTP logs
- **Output:** Structured analysis - endpoints, methods, headers, auth patterns, payload schemas
- **Behavior:** Auto-detects format, decodes payloads (JSON, protobuf, msgpack), identifies patterns

### `analyze_format`

- **Input:** Binary blob, data sample, file of unknown type
- **Output:** Structure hypothesis - byte layout, field boundaries, encoding guess
- **Behavior:** Looks for magic numbers, tries known formats, proposes schema

### `research_feature`

- **Input:** "How does [Product X]'s [Feature Y] work?"
- **Output:** Deep breakdown - components, flows, edge cases, implementation patterns
- **Behavior:** Uses perplexity-search, synthesizes into actionable spec, maps to user's stack

### `build_spec`

- **Input:** Incremental discoveries from analysis sessions
- **Output:** Living protocol/API specification document
- **Behavior:** Appends new findings, resolves conflicts, exports as OpenAPI/markdown

### `suggest_next_step`

- **Input:** Current investigation context
- **Output:** Recommended action with explanation
- **Behavior:** Adapts to skill level, explains WHY this is the next step

### `explain_concept`

- **Input:** "What is [term]?" (e.g., "What's mitmproxy?", "What's protobuf?")
- **Output:** Contextual explanation at user's level
- **Behavior:** Teaches just-in-time, stores that user now knows this in shared-memory

## Guided Skill

### `forensics:investigate`

The end-to-end workflow skill for users who need guidance.

**Invocation:**
- Explicit: `/forensics:investigate`
- Auto-detected: Claude notices a black-box problem, offers to launch

**Flow:**

```
1. INTAKE
   "What are we investigating?"
   -> Dead IoT device? Competitor feature? Mystery codebase?
   -> Auto-selects mode (protocol/feature/codebase/etc.)

2. SKILL CHECK
   Reads user profile from shared-memory
   -> Beginner: "Let me explain what we're about to do..."
   -> Expert: "Ready to capture traffic?"

3. GATHER
   Guides data collection appropriate to mode
   -> Protocol: Set up proxy, capture traffic
   -> Feature: Fire up perplexity research
   -> Codebase: Identify entry points, trace flows

4. ANALYZE
   Run appropriate tools, explain findings
   -> "I found 3 endpoints, here's what each does..."
   -> "This feature has 4 components, let me break down..."

5. DOCUMENT
   Build the spec/dossier
   -> Offer to save to shared-memory
   -> Export as markdown/OpenAPI if applicable

6. IMPLEMENT (optional)
   "Ready to build the replacement?"
   -> Scaffold code based on discovered spec
   -> Guide through testing against real device/API
```

**Session Persistence:** Investigation state saves to shared-memory. User can resume with `--resume` flag. Multi-day investigations are first-class.

## Suite Interop

### forensics -> shared-memory (writes)

| Event | What gets stored |
|-------|------------------|
| User completes first capture | `forensics.skillLevel` updated |
| Protocol decoded | `forensics.investigations.<name>` with endpoints, auth, etc. |
| Concept explained | `forensics.knownConcepts[]` - skip explanations next time |
| Feature researched | `forensics.featureSpecs.<name>` with components, mappings |
| Investigation paused | Full session state for resume |

### forensics -> perplexity-search (triggers)

| Situation | Search fired |
|-----------|--------------|
| Unknown protocol encountered | "Has anyone reverse engineered [device] API?" |
| Feature mode activated | Deep research on how the feature works |
| Stuck on format | "What uses this magic number / byte pattern?" |
| Implementation phase | "Best practices for [protocol type] server in [user's stack]" |
| Concept explanation | Current docs/tutorials for the tool/concept |

### forensics <- shared-memory (reads)

| What it reads | Why |
|---------------|-----|
| `technical.languages`, `technical.frameworks` | Map discoveries to user's stack |
| `forensics.skillLevel` | Adjust verbosity and hand-holding |
| `forensics.knownConcepts` | Skip explanations user already got |
| `forensics.investigations.*` | Resume sessions, reference past findings |

## Technical Architecture

```
forensics/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── src/
│   ├── index.ts             # MCP server entry
│   ├── tools/
│   │   ├── analyze-capture.ts
│   │   ├── analyze-format.ts
│   │   ├── research-feature.ts
│   │   ├── build-spec.ts
│   │   ├── suggest-next-step.ts
│   │   └── explain-concept.ts
│   ├── modes/
│   │   ├── protocol.ts
│   │   ├── feature.ts
│   │   ├── codebase.ts
│   │   ├── decision.ts
│   │   └── format.ts
│   ├── parsers/
│   │   ├── har.ts
│   │   ├── pcap.ts
│   │   ├── curl.ts
│   │   └── binary.ts
│   ├── interop/
│   │   ├── shared-memory.ts
│   │   └── perplexity.ts
│   └── utils/
│       ├── skill-level.ts
│       └── spec-builder.ts
├── skills/
│   └── investigate.md
├── package.json
└── tsconfig.json
```

### Key Dependencies

- `@anthropic-ai/sdk` - Claude interactions
- `har-validator` - Parse HAR files
- `pcap-parser` (optional) - Parse packet captures
- Standard brain-jar patterns for MCP server setup

### Interop Mechanism

Plugins can't directly call each other's MCP tools. Interop happens through Claude - skill instructions tell Claude: "When you need external research, use perplexity-search. When you learn something, store it in shared-memory."

## Example Session

```
USER: My Neato vacuum lost cloud support. I want to keep using it.

CLAUDE: Sounds like a protocol forensics case - you want to reverse
        engineer the Neato cloud API and build a local replacement.
        Want me to guide you through this?

USER: Yes

CLAUDE: [Launches forensics:investigate]

        First, let's capture traffic. What device do you have?
        A) Mac  B) Windows  C) Linux

USER: Mac

CLAUDE: Perfect. Here's what we'll do:
        1. Install mitmproxy (I'll walk you through it)
        2. Configure your phone to use it as a proxy
        3. Open the Neato app and trigger some actions
        4. Capture the traffic before the servers fully die

        Let's start. Run: brew install mitmproxy

USER: Done. I captured some traffic, here's the HAR file.

CLAUDE: [Runs analyze_capture]

        Found 4 endpoints:
        - POST /api/v2/auth/login - Bearer token auth
        - GET /api/v2/robots/{id}/state - Vacuum status
        - POST /api/v2/robots/{id}/schedule - Set cleaning schedule
        - POST /api/v2/robots/{id}/command - Start/stop/dock

        Auth uses JWT with 24hr expiry. Payloads are JSON.
        Want me to build a spec document?

USER: Yes

CLAUDE: [Runs build_spec, saves to shared-memory]

        Spec saved. Next step: scaffold a local server that
        speaks this protocol. Your profile says you know Node.js -
        want me to generate an Express server that implements these
        endpoints?

USER: Let's do it

CLAUDE: [Generates replacement server code]
        [Guides DNS redirect setup]
        [Tests against actual vacuum]

        Your Neato now talks to localhost.
```

## Future Possibilities

- **forensics -> code-reviewer**: "Review my replacement server implementation"
- **forensics -> test-generator**: "Generate tests for this decoded API"
- Additional modes as use cases emerge
