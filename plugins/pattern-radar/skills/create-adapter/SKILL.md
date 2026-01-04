---
name: create-adapter
description: Create a custom source adapter for pattern-radar
---

# Create Custom Adapter

Guide the user through creating a custom source adapter for pattern-radar.

## Process

1. **Ask what source they want to add**
   - Get the name and URL/API of the source

2. **Analyze the source**
   - Fetch the URL to understand its structure
   - Determine if it's RSS, JSON API, or needs scraping
   - Identify authentication requirements

3. **Generate the adapter**
   - Use the SourceAdapter interface from `plugins/pattern-radar/src/adapters/types.ts`
   - Create a TypeScript file with the adapter implementation
   - Include proper error handling and health check

4. **Test the adapter**
   - Create a test instance
   - Fetch a few signals to verify it works
   - Health check the source

5. **Save to user config**
   - Save to `~/.config/pattern-radar/adapters/<name>.ts`
   - Inform user how to use it

## Adapter Template

```typescript
import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';

interface MyInstanceConfig extends InstanceConfig {
  // Add config fields here
}

class MySourceInstance implements SourceInstance {
  id: string;
  adapter = 'my-source';
  topic: string;
  config: MyInstanceConfig;

  constructor(topic: string, config: MyInstanceConfig) {
    this.topic = topic;
    this.config = config;
    this.id = `my-source:${topic}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    // Implement fetching
    return [];
  }

  async healthCheck(): Promise<HealthStatus> {
    return { healthy: true, lastChecked: new Date() };
  }
}

export const mySourceAdapter: SourceAdapter = {
  type: 'my-source',
  name: 'My Source',
  capabilities: ['search'],
  requiresAuth: false,
  freeTierAvailable: true,

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    return new MySourceInstance(topic, config as MyInstanceConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    return { valid: true };
  }
};
```

## Example Interaction

```
User: /create-adapter

Claude: What source do you want to add to pattern-radar?

User: There's a Korean baseball stats site at statiz.co.kr

Claude: Let me check that out...
[fetches site, analyzes structure]

I found statiz.co.kr has a news section with an RSS-like structure.
Should I create an RSS adapter configured for their news feed?

User: Yes

Claude: [generates adapter]
Created adapter at ~/.config/pattern-radar/adapters/statiz-kbo.ts
Testing... fetched 12 articles successfully!

The adapter is ready. It will be used when you add "Korean baseball" as a topic.
```
