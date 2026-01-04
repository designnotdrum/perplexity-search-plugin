import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { detectScope, detectScopeWithDetails, isValidScope, parseScope } from './scope';

describe('scope detection', () => {
  describe('detectScope', () => {
    it('should detect brain-jar project from current directory', () => {
      // Running from brain-jar root, should detect package.json
      const scope = detectScope();
      expect(scope).toBe('project:brain-jar');
    });

    it('should detect project from a specific directory', () => {
      // Test with the core package directory
      const coreDir = path.join(__dirname);
      const scope = detectScope(coreDir);
      // Should still find brain-jar from git root
      expect(scope).toMatch(/^project:/);
    });
  });

  describe('detectScopeWithDetails', () => {
    it('should return full details about detection', () => {
      const result = detectScopeWithDetails();
      expect(result.scope).toBe('project:brain-jar');
      expect(result.projectName).toBe('brain-jar');
      expect(result.source).toBe('package.json');
      expect(result.gitRoot).toBeDefined();
    });
  });

  describe('isValidScope', () => {
    it('should accept "global"', () => {
      expect(isValidScope('global')).toBe(true);
    });

    it('should accept valid project scopes', () => {
      expect(isValidScope('project:brain-jar')).toBe(true);
      expect(isValidScope('project:my-app')).toBe(true);
      expect(isValidScope('project:app_v2')).toBe(true);
      expect(isValidScope('project:app.io')).toBe(true);
    });

    it('should reject invalid scopes', () => {
      expect(isValidScope('')).toBe(false);
      expect(isValidScope('project:')).toBe(false);
      expect(isValidScope('project:My App')).toBe(false); // spaces
      expect(isValidScope('project:app@2.0')).toBe(false); // @
      expect(isValidScope('random')).toBe(false);
    });
  });

  describe('parseScope', () => {
    it('should parse global scope', () => {
      expect(parseScope('global')).toEqual({ type: 'global' });
    });

    it('should parse project scope', () => {
      expect(parseScope('project:brain-jar')).toEqual({
        type: 'project',
        projectName: 'brain-jar',
      });
    });

    it('should treat invalid as global', () => {
      expect(parseScope('invalid')).toEqual({ type: 'global' });
    });
  });
});
