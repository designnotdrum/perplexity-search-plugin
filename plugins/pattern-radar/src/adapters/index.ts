/**
 * Adapters index - exports registry and registers core adapters
 */

export * from './types.js';
export * from './registry.js';

import { registerAdapter } from './registry.js';
import { hackernewsAdapter } from './hackernews.js';
import { githubAdapter } from './github.js';
import { redditAdapter } from './reddit.js';
import { rssAdapter } from './rss.js';

// Register core adapters
registerAdapter(hackernewsAdapter);
registerAdapter(githubAdapter);
registerAdapter(redditAdapter);
registerAdapter(rssAdapter);

// Re-export for convenience
export { hackernewsAdapter } from './hackernews.js';
export { githubAdapter } from './github.js';
export { redditAdapter } from './reddit.js';
export { rssAdapter } from './rss.js';
