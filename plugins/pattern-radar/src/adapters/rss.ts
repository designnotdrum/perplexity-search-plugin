/**
 * RSS adapter - fetches items from RSS/Atom feeds
 */

import { SourceAdapter, SourceInstance, InstanceConfig, FetchOptions, HealthStatus, ConfigValidation } from './types.js';
import { Signal } from '../types.js';

interface RSSInstanceConfig extends InstanceConfig {
  url: string;
  name?: string;
}

interface FeedItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
}

class RSSSourceInstance implements SourceInstance {
  id: string;
  adapter = 'rss';
  topic: string;
  config: RSSInstanceConfig;

  constructor(topic: string, config: RSSInstanceConfig) {
    this.topic = topic;
    this.config = config;
    const hostname = new URL(config.url).hostname;
    this.id = `rss:${config.name || hostname}`;
  }

  async fetch(options?: FetchOptions): Promise<Signal[]> {
    const limit = options?.limit || 20;

    const response = await fetch(this.config.url, {
      headers: {
        'User-Agent': 'pattern-radar/1.0 (brain-jar plugin)',
        'Accept': 'application/rss+xml, application/xml, text/xml'
      }
    });

    if (!response.ok) {
      throw new Error(`RSS fetch error: ${response.status}`);
    }

    const text = await response.text();
    const items = this.parseRSS(text);

    return items.slice(0, limit).map((item, i): Signal => ({
      id: `rss:${item.guid || `${this.config.url}:${i}`}`,
      source: 'rss' as Signal['source'],
      title: item.title || 'Untitled',
      url: item.link,
      content: item.description?.replace(/<[^>]*>/g, '').slice(0, 500),
      score: 0, // RSS doesn't have scores
      timestamp: item.pubDate
        ? new Date(item.pubDate).toISOString()
        : new Date().toISOString(),
      metadata: {
        feedUrl: this.config.url,
        feedName: this.config.name
      }
    }));
  }

  private parseRSS(xml: string): FeedItem[] {
    // Simple regex-based RSS parser (works for most feeds)
    const items: FeedItem[] = [];
    const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) ||
                        xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];

    for (const itemXml of itemMatches) {
      const title = this.extractTag(itemXml, 'title');
      const link = this.extractTag(itemXml, 'link') ||
                   this.extractAttr(itemXml, 'link', 'href');
      const description = this.extractTag(itemXml, 'description') ||
                          this.extractTag(itemXml, 'summary') ||
                          this.extractTag(itemXml, 'content');
      const pubDate = this.extractTag(itemXml, 'pubDate') ||
                      this.extractTag(itemXml, 'published') ||
                      this.extractTag(itemXml, 'updated');
      const guid = this.extractTag(itemXml, 'guid') ||
                   this.extractTag(itemXml, 'id');

      items.push({ title, link, description, pubDate, guid });
    }

    return items;
  }

  private extractTag(xml: string, tag: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
    return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
  }

  private extractAttr(xml: string, tag: string, attr: string): string | undefined {
    const match = xml.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["']`, 'i'));
    return match?.[1];
  }

  async healthCheck(): Promise<HealthStatus> {
    try {
      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: { 'User-Agent': 'pattern-radar/1.0' }
      });

      return {
        healthy: response.ok,
        message: response.ok ? 'Feed accessible' : `HTTP ${response.status}`,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date()
      };
    }
  }
}

export const rssAdapter: SourceAdapter = {
  type: 'rss',
  name: 'RSS/Atom Feed',
  capabilities: ['feed'],
  requiresAuth: false,
  freeTierAvailable: true,

  createInstance(topic: string, config: InstanceConfig): SourceInstance {
    const rssConfig = config as RSSInstanceConfig;
    if (!rssConfig.url) {
      throw new Error('RSS adapter requires url in config');
    }
    return new RSSSourceInstance(topic, rssConfig);
  },

  validateConfig(config: InstanceConfig): ConfigValidation {
    const rssConfig = config as RSSInstanceConfig;
    if (!rssConfig.url) {
      return { valid: false, errors: ['url is required'] };
    }
    try {
      new URL(rssConfig.url);
      return { valid: true };
    } catch {
      return { valid: false, errors: ['invalid URL'] };
    }
  }
};
