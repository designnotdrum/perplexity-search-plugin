/**
 * Tests for ProfileManager.
 *
 * Tests CRUD operations for user profiles:
 * - Loading profile (creates default if missing)
 * - Saving profile
 * - Checking if profile needs refresh (>2 days since last refresh)
 */

import { ProfileManager } from './manager';
import { UserProfile } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock profile directory for tests
const TEST_PROFILE_DIR = path.join(os.tmpdir(), 'perplexity-test-profiles');
const TEST_PROFILE_PATH = path.join(TEST_PROFILE_DIR, 'profile.json');

describe('ProfileManager', () => {
  let manager: ProfileManager;

  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
    await fs.mkdir(TEST_PROFILE_DIR, { recursive: true });

    manager = new ProfileManager(TEST_PROFILE_PATH);
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  });

  test('creates default profile if none exists', async () => {
    const profile = await manager.load();

    expect(profile.version).toBe('1.0.0');
    expect(profile.profile.technicalPreferences.languages).toEqual([]);
    expect(profile.profile.workingStyle.priorities).toEqual([]);
    expect(profile.lastUpdated).toBeDefined();
    expect(profile.lastRefresh).toBeDefined();
  });

  test('loads existing profile', async () => {
    const existingProfile: UserProfile = {
      version: '1.0.0',
      lastUpdated: '2024-01-15T10:00:00Z',
      lastRefresh: '2024-01-15T10:00:00Z',
      profile: {
        technicalPreferences: {
          languages: ['TypeScript', 'Python'],
          frameworks: ['React', 'FastAPI'],
          tools: ['VS Code', 'Git'],
          patterns: ['TDD', 'Clean Code']
        },
        workingStyle: {
          explanationPreference: 'detailed',
          communicationStyle: 'direct',
          priorities: ['correctness', 'performance']
        },
        projectContext: {
          domains: ['web development', 'API design'],
          currentProjects: ['e-commerce platform'],
          commonTasks: ['debugging', 'refactoring']
        },
        knowledgeLevel: {
          expert: ['JavaScript'],
          proficient: ['Python'],
          learning: ['Rust']
        }
      }
    };

    await fs.writeFile(TEST_PROFILE_PATH, JSON.stringify(existingProfile, null, 2));

    const profile = await manager.load();

    expect(profile.profile.technicalPreferences.languages).toEqual(['TypeScript', 'Python']);
    expect(profile.profile.workingStyle.communicationStyle).toBe('direct');
    expect(profile.lastUpdated).toBe('2024-01-15T10:00:00Z');
  });

  test('saves profile updates', async () => {
    const profile = await manager.load();
    profile.profile.technicalPreferences.languages.push('Rust');
    profile.lastUpdated = new Date().toISOString();

    await manager.save(profile);

    const savedContent = await fs.readFile(TEST_PROFILE_PATH, 'utf-8');
    const savedProfile = JSON.parse(savedContent);

    expect(savedProfile.profile.technicalPreferences.languages).toContain('Rust');
  });

  test('checks if profile needs refresh (2 day threshold)', async () => {
    const profile = await manager.load();

    // Fresh profile should not need refresh
    profile.lastRefresh = new Date().toISOString();
    await manager.save(profile);
    expect(await manager.needsRefresh()).toBe(false);

    // 1 day old profile should not need refresh
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    profile.lastRefresh = oneDayAgo.toISOString();
    await manager.save(profile);
    expect(await manager.needsRefresh()).toBe(false);

    // 3 day old profile should need refresh
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    profile.lastRefresh = threeDaysAgo.toISOString();
    await manager.save(profile);
    expect(await manager.needsRefresh()).toBe(true);
  });
});
