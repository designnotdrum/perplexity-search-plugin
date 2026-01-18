// plugins/shared-memory/src/chess-timer/integration.test.ts

import { SessionStore } from './session-store';
import { Predictor } from './predictor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Chess Timer Integration', () => {
  let store: SessionStore;
  let predictor: Predictor;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-integration-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
    predictor = new Predictor(store);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should track a complete session lifecycle', () => {
    // Start session
    const session = store.createSession({
      feature_id: 'feature/auth',
      description: 'Add authentication',
      scope: 'project:myapp',
      work_type: 'feature',
    });

    expect(session.status).toBe('active');

    // Pause for break
    const paused = store.pauseSession(session.id, 'break');
    expect(paused.status).toBe('paused');

    // Resume
    const resumed = store.resumeSession(session.id);
    expect(resumed.status).toBe('active');

    // Complete
    const completed = store.completeSession(session.id, {
      satisfaction: 5,
      notes: 'Went great',
      metrics: {
        files_touched: 10,
        lines_added: 200,
        work_type: 'feature',
        complexity_rating: 3,
      },
    });

    expect(completed.status).toBe('completed');
    expect(completed.satisfaction).toBe(5);

    // Verify segments
    const segments = store.getSegments(session.id);
    expect(segments.length).toBe(2); // Initial + after resume

    // Verify metrics (last entry contains the completion metrics)
    const metrics = store.getMetrics(session.id);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics[metrics.length - 1].files_touched).toBe(10);
  });

  it('should improve estimates with more data', () => {
    // First estimate - no data
    const estimate1 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate1.confidence).toBe('low');

    // Add 5 sessions
    for (let i = 0; i < 5; i++) {
      const s = store.createSession({
        feature_id: `feature/test-${i}`,
        description: 'Test',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(s.id, { metrics: { work_type: 'feature' } });
    }

    // Second estimate - some data
    const estimate2 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate2.confidence).toBe('medium');
    expect(estimate2.sample_count).toBe(5);

    // Add 10 more
    for (let i = 5; i < 15; i++) {
      const s = store.createSession({
        feature_id: `feature/test-${i}`,
        description: 'Test',
        scope: 'project:test',
        work_type: 'feature',
      });
      store.completeSession(s.id, { metrics: { work_type: 'feature' } });
    }

    // Third estimate - lots of data
    const estimate3 = predictor.getEstimate({ work_type: 'feature' });
    expect(estimate3.confidence).toBe('high');
    expect(estimate3.sample_count).toBe(15);
  });

  it('should filter sessions by scope', () => {
    store.createSession({ feature_id: 'f1', description: 'Test', scope: 'project:a', work_type: 'feature' });
    store.createSession({ feature_id: 'f2', description: 'Test', scope: 'project:b', work_type: 'feature' });

    const sessionsA = store.listSessions({ scope: 'project:a' });
    const sessionsB = store.listSessions({ scope: 'project:b' });

    expect(sessionsA.length).toBe(1);
    expect(sessionsB.length).toBe(1);
    expect(sessionsA[0].feature_id).toBe('f1');
  });
});
