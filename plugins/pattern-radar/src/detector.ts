import {
  Signal,
  Pattern,
  ActionableInsight,
  UserProfile,
  RadarConfig,
} from './types';

/**
 * Pattern detection and relevance scoring
 */
export class PatternDetector {
  /**
   * Score a signal's relevance to user's domains
   */
  scoreRelevance(signal: Signal, domains: string[]): number {
    if (domains.length === 0) return 0.5; // Neutral if no domains set

    const text = `${signal.title} ${signal.content || ''}`.toLowerCase();
    let matches = 0;

    for (const domain of domains) {
      const domainLower = domain.toLowerCase();
      // Check for exact match or related terms
      if (text.includes(domainLower)) {
        matches++;
      }
    }

    // Score based on percentage of domains matched
    return Math.min(1, matches / Math.max(1, domains.length) + 0.2);
  }

  /**
   * Detect patterns from a collection of signals
   */
  detectPatterns(signals: Signal[], domains: string[]): Pattern[] {
    if (signals.length === 0) return [];

    // Group signals by common keywords/themes
    const groups = this.groupByTheme(signals);
    const patterns: Pattern[] = [];

    for (const [theme, themeSignals] of Object.entries(groups)) {
      if (themeSignals.length < 2) continue; // Need at least 2 signals for a pattern

      // Calculate average relevance score
      const relevanceScores = themeSignals.map((s) => this.scoreRelevance(s, domains));
      const avgRelevance = relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length;

      // Generate actionable insights
      const insights = this.generateInsights(theme, themeSignals, avgRelevance);

      patterns.push({
        id: `pattern-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: theme,
        description: this.describePattern(theme, themeSignals),
        signals: themeSignals,
        relevanceScore: avgRelevance,
        domains: this.extractDomains(themeSignals),
        detectedAt: new Date().toISOString(),
        actionable: insights,
      });
    }

    // Sort by relevance
    return patterns.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  /**
   * Group signals by common themes
   */
  private groupByTheme(signals: Signal[]): Record<string, Signal[]> {
    const groups: Record<string, Signal[]> = {};

    // Extract common keywords from titles
    const keywords = new Map<string, Signal[]>();

    for (const signal of signals) {
      const words = this.extractKeywords(signal.title);
      for (const word of words) {
        if (!keywords.has(word)) {
          keywords.set(word, []);
        }
        keywords.get(word)!.push(signal);
      }
    }

    // Keep only keywords that appear in multiple signals
    for (const [keyword, keywordSignals] of keywords) {
      if (keywordSignals.length >= 2) {
        groups[keyword] = keywordSignals;
      }
    }

    return groups;
  }

  /**
   * Extract significant keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Common stop words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'that', 'this', 'these',
      'those', 'it', 'its', 'my', 'your', 'his', 'her', 'our', 'their',
      'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
      'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'show', 'ask', 'new', 'just', 'now', 'can', 'get', 'use', 'using',
    ]);

    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Describe a pattern in natural language
   */
  private describePattern(theme: string, signals: Signal[]): string {
    const sources = [...new Set(signals.map((s) => s.source))];
    const avgScore = signals.reduce((a, b) => a + b.score, 0) / signals.length;

    return `"${theme}" is trending across ${sources.join(' and ')} with ${signals.length} signals. Average engagement: ${Math.round(avgScore)}.`;
  }

  /**
   * Extract domain tags from signals
   */
  private extractDomains(signals: Signal[]): string[] {
    const domains = new Set<string>();

    for (const signal of signals) {
      // From GitHub topics
      const topics = signal.metadata.topics as string[] | undefined;
      if (topics) {
        topics.forEach((t) => domains.add(t));
      }

      // From GitHub language
      const language = signal.metadata.language as string | undefined;
      if (language && language !== 'Unknown') {
        domains.add(language);
      }
    }

    return Array.from(domains).slice(0, 5);
  }

  /**
   * Generate actionable insights for a pattern
   */
  private generateInsights(
    theme: string,
    signals: Signal[],
    relevance: number
  ): ActionableInsight[] {
    const insights: ActionableInsight[] = [];

    // Learning opportunity
    if (signals.some((s) => s.source === 'hackernews')) {
      insights.push({
        type: 'learn',
        suggestion: `Deep dive into ${theme} - multiple discussions on HN`,
        effort: 'low',
        reason: 'Active community discussion indicates learning resources available',
      });
    }

    // Build opportunity
    if (signals.some((s) => s.source === 'github')) {
      const repoCount = signals.filter((s) => s.source === 'github').length;
      insights.push({
        type: 'build',
        suggestion: `Explore ${theme} implementations on GitHub (${repoCount} trending repos)`,
        effort: 'medium',
        reason: 'Active development ecosystem suggests tooling opportunities',
      });
    }

    // Exploration opportunity based on relevance
    if (relevance > 0.6) {
      insights.push({
        type: 'explore',
        suggestion: `${theme} intersects with your domains - investigate potential applications`,
        effort: 'low',
        reason: 'High relevance to your expertise suggests unique perspective advantage',
      });
    }

    return insights;
  }

  /**
   * Infer user domains from profile
   */
  inferDomainsFromProfile(profile: UserProfile): string[] {
    const domains: string[] = [];

    if (profile.technical?.languages) {
      domains.push(...profile.technical.languages);
    }

    if (profile.technical?.frameworks) {
      domains.push(...profile.technical.frameworks);
    }

    if (profile.technical?.domains) {
      domains.push(...profile.technical.domains);
    }

    if (profile.knowledge?.domains) {
      domains.push(...profile.knowledge.domains);
    }

    if (profile.knowledge?.interests) {
      domains.push(...profile.knowledge.interests);
    }

    return [...new Set(domains)];
  }
}
