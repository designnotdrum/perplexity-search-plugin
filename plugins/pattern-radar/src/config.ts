import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RadarConfig, UserProfile, getDefaultConfig } from './types';

const CONFIG_DIR = path.join(os.homedir(), '.config', 'brain-jar');
const RADAR_CONFIG_PATH = path.join(CONFIG_DIR, 'pattern-radar.json');
const PROFILE_PATH = path.join(CONFIG_DIR, 'user-profile.json');

/**
 * Configuration manager for pattern-radar
 */
export class ConfigManager {
  /**
   * Load radar configuration
   */
  loadConfig(): RadarConfig {
    try {
      if (fs.existsSync(RADAR_CONFIG_PATH)) {
        const content = fs.readFileSync(RADAR_CONFIG_PATH, 'utf-8');
        const saved = JSON.parse(content) as Partial<RadarConfig>;
        return { ...getDefaultConfig(), ...saved };
      }
    } catch {
      // Ignore parse errors
    }
    return getDefaultConfig();
  }

  /**
   * Save radar configuration
   */
  saveConfig(config: RadarConfig): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(RADAR_CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  /**
   * Update specific config fields
   */
  updateConfig(updates: Partial<RadarConfig>): RadarConfig {
    const current = this.loadConfig();
    const updated = { ...current, ...updates };

    // Deep merge sources
    if (updates.sources) {
      updated.sources = {
        ...current.sources,
        ...updates.sources,
      };
    }

    this.saveConfig(updated);
    return updated;
  }

  /**
   * Get GitHub token if configured
   */
  getGitHubToken(): string | undefined {
    try {
      if (fs.existsSync(RADAR_CONFIG_PATH)) {
        const content = fs.readFileSync(RADAR_CONFIG_PATH, 'utf-8');
        const config = JSON.parse(content) as { github_token?: string };
        return config.github_token;
      }
    } catch {
      // Ignore
    }
    return undefined;
  }

  /**
   * Load user profile (from shared-memory if available)
   */
  loadUserProfile(): UserProfile | null {
    try {
      if (fs.existsSync(PROFILE_PATH)) {
        const content = fs.readFileSync(PROFILE_PATH, 'utf-8');
        return JSON.parse(content) as UserProfile;
      }
    } catch {
      // Ignore parse errors
    }
    return null;
  }

  /**
   * Check if shared-memory is configured
   */
  hasSharedMemory(): boolean {
    const brainJarConfig = path.join(CONFIG_DIR, 'config.json');
    return fs.existsSync(brainJarConfig);
  }
}
