/**
 * ProfileManager - CRUD operations for user profiles.
 *
 * Responsibilities:
 * - Load profile from disk (creates default if missing)
 * - Save profile updates
 * - Check if profile needs refresh (>2 days since lastRefresh)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { UserProfile } from '../types';

export class ProfileManager {
  constructor(private profilePath: string) {}

  /**
   * Loads user profile from disk.
   * Creates default profile if none exists.
   */
  async load(): Promise<UserProfile> {
    try {
      const data = await fs.readFile(this.profilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist - create default
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.createDefaultProfile();
      }
      throw error;
    }
  }

  /**
   * Saves profile to disk.
   */
  async save(profile: UserProfile): Promise<void> {
    const dir = path.dirname(this.profilePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.profilePath, JSON.stringify(profile, null, 2));
  }

  /**
   * Checks if profile needs refresh.
   * Returns true if more than 2 days since lastRefresh.
   */
  async needsRefresh(): Promise<boolean> {
    const profile = await this.load();
    const lastRefresh = new Date(profile.lastRefresh);
    const now = new Date();
    const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;

    return now.getTime() - lastRefresh.getTime() > twoDaysInMs;
  }

  /**
   * Creates a default profile with empty arrays for all fields.
   */
  private createDefaultProfile(): UserProfile {
    const now = new Date().toISOString();

    return {
      version: '1.0.0',
      lastUpdated: now,
      lastRefresh: now,
      profile: {
        technicalPreferences: {
          languages: [],
          frameworks: [],
          tools: [],
          patterns: []
        },
        workingStyle: {
          explanationPreference: '',
          communicationStyle: '',
          priorities: []
        },
        projectContext: {
          domains: [],
          currentProjects: [],
          commonTasks: []
        },
        knowledgeLevel: {
          expert: [],
          proficient: [],
          learning: []
        }
      }
    };
  }
}
