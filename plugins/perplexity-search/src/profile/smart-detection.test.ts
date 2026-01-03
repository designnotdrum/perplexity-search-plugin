/**
 * Tests for SmartDetector.
 *
 * Tests detection of user preferences from text using
 * the @brain-jar/core UserProfile schema.
 */

import { SmartDetector } from './smart-detection';
import type { UserProfile } from '@brain-jar/core';

function createBaseProfile(): UserProfile {
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

describe('SmartDetector', () => {
  let detector: SmartDetector;
  let baseProfile: UserProfile;

  beforeEach(() => {
    detector = new SmartDetector();
    baseProfile = createBaseProfile();
  });

  it('detects language preferences', () => {
    const text = 'I prefer writing code in TypeScript and Python';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.technical.languages).toContain('TypeScript');
    expect(updated.technical.languages).toContain('Python');
  });

  it('detects frameworks', () => {
    const text = 'I use React and Express in my projects';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.technical.frameworks).toContain('React');
    expect(updated.technical.frameworks).toContain('Express');
  });

  it('detects tools', () => {
    const text = 'I work with Docker and PostgreSQL';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.technical.tools).toContain('Docker');
    expect(updated.technical.tools).toContain('PostgreSQL');
  });

  it('detects patterns', () => {
    const text = 'I follow TDD and use microservices architecture';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.technical.patterns).toContain('TDD');
    expect(updated.technical.patterns).toContain('microservices');
  });

  it('detects learning topics', () => {
    const text = 'I want to learn machine learning and improve my understanding of async patterns';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.knowledge.learning).toContain('machine learning');
    expect(updated.knowledge.learning).toContain('async patterns');
  });

  it('detects expert topics', () => {
    const text = "I'm expert at JavaScript and very experienced with TypeScript";
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.knowledge.expert).toContain('JavaScript');
    expect(updated.knowledge.expert).toContain('TypeScript');
  });

  it('detects proficient topics', () => {
    const text = "I'm proficient at Python and comfortable with Go";
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.knowledge.proficient).toContain('Python');
    expect(updated.knowledge.proficient).toContain('Go');
  });

  it('updates meta.lastUpdated timestamp', () => {
    // Set an explicitly old timestamp
    const oldTimestamp = '2020-01-01T00:00:00.000Z';
    baseProfile.meta.lastUpdated = oldTimestamp;

    const text = 'I prefer TypeScript';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.meta.lastUpdated).not.toBe(oldTimestamp);
    expect(new Date(updated.meta.lastUpdated).getTime()).toBeGreaterThan(
      new Date(oldTimestamp).getTime()
    );
  });

  it('returns unchanged profile for non-preference statements', () => {
    const text = 'The weather is nice today';
    const updated = detector.detectAndUpdate(text, baseProfile);

    // Profile should be unchanged
    expect(updated.technical.languages).toEqual([]);
    expect(updated.technical.frameworks).toEqual([]);
    expect(updated.knowledge.learning).toEqual([]);
  });
});
