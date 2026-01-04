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
${task.input || '(No capture data provided - request from user)'}

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
