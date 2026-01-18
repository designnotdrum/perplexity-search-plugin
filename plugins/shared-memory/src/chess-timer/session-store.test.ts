// plugins/shared-memory/src/chess-timer/session-store.test.ts

import { SessionStore } from './session-store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SessionStore', () => {
  let store: SessionStore;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-sessions-${Date.now()}.db`);
    store = new SessionStore(testDbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('createSession', () => {
    it('should create a session with a new segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
        work_type: 'feature',
      });

      expect(session.id).toBeDefined();
      expect(session.feature_id).toBe('feature/auth');
      expect(session.status).toBe('active');
      expect(session.total_active_seconds).toBe(0);
    });

    it('should create an initial segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
      });

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(1);
      expect(segments[0].ended_at).toBeNull();
    });

    it('should set feature_description from description input', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
      });

      expect(session.feature_description).toBe('Add user authentication');
    });

    it('should set scope correctly', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
      });

      expect(session.scope).toBe('project:myapp');
    });

    it('should initialize timestamps', () => {
      const before = new Date();
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
      });
      const after = new Date();

      expect(session.started_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.started_at.getTime()).toBeLessThanOrEqual(after.getTime());
      expect(session.created_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.updated_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should create metrics when work_type is provided', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Add user authentication',
        scope: 'project:myapp',
        work_type: 'feature',
      });

      const metrics = store.getMetrics(session.id);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].work_type).toBe('feature');
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', () => {
      const session = store.getSession('non-existent-id');
      expect(session).toBeNull();
    });

    it('should return the session by id', () => {
      const created = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const retrieved = store.getSession(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.feature_id).toBe('feature/auth');
    });
  });

  describe('getActiveSession', () => {
    it('should return null when no active session', () => {
      const session = store.getActiveSession('project:myapp');
      expect(session).toBeNull();
    });

    it('should return the active session for scope', () => {
      store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const session = store.getActiveSession('project:myapp');
      expect(session).not.toBeNull();
      expect(session?.status).toBe('active');
    });

    it('should not return sessions from different scopes', () => {
      store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:other',
      });

      const session = store.getActiveSession('project:myapp');
      expect(session).toBeNull();
    });

    it('should return paused sessions as active', () => {
      const created = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(created.id, 'paused');

      const session = store.getActiveSession('project:myapp');
      expect(session).not.toBeNull();
      expect(session?.status).toBe('paused');
    });

    it('should not return completed sessions', () => {
      const created = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(created.id, 'completed');

      const session = store.getActiveSession('project:myapp');
      expect(session).toBeNull();
    });
  });

  describe('getSegments', () => {
    it('should return empty array for non-existent session', () => {
      const segments = store.getSegments('non-existent-id');
      expect(segments).toEqual([]);
    });

    it('should return segments ordered by started_at', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      // Close first segment and create second
      store.endCurrentSegment(session.id, 'pause');
      store.createNewSegment(session.id, 'resume');

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(2);
      expect(segments[0].started_at.getTime()).toBeLessThanOrEqual(
        segments[1].started_at.getTime()
      );
    });
  });

  describe('getMetrics', () => {
    it('should return empty array for session without metrics', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const metrics = store.getMetrics(session.id);
      expect(metrics).toEqual([]);
    });

    it('should return metrics for session', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
        work_type: 'bugfix',
      });

      const metrics = store.getMetrics(session.id);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].work_type).toBe('bugfix');
    });
  });

  describe('updateSessionStatus', () => {
    it('should update session status', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(session.id, 'paused');

      const updated = store.getSession(session.id);
      expect(updated?.status).toBe('paused');
    });

    it('should set completed_at when status is completed', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(session.id, 'completed');

      const updated = store.getSession(session.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completed_at).not.toBeNull();
    });

    it('should update updated_at timestamp', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const originalUpdatedAt = session.updated_at;

      // Small delay to ensure timestamp difference
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      return delay(10).then(() => {
        store.updateSessionStatus(session.id, 'paused');
        const updated = store.getSession(session.id);
        expect(updated?.updated_at.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      });
    });
  });

  describe('updateTotalActiveSeconds', () => {
    it('should update total_active_seconds', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateTotalActiveSeconds(session.id, 3600);

      const updated = store.getSession(session.id);
      expect(updated?.total_active_seconds).toBe(3600);
    });
  });

  describe('endCurrentSegment', () => {
    it('should close the current open segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.endCurrentSegment(session.id, 'pause');

      const segments = store.getSegments(session.id);
      expect(segments[0].ended_at).not.toBeNull();
      expect(segments[0].trigger_end).toBe('pause');
    });
  });

  describe('createNewSegment', () => {
    it('should create a new segment', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.endCurrentSegment(session.id, 'pause');
      store.createNewSegment(session.id, 'resume');

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(2);
      expect(segments[1].trigger_start).toBe('resume');
      expect(segments[1].ended_at).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should return sessions for a scope', () => {
      store.createSession({
        feature_id: 'feature/auth',
        description: 'Test 1',
        scope: 'project:myapp',
      });
      store.createSession({
        feature_id: 'feature/other',
        description: 'Test 2',
        scope: 'project:other',
      });

      const sessions = store.listSessions({ scope: 'project:myapp' });
      expect(sessions).toHaveLength(1);
      expect(sessions[0].feature_id).toBe('feature/auth');
    });

    it('should filter by status', () => {
      const session1 = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test 1',
        scope: 'project:myapp',
      });
      store.createSession({
        feature_id: 'feature/other',
        description: 'Test 2',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(session1.id, 'completed');

      const activeSessions = store.listSessions({ scope: 'project:myapp', status: 'active' });
      expect(activeSessions).toHaveLength(1);
      expect(activeSessions[0].feature_id).toBe('feature/other');
    });

    it('should respect limit', () => {
      for (let i = 0; i < 5; i++) {
        store.createSession({
          feature_id: `feature/${i}`,
          description: `Test ${i}`,
          scope: 'project:myapp',
        });
      }

      const sessions = store.listSessions({ scope: 'project:myapp', limit: 3 });
      expect(sessions).toHaveLength(3);
    });

    it('should order by updated_at descending', () => {
      const session1 = store.createSession({
        feature_id: 'feature/first',
        description: 'Test 1',
        scope: 'project:myapp',
      });
      store.createSession({
        feature_id: 'feature/second',
        description: 'Test 2',
        scope: 'project:myapp',
      });

      // Update first session to make it more recent
      store.updateSessionStatus(session1.id, 'paused');

      const sessions = store.listSessions({ scope: 'project:myapp' });
      expect(sessions[0].feature_id).toBe('feature/first');
    });
  });

  describe('updateSessionNotes', () => {
    it('should update session notes', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionNotes(session.id, 'Some notes about the work');

      const updated = store.getSession(session.id);
      expect(updated?.notes).toBe('Some notes about the work');
    });
  });

  describe('updateSessionSatisfaction', () => {
    it('should update session satisfaction', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionSatisfaction(session.id, 4);

      const updated = store.getSession(session.id);
      expect(updated?.satisfaction).toBe(4);
    });
  });

  describe('addMetrics', () => {
    it('should add metrics to a session', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.addMetrics(session.id, {
        files_touched: 5,
        lines_added: 100,
        lines_removed: 20,
        complexity_rating: 4,
        work_type: 'feature',
      });

      const metrics = store.getMetrics(session.id);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].files_touched).toBe(5);
      expect(metrics[0].lines_added).toBe(100);
      expect(metrics[0].lines_removed).toBe(20);
      expect(metrics[0].complexity_rating).toBe(4);
      expect(metrics[0].work_type).toBe('feature');
    });
  });

  describe('pauseSession', () => {
    it('should end the current segment and update status', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const paused = store.pauseSession(session.id, 'break');

      expect(paused.status).toBe('paused');
      expect(paused.total_active_seconds).toBeGreaterThanOrEqual(0);

      const segments = store.getSegments(session.id);
      expect(segments[0].ended_at).not.toBeNull();
      expect(segments[0].trigger_end).toBe('break');
    });

    it('should throw error if session not found', () => {
      expect(() => store.pauseSession('non-existent', 'break')).toThrow();
    });

    it('should throw error if session is not active', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.updateSessionStatus(session.id, 'completed');

      expect(() => store.pauseSession(session.id, 'break')).toThrow();
    });
  });

  describe('resumeSession', () => {
    it('should create a new segment and set status to active', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.pauseSession(session.id, 'break');
      const resumed = store.resumeSession(session.id);

      expect(resumed.status).toBe('active');

      const segments = store.getSegments(session.id);
      expect(segments).toHaveLength(2);
      expect(segments[1].trigger_start).toBe('resume');
    });

    it('should throw error if session not found', () => {
      expect(() => store.resumeSession('non-existent')).toThrow();
    });

    it('should throw error if session is not paused', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      expect(() => store.resumeSession(session.id)).toThrow();
    });
  });

  describe('completeSession', () => {
    it('should finalize the session with metrics', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const completed = store.completeSession(session.id, {
        satisfaction: 4,
        notes: 'Went well',
        metrics: {
          files_touched: 5,
          lines_added: 120,
          lines_removed: 30,
          complexity_rating: 3,
          work_type: 'feature',
        },
      });

      expect(completed.status).toBe('completed');
      expect(completed.completed_at).not.toBeNull();
      expect(completed.satisfaction).toBe(4);
      expect(completed.notes).toBe('Went well');

      const metrics = store.getMetrics(session.id);
      expect(metrics).not.toBeNull();
      expect(metrics.length).toBeGreaterThan(0);
      expect(metrics[metrics.length - 1].files_touched).toBe(5);
    });

    it('should throw error if session not found', () => {
      expect(() => store.completeSession('non-existent', {})).toThrow();
    });

    it('should complete session without optional fields', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      const completed = store.completeSession(session.id, {});

      expect(completed.status).toBe('completed');
      expect(completed.completed_at).not.toBeNull();
    });

    it('should end current segment on completion', () => {
      const session = store.createSession({
        feature_id: 'feature/auth',
        description: 'Test',
        scope: 'project:myapp',
      });

      store.completeSession(session.id, {});

      const segments = store.getSegments(session.id);
      expect(segments[0].ended_at).not.toBeNull();
      expect(segments[0].trigger_end).toBe('session_complete');
    });
  });
});
