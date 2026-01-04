# Pattern Radar Signal Validation Design

**Date:** 2026-01-04
**Status:** Approved
**Problem:** Pattern radar surfaces dead projects and low-engagement noise (e.g., BuildTrial with 404 site, 0 HN comments), wasting time on false positives.

---

## Overview

Two-pass validation system that filters noise during digest generation and validates signals before adding to reports.

```
┌─────────────────────────────────────────────────────────────────┐
│                        PASS 1: Quick Scan                        │
│              (runs during digest, filters + badges)              │
├─────────────────────────────────────────────────────────────────┤
│  HN Signal → Engagement Check → Age Check → Quality Tier        │
│                                                                  │
│  Thresholds:                                                     │
│  • 5+ points OR 2+ comments = passes                            │
│  • <3 months old = "fresh"                                       │
│                                                                  │
│  Output: ✓ Verified | ⚠ Unverified | filtered out               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     PASS 2: Deep Validation                      │
│           (runs on-demand when creating reports)                 │
├─────────────────────────────────────────────────────────────────┤
│  Signal → Site Health → Recency Flag → Product Signals          │
│                                                                  │
│  Checks:                                                         │
│  1. HTTP HEAD → 200? (site alive)                               │
│  2. Post age > 3mo? (stale flag)                                │
│  3. Heuristics → /pricing, /signup, app store links             │
│  4. Perplexity (if inconclusive) → "Is X an active product?"    │
│                                                                  │
│  Output: ValidationResult with confidence + flags                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation approach | Two-pass | Market does initial validation; expensive checks only on-demand |
| Quick scan thresholds | 5+ pts OR 2+ comments | Moderate - catches early traction, filters total duds |
| Deep validation checks | Site + recency + product signals | Full picture before committing to a report |
| Product detection | Hybrid (heuristics → Perplexity) | Fast/free first, paid API only when inconclusive |
| Surfacing | Digest shows quality badges | User sees signal quality without full validation cost |

---

## Data Model

### New Types (`src/types.ts`)

```typescript
/** Quality tier from quick scan */
type SignalTier = 'verified' | 'unverified' | 'dead';

/** Quick scan result (attached to Signal) */
interface QuickScanResult {
  tier: SignalTier;
  engagement: {
    points: number;
    comments: number;
    passesThreshold: boolean;  // 5+ points OR 2+ comments
  };
  age: {
    days: number;
    isStale: boolean;  // >90 days
  };
}

/** Deep validation result (on-demand) */
interface ValidationResult {
  siteHealth: {
    status: number | null;    // HTTP status or null if unreachable
    isLive: boolean;
    checkedAt: string;
  };
  recency: {
    isStale: boolean;
    daysSincePost: number;
  };
  productSignals: {
    method: 'heuristics' | 'perplexity' | 'both';
    isProduct: boolean | null;  // null = inconclusive
    confidence: 'high' | 'medium' | 'low';
    signals: string[];  // e.g., ["has /pricing", "app store link"]
    redFlags: string[]; // e.g., ["404", "parked domain", "no product pages"]
  };
  overallVerdict: 'verified' | 'caution' | 'dead';
}
```

### Signal Extension

```typescript
interface Signal {
  // ... existing fields ...
  quickScan?: QuickScanResult;      // Populated during digest
  validation?: ValidationResult;    // Populated on-demand
}
```

---

## Implementation

### File Structure

```
plugins/pattern-radar/src/
├── validation/
│   ├── quick-scan.ts      # Pass 1: engagement + age checks
│   ├── deep-validate.ts   # Pass 2: site health + product signals
│   ├── heuristics.ts      # HTML-based product detection
│   └── perplexity.ts      # Perplexity fallback for inconclusive
├── types.ts               # Extended with validation types
└── index.ts               # New validate_signal tool
```

### Quick Scan (`validation/quick-scan.ts`)

```typescript
const THRESHOLDS = {
  minPoints: 5,
  minComments: 2,
  staleDays: 90,
};

