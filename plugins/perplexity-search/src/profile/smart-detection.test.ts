import { SmartDetector } from './smart-detection';
import type { UserProfile } from '../types';

describe('SmartDetector', () => {
  let detector: SmartDetector;
  let baseProfile: UserProfile;

  beforeEach(() => {
    detector = new SmartDetector();
    baseProfile = {
      version: '1.0.0',
      lastUpdated: '2024-01-01T00:00:00.000Z',
      lastRefresh: '2024-01-01T00:00:00.000Z',
      profile: {
        technicalPreferences: {
          languages: [],
          frameworks: [],
          tools: [],
          patterns: []
        },
        workingStyle: {
          explanationPreference: 'balanced',
          communicationStyle: 'professional',
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
  });

  it('detects language preferences', () => {
    const text = 'I prefer writing code in TypeScript and Python';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.technicalPreferences.languages).toContain('TypeScript');
    expect(updated.profile.technicalPreferences.languages).toContain('Python');
  });

  it('detects frameworks', () => {
    const text = 'I use React and Express in my projects';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.technicalPreferences.frameworks).toContain('React');
    expect(updated.profile.technicalPreferences.frameworks).toContain('Express');
  });

  it('detects tools', () => {
    const text = 'I work with Docker and PostgreSQL';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.technicalPreferences.tools).toContain('Docker');
    expect(updated.profile.technicalPreferences.tools).toContain('PostgreSQL');
  });

  it('detects patterns', () => {
    const text = 'I follow TDD and use microservices architecture';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.technicalPreferences.patterns).toContain('TDD');
    expect(updated.profile.technicalPreferences.patterns).toContain('microservices');
  });

  it('detects learning topics', () => {
    const text = 'I want to learn machine learning and improve my understanding of async patterns';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.knowledgeLevel.learning).toContain('machine learning');
    expect(updated.profile.knowledgeLevel.learning).toContain('async patterns');
  });

  it('detects expert topics', () => {
    const text = "I'm expert at JavaScript and very experienced with TypeScript";
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.knowledgeLevel.expert).toContain('JavaScript');
    expect(updated.profile.knowledgeLevel.expert).toContain('TypeScript');
  });

  it('detects proficient topics', () => {
    const text = "I'm proficient at Python and comfortable with Go";
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.knowledgeLevel.proficient).toContain('Python');
    expect(updated.profile.knowledgeLevel.proficient).toContain('Go');
  });

  it('detects domains', () => {
    const text = 'I work in web development and machine learning';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.projectContext.domains).toContain('web development');
    expect(updated.profile.projectContext.domains).toContain('machine learning');
  });

  it('detects current projects', () => {
    const text = "I'm working on a web scraper and building an API server";
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated.profile.projectContext.currentProjects).toContain('web scraper');
    expect(updated.profile.projectContext.currentProjects).toContain('API server');
  });

  it('updates lastUpdated timestamp', () => {
    const oldTimestamp = baseProfile.lastUpdated;
    const text = 'I prefer TypeScript';

    const updated = detector.detectAndUpdate(text, baseProfile);
    expect(updated.lastUpdated).not.toBe(oldTimestamp);
  });

  it('returns unchanged profile for non-preference statements', () => {
    const text = 'The weather is nice today';
    const updated = detector.detectAndUpdate(text, baseProfile);

    expect(updated).toEqual(baseProfile);
  });
});
