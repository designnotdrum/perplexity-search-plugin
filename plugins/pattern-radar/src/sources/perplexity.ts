import { Signal, ScanResult } from '../types';

/**
 * Perplexity source adapter
 *
 * This adapter provides aggregated search across sources that perplexity-search can reach:
 * Reddit, Twitter, arXiv, financial news, etc.
 *
 * When perplexity-search is installed, this can leverage its capabilities.
 * Otherwise, it provides guidance on manual searches.
 */
export class PerplexitySource {
  /**
   * Generate a search query for perplexity based on domains and topic
   */
  generateQuery(topic: string, domains: string[]): string {
    let query = topic;

    if (domains.length > 0) {
      query += ` in the context of ${domains.join(', ')}`;
    }

    query += '. Focus on recent developments, trends, and opportunities.';

    return query;
  }

  /**
   * Parse a perplexity response into signals
   *
   * Since perplexity returns synthesized text, we create a single signal
   * representing the aggregated insights.
   */
  parseResponse(topic: string, response: string): ScanResult {
    const signal: Signal = {
      id: `perplexity-${Date.now()}`,
      source: 'perplexity',
      title: `Trend analysis: ${topic}`,
      content: response,
      score: 1, // Perplexity results are pre-synthesized, score is relative
      timestamp: new Date().toISOString(),
      metadata: {
        type: 'aggregated',
        topic,
      },
    };

    return {
      source: 'perplexity',
      signals: [signal],
      scannedAt: new Date().toISOString(),
    };
  }

  /**
   * Create a manual scan result with instructions
   *
   * Used when perplexity-search isn't available or user wants to search manually.
   */
  getManualScanInstructions(topic: string, domains: string[]): ScanResult {
    const query = this.generateQuery(topic, domains);

    return {
      source: 'perplexity',
      signals: [],
      scannedAt: new Date().toISOString(),
      error: `Perplexity search not available. Use perplexity_search with query: "${query}"`,
    };
  }
}
