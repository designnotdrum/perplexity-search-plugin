/**
 * LLM-powered source discovery for novel topics
 * Uses Perplexity to find relevant sources for topics not in curated mappings
 */

import { TopicSource, LearnedMapping } from './types.js';
import { listAdapters } from '../adapters/index.js';

interface DiscoveryResult {
  sources: TopicSource[];
  domain?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Build the structured discovery prompt
 */
function buildDiscoveryPrompt(topic: string): string {
  const adapters = listAdapters();
  const adapterList = adapters
    .map(a => `- ${a.type}: ${a.capabilities.join(', ')}`)
    .join('\n');

  return `I need to find sources to track "${topic}".

Available source types:
${adapterList}

For each applicable source, provide specific configuration:
- reddit: { "subreddit": "exact_subreddit_name" }
- rss: { "url": "https://exact.feed.url/rss" }
- hackernews: { "searchQuery": "search terms" } (optional, defaults to topic)
- github: { "searchQuery": "search terms", "language": "optional" }

Return JSON only:
{
  "sources": [
    { "adapter": "reddit", "config": { "subreddit": "..." }, "reason": "..." }
  ],
  "domain": "category like sports/football or tech/ai",
  "confidence": "high" | "medium" | "low"
}

Only include sources you're confident exist. Verify subreddit names are real.`;
}

/**
 * Parse discovery response from LLM
 */
function parseDiscoveryResponse(response: string): DiscoveryResult | null {
  try {
    // Extract JSON from response (may have markdown wrapping)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.sources || !Array.isArray(parsed.sources)) {
      return null;
    }

    return {
      sources: parsed.sources.map((s: Record<string, unknown>) => ({
        adapter: s.adapter as string,
        config: (s.config as Record<string, unknown>) || {},
        reason: s.reason as string | undefined
      })),
      domain: parsed.domain as string | undefined,
      confidence: (parsed.confidence as DiscoveryResult['confidence']) || 'medium'
    };
  } catch {
    return null;
  }
}

/**
 * Discover sources for a topic using LLM
 * Returns null if discovery fails - caller should handle gracefully
 */
export async function discoverSourcesForTopic(
  topic: string,
  perplexitySearch: (query: string) => Promise<string>
): Promise<DiscoveryResult | null> {
  const prompt = buildDiscoveryPrompt(topic);

  try {
    const response = await perplexitySearch(prompt);
    return parseDiscoveryResponse(response);
  } catch (error) {
    console.error('Discovery failed:', error);
    return null;
  }
}

/**
 * Validate discovered sources by health-checking each one
 */
export async function validateDiscoveredSources(
  sources: TopicSource[]
): Promise<{ valid: TopicSource[]; invalid: TopicSource[] }> {
  const { getAdapter } = await import('../adapters/index.js');

  const valid: TopicSource[] = [];
  const invalid: TopicSource[] = [];

  for (const source of sources) {
    const adapter = getAdapter(source.adapter);
    if (!adapter) {
      invalid.push(source);
      continue;
    }

    try {
      const instance = adapter.createInstance('test', source.config);
      const health = await instance.healthCheck();

      if (health.healthy) {
        valid.push(source);
      } else {
        invalid.push(source);
      }
    } catch {
      invalid.push(source);
    }
  }

  return { valid, invalid };
}

/**
 * Full discovery flow: discover → validate → return
 */
export async function discoverAndValidate(
  topic: string,
  perplexitySearch: (query: string) => Promise<string>
): Promise<LearnedMapping | null> {
  const discovered = await discoverSourcesForTopic(topic, perplexitySearch);
  if (!discovered || discovered.sources.length === 0) {
    return null;
  }

  const { valid } = await validateDiscoveredSources(discovered.sources);
  if (valid.length === 0) {
    return null;
  }

  return {
    topic,
    sources: valid,
    matchedDomain: discovered.domain,
    discoveredAt: new Date().toISOString()
  };
}
