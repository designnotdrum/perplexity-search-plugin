/**
 * Curated domain → source type mappings
 * These ship with the plugin and provide reliable defaults
 */

export interface DomainMapping {
  domain: string;
  keywords: string[];
  sourceTypes: string[];
  discoveryHints: string;
}

export const CURATED_MAPPINGS: DomainMapping[] = [
  {
    domain: 'sports/football',
    keywords: ['football', 'soccer', 'premier league', 'la liga', 'champions league', 'bundesliga', 'serie a', 'world cup', 'uefa'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Look for team-specific subreddits (r/reddevils, r/gunners, r/LiverpoolFC), league subreddits (r/soccer, r/PremierLeague)'
  },
  {
    domain: 'sports/american-football',
    keywords: ['nfl', 'american football', 'super bowl', 'touchdown'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits (r/eagles, r/patriots, r/cowboys), r/nfl'
  },
  {
    domain: 'sports/basketball',
    keywords: ['nba', 'basketball', 'wnba'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits, r/nba'
  },
  {
    domain: 'sports/baseball',
    keywords: ['mlb', 'baseball', 'world series'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Team subreddits, r/baseball'
  },
  {
    domain: 'finance/stocks',
    keywords: ['stocks', 'investing', 'trading', 'market', 'portfolio', 'dividend', 'etf'],
    sourceTypes: ['reddit', 'rss', 'hackernews'],
    discoveryHints: 'r/stocks, r/investing, r/wallstreetbets, Yahoo Finance RSS'
  },
  {
    domain: 'finance/crypto',
    keywords: ['crypto', 'bitcoin', 'ethereum', 'blockchain', 'defi', 'nft', 'web3'],
    sourceTypes: ['reddit', 'rss', 'hackernews', 'github'],
    discoveryHints: 'r/cryptocurrency, r/bitcoin, r/ethereum, CoinDesk RSS'
  },
  {
    domain: 'gaming',
    keywords: ['gaming', 'video games', 'esports', 'playstation', 'xbox', 'nintendo', 'steam', 'pc gaming'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Game-specific subreddits, r/gaming, r/pcgaming, r/Games'
  },
  {
    domain: 'tech/programming',
    keywords: ['programming', 'software', 'coding', 'developer', 'engineering'],
    sourceTypes: ['hackernews', 'github', 'reddit'],
    discoveryHints: 'r/programming, r/learnprogramming, language-specific subs'
  },
  {
    domain: 'tech/ai',
    keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'claude', 'neural network', 'deep learning'],
    sourceTypes: ['hackernews', 'github', 'reddit', 'rss'],
    discoveryHints: 'r/MachineLearning, r/LocalLLaMA, r/artificial, arXiv RSS'
  },
  {
    domain: 'tech/startups',
    keywords: ['startup', 'entrepreneur', 'founder', 'vc', 'venture capital', 'saas', 'b2b'],
    sourceTypes: ['hackernews', 'reddit', 'rss'],
    discoveryHints: 'r/startups, r/Entrepreneur, TechCrunch RSS'
  },
  {
    domain: 'entertainment/movies',
    keywords: ['movies', 'film', 'cinema', 'oscar', 'hollywood', 'streaming'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'r/movies, r/MovieDetails, r/boxoffice'
  },
  {
    domain: 'entertainment/tv',
    keywords: ['tv shows', 'television', 'streaming', 'netflix', 'hbo'],
    sourceTypes: ['reddit', 'rss'],
    discoveryHints: 'Show-specific subreddits, r/television'
  },
  {
    domain: 'science',
    keywords: ['science', 'research', 'physics', 'biology', 'chemistry', 'astronomy', 'space'],
    sourceTypes: ['reddit', 'rss', 'hackernews'],
    discoveryHints: 'r/science, r/space, r/physics, Nature RSS'
  }
];

/**
 * Find matching domain for a topic based on keywords
 */
export function findMatchingDomain(topic: string): DomainMapping | undefined {
  const topicLower = topic.toLowerCase();

  for (const mapping of CURATED_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (topicLower.includes(keyword)) {
        return mapping;
      }
    }
  }

  return undefined;
}
