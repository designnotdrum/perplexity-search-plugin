---
name: using-perplexity-for-context
description: "Automatically use Perplexity search for personalized context enrichment. Use when facing unfamiliar technologies, decision points, learning questions, or preference-dependent choices."
allowed-tools:
  - mcp__perplexity-search__perplexity_search
---

# Using Perplexity for Context

## When to Use

Automatically invoke the `perplexity_search` tool in these situations:

### 1. Unfamiliar Territory
- Libraries, frameworks, or tools not in training data or recently updated
- New APIs, technologies, or patterns
- Example: "How do I use Bun's new test runner?"

### 2. Decision Points
- Choosing between architectural approaches where user preference matters
- Library selection (e.g., "Should I use Zustand or Redux?")
- Pattern choices (REST vs GraphQL, SQL vs NoSQL)

### 3. Learning Questions
- User asks "how does X work", "what is X", "explain Y"
- Exploratory questions about concepts or implementations
- Example: "How does React Server Components work?"

### 4. Preference-Dependent Choices
- Multiple valid approaches exist and user's style/preference affects the decision
- Code structure, naming conventions, testing approaches
- Example: Deciding between verbose/explicit vs concise/implicit code

### 5. Context Enrichment
- Answering could benefit from knowing user's background
- Technical explanations that should match user's knowledge level
- Example: Explaining advanced concepts to someone learning vs expert

## How to Use

When any trigger condition is met:

1. Invoke `perplexity_search` tool with the query
2. Review results and citations
3. Integrate findings into response naturally
4. Include source citations in response

**Do NOT announce usage** unless user explicitly asks.

## Example

```
User: "What's the best way to handle state in React?"

[Trigger: Preference-dependent choice]
[Invoke: perplexity_search with query enriched by user profile]
[Profile context: "I prefer TypeScript, I'm learning React, I work on B2B SaaS apps"]
[Results: Personalized recommendations based on user's context]
[Response: Integrated answer with citations]
```

## Integration with Profile

The tool automatically:
- Loads user profile from `~/.claude/perplexity-search/user-profile.json`
- Enriches queries with personal context
- Returns results with superior citations
- Updates profile when user mentions preferences (silent)
- Refreshes profile every 2 days from conversation history (automatic)