export function quickScan(signal: Signal): QuickScanResult {
  const points = signal.score || 0;
  const comments = (signal.metadata.comments as number) || 0;
  const postDate = new Date(signal.timestamp);
  const daysSince = Math.floor((Date.now() - postDate.getTime()) / 86400000);

  const passesThreshold = points >= THRESHOLDS.minPoints
                       || comments >= THRESHOLDS.minComments;
  const isStale = daysSince > THRESHOLDS.staleDays;

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
```

### Deep Validation (`validation/deep-validate.ts`)

```typescript
export async function deepValidate(signal: Signal): Promise<ValidationResult> {
  const [siteHealth, productSignals] = await Promise.all([
    checkSiteHealth(signal.url),
    detectProductSignals(signal.url),
  ]);

  const daysSincePost = signal.quickScan?.age.days || 0;

  let overallVerdict: 'verified' | 'caution' | 'dead';
  if (!siteHealth.isLive) {
    overallVerdict = 'dead';
  } else if (productSignals.redFlags.length > 0 || daysSincePost > 90) {
    overallVerdict = 'caution';
  } else if (productSignals.isProduct && productSignals.confidence !== 'low') {
    overallVerdict = 'verified';
  } else {
    overallVerdict = 'caution';
  }

  return {
    siteHealth,
    recency: { isStale: daysSincePost > 90, daysSincePost },
    productSignals,
    overallVerdict,
  };
}

async function checkSiteHealth(url?: string): Promise<SiteHealthResult> {
  if (!url) return { status: null, isLive: false, checkedAt: new Date().toISOString() };

  try {
    const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return {
      status: response.status,
      isLive: response.status >= 200 && response.status < 400,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { status: null, isLive: false, checkedAt: new Date().toISOString() };
  }
}
```

### Heuristics (`validation/heuristics.ts`)

```typescript
export async function checkHeuristics(url: string): Promise<ProductSignalsResult> {
  const html = await fetch(url).then(r => r.text()).catch(() => '');

  const signals: string[] = [];
  const redFlags: string[] = [];

  // Positive signals
  if (/\/pricing|\/plans/i.test(html)) signals.push('has pricing page');
  if (/\/signup|\/register|\/get-started/i.test(html)) signals.push('has signup flow');
  if (/app\..*\.com|dashboard\./i.test(html)) signals.push('has app subdomain');
  if (/apps\.apple\.com|play\.google\.com/i.test(html)) signals.push('app store links');
  if (/\$\d+.*\/mo|per month|per user/i.test(html)) signals.push('pricing visible');

  // Red flags
  if (/coming soon|under construction/i.test(html)) redFlags.push('coming soon page');
  if (/parked|domain for sale/i.test(html)) redFlags.push('parked domain');
  if (html.length < 1000) redFlags.push('minimal content');

  const isProduct = signals.length >= 2 ? true : redFlags.length >= 1 ? false : null;
  const confidence = signals.length >= 3 ? 'high' : signals.length >= 1 ? 'medium' : 'low';

  return { method: 'heuristics', isProduct, confidence, signals, redFlags };
}
```

### Perplexity Fallback (`validation/perplexity.ts`)

```typescript
export async function checkWithPerplexity(url: string): Promise<ProductSignalsResult> {
  const domain = new URL(url).hostname.replace('www.', '');

  const query = `Is ${domain} an active product or company?
    Looking for: paying customers, funding, team size, launch date.
    Answer format: ACTIVE_PRODUCT / DEAD_PROJECT / UNCLEAR + brief reason`;

  try {
    const result = await perplexitySearch({ query, mode: 'quick' });

    const signals: string[] = [];
    const redFlags: string[] = [];
    const text = result.answer.toLowerCase();

    if (/funded|raised|series [a-z]|yc |y combinator/i.test(text)) signals.push('has funding');
    if (/\d+ employees|\d+ team/i.test(text)) signals.push('has team');
    if (/launched|active|customers|revenue/i.test(text)) signals.push('active product');
    if (/shut down|defunct|abandoned|inactive|failed/i.test(text)) redFlags.push('confirmed dead');
    if (/no information|cannot find|unclear/i.test(text)) redFlags.push('no public info');

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
    return { method: 'perplexity', isProduct: null, confidence: 'low', signals: [], redFlags: ['perplexity unavailable'] };
  }
}
```

### Hybrid Detection (`validation/deep-validate.ts`)

```typescript
async function detectProductSignals(url?: string): Promise<ProductSignalsResult> {
  if (!url) return { method: 'heuristics', isProduct: null, confidence: 'low', signals: [], redFlags: ['no url'] };

  // Step 1: Heuristics first (fast, free)
  const heuristics = await checkHeuristics(url);

  if (heuristics.confidence === 'high') {
    return heuristics;  // Clear answer, skip Perplexity
  }

  // Step 2: Perplexity fallback for inconclusive cases
  const perplexityResult = await checkWithPerplexity(url);

  return {
    method: 'both',
    isProduct: perplexityResult.isProduct,
    confidence: perplexityResult.confidence,
    signals: [...heuristics.signals, ...perplexityResult.signals],
    redFlags: [...heuristics.redFlags, ...perplexityResult.redFlags],
  };
}
```

---

## Integration Changes

### Existing Tools

| Tool | Change |
|------|--------|
| `scan_trends` | Run quick scan on all signals, filter out `dead` tier |
| `get_radar_digest` | Show quality badge + engagement stats |
| `suggest_actions` | Add "validate before reporting" for `unverified` signals |

### New MCP Tool

```typescript
{
  name: 'validate_signal',
  description: 'Run deep validation on a signal before adding to a report',
  parameters: {
    url: { type: 'string', description: 'URL to validate' },
    title: { type: 'string', description: 'Signal title for context' },
  },
  returns: ValidationResult
}
```

---

## Output Changes

### Digest Before

```
- [hackernews] BuildTrial - Cursor for Technical Recruiting
- [hackernews] Lindy - No-code AI employees
```

### Digest After

```
## High Relevance
- ✓ [Lindy](https://lindy.ai) - No-code AI employees (150 pts, 45 comments, 2d ago)

## Filtered Out (low engagement)
- BuildTrial (0 pts, 0 comments) - skipped
```

---

## Diagrams

Deep validation flow saved to visual-thinking:
- **ID:** `d624602e-d34d-4e49-857f-bbf1508a723b`
- **Title:** Pattern Radar - Deep Validation Flow

---

## Implementation Order

1. Add new types to `types.ts`
2. Create `validation/quick-scan.ts`
3. Integrate quick scan into `scan_trends` and `get_radar_digest`
4. Create `validation/heuristics.ts`
5. Create `validation/perplexity.ts`
6. Create `validation/deep-validate.ts`
7. Add `validate_signal` MCP tool
8. Update digest output formatting
9. Test with known dead projects (BuildTrial) and live ones (Lindy)
