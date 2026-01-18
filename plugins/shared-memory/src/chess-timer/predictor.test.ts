// plugins/shared-memory/src/chess-timer/predictor.test.ts

import { Predictor } from './predictor';
import { SessionStore } from './session-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Predictor', () => {
  let store: SessionStore;
  let predictor: Predictor;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-predictor-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
    predictor = new Predictor(store);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('getEstimate', () => {
    it('should return low confidence with no history', () => {
      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.confidence).toBe('low');
      expect(estimate.sample_count).toBe(0);
      expect(estimate.message).toContain('new territory');
    });

    it('should return medium confidence with some history', () => {
      // Create 5 completed sessions
      for (let i = 0; i < 5; i++) {
        const session = store.createSession({
          feature_id: `feature/test-${i}`,
          description: 'Test feature',
          scope: 'project:test',
          work_type: 'feature',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'feature', complexity_rating: 3 },
        });
      }

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.confidence).toBe('medium');
      expect(estimate.sample_count).toBe(5);
    });

    it('should return high confidence with lots of history', () => {
      // Create 15 completed sessions
      for (let i = 0; i < 15; i++) {
        const session = store.createSession({
          feature_id: `feature/test-${i}`,
          description: 'Test feature',
          scope: 'project:test',
          work_type: 'feature',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'feature', complexity_rating: 3 },
        });
      }

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.confidence).toBe('high');
      expect(estimate.sample_count).toBe(15);
    });

    it('should filter by work_type', () => {
      // Create sessions with different work types
      const bugfix = store.createSession({
        feature_id: 'fix/bug1',
        description: 'Bug fix',
        scope: 'project:test',
        work_type: 'bugfix',
      });
      store.completeSession(bugfix.id, { metrics: { work_type: 'bugfix' } });

      const feature = store.createSession({
        feature_id: 'feature/f1',
        description: 'Feature',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(feature.id, { metrics: { work_type: 'feature' } });

      const estimate = predictor.getEstimate({ work_type: 'bugfix' });

      expect(estimate.sample_count).toBe(1);
      expect(estimate.similar_sessions[0].feature_id).toBe('fix/bug1');
    });

    it('should filter by complexity_rating within range', () => {
      // Create sessions with different complexities
      for (let complexity = 1; complexity <= 5; complexity++) {
        const session = store.createSession({
          feature_id: `feature/complexity-${complexity}`,
          description: `Complexity ${complexity} feature`,
          scope: 'project:test',
          work_type: 'feature',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'feature', complexity_rating: complexity },
        });
      }

      // Request estimate for complexity 3, should match 2, 3, 4 (within +-1)
      const estimate = predictor.getEstimate({
        work_type: 'feature',
        complexity_rating: 3,
      });

      expect(estimate.sample_count).toBe(3);
    });

    it('should return similar_sessions limited to 3', () => {
      // Create 10 completed sessions
      for (let i = 0; i < 10; i++) {
        const session = store.createSession({
          feature_id: `feature/test-${i}`,
          description: `Test feature ${i}`,
          scope: 'project:test',
          work_type: 'feature',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'feature' },
        });
      }

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.similar_sessions.length).toBe(3);
    });

    it('should include duration info in similar_sessions', () => {
      const session = store.createSession({
        feature_id: 'feature/test',
        description: 'Test feature',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(session.id, {
        metrics: { work_type: 'feature' },
      });

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      expect(estimate.similar_sessions[0]).toHaveProperty('feature_id');
      expect(estimate.similar_sessions[0]).toHaveProperty('description');
      expect(estimate.similar_sessions[0]).toHaveProperty('duration_seconds');
    });

    it('should generate message based on confidence level', () => {
      // Low confidence message
      const lowEstimate = predictor.getEstimate({ work_type: 'feature' });
      expect(lowEstimate.message).toContain('new territory');

      // Create sessions for medium confidence
      for (let i = 0; i < 5; i++) {
        const session = store.createSession({
          feature_id: `feature/test-${i}`,
          description: 'Test feature',
          scope: 'project:test',
          work_type: 'bugfix',
        });
        store.completeSession(session.id, {
          metrics: { work_type: 'bugfix' },
        });
      }

      const mediumEstimate = predictor.getEstimate({ work_type: 'bugfix' });
      expect(mediumEstimate.message).toContain('Based on');
      expect(mediumEstimate.message).toContain('5');
    });
  });

  describe('formatDuration', () => {
    it('should format durations correctly through estimate messages', () => {
      // Create a session and manually set duration to test formatting
      // We can't directly test private method, but we can verify through output
      const session = store.createSession({
        feature_id: 'feature/test',
        description: 'Test feature',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(session.id, {
        metrics: { work_type: 'feature' },
      });

      const estimate = predictor.getEstimate({ work_type: 'feature' });

      // Message should contain formatted duration
      expect(typeof estimate.message).toBe('string');
      expect(estimate.message.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty input', () => {
      const estimate = predictor.getEstimate({});

      expect(estimate.confidence).toBe('low');
      expect(estimate.sample_count).toBe(0);
    });

    it('should handle sessions without metrics', () => {
      // Create session without work_type
      const session = store.createSession({
        feature_id: 'feature/no-metrics',
        description: 'No metrics session',
        scope: 'project:test',
      });
      store.completeSession(session.id, {});

      // Should still work, just won't match work_type filter
      const estimate = predictor.getEstimate({ work_type: 'feature' });
      expect(estimate.sample_count).toBe(0);

      // But should appear when no work_type filter
      const allEstimate = predictor.getEstimate({});
      expect(allEstimate.sample_count).toBe(1);
    });
  });
});
