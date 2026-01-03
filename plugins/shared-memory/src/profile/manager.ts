/**
 * ProfileManager - CRUD operations for shared user profile.
 *
 * Profile is shared across all brain-jar plugins at:
 * ~/.config/brain-jar/user-profile.json
 *
 * Profile is synced to Mem0 as append-only snapshots using infer:false
 * to preserve raw JSON. This enables profile portability across machines
 * and historical analysis ("You, Wrapped").
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { UserProfile, OnboardingQuestion, InferredPreference } from './types';
import { randomUUID } from 'crypto';
import type { Mem0Client, ProfileSnapshot } from '../mem0-client';

const PROFILE_PATH = path.join(os.homedir(), '.config', 'brain-jar', 'user-profile.json');
const INFERENCES_PATH = path.join(os.homedir(), '.config', 'brain-jar', 'pending-inferences.json');

export class ProfileManager {
  private mem0Client: Mem0Client | null = null;
  private lastSyncedProfile: string | null = null; // JSON string for deep compare

  constructor(
    private profilePath: string = PROFILE_PATH,
    private inferencesPath: string = INFERENCES_PATH
  ) {}

  /**
   * Sets the Mem0 client for cloud sync.
   * Call this after construction if Mem0 is configured.
   */
  setMem0Client(client: Mem0Client): void {
    this.mem0Client = client;
  }

  /**
   * Loads user profile from disk.
   * Creates default profile if none exists.
   */
  async load(): Promise<UserProfile> {
    try {
      const data = await fs.readFile(this.profilePath, 'utf-8');
      const profile = JSON.parse(data) as UserProfile;
      return this.migrateIfNeeded(profile);
    } catch (error) {
      const err = error as NodeJS.ErrnoException | SyntaxError;

      // File doesn't exist - create default
      if ('code' in err && err.code === 'ENOENT') {
        const defaultProfile = this.createDefaultProfile();
        await this.save(defaultProfile);
        return defaultProfile;
      }

      // Corrupted JSON - log and create default
      if (error instanceof SyntaxError) {
        console.warn(`Profile file corrupted at ${this.profilePath}, creating default:`, error.message);
        const defaultProfile = this.createDefaultProfile();
        await this.save(defaultProfile);
        return defaultProfile;
      }

      // Other errors - rethrow
      throw new Error(`Failed to load profile from ${this.profilePath}: ${err.message}`);
    }
  }

  /**
   * Saves profile to disk and syncs to Mem0 if configured.
   */
  async save(profile: UserProfile, skipMem0Sync: boolean = false): Promise<void> {
    const dir = path.dirname(this.profilePath);
    await fs.mkdir(dir, { recursive: true });
    profile.meta.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.profilePath, JSON.stringify(profile, null, 2));

    // Sync to Mem0 if configured and profile changed
    if (!skipMem0Sync && this.mem0Client) {
      await this.pushSnapshot(profile);
    }
  }

  // --- Mem0 Sync Methods ---

  /**
   * Syncs profile from Mem0 on startup.
   * - If Mem0 has a newer profile, pull it (and save locally)
   * - If local is newer or Mem0 is empty, push local to Mem0
   * - If no Mem0 client, skip sync
   */
  async syncFromMem0(): Promise<{ action: 'pulled' | 'pushed' | 'skipped'; profile: UserProfile }> {
    const localProfile = await this.load();

    if (!this.mem0Client) {
      return { action: 'skipped', profile: localProfile };
    }

    try {
      const remoteSnapshot = await this.mem0Client.getLatestProfile();

      if (!remoteSnapshot) {
        // No remote profile - push local
        await this.pushSnapshot(localProfile);
        return { action: 'pushed', profile: localProfile };
      }

      // Compare timestamps
      const localUpdated = new Date(localProfile.meta.lastUpdated || 0);
      const remoteUpdated = new Date(remoteSnapshot.timestamp);

      if (remoteUpdated > localUpdated) {
        // Remote is newer - pull it
        await this.save(remoteSnapshot.profile, true); // skipMem0Sync to avoid loop
        this.lastSyncedProfile = JSON.stringify(remoteSnapshot.profile);
        return { action: 'pulled', profile: remoteSnapshot.profile };
      } else {
        // Local is newer or same - push if changed
        const localJson = JSON.stringify(localProfile);
        if (localJson !== this.lastSyncedProfile) {
          await this.pushSnapshot(localProfile);
        }
        return { action: 'pushed', profile: localProfile };
      }
    } catch (error) {
      console.warn('Profile sync from Mem0 failed:', error);
      return { action: 'skipped', profile: localProfile };
    }
  }

  /**
   * Pushes a new profile snapshot to Mem0.
   * Uses infer:false to store raw JSON without semantic extraction.
   */
  async pushSnapshot(profile: UserProfile): Promise<boolean> {
    if (!this.mem0Client) {
      return false;
    }

    try {
      const profileJson = JSON.stringify(profile);
      // Only push if changed
      if (profileJson === this.lastSyncedProfile) {
        return true;
      }

      const id = await this.mem0Client.saveProfileSnapshot(profile);
      if (id) {
        this.lastSyncedProfile = profileJson;
        return true;
      }
      return false;
    } catch (error) {
      console.warn('Failed to push profile snapshot to Mem0:', error);
      return false;
    }
  }

  /**
   * Gets profile history from Mem0.
   * Returns snapshots sorted newest-first.
   */
  async getHistory(since?: Date, limit?: number): Promise<ProfileSnapshot[]> {
    if (!this.mem0Client) {
      return [];
    }

    try {
      return await this.mem0Client.getProfileHistory(since, limit);
    } catch (error) {
      console.warn('Failed to get profile history from Mem0:', error);
      return [];
    }
  }

  /**
   * Gets a value from the profile using dot-path notation.
   * e.g., get('identity.name') or get('technical.languages')
   */
  async get<T>(dotPath: string): Promise<T | undefined> {
    const profile = await this.load();
    const parts = dotPath.split('.');
    let current: unknown = profile;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current as T;
  }

  /**
   * Sets a value in the profile using dot-path notation.
   */
  async set(dotPath: string, value: unknown): Promise<void> {
    const profile = await this.load();
    const parts = dotPath.split('.');
    let current: Record<string, unknown> = profile as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    await this.save(profile);
  }

  /**
   * Appends values to an array field in the profile.
   */
  async addToArray(dotPath: string, values: string[]): Promise<void> {
    const profile = await this.load();
    const currentValue = await this.get<string[]>(dotPath);
    const existing = Array.isArray(currentValue) ? currentValue : [];
    const unique = [...new Set([...existing, ...values])];
    await this.set(dotPath, unique);
  }

  /**
   * Returns the next batch of onboarding questions based on profile gaps.
   */
  getNextOnboardingQuestions(profile: UserProfile, count: number = 3): OnboardingQuestion[] {
    const questions: OnboardingQuestion[] = [];

    // Identity questions (session 1)
    if (!profile.meta.onboardingProgress.identity) {
      if (!profile.identity.name) {
        questions.push({
          category: 'identity',
          field: 'identity.name',
          question: "What name should I use for you?",
          optional: false,
        });
      }
      if (!profile.identity.timezone) {
        questions.push({
          category: 'identity',
          field: 'identity.timezone',
          question: "What's your timezone?",
          followUp: "Helps me know when to wish you good morning!",
          examples: ['America/New_York', 'Europe/London', 'Asia/Tokyo'],
          optional: false,
        });
      }
      if (!profile.identity.role) {
        questions.push({
          category: 'identity',
          field: 'identity.role',
          question: "What's your primary role?",
          examples: ['Developer', 'Designer', 'PM', 'Founder', 'Student'],
          optional: false,
        });
      }
    }

    // Technical questions (session 2-3)
    if (questions.length < count && !profile.meta.onboardingProgress.technical) {
      if (profile.technical.languages.length === 0) {
        questions.push({
          category: 'technical',
          field: 'technical.languages',
          question: "What programming languages do you use most?",
          examples: ['TypeScript', 'Python', 'Go', 'Rust'],
          optional: true,
        });
      }
      if (profile.technical.frameworks.length === 0) {
        questions.push({
          category: 'technical',
          field: 'technical.frameworks',
          question: "Any frameworks you prefer?",
          examples: ['React', 'Next.js', 'Django', 'FastAPI'],
          optional: true,
        });
      }
      if (profile.technical.editors.length === 0) {
        questions.push({
          category: 'technical',
          field: 'technical.editors',
          question: "What's your editor of choice?",
          examples: ['VS Code', 'Neovim', 'JetBrains', 'Cursor'],
          optional: true,
        });
      }
    }

    // Working style questions (session 4+)
    if (questions.length < count && !profile.meta.onboardingProgress.workingStyle) {
      if (profile.workingStyle.verbosity === 'adaptive') {
        questions.push({
          category: 'workingStyle',
          field: 'workingStyle.verbosity',
          question: "Do you prefer concise answers or detailed explanations?",
          optional: true,
        });
      }
      if (profile.workingStyle.priorities.length === 0) {
        questions.push({
          category: 'workingStyle',
          field: 'workingStyle.priorities',
          question: "What do you prioritize most in your work?",
          examples: ['Code quality', 'Speed', 'Learning', 'Maintainability'],
          optional: true,
        });
      }
    }

    // Personal questions (optional, later sessions)
    if (questions.length < count && !profile.meta.onboardingProgress.personal) {
      if (profile.personal.goals.length === 0) {
        questions.push({
          category: 'personal',
          field: 'personal.goals',
          question: "Any personal or professional goals you're working toward?",
          examples: ['Learn Rust', 'Ship my startup', 'Get promoted'],
          optional: true,
        });
      }
      if (profile.personal.interests.length === 0) {
        questions.push({
          category: 'personal',
          field: 'personal.interests',
          question: "Any hobbies or interests outside of work?",
          followUp: "Feel free to skip if you'd rather not say",
          optional: true,
        });
      }
    }

    return questions.slice(0, count);
  }

  /**
   * Checks if onboarding is complete.
   */
  isOnboardingComplete(profile: UserProfile): boolean {
    return profile.meta.onboardingComplete;
  }

  /**
   * Marks a category as complete and checks overall completion.
   */
  async markCategoryComplete(category: keyof UserProfile['meta']['onboardingProgress']): Promise<void> {
    const profile = await this.load();
    profile.meta.onboardingProgress[category] = true;

    // Check if all required categories are complete
    const { identity, technical } = profile.meta.onboardingProgress;
    if (identity && technical) {
      profile.meta.onboardingComplete = true;
    }

    await this.save(profile);
  }

  /**
   * Records when we last prompted the user for onboarding questions.
   */
  async recordOnboardingPrompt(): Promise<void> {
    const profile = await this.load();
    profile.meta.lastOnboardingPrompt = new Date().toISOString();
    await this.save(profile);
  }

  /**
   * Checks if enough time has passed to ask more onboarding questions.
   * Returns true if > 3 days since last prompt.
   */
  async shouldPromptOnboarding(profile: UserProfile): Promise<boolean> {
    if (profile.meta.onboardingComplete) return false;
    if (!profile.meta.lastOnboardingPrompt) return true;

    const lastPrompt = new Date(profile.meta.lastOnboardingPrompt);
    const now = new Date();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

    return now.getTime() - lastPrompt.getTime() > threeDaysInMs;
  }

  // --- Inference Management ---

  /**
   * Loads pending inferences from disk.
   */
  async loadInferences(): Promise<InferredPreference[]> {
    try {
      const data = await fs.readFile(this.inferencesPath, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Saves pending inferences to disk.
   */
  async saveInferences(inferences: InferredPreference[]): Promise<void> {
    const dir = path.dirname(this.inferencesPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.inferencesPath, JSON.stringify(inferences, null, 2));
  }

  /**
   * Adds a new inference to pending list.
   */
  async addInference(inference: Omit<InferredPreference, 'id' | 'status' | 'createdAt'>): Promise<InferredPreference> {
    const inferences = await this.loadInferences();
    const newInference: InferredPreference = {
      ...inference,
      id: randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    inferences.push(newInference);
    await this.saveInferences(inferences);
    return newInference;
  }

  /**
   * Confirms an inference and applies it to the profile.
   */
  async confirmInference(inferenceId: string): Promise<boolean> {
    const inferences = await this.loadInferences();
    const inference = inferences.find((i) => i.id === inferenceId);

    if (!inference || inference.status !== 'pending') {
      return false;
    }

    // Apply to profile
    const currentValue = await this.get<string[] | string>(inference.field);
    if (Array.isArray(inference.value)) {
      await this.addToArray(inference.field, inference.value);
    } else if (Array.isArray(currentValue)) {
      await this.addToArray(inference.field, [inference.value]);
    } else {
      await this.set(inference.field, inference.value);
    }

    // Update inference status
    inference.status = 'confirmed';
    await this.saveInferences(inferences);
    return true;
  }

  /**
   * Rejects an inference.
   */
  async rejectInference(inferenceId: string): Promise<boolean> {
    const inferences = await this.loadInferences();
    const inference = inferences.find((i) => i.id === inferenceId);

    if (!inference || inference.status !== 'pending') {
      return false;
    }

    inference.status = 'rejected';
    await this.saveInferences(inferences);
    return true;
  }

  /**
   * Gets pending inferences.
   */
  async getPendingInferences(): Promise<InferredPreference[]> {
    const inferences = await this.loadInferences();
    return inferences.filter((i) => i.status === 'pending');
  }

  // --- Helpers ---

  /**
   * Creates a default profile with empty/default values.
   */
  private createDefaultProfile(): UserProfile {
    const now = new Date().toISOString();

    return {
      version: '1.0.0',
      identity: {},
      technical: {
        languages: [],
        frameworks: [],
        tools: [],
        editors: [],
        patterns: [],
        operatingSystems: [],
      },
      workingStyle: {
        verbosity: 'adaptive',
        learningPace: 'adaptive',
        priorities: [],
      },
      knowledge: {
        expert: [],
        proficient: [],
        learning: [],
        interests: [],
      },
      personal: {
        interests: [],
        goals: [],
        context: [],
      },
      meta: {
        onboardingComplete: false,
        onboardingProgress: {
          identity: false,
          technical: false,
          workingStyle: false,
          personal: false,
        },
        lastUpdated: now,
        createdAt: now,
      },
    };
  }

  /**
   * Migrates old profile versions to current schema.
   */
  private migrateIfNeeded(profile: UserProfile): UserProfile {
    // Future: Add migration logic when schema changes
    // For now, ensure all required fields exist
    if (!profile.meta.onboardingProgress) {
      profile.meta.onboardingProgress = {
        identity: false,
        technical: false,
        workingStyle: false,
        personal: false,
      };
    }
    if (!profile.personal) {
      profile.personal = { interests: [], goals: [], context: [] };
    }
    return profile;
  }
}

export { PROFILE_PATH, INFERENCES_PATH };
