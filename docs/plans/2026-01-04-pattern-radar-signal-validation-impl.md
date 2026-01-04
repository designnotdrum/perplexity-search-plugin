# Pattern Radar Signal Validation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two-pass signal validation to filter noise and validate competitors before reporting.

**Architecture:** Quick scan runs during digest (engagement + age thresholds), deep validation runs on-demand (site health + product signals with heuristics → Perplexity fallback).

**Tech Stack:** TypeScript, MCP SDK, node-fetch, Zod, Jest for testing

---

## Task 1: Add Validation Types

**Files:**
- Modify: `plugins/pattern-radar/src/types.ts`

**Step 1: Add validation types to types.ts**

Add after line 113 (after `DigestResult` interface):

```typescript
/**
 * Quality tier from quick scan
 */
export type SignalTier = 'verified' | 'unverified' | 'dead';

/**
 * Quick scan result (attached to Signal during digest)
 */
export interface QuickScanResult {
  tier: SignalTier;
  engagement: {
    points: number;
    comments: number;
    passesThreshold: boolean;
  };
  age: {
    days: number;
    isStale: boolean;
  };
}

/**
 * Site health check result
 */
export interface SiteHealthResult {
  status: number | null;
  isLive: boolean;
  checkedAt: string;
}

/**
 * Product signal detection result
 */
export interface ProductSignalsResult {
  method: 'heuristics' | 'perplexity' | 'both';
  isProduct: boolean | null;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
  redFlags: string[];
}

/**
 * Deep validation result (on-demand)
 */
export interface ValidationResult {
  siteHealth: SiteHealthResult;
  recency: {
    isStale: boolean;
    daysSincePost: number;
  };
  productSignals: ProductSignalsResult;
  overallVerdict: 'verified' | 'caution' | 'dead';
}
```

**Step 2: Extend Signal interface**

Modify the existing `Signal` interface (around line 4-13) to add optional validation fields:

```typescript
export interface Signal {
  id: string;
  source: 'hackernews' | 'github' | 'perplexity';
  title: string;
  url?: string;
  content?: string;
  score: number;
  timestamp: string;
  metadata: Record<string, unknown>;
  quickScan?: QuickScanResult;
  validation?: ValidationResult;
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS (no type errors)

**Step 4: Commit**

```bash
git add plugins/pattern-radar/src/types.ts
git commit -m "feat(pattern-radar): add validation types"
```

---

## Task 2: Create Quick Scan Module

**Files:**
- Create: `plugins/pattern-radar/src/validation/quick-scan.ts`

**Step 1: Create validation directory and quick-scan.ts**

```typescript
import { Signal, QuickScanResult, SignalTier } from '../types';

/**
 * Thresholds for quick scan validation
 */
export const QUICK_SCAN_THRESHOLDS = {
  minPoints: 5,
  minComments: 2,
  staleDays: 90,
};

/**
 * Run quick scan on a signal to determine quality tier
 * Fast, no network calls - just evaluates existing data
 */
export function quickScan(signal: Signal): QuickScanResult {
  const points = signal.score || 0;
  const comments = (signal.metadata.comments as number) || 0;

  const postDate = new Date(signal.timestamp);
  const now = new Date();
  const daysSince = Math.floor((now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24));

  const passesThreshold =
    points >= QUICK_SCAN_THRESHOLDS.minPoints ||
    comments >= QUICK_SCAN_THRESHOLDS.minComments;

  const isStale = daysSince > QUICK_SCAN_THRESHOLDS.staleDays;

  let tier: SignalTier;
  if (!passesThreshold) {
    tier = 'dead';
  } else if (isStale) {
    tier = 'unverified';
  } else {
    tier = 'verified';
  }

  return {
    tier,
    engagement: { points, comments, passesThreshold },
    age: { days: daysSince, isStale },
  };
}

/**
 * Run quick scan on array of signals, attaching results
 */
export function quickScanAll(signals: Signal[]): Signal[] {
  return signals.map(signal => ({
    ...signal,
    quickScan: quickScan(signal),
  }));
}

