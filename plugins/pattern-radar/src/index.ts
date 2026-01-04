#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { HackerNewsSource } from './sources/hackernews';
import { GitHubSource } from './sources/github';
import { PerplexitySource } from './sources/perplexity';
import { PatternDetector } from './detector';
import { ConfigManager } from './config';
import { Signal, Pattern, DigestResult } from './types';
import { quickScan, quickScanAll, deepValidate } from './validation';
import { loadCustomAdapters } from './adapters/loader.js';

async function main(): Promise<void> {
  // Load custom adapters from ~/.config/pattern-radar/adapters/
  loadCustomAdapters().then(loaded => {
    if (loaded.length > 0) {
      console.error(`[pattern-radar] Loaded custom adapters: ${loaded.join(', ')}`);
    }
  }).catch(err => {
    console.error('[pattern-radar] Failed to load custom adapters:', err);
  });
  // Initialize components
  const configManager = new ConfigManager();
  const config = configManager.loadConfig();
  const githubToken = configManager.getGitHubToken();

  const hnSource = new HackerNewsSource();
  const ghSource = new GitHubSource(githubToken);
  const perplexitySource = new PerplexitySource();
  const detector = new PatternDetector();

  // Load user profile for domain inference
  const profile = configManager.loadUserProfile();
  let userDomains = config.domains;

  if (userDomains.length === 0 && profile) {
    userDomains = detector.inferDomainsFromProfile(profile);
    console.error(`[pattern-radar] Inferred domains from profile: ${userDomains.join(', ')}`);
  }

  if (!configManager.hasSharedMemory()) {
    console.error('[pattern-radar] shared-memory not configured. Profile integration disabled.');
  }

  // Create MCP server
  const server = new McpServer({
    name: 'pattern-radar',
    version: '0.4.1',
  });

  // --- Pattern Radar Tools ---

  server.tool(
    'scan_trends',
    'Scan sources for trends on a topic (HN, GitHub, optionally Perplexity)',
    {
      topic: z.string().describe('Topic to scan for'),
      sources: z
        .array(z.enum(['hackernews', 'github', 'all']))
        .optional()
        .describe('Sources to scan (default: all enabled)'),
      limit: z.number().optional().describe('Max results per source (default: 20)'),
    },
    async (args: { topic: string; sources?: string[]; limit?: number }) => {
      const limit = args.limit || 20;
      const sourcesToScan = args.sources || ['all'];
      const scanAll = sourcesToScan.includes('all');

      const allSignals: Signal[] = [];
      const errors: string[] = [];

      // Scan HN
      if (scanAll || sourcesToScan.includes('hackernews')) {
        const hnResult = await hnSource.search(args.topic, limit);
        if (hnResult.error) {
          errors.push(`HN: ${hnResult.error}`);
        } else {
          allSignals.push(...hnResult.signals);
        }
      }

      // Scan GitHub
      if (scanAll || sourcesToScan.includes('github')) {
        const ghResult = await ghSource.search(args.topic, limit);
        if (ghResult.error) {
          errors.push(`GitHub: ${ghResult.error}`);
        } else {
          allSignals.push(...ghResult.signals);
        }
      }

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

  server.tool(
    'get_radar_digest',
    'Get your personalized trend digest based on profile domains',
    {
      timeframe: z
        .enum(['daily', 'weekly'])
        .optional()
        .describe('Timeframe for trending content (default: weekly)'),
    },
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
  );

  server.tool(
    'configure_sources',
    'Configure which sources to scan and their weights',
    {
      hackernews_enabled: z.boolean().optional().describe('Enable HN scanning'),
      hackernews_weight: z.number().optional().describe('HN weight (0-2)'),
      github_enabled: z.boolean().optional().describe('Enable GitHub scanning'),
      github_weight: z.number().optional().describe('GitHub weight (0-2)'),
      github_languages: z.array(z.string()).optional().describe('Languages to prioritize'),
      domains: z.array(z.string()).optional().describe('Your interest domains'),
    },
    async (args: {
      hackernews_enabled?: boolean;
      hackernews_weight?: number;
      github_enabled?: boolean;
      github_weight?: number;
      github_languages?: string[];
      domains?: string[];
    }) => {
      const updates: Record<string, unknown> = {};

      if (args.hackernews_enabled !== undefined || args.hackernews_weight !== undefined) {
        updates.sources = {
          ...config.sources,
          hackernews: {
            enabled: args.hackernews_enabled ?? config.sources.hackernews.enabled,
            weight: args.hackernews_weight ?? config.sources.hackernews.weight,
          },
        };
      }

      if (
        args.github_enabled !== undefined ||
        args.github_weight !== undefined ||
        args.github_languages !== undefined
      ) {
        updates.sources = {
          ...config.sources,
          ...(updates.sources as Record<string, unknown>),
          github: {
            enabled: args.github_enabled ?? config.sources.github.enabled,
            weight: args.github_weight ?? config.sources.github.weight,
            languages: args.github_languages ?? config.sources.github.languages,
          },
        };
      }

      if (args.domains !== undefined) {
        updates.domains = args.domains;
        userDomains = args.domains;
      }

      const newConfig = configManager.updateConfig(updates as Partial<typeof config>);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Configuration updated:\n\n${JSON.stringify(newConfig, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    'explore_pattern',
    'Deep dive into a specific pattern or topic',
    {
      topic: z.string().describe('Pattern or topic to explore'),
      include_github: z.boolean().optional().describe('Include GitHub repos (default: true)'),
      include_hn: z.boolean().optional().describe('Include HN discussions (default: true)'),
    },
    async (args: { topic: string; include_github?: boolean; include_hn?: boolean }) => {
      const includeGH = args.include_github !== false;
      const includeHN = args.include_hn !== false;
      const allSignals: Signal[] = [];

      if (includeHN) {
        const hnResult = await hnSource.search(args.topic, 15);
        if (!hnResult.error) {
          allSignals.push(...hnResult.signals);
        }
      }

      if (includeGH) {
        const ghResult = await ghSource.search(args.topic, 15);
        if (!ghResult.error) {
          allSignals.push(...ghResult.signals);
        }
      }

      // Score and sort by relevance
      const scored = allSignals.map((s) => ({
        signal: s,
        relevance: detector.scoreRelevance(s, userDomains),
      }));
      scored.sort((a, b) => b.relevance - a.relevance);

      let output = `# Exploring: ${args.topic}\n\n`;
      output += `Found ${allSignals.length} signals\n\n`;

      output += `## Most Relevant to You\n\n`;
      for (const { signal: s, relevance } of scored.slice(0, 10)) {
        output += `### ${s.title}\n`;
        output += `*Source: ${s.source} | Score: ${s.score} | Relevance: ${(relevance * 100).toFixed(0)}%*\n`;
        if (s.content) {
          output += `\n${s.content.substring(0, 200)}${s.content.length > 200 ? '...' : ''}\n`;
        }
        if (s.url) {
          output += `\nLink: ${s.url}\n`;
        }
        output += '\n';
      }

      // Perplexity prompt for deeper dive
      const perplexityQuery = perplexitySource.generateQuery(args.topic, userDomains);
      output += `---\n\n`;
      output += `**For deeper analysis**, use perplexity_search:\n`;
      output += `\`perplexity_search("${perplexityQuery}")\`\n`;

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

  server.tool(
    'get_intersections',
    'Find where trends overlap with your expertise domains',
    {},
    async () => {
      if (userDomains.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No domains configured. Set domains via configure_sources or install shared-memory for automatic profile detection.',
            },
          ],
        };
      }

      // Search each domain
      const domainResults = new Map<string, Signal[]>();

      for (const domain of userDomains.slice(0, 5)) {
        // Limit to 5 domains
        const hnResult = await hnSource.search(domain, 10);
        const ghResult = await ghSource.search(domain, 10);

        const signals = [...(hnResult.signals || []), ...(ghResult.signals || [])];
        domainResults.set(domain, signals);
      }

      // Find overlapping signals (appear in multiple domain searches)
      const signalCounts = new Map<string, { signal: Signal; domains: string[] }>();

      for (const [domain, signals] of domainResults) {
        for (const signal of signals) {
          if (!signalCounts.has(signal.id)) {
            signalCounts.set(signal.id, { signal, domains: [] });
          }
          signalCounts.get(signal.id)!.domains.push(domain);
        }
      }

      // Filter to signals that match multiple domains
      const intersections = Array.from(signalCounts.values())
        .filter((x) => x.domains.length >= 2)
        .sort((a, b) => b.domains.length - a.domains.length);

      let output = `# Domain Intersections\n\n`;
      output += `*Your domains: ${userDomains.join(', ')}*\n\n`;

      if (intersections.length === 0) {
        output += `No signals found that overlap multiple domains.\n\n`;
        output += `**Suggestions:**\n`;
        output += `- Your domains may be too specific\n`;
        output += `- Try broader terms or related technologies\n`;
        output += `- Use scan_trends to search specific topics\n`;
      } else {
        output += `## Intersection Signals (${intersections.length})\n\n`;
        output += `These signals appear across multiple of your domains:\n\n`;

        for (const { signal: s, domains } of intersections.slice(0, 10)) {
          output += `### ${s.title}\n`;
          output += `*Domains: ${domains.join(', ')} | Source: ${s.source} | Score: ${s.score}*\n`;
          if (s.content) {
            output += `\n${s.content.substring(0, 150)}${s.content.length > 150 ? '...' : ''}\n`;
          }
          if (s.url) {
            output += `\nLink: ${s.url}\n`;
          }
          output += '\n';
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
  );

  server.tool(
    'suggest_actions',
    'Get actionable suggestions based on current trends and your profile',
    {
      focus: z
        .enum(['learn', 'build', 'explore', 'all'])
        .optional()
        .describe('Focus on specific action type'),
    },
    async (args: { focus?: 'learn' | 'build' | 'explore' | 'all' }) => {
      const focus = args.focus || 'all';

      // Get recent trends
      const hnResult = await hnSource.getFrontPage(20);
      const ghResult = await ghSource.getTrending(undefined, 'weekly', 15);

      const allSignals = [...(hnResult.signals || []), ...(ghResult.signals || [])];
      const patterns = detector.detectPatterns(allSignals, userDomains);

      // Collect all actionable insights
      const actions = patterns
        .flatMap((p) => p.actionable)
        .filter((a) => focus === 'all' || a.type === focus);

      let output = `# Suggested Actions\n\n`;
      output += `*Based on current trends and your domains*\n\n`;

      if (actions.length === 0) {
        output += `No specific actions detected. Try:\n`;
        output += `- Configure your domains for better matching\n`;
        output += `- Use scan_trends to search specific topics\n`;
      } else {
        const grouped: Record<string, typeof actions> = {
          learn: [],
          build: [],
          explore: [],
          invest: [],
        };

        for (const a of actions) {
          grouped[a.type].push(a);
        }

        for (const [type, typeActions] of Object.entries(grouped)) {
          if (typeActions.length === 0) continue;

          output += `## ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
          for (const a of typeActions.slice(0, 5)) {
            output += `- **${a.suggestion}**\n`;
            output += `  *${a.reason}* (${a.effort} effort)\n\n`;
          }
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
  );

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

  server.tool(
    'scan_topic',
    'Scan a specific topic across dynamically discovered sources',
    {
      topic: z.string().describe('The topic to scan (e.g., "Premier League", "AI tools", "rust programming")'),
      limit: z.number().optional().describe('Max results per source (default: 20)'),
      discover: z.boolean().optional().describe('Use LLM to discover sources if not cached (default: true)'),
    },
    async (args: { topic: string; limit?: number; discover?: boolean }) => {
      const limit = args.limit || 20;
      // Note: 'discover' param reserved for future LLM-based discovery via skill
      // Currently we use curated mappings + fallback to HN/GitHub

      // Import mapper functions
      const { resolveTopic, createInstancesForTopic } = await import('./mapper/index.js');

      // Resolve topic to sources
      const resolution = await resolveTopic(args.topic);

      // If still no sources, fall back to basic HN/GitHub search
      if (resolution.sources.length === 0) {
        const hnResult = await hnSource.search(args.topic, limit);
        const ghResult = await ghSource.search(args.topic, limit);
        const allSignals = [...(hnResult.signals || []), ...(ghResult.signals || [])];
        const scannedSignals = quickScanAll(allSignals);
        const validSignals = scannedSignals.filter(s => s.quickScan?.tier !== 'dead');

        let output = `# Topic Scan: ${args.topic}\n\n`;
        output += `*Resolution: fallback (no specific sources found)*\n\n`;
        output += `Found ${validSignals.length} signals from HN + GitHub\n\n`;

        output += `## Top Signals\n\n`;
        for (const s of validSignals.slice(0, 10)) {
          const badge = s.quickScan?.tier === 'verified' ? '✓' : '⚠';
          output += `- ${badge} [${s.source}] ${s.title}`;
          if (s.url) output += ` - ${s.url}`;
          output += '\n';
        }

        output += `\n---\n`;
        output += `*Tip: Use scan_trends for more control, or configure domain mappings.*\n`;

        return {
          content: [{ type: 'text' as const, text: output }],
        };
      }

      // Create source instances and fetch signals
      const topicConfig = {
        topic: args.topic,
        sources: resolution.sources,
        matchedDomain: resolution.matchedDomain,
        discoveredAt: new Date().toISOString(),
        enabled: true,
      };

      const instances = createInstancesForTopic(topicConfig);

      // If all curated sources failed to create instances (missing configs),
      // fall back to HN/GitHub with the topic as search query
      if (instances.length === 0 && resolution.sources.length > 0) {
        console.error(`[scan_topic] All ${resolution.sources.length} curated sources failed to instantiate - falling back to HN/GitHub`);

        const hnResult = await hnSource.search(args.topic, limit);
        const ghResult = await ghSource.search(args.topic, limit);
        const allSignals = [...(hnResult.signals || []), ...(ghResult.signals || [])];
        const scannedSignals = quickScanAll(allSignals);
        const validSignals = scannedSignals.filter(s => s.quickScan?.tier !== 'dead');

        let output = `# Topic Scan: ${args.topic}\n\n`;
        output += `*Resolution: ${resolution.resolutionMethod} → fallback`;
        if (resolution.matchedDomain) output += ` (matched domain: ${resolution.matchedDomain}, but no specific source configs)`;
        output += `*\n\n`;
        output += `⚠️ **Note:** Curated mapping found for "${resolution.matchedDomain}" but requires specific source configs.\n`;
        output += `Use \`/create-adapter\` skill to configure Reddit subreddits or RSS feeds for this domain.\n\n`;
        output += `Found ${validSignals.length} signals from HN + GitHub fallback\n\n`;

        output += `## Top Signals\n\n`;
        for (const s of validSignals.slice(0, 10)) {
          const badge = s.quickScan?.tier === 'verified' ? '✓' : '⚠';
          output += `- ${badge} [${s.source}] ${s.title}`;
          if (s.url) output += ` - ${s.url}`;
          output += '\n';
        }

        output += `\n---\n`;
        output += `*Tip: Configure specific sources with \`/create-adapter\` for better results.*\n`;

        return {
          content: [{ type: 'text' as const, text: output }],
        };
      }

      const allSignals: Signal[] = [];
      const sourceResults: { adapter: string; count: number; error?: string }[] = [];

      for (const instance of instances) {
        try {
          const signals = await instance.fetch({ limit });
          allSignals.push(...signals);
          sourceResults.push({ adapter: instance.adapter, count: signals.length });
        } catch (error) {
          sourceResults.push({
            adapter: instance.adapter,
            count: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Run quick scan and filter
      const scannedSignals = quickScanAll(allSignals);
      const validSignals = scannedSignals.filter(s => s.quickScan?.tier !== 'dead');
      const deadCount = scannedSignals.length - validSignals.length;

      // Format output
      let output = `# Topic Scan: ${args.topic}\n\n`;
      output += `*Resolution: ${resolution.resolutionMethod}`;
      if (resolution.matchedDomain) output += ` (domain: ${resolution.matchedDomain})`;
      output += `*\n\n`;

      output += `## Sources Scanned\n\n`;
      for (const result of sourceResults) {
        if (result.error) {
          output += `- ❌ ${result.adapter}: ${result.error}\n`;
        } else {
          output += `- ✓ ${result.adapter}: ${result.count} signals\n`;
        }
      }
      output += '\n';

      output += `Found ${validSignals.length} valid signals (${deadCount} filtered)\n\n`;

      output += `## Top Signals\n\n`;
      for (const s of validSignals.slice(0, 15)) {
        const badge = s.quickScan?.tier === 'verified' ? '✓' : '⚠';
        const meta = s.quickScan
          ? `${s.quickScan.engagement.points} pts, ${s.quickScan.engagement.comments} comments`
          : '';
        output += `- ${badge} [${s.source}] ${s.title}`;
        if (meta) output += ` (${meta})`;
        if (s.url) output += `\n  ${s.url}`;
        output += '\n';
      }

      output += `\n---\n`;
      output += `*Use \`validate_signal\` before adding signals to reports.*\n`;

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    }
  );

  // Connect transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[pattern-radar] MCP server running on stdio');
}

main().catch((error) => {
  console.error('[pattern-radar] Fatal error:', error);
  process.exit(1);
});
