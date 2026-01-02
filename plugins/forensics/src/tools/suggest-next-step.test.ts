import { SuggestNextStepTool, InvestigationContext } from './suggest-next-step';

describe('SuggestNextStepTool', () => {
  let tool: SuggestNextStepTool;

  beforeEach(() => {
    tool = new SuggestNextStepTool();
  });

  describe('protocol mode', () => {
    it('suggests capture when no capture exists', () => {
      const context: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'beginner',
        hasCapture: false,
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('capture');
      expect(result.explanation).toBeDefined();
      expect(result.explanation.length).toBeGreaterThan(0);
    });

    it('suggests analysis when capture exists but no spec', () => {
      const context: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'beginner',
        hasCapture: true,
        hasSpec: false,
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('analy');
      expect(result.explanation).toBeDefined();
    });

    it('suggests implementation when spec exists', () => {
      const context: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'beginner',
        hasCapture: true,
        hasSpec: true,
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('implement');
      expect(result.explanation).toBeDefined();
    });
  });

  describe('skill level verbosity', () => {
    it('provides commands and tips for beginners', () => {
      const context: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'beginner',
        hasCapture: false,
      };

      const result = tool.suggest(context);

      expect(result.commands).toBeDefined();
      expect(result.commands!.length).toBeGreaterThan(0);
      expect(result.tips).toBeDefined();
      expect(result.tips!.length).toBeGreaterThan(0);
    });

    it('omits commands and tips for advanced users', () => {
      const context: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'advanced',
        hasCapture: false,
      };

      const result = tool.suggest(context);

      expect(result.commands).toBeUndefined();
      expect(result.tips).toBeUndefined();
    });

    it('provides shorter explanation for advanced users', () => {
      const beginnerContext: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'beginner',
        hasCapture: false,
      };

      const advancedContext: InvestigationContext = {
        mode: 'protocol',
        skillLevel: 'advanced',
        hasCapture: false,
      };

      const beginnerResult = tool.suggest(beginnerContext);
      const advancedResult = tool.suggest(advancedContext);

      expect(beginnerResult.explanation.length).toBeGreaterThan(
        advancedResult.explanation.length
      );
    });
  });

  describe('feature mode', () => {
    it('suggests research when no research exists', () => {
      const context: InvestigationContext = {
        mode: 'feature',
        skillLevel: 'beginner',
        hasResearch: false,
        targetFeature: 'authentication',
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('research');
      expect(result.explanation).toBeDefined();
    });

    it('suggests mapping when research exists', () => {
      const context: InvestigationContext = {
        mode: 'feature',
        skillLevel: 'beginner',
        hasResearch: true,
        targetFeature: 'authentication',
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('map');
      expect(result.explanation).toBeDefined();
    });
  });

  describe('codebase mode', () => {
    it('suggests entry point identification', () => {
      const context: InvestigationContext = {
        mode: 'codebase',
        skillLevel: 'beginner',
        targetCodebase: 'my-project',
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('entry');
      expect(result.explanation).toBeDefined();
    });
  });

  describe('decision mode', () => {
    it('suggests git history analysis', () => {
      const context: InvestigationContext = {
        mode: 'decision',
        skillLevel: 'beginner',
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('git');
      expect(result.explanation).toBeDefined();
    });
  });

  describe('format mode', () => {
    it('suggests byte pattern analysis', () => {
      const context: InvestigationContext = {
        mode: 'format',
        skillLevel: 'beginner',
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('byte');
      expect(result.explanation).toBeDefined();
    });
  });

  describe('default behavior', () => {
    it('suggests mode selection for unknown mode', () => {
      const context = {
        mode: 'unknown' as any,
        skillLevel: 'beginner' as const,
      };

      const result = tool.suggest(context);

      expect(result.step.toLowerCase()).toContain('mode');
      expect(result.explanation).toBeDefined();
    });
  });
});