/**
 * Filter signals to only those passing quick scan
 */
export function filterByQuickScan(signals: Signal[], excludeDead = true): Signal[] {
  const scanned = quickScanAll(signals);
  if (excludeDead) {
    return scanned.filter(s => s.quickScan?.tier !== 'dead');
  }
  return scanned;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 3: Commit**

```bash
git add plugins/pattern-radar/src/validation/quick-scan.ts
git commit -m "feat(pattern-radar): add quick scan validation"
```

---

## Task 3: Create Heuristics Module

**Files:**
- Create: `plugins/pattern-radar/src/validation/heuristics.ts`

**Step 1: Create heuristics.ts**

```typescript
import { ProductSignalsResult } from '../types';

/**
 * Check a URL for product signals using HTML heuristics
 * Fast and free - no external API calls
 */
export async function checkHeuristics(url: string): Promise<ProductSignalsResult> {
  let html = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PatternRadar/1.0)',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        method: 'heuristics',
        isProduct: false,
        confidence: 'high',
        signals: [],
        redFlags: [`HTTP ${response.status}`],
      };
    }

    html = await response.text();
  } catch (error) {
    return {
      method: 'heuristics',
      isProduct: null,
      confidence: 'low',
      signals: [],
      redFlags: ['fetch failed'],
    };
  }

  const signals: string[] = [];
  const redFlags: string[] = [];

  // Positive signals - indicators of a real product
  if (/\/pricing|\/plans|\/upgrade/i.test(html)) {
    signals.push('has pricing page');
  }
  if (/\/signup|\/register|\/get-started|\/start/i.test(html)) {
    signals.push('has signup flow');
  }
  if (/app\..*\.com|dashboard\.|portal\./i.test(html)) {
    signals.push('has app subdomain');
  }
  if (/apps\.apple\.com|play\.google\.com|chrome\.google\.com/i.test(html)) {
    signals.push('app store links');
  }
  if (/\$\d+.*\/(mo|month|yr|year)|per (month|user|seat)/i.test(html)) {
    signals.push('pricing visible');
  }
  if (/book a demo|schedule demo|request demo/i.test(html)) {
    signals.push('has demo booking');
  }
  if (/customers include|trusted by|used by/i.test(html)) {
    signals.push('shows customer logos');
  }

  // Red flags - indicators of dead/fake project
  if (/coming soon|under construction|launching soon/i.test(html)) {
    redFlags.push('coming soon page');
  }
  if (/parked|domain for sale|buy this domain/i.test(html)) {
    redFlags.push('parked domain');
  }
  if (html.length < 1000) {
    redFlags.push('minimal content');
  }
  if (/404|not found|page doesn.*exist/i.test(html)) {
    redFlags.push('404 content');
  }
  if (/vercel|netlify|heroku.*404|deployment.*failed/i.test(html)) {
    redFlags.push('failed deployment');
  }

  // Determine product status
  let isProduct: boolean | null;
  let confidence: 'high' | 'medium' | 'low';

  if (redFlags.length >= 1 && signals.length === 0) {
    isProduct = false;
    confidence = 'high';
  } else if (signals.length >= 3) {
    isProduct = true;
    confidence = 'high';
  } else if (signals.length >= 2) {
    isProduct = true;
    confidence = 'medium';
  } else if (signals.length >= 1) {
    isProduct = null; // inconclusive
    confidence = 'low';
  } else {
    isProduct = null;
    confidence = 'low';
  }

  return { method: 'heuristics', isProduct, confidence, signals, redFlags };
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 3: Commit**

```bash
git add plugins/pattern-radar/src/validation/heuristics.ts
git commit -m "feat(pattern-radar): add heuristics product detection"
```

---

## Task 4: Create Perplexity Validation Module

**Files:**
- Create: `plugins/pattern-radar/src/validation/perplexity-check.ts`

**Step 1: Create perplexity-check.ts**

```typescript
import { ProductSignalsResult } from '../types';
import { PerplexitySource } from '../sources/perplexity';

const perplexity = new PerplexitySource();

/**
 * Check product status using Perplexity search
 * Used as fallback when heuristics are inconclusive
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

  const query = `Is ${domain} an active product or company? Looking for: paying customers, funding, team size, launch date, active development.`;

  try {
    const result = await perplexity.search(query);

    if (!result || result.error) {
      return {
        method: 'perplexity',
        isProduct: null,
        confidence: 'low',
        signals: [],
        redFlags: ['perplexity unavailable'],
      };
    }

    const signals: string[] = [];
    const redFlags: string[] = [];

    // Parse response text for signals
    const text = (result.content || '').toLowerCase();

    // Positive signals
    if (/funded|raised|series [a-z]|yc |y combinator|seed round/i.test(text)) {
      signals.push('has funding');
    }
    if (/\d+\s*(employees?|team members?|people)/i.test(text)) {
      signals.push('has team');
    }
    if (/launched|active|customers|revenue|paying users/i.test(text)) {
      signals.push('active product');
    }
    if (/growing|traction|users|downloads/i.test(text)) {
      signals.push('shows traction');
    }

    // Red flags
    if (/shut down|defunct|abandoned|inactive|failed|closed/i.test(text)) {
      redFlags.push('confirmed dead');
    }
    if (/no information|cannot find|unclear|not found/i.test(text)) {
      redFlags.push('no public info');
    }
    if (/pivot|rebrand|acquired|merged/i.test(text)) {
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
  } catch {
    return {
      method: 'perplexity',
      isProduct: null,
      confidence: 'low',
      signals: [],
      redFlags: ['perplexity error'],
    };
  }
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 3: Commit**

```bash
git add plugins/pattern-radar/src/validation/perplexity-check.ts
git commit -m "feat(pattern-radar): add perplexity product validation"
```

---

## Task 5: Create Deep Validation Module

**Files:**
- Create: `plugins/pattern-radar/src/validation/deep-validate.ts`

**Step 1: Create deep-validate.ts**

```typescript
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
```

**Step 2: Create index.ts barrel export**

Create `plugins/pattern-radar/src/validation/index.ts`:

```typescript
export * from './quick-scan';
export * from './heuristics';
export * from './perplexity-check';
export * from './deep-validate';
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 4: Commit**

```bash
git add plugins/pattern-radar/src/validation/
git commit -m "feat(pattern-radar): add deep validation with hybrid product detection"
```

---

## Task 6: Integrate Quick Scan into Digest

**Files:**
- Modify: `plugins/pattern-radar/src/index.ts`

**Step 1: Import validation module**

Add import at top of file (around line 11):

```typescript
import { quickScanAll, filterByQuickScan } from './validation';
```

**Step 2: Update get_radar_digest tool**

Modify the `get_radar_digest` tool (starting around line 140). Replace the signal processing and output sections:

Find this section (around lines 152-206) and replace:

```typescript
    async (args: { timeframe?: 'daily' | 'weekly' }) => {
      const timeframe = args.timeframe || 'weekly';
      const allSignals: Signal[] = [];

      // Get HN front page
      const hnResult = await hnSource.getFrontPage(30);
      if (!hnResult.error) {
        allSignals.push(...hnResult.signals);
      }

      // Get GitHub trending
      const ghResult = await ghSource.getTrending(undefined, timeframe, 20);
      if (!ghResult.error) {
        allSignals.push(...ghResult.signals);
      }

      // Run quick scan on all signals
      const scannedSignals = quickScanAll(allSignals);
      const validSignals = scannedSignals.filter(s => s.quickScan?.tier !== 'dead');
      const deadSignals = scannedSignals.filter(s => s.quickScan?.tier === 'dead');

      // Detect patterns from valid signals only
      const patterns = detector.detectPatterns(validSignals, userDomains);

      // Filter to relevant patterns
      const relevantPatterns = patterns.filter((p) => p.relevanceScore > 0.4);

      let output = `# Your Radar Digest\n\n`;
      output += `*Generated: ${new Date().toISOString()}*\n`;
      output += `*Timeframe: ${timeframe}*\n`;
      output += `*Your domains: ${userDomains.join(', ') || 'none set (configure via shared-memory)'}*\n\n`;

      if (relevantPatterns.length === 0) {
        output += `No high-relevance patterns detected this ${timeframe}.\n\n`;
        output += `**Suggestions:**\n`;
        output += `- Configure your domains for better matching\n`;
        output += `- Use scan_trends to search specific topics\n`;
      } else {
        output += `## Relevant Patterns (${relevantPatterns.length})\n\n`;
        for (const p of relevantPatterns) {
          output += `### ${p.title}\n`;
          output += `*Relevance: ${(p.relevanceScore * 100).toFixed(0)}% | Signals: ${p.signals.length}*\n\n`;
          output += `${p.description}\n\n`;

          if (p.actionable.length > 0) {
            output += `**Actions:**\n`;
            for (const a of p.actionable) {
              output += `- **${a.type}**: ${a.suggestion}\n`;
              output += `  *${a.reason}*\n`;
            }
            output += '\n';
          }
        }
      }

      // Show valid signals with quality badges
      output += `## Top Signals\n\n`;
      for (const s of validSignals.slice(0, 10)) {
        const badge = s.quickScan?.tier === 'verified' ? '✓' : '⚠';
        const meta = s.quickScan
          ? `${s.quickScan.engagement.points} pts, ${s.quickScan.engagement.comments} comments, ${s.quickScan.age.days}d ago`
          : '';
        output += `- ${badge} [${s.source}] ${s.title}`;
        if (meta) output += ` (${meta})`;
        if (s.url) output += `\n  ${s.url}`;
        output += '\n';
      }

      // Show filtered signals count
      if (deadSignals.length > 0) {
        output += `\n## Filtered Out (low engagement)\n\n`;
        output += `*${deadSignals.length} signals skipped (< 5 pts and < 2 comments)*\n`;
        for (const s of deadSignals.slice(0, 3)) {
          const meta = s.quickScan
            ? `${s.quickScan.engagement.points} pts, ${s.quickScan.engagement.comments} comments`
            : '';
          output += `- ${s.title} (${meta})\n`;
        }
        if (deadSignals.length > 3) {
          output += `- ...and ${deadSignals.length - 3} more\n`;
        }
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: output,
          },
        ],
      };
    }
```

**Step 3: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 4: Commit**

```bash
git add plugins/pattern-radar/src/index.ts
git commit -m "feat(pattern-radar): integrate quick scan into digest"
```

---

## Task 7: Add validate_signal MCP Tool

**Files:**
- Modify: `plugins/pattern-radar/src/index.ts`

**Step 1: Update imports**

Add `deepValidate` to the validation import:

```typescript
import { quickScanAll, filterByQuickScan, deepValidate, quickScan } from './validation';
```

**Step 2: Add validate_signal tool**

Add after the `suggest_actions` tool (around line 494, before the transport connection):

```typescript
  server.tool(
    'validate_signal',
    'Run deep validation on a signal before adding to a report. Checks site health, recency, and product signals.',
    {
      url: z.string().describe('URL to validate'),
      title: z.string().optional().describe('Signal title for context'),
    },
    async (args: { url: string; title?: string }) => {
      // Create a minimal signal for validation
      const signal: Signal = {
        id: `manual-${Date.now()}`,
        source: 'hackernews',
        title: args.title || args.url,
        url: args.url,
        score: 0,
        timestamp: new Date().toISOString(),
        metadata: {},
      };

      // Run quick scan first
      signal.quickScan = quickScan(signal);

      // Run deep validation
      const validation = await deepValidate(signal);

      let output = `# Validation Result: ${args.title || args.url}\n\n`;

      // Overall verdict with emoji
      const verdictEmoji = {
        verified: '✅',
        caution: '⚠️',
        dead: '🚫',
      }[validation.overallVerdict];

      output += `## Verdict: ${verdictEmoji} ${validation.overallVerdict.toUpperCase()}\n\n`;

      // Site health
      output += `### Site Health\n`;
      output += `- Status: ${validation.siteHealth.status ?? 'unreachable'}\n`;
      output += `- Live: ${validation.siteHealth.isLive ? 'Yes' : 'No'}\n`;
      output += `- Checked: ${validation.siteHealth.checkedAt}\n\n`;

      // Recency
      output += `### Recency\n`;
      output += `- Days since post: ${validation.recency.daysSincePost}\n`;
      output += `- Stale (>90d): ${validation.recency.isStale ? 'Yes' : 'No'}\n\n`;

      // Product signals
      output += `### Product Signals\n`;
      output += `- Method: ${validation.productSignals.method}\n`;
      output += `- Is Product: ${validation.productSignals.isProduct ?? 'inconclusive'}\n`;
      output += `- Confidence: ${validation.productSignals.confidence}\n`;

      if (validation.productSignals.signals.length > 0) {
        output += `\n**Positive Signals:**\n`;
        for (const s of validation.productSignals.signals) {
          output += `- ✓ ${s}\n`;
        }
      }

      if (validation.productSignals.redFlags.length > 0) {
        output += `\n**Red Flags:**\n`;
        for (const flag of validation.productSignals.redFlags) {
          output += `- ⚠ ${flag}\n`;
        }
      }

      // Recommendation
      output += `\n---\n\n`;
      if (validation.overallVerdict === 'verified') {
        output += `**Recommendation:** Safe to include in reports.\n`;
      } else if (validation.overallVerdict === 'caution') {
        output += `**Recommendation:** Review manually before including. Check for recent activity.\n`;
      } else {
        output += `**Recommendation:** Do not include. Site is down or project appears dead.\n`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: output,
          },
        ],
      };
    }
  );
```

**Step 3: Update server version**

Update the version in the McpServer config (around line 42):

```typescript
  const server = new McpServer({
    name: 'pattern-radar',
    version: '0.3.0',
  });
```

**Step 4: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 5: Commit**

```bash
git add plugins/pattern-radar/src/index.ts
git commit -m "feat(pattern-radar): add validate_signal MCP tool"
```

---

## Task 8: Update scan_trends with Quick Scan

**Files:**
- Modify: `plugins/pattern-radar/src/index.ts`

**Step 1: Update scan_trends tool**

Find the `scan_trends` tool (around line 46) and update the signal processing to include quick scan. Replace the result formatting section (around lines 86-137):

```typescript
      // Run quick scan on all signals
      const scannedSignals = quickScanAll(allSignals);
      const validSignals = scannedSignals.filter(s => s.quickScan?.tier !== 'dead');
      const deadCount = scannedSignals.length - validSignals.length;

      // Detect patterns from valid signals only
      const patterns = detector.detectPatterns(validSignals, userDomains);

      // Format result
      const result: DigestResult = {
        patterns,
        topSignals: validSignals.slice(0, 10),
        domains: userDomains,
        generatedAt: new Date().toISOString(),
      };

      let output = `# Trend Scan: ${args.topic}\n\n`;
      output += `Found ${validSignals.length} valid signals (${deadCount} filtered), ${patterns.length} patterns\n`;
      output += `Your domains: ${userDomains.join(', ') || 'none set'}\n\n`;

      if (errors.length > 0) {
        output += `## Warnings\n${errors.map((e) => `- ${e}`).join('\n')}\n\n`;
      }

      if (patterns.length > 0) {
        output += `## Detected Patterns\n\n`;
        for (const p of patterns.slice(0, 5)) {
          output += `### ${p.title} (relevance: ${(p.relevanceScore * 100).toFixed(0)}%)\n`;
          output += `${p.description}\n\n`;
          if (p.actionable.length > 0) {
            output += `**Actions:**\n`;
            for (const a of p.actionable) {
              output += `- [${a.type}] ${a.suggestion} (${a.effort} effort)\n`;
            }
            output += '\n';
          }
        }
      }

      output += `## Top Signals\n\n`;
      for (const s of validSignals.slice(0, 10)) {
        const badge = s.quickScan?.tier === 'verified' ? '✓' : '⚠';
        const meta = s.quickScan
          ? `${s.quickScan.engagement.points} pts, ${s.quickScan.engagement.comments} comments`
          : '';
        output += `- ${badge} [${s.source}] ${s.title} (${meta})`;
        if (s.url) output += ` - ${s.url}`;
        output += '\n';
      }

      // Note about perplexity and validation
      output += `\n---\n`;
      output += `*Use \`validate_signal\` before adding signals to reports.*\n`;
      output += `*For deeper analysis: \`perplexity_search("${perplexitySource.generateQuery(args.topic, userDomains)}")\`*`;
```

**Step 2: Run typecheck**

Run: `npm run typecheck -w plugins/pattern-radar`
Expected: PASS

**Step 3: Commit**

```bash
git add plugins/pattern-radar/src/index.ts
git commit -m "feat(pattern-radar): integrate quick scan into scan_trends"
```

---

## Task 9: Build and Test

**Step 1: Build the plugin**

Run: `npm run build -w plugins/pattern-radar`
Expected: PASS, no errors

**Step 2: Manual test - validate known dead project**

Create a test script `plugins/pattern-radar/test-validation.js`:

```javascript
// Quick manual test
const { deepValidate } = require('./dist/validation/deep-validate');
const { quickScan } = require('./dist/validation/quick-scan');

async function test() {
  // Test with a known dead signal (BuildTrial style)
  const deadSignal = {
    id: 'test-dead',
    source: 'hackernews',
    title: 'Test Dead Project',
    url: 'https://buildtrial.com',
    score: 0,
    timestamp: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 180 days ago
    metadata: { comments: 0 },
  };

  console.log('Quick scan (dead signal):', quickScan(deadSignal));

  console.log('\nDeep validation (may take a moment)...');
  const result = await deepValidate(deadSignal);
  console.log('Deep validation result:', JSON.stringify(result, null, 2));
}

test().catch(console.error);
```

Run: `node plugins/pattern-radar/test-validation.js`
Expected: Should show `tier: 'dead'` for quick scan, and site health check results

**Step 3: Delete test script and commit**

```bash
rm plugins/pattern-radar/test-validation.js
git add plugins/pattern-radar/
git commit -m "feat(pattern-radar): complete signal validation implementation"
```

---

## Task 10: Version Bump and Release

**Step 1: Update package.json version**

Update `plugins/pattern-radar/package.json` version to `0.3.0`

**Step 2: Update plugin.json version**

Update `plugins/pattern-radar/.claude-plugin/plugin.json` version to `0.3.0`

**Step 3: Update README with new feature**

Add to the features section in `plugins/pattern-radar/README.md`:

```markdown
### Signal Validation
- **Quick Scan**: Automatic filtering of low-engagement signals (< 5 pts and < 2 comments)
- **Quality Badges**: ✓ Verified, ⚠ Unverified indicators in digest
- **Deep Validation**: On-demand site health and product signal detection
- **validate_signal tool**: Validate URLs before adding to competitive reports
```

**Step 4: Build and push**

```bash
npm run build -w plugins/pattern-radar
git add plugins/pattern-radar/
git commit -m "feat(pattern-radar): signal validation v0.3.0

Two-pass validation system:
- Quick scan filters low-engagement noise during digest
- Deep validation checks site health and product signals on-demand
- New validate_signal MCP tool for report preparation
- Quality badges in digest output

Addresses false positive issue (dead projects like BuildTrial)."
git push
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add validation types | types.ts |
| 2 | Create quick scan module | validation/quick-scan.ts |
| 3 | Create heuristics module | validation/heuristics.ts |
| 4 | Create perplexity check module | validation/perplexity-check.ts |
| 5 | Create deep validation module | validation/deep-validate.ts, validation/index.ts |
| 6 | Integrate quick scan into digest | index.ts |
| 7 | Add validate_signal tool | index.ts |
| 8 | Update scan_trends with quick scan | index.ts |
| 9 | Build and test | - |
| 10 | Version bump and release | package.json, plugin.json, README.md |

**Estimated commits:** 10
**New files:** 5
**Modified files:** 4
