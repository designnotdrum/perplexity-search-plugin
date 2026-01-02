/**
 * Profile types for holistic user learning.
 * Shared across all brain-jar plugins.
 */

export interface UserProfile {
  version: string;

  identity: {
    name?: string;
    pronouns?: string;
    timezone?: string;
    location?: string; // City-level, optional
    role?: string; // "Senior engineer", "Founder", "Student"
    organization?: string;
  };

  technical: {
    languages: string[];
    frameworks: string[];
    tools: string[];
    editors: string[];
    patterns: string[]; // TDD, microservices, etc.
    operatingSystems: string[];
  };

  workingStyle: {
    verbosity: 'concise' | 'detailed' | 'adaptive';
    learningPace: 'fast' | 'thorough' | 'adaptive';
    communicationStyle?: string;
    priorities: string[]; // "code quality", "speed", "learning"
  };

  knowledge: {
    expert: string[];
    proficient: string[];
    learning: string[];
    interests: string[]; // Technical topics they follow
  };

  personal: {
    interests: string[]; // Hobbies, non-technical
    goals: string[]; // "Learn Rust", "Ship my startup"
    context: string[]; // Life context, freeform
  };

  meta: {
    onboardingComplete: boolean;
    onboardingProgress: {
      identity: boolean;
      technical: boolean;
      workingStyle: boolean;
      personal: boolean;
    };
    lastUpdated: string;
    lastOnboardingPrompt?: string;
    createdAt: string;
  };
}

export interface InferredPreference {
  id: string;
  field: string; // Dot-path like 'technical.languages'
  value: string | string[];
  confidence: 'high' | 'medium' | 'low';
  evidence: string; // What triggered this inference
  source: 'codebase' | 'conversation' | 'config';
  status: 'pending' | 'confirmed' | 'rejected';
  createdAt: string;
}

export interface OnboardingQuestion {
  category: 'identity' | 'technical' | 'workingStyle' | 'personal';
  field: string;
  question: string;
  followUp?: string;
  examples?: string[];
  optional: boolean;
}

export type ProfileSection = 'all' | 'identity' | 'technical' | 'workingStyle' | 'knowledge' | 'personal' | 'meta';
