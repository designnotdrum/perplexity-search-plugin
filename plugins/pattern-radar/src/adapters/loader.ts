/**
 * Custom adapter loader
 * Loads user-created adapters from ~/.config/pattern-radar/adapters/
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { registerAdapter } from './registry.js';
import { SourceAdapter } from './types.js';

const CUSTOM_ADAPTERS_DIR = join(homedir(), '.config', 'pattern-radar', 'adapters');

/**
 * Load all custom adapters from user config directory
 */
export async function loadCustomAdapters(): Promise<string[]> {
  if (!existsSync(CUSTOM_ADAPTERS_DIR)) {
    return [];
  }

  const loaded: string[] = [];
  const files = readdirSync(CUSTOM_ADAPTERS_DIR).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const modulePath = join(CUSTOM_ADAPTERS_DIR, file);
      const module = await import(modulePath);

      // Look for exported adapter
      const adapter = module.default || Object.values(module).find(
        (v: unknown) => {
          const obj = v as Record<string, unknown>;
          return obj?.type && obj?.createInstance;
        }
      ) as SourceAdapter | undefined;

      if (adapter) {
        registerAdapter(adapter);
        loaded.push(adapter.type);
      }
    } catch (error) {
      console.warn(`Failed to load custom adapter ${file}:`, error);
    }
  }

  return loaded;
}
