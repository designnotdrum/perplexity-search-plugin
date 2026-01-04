import { Signal, ValidationResult, SiteHealthResult, ProductSignalsResult } from '../types';
import { checkHeuristics } from './heuristics';
import { checkWithPerplexity } from './perplexity-check';

/**
 * Check if a site is live via HTTP HEAD request
 */
export async function checkSiteHealth(url?: string): Promise<SiteHealthResult> {
  const checkedAt = new Date().toISOString();

  if (!url) {
    return { status: null, isLive: false, checkedAt };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    return {
      status: response.status,
      isLive: response.status >= 200 && response.status < 400,
      checkedAt,
    };
  } catch {
    return { status: null, isLive: false, checkedAt };
  }
}

/**
 * Detect product signals using hybrid approach:
 * 1. Try heuristics first (fast, free)
 * 2. Fall back to Perplexity if inconclusive
 */
export async function detectProductSignals(url?: string): Promise<ProductSignalsResult> {
  if (!url) {
    return {
      method: 'heuristics',
      isProduct: null,
      confidence: 'low',
      signals: [],
      redFlags: ['no url'],
    };
  }

  // Step 1: Try heuristics first
  const heuristics = await checkHeuristics(url);

  // If high confidence, we're done
  if (heuristics.confidence === 'high') {
    return heuristics;
  }

  // Step 2: Fall back to Perplexity for inconclusive cases
  const perplexityResult = await checkWithPerplexity(url);

  // Combine results
  return {
    method: 'both',
    isProduct: perplexityResult.isProduct ?? heuristics.isProduct,
    confidence: perplexityResult.confidence,
    signals: [...heuristics.signals, ...perplexityResult.signals],
    redFlags: [...heuristics.redFlags, ...perplexityResult.redFlags],
  };
}

/**
 * Run full deep validation on a signal
 * Use before adding to competitive reports
 */
export async function deepValidate(signal: Signal): Promise<ValidationResult> {
  // Run checks in parallel
  const [siteHealth, productSignals] = await Promise.all([
    checkSiteHealth(signal.url),
    detectProductSignals(signal.url),
  ]);

  const daysSincePost = signal.quickScan?.age.days || 0;
  const isStale = daysSincePost > 90;

  // Determine overall verdict
  let overallVerdict: 'verified' | 'caution' | 'dead';

  if (!siteHealth.isLive) {
    overallVerdict = 'dead';
  } else if (productSignals.redFlags.length > 0 || isStale) {
    overallVerdict = 'caution';
  } else if (productSignals.isProduct && productSignals.confidence !== 'low') {
    overallVerdict = 'verified';
  } else {
    overallVerdict = 'caution';
  }

  return {
    siteHealth,
    recency: { isStale, daysSincePost },
    productSignals,
    overallVerdict,
  };
}

/**
 * Validate signal and attach result
 */
export async function validateSignal(signal: Signal): Promise<Signal> {
  const validation = await deepValidate(signal);
  return { ...signal, validation };
}
