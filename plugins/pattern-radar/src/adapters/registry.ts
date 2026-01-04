/**
 * Adapter registry - manages available source adapters
 */

import { SourceAdapter, AdapterRegistry } from './types.js';

class AdapterRegistryImpl implements AdapterRegistry {
  adapters: Map<string, SourceAdapter> = new Map();

  register(adapter: SourceAdapter): void {
    if (this.adapters.has(adapter.type)) {
      console.warn(`Adapter ${adapter.type} already registered, overwriting`);
    }
    this.adapters.set(adapter.type, adapter);
  }

  get(type: string): SourceAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): SourceAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// Singleton registry
export const registry = new AdapterRegistryImpl();

/**
 * Register a source adapter
 */
export function registerAdapter(adapter: SourceAdapter): void {
  registry.register(adapter);
}

/**
 * Get an adapter by type
 */
export function getAdapter(type: string): SourceAdapter | undefined {
  return registry.get(type);
}

/**
 * List all registered adapters
 */
export function listAdapters(): SourceAdapter[] {
  return registry.list();
}
