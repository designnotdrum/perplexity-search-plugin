import { ProductSignalsResult } from '../types';

/**
 * Check product status using Perplexity search
 * Used as fallback when heuristics are inconclusive
 *
 * Note: This is a stub that returns "unavailable" since pattern-radar
 * cannot directly call the perplexity-search MCP tool. When deeper
 * validation is needed, the orchestrating agent should use
 * perplexity_search directly with the query generated here.
 */
export async function checkWithPerplexity(url: string): Promise<ProductSignalsResult> {
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return {
      method: 'perplexity',
      isProduct: null,
      confidence: 'low',
      signals: [],
      redFlags: ['invalid url'],
    };
  }

  // Generate the query that could be used with perplexity_search
  const _query = `Is ${domain} an active product or company? Looking for: paying customers, funding, team size, launch date, active development.`;

  // Return unavailable - heuristics are the primary method
  // The orchestrating agent can use perplexity_search directly if needed
  return {
    method: 'perplexity',
    isProduct: null,
    confidence: 'low',
    signals: [],
    redFlags: ['perplexity not integrated - use heuristics'],
  };
}

/**
 * Generate a perplexity query for manual validation
 * This can be used by the orchestrating agent to call perplexity_search
 */
export function generatePerplexityQuery(url: string): string | null {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return `Is ${domain} an active product or company? Looking for: paying customers, funding, team size, launch date, active development.`;
  } catch {
    return null;
  }
}

/**
 * Parse a perplexity response into product signals
 * Call this after getting a response from perplexity_search
 */
export function parsePerplexityResponse(text: string): ProductSignalsResult {
  const signals: string[] = [];
  const redFlags: string[] = [];

  const lowerText = text.toLowerCase();

  // Positive signals
  if (/funded|raised|series [a-z]|yc |y combinator|seed round/i.test(lowerText)) {
    signals.push('has funding');
  }
  if (/\d+\s*(employees?|team members?|people)/i.test(lowerText)) {
    signals.push('has team');
  }
  if (/launched|active|customers|revenue|paying users/i.test(lowerText)) {
    signals.push('active product');
  }
  if (/growing|traction|users|downloads/i.test(lowerText)) {
    signals.push('shows traction');
  }

  // Red flags
  if (/shut down|defunct|abandoned|inactive|failed|closed/i.test(lowerText)) {
    redFlags.push('confirmed dead');
  }
  if (/no information|cannot find|unclear|not found/i.test(lowerText)) {
    redFlags.push('no public info');
  }
  if (/pivot|rebrand|acquired|merged/i.test(lowerText)) {
    redFlags.push('company changed');
  }

  // Determine product status
  const isProduct = signals.length > redFlags.length ? true
                  : redFlags.length > 0 ? false
                  : null;

  return {
    method: 'perplexity',
    isProduct,
    confidence: signals.length >= 2 ? 'medium' : 'low',
    signals,
    redFlags,
  };
}
