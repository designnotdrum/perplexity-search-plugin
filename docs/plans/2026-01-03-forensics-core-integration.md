# Forensics + Core Integration Design

Completing the original forensics design with @brain-jar/core architecture.

## Architectural Approach

**Key insight:** With @brain-jar/core, forensics directly uses `Mem0Client` - no need to "call" shared-memory MCP. Both plugins share the same Mem0 backend.

```
┌─────────────────┐     ┌─────────────────┐
│   forensics     │     │  shared-memory  │
│   MCP server    │     │   MCP server    │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │ @brain-jar/ │
              │    core     │
              │ (Mem0Client)│
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │   Mem0 API  │
              │   (cloud)   │
              └─────────────┘
```

Both plugins read/write to the same Mem0 user. Forensics stores investigation data; shared-memory can query it. Profile is shared.

## What to Implement

### 1. Add @brain-jar/core dependency

```json
// plugins/forensics/package.json
"dependencies": {
  "@brain-jar/core": "*",
  ...
}
```

### 2. Create forensics memory schema

Extend UserProfile or use dedicated memory scopes:

```typescript
// Memory scopes for forensics
const FORENSICS_SCOPES = {
  investigations: 'forensics:investigation',  // Per-investigation findings
  concepts: 'forensics:concepts',             // Known concepts (skip re-explaining)
  specs: 'forensics:specs',                   // Built API specs
};

// Investigation memory structure
interface InvestigationMemory {
  id: string;
  name: string;
  mode: 'protocol' | 'feature' | 'codebase' | 'decision' | 'format';
  status: 'active' | 'paused' | 'complete';
  created: string;
  updated: string;
  findings: {
    endpoints?: Endpoint[];
    auth?: AuthPattern;
    payloadSchemas?: Schema[];
    features?: FeatureBreakdown[];
  };
  sessionState?: any;  // For --resume
}
```

### 3. Create src/interop/memory.ts

```typescript
import { Mem0Client, loadConfig } from '@brain-jar/core';

export class ForensicsMemory {
  private mem0: Mem0Client | null = null;

  constructor() {
    const config = loadConfig();
    if (config?.mem0_api_key) {
      this.mem0 = new Mem0Client(config.mem0_api_key);
    }
  }

  // Investigation CRUD
  async saveInvestigation(inv: InvestigationMemory): Promise<void>
  async getInvestigation(id: string): Promise<InvestigationMemory | null>
  async listInvestigations(): Promise<InvestigationMemory[]>
  async resumeInvestigation(id: string): Promise<InvestigationMemory | null>

  // Concept tracking
  async markConceptKnown(concept: string): Promise<void>
  async isConceptKnown(concept: string): Promise<boolean>
  async getKnownConcepts(): Promise<string[]>

  // Spec storage
  async saveSpec(name: string, spec: APISpec): Promise<void>
  async getSpec(name: string): Promise<APISpec | null>

  // Skill level (reads from shared UserProfile)
  async getSkillLevel(): Promise<'beginner' | 'intermediate' | 'advanced'>
  async getUserStack(): Promise<{ languages: string[]; frameworks: string[] }>
}
```

### 4. Implement missing tools

#### `analyze_format`
- Input: Binary blob, unknown data
- Output: Structure hypothesis
- Memory: Store format discoveries

#### `research_feature`
- Input: "How does [Product]'s [Feature] work?"
- Output: Feature breakdown mapped to user's stack
- Memory: Store feature specs
- **Note:** Can't call perplexity MCP directly. Returns guidance for Claude to use perplexity, OR we add perplexity SDK as optional dep.

#### `build_spec`
- Input: Investigation ID + new findings
- Output: Updated OpenAPI/markdown spec
- Memory: Persists spec, tracks versions

### 5. Update existing tools

#### `explain_concept`
```typescript
// Before explaining
if (await memory.isConceptKnown(concept)) {
  return { brief: true, message: "You've seen this before..." };
}

// After explaining
await memory.markConceptKnown(concept);
```

#### `suggest_next_step`
```typescript
// Read skill level from profile
const skillLevel = await memory.getSkillLevel();

// Adjust verbosity
if (skillLevel === 'beginner') {
  // Include detailed commands, explanations
} else if (skillLevel === 'advanced') {
  // Terse output
}
```

#### `analyze_capture`
```typescript
// After analysis
await memory.saveInvestigation({
  id: generateId(),
  name: inferName(content),
  mode: 'protocol',
  status: 'active',
  findings: { endpoints, auth, payloadSchemas }
});
```

### 6. Update investigate skill

Add memory-aware instructions:

```markdown
## Session Persistence

When starting an investigation:
1. Check for active investigations: "Do you want to resume [name] or start fresh?"
2. Load previous findings if resuming

When pausing:
1. Save full session state to memory
2. Confirm: "Investigation saved. Say 'resume [name]' to continue."

When completing:
1. Mark investigation complete
2. Offer to export spec
```

## Implementation Order

1. **Add core dependency + ForensicsMemory class** (foundation)
2. **Update explain_concept** (simplest integration)
3. **Update suggest_next_step** (skill level adaptation)
4. **Update analyze_capture** (store findings)
5. **Implement build_spec** (incremental spec building)
6. **Implement analyze_format** (new tool)
7. **Implement research_feature** (perplexity coordination)
8. **Update investigate skill** (session persistence)

## Perplexity Integration Strategy

Two options:

**Option A: Skill-based coordination (original design)**
- Skill instructions tell Claude: "Use perplexity_search for external research"
- Forensics tools return: "I need more info about X - suggest searching"
- Claude orchestrates

**Option B: Direct SDK (simpler)**
- Add `@perplexity-ai/perplexity_ai` as optional dependency
- ForensicsMemory gets `searchExternal()` method
- Works standalone without perplexity-search plugin

**Recommendation:** Option A for now. Keeps plugins decoupled. Can add Option B later for standalone use.

## Testing Plan

1. Unit tests for ForensicsMemory with mocked Mem0
2. Integration test: explain_concept skips known concepts
3. Integration test: analyze_capture persists findings
4. Integration test: suggest_next_step adapts to skill level
5. E2E: Full investigation flow with resume

## Version Bump

This is a minor feature addition (backwards compatible):
- forensics: 0.1.0 → 0.2.0
