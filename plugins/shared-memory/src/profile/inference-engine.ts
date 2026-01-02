/**
 * InferenceEngine - Detects user preferences from text and codebase.
 *
 * Returns InferredPreference objects that require user confirmation
 * before being added to the profile.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { InferredPreference, UserProfile } from './types';

interface Pattern {
  regex: RegExp;
  field: string;
  confidence: 'high' | 'medium' | 'low';
  extract: (match: RegExpMatchArray) => string | string[];
}

export class InferenceEngine {
  private textPatterns: Pattern[] = [
    // Languages - explicit preferences
    {
      regex: /\b(?:I (?:prefer|love|use|like)|my favorite (?:language is|languages are))\s+([A-Za-z+#]+(?:\s*,\s*[A-Za-z+#]+)*)/gi,
      field: 'technical.languages',
      confidence: 'high',
      extract: (match) => this.splitList(match[1]),
    },
    // Languages - implicit from mentions
    {
      regex: /\b(TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Ruby|PHP|Swift|Kotlin|C#|Scala|Elixir)\b/g,
      field: 'technical.languages',
      confidence: 'low',
      extract: (match) => match[1],
    },

    // Frameworks
    {
      regex: /\b(?:I (?:prefer|use|like)|using)\s+(React|Vue|Angular|Express|Django|Flask|Rails|Spring|Next\.js|Nuxt|Svelte|FastAPI|NestJS)/gi,
      field: 'technical.frameworks',
      confidence: 'high',
      extract: (match) => match[1],
    },
    {
      regex: /\b(React|Vue|Angular|Express|Django|Flask|Rails|Spring|Next\.js|Nuxt|Svelte|FastAPI|NestJS)\b/g,
      field: 'technical.frameworks',
      confidence: 'low',
      extract: (match) => match[1],
    },

    // Tools
    {
      regex: /\b(?:I (?:use|prefer))\s+(Docker|Kubernetes|PostgreSQL|MongoDB|Redis|Git)\b/gi,
      field: 'technical.tools',
      confidence: 'high',
      extract: (match) => match[1],
    },

    // Editors
    {
      regex: /\b(?:I (?:use|prefer)|my editor is)\s+(VS Code|VSCode|Neovim|Vim|Emacs|JetBrains|Cursor|Zed|Sublime)/gi,
      field: 'technical.editors',
      confidence: 'high',
      extract: (match) => match[1],
    },

    // Expertise
    {
      regex: /(?:I(?:'m| am) (?:an? )?expert (?:at|in|with)|I've mastered|very experienced with)\s+([^.,!?]+)/gi,
      field: 'knowledge.expert',
      confidence: 'high',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Proficiency
    {
      regex: /(?:I(?:'m| am) (?:proficient|good|comfortable) (?:at|in|with)|experienced with)\s+([^.,!?]+)/gi,
      field: 'knowledge.proficient',
      confidence: 'high',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Learning
    {
      regex: /(?:I(?:'m| am) learning|want to learn|studying|trying to improve my)\s+([^.,!?]+)/gi,
      field: 'knowledge.learning',
      confidence: 'high',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Technical interests
    {
      regex: /(?:I(?:'m| am) interested in|fascinated by|curious about)\s+([^.,!?]+)/gi,
      field: 'knowledge.interests',
      confidence: 'medium',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Personal goals
    {
      regex: /(?:my goal is to|I want to|I(?:'m| am) trying to|working toward)\s+([^.,!?]+)/gi,
      field: 'personal.goals',
      confidence: 'high',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Personal interests/hobbies
    {
      regex: /(?:I (?:love|enjoy|like) (?:doing )?|my hobbies? (?:is|are|include))\s+([^.,!?]+)/gi,
      field: 'personal.interests',
      confidence: 'medium',
      extract: (match) => this.cleanTopic(match[1]),
    },

    // Working style - verbosity
    {
      regex: /(?:keep it|prefer|I like) (?:brief|concise|short|to the point)/gi,
      field: 'workingStyle.verbosity',
      confidence: 'high',
      extract: () => 'concise',
    },
    {
      regex: /(?:I (?:prefer|like)|give me) (?:detailed|thorough|comprehensive) (?:explanations?|answers?)/gi,
      field: 'workingStyle.verbosity',
      confidence: 'high',
      extract: () => 'detailed',
    },

    // Working style - pace
    {
      regex: /(?:I(?:'m| am) a )?fast learner|quick learner|get to the point/gi,
      field: 'workingStyle.learningPace',
      confidence: 'medium',
      extract: () => 'fast',
    },
    {
      regex: /(?:step by step|take (?:it |your )?time|thorough(?:ly)?|in detail)/gi,
      field: 'workingStyle.learningPace',
      confidence: 'medium',
      extract: () => 'thorough',
    },

    // Role
    {
      regex: /I(?:'m| am) (?:a |an )?(developer|engineer|designer|PM|product manager|founder|student|researcher)/gi,
      field: 'identity.role',
      confidence: 'high',
      extract: (match) => match[1],
    },

    // Name
    {
      regex: /(?:my name is|I(?:'m| am)|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
      field: 'identity.name',
      confidence: 'high',
      extract: (match) => match[1].trim(),
    },

    // Timezone
    {
      regex: /(?:I(?:'m| am) in|my timezone is|I live in)\s+((?:America|Europe|Asia|Pacific|Australia)\/[A-Za-z_]+|[A-Z]{2,4})/gi,
      field: 'identity.timezone',
      confidence: 'high',
      extract: (match) => match[1],
    },
  ];

  /**
   * Detects potential preferences from text input.
   * Returns inferences that should be confirmed with the user.
   */
  detectFromText(text: string, profile: UserProfile): Omit<InferredPreference, 'id' | 'status' | 'createdAt'>[] {
    const inferences: Omit<InferredPreference, 'id' | 'status' | 'createdAt'>[] = [];
    const seen = new Set<string>();

    for (const pattern of this.textPatterns) {
      const matches = Array.from(text.matchAll(pattern.regex));

      for (const match of matches) {
        const value = pattern.extract(match);
        const values = Array.isArray(value) ? value : [value];

        for (const v of values) {
          if (!v || v.length < 2) continue;

          // Check if already in profile
          if (this.isAlreadyInProfile(profile, pattern.field, v)) continue;

          // Dedupe within this detection run
          const key = `${pattern.field}:${v.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);

          inferences.push({
            field: pattern.field,
            value: v,
            confidence: pattern.confidence,
            evidence: this.truncateEvidence(match[0]),
            source: 'conversation',
          });
        }
      }
    }

    return inferences;
  }

  /**
   * Analyzes codebase to infer tech preferences.
   * Scans package.json, config files, etc.
   */
  async detectFromCodebase(cwd: string, profile: UserProfile): Promise<Omit<InferredPreference, 'id' | 'status' | 'createdAt'>[]> {
    const inferences: Omit<InferredPreference, 'id' | 'status' | 'createdAt'>[] = [];

    // Check package.json
    try {
      const pkgPath = path.join(cwd, 'package.json');
      const pkgData = await fs.readFile(pkgPath, 'utf-8');
      const pkg = JSON.parse(pkgData);

      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Detect frameworks
      const frameworkMap: Record<string, string> = {
        react: 'React',
        vue: 'Vue',
        angular: 'Angular',
        next: 'Next.js',
        nuxt: 'Nuxt',
        svelte: 'Svelte',
        express: 'Express',
        fastify: 'Fastify',
        nestjs: 'NestJS',
      };

      for (const [dep, framework] of Object.entries(frameworkMap)) {
        if (deps[dep] && !this.isAlreadyInProfile(profile, 'technical.frameworks', framework)) {
          inferences.push({
            field: 'technical.frameworks',
            value: framework,
            confidence: 'high',
            evidence: `Found ${dep} in package.json`,
            source: 'codebase',
          });
        }
      }

      // Detect TypeScript
      if (deps.typescript && !this.isAlreadyInProfile(profile, 'technical.languages', 'TypeScript')) {
        inferences.push({
          field: 'technical.languages',
          value: 'TypeScript',
          confidence: 'high',
          evidence: 'Found typescript in package.json',
          source: 'codebase',
        });
      }

      // Detect tools
      const toolMap: Record<string, string> = {
        jest: 'Jest',
        vitest: 'Vitest',
        playwright: 'Playwright',
        cypress: 'Cypress',
        prettier: 'Prettier',
        eslint: 'ESLint',
        webpack: 'Webpack',
        vite: 'Vite',
        docker: 'Docker',
      };

      for (const [dep, tool] of Object.entries(toolMap)) {
        if (deps[dep] && !this.isAlreadyInProfile(profile, 'technical.tools', tool)) {
          inferences.push({
            field: 'technical.tools',
            value: tool,
            confidence: 'medium',
            evidence: `Found ${dep} in package.json`,
            source: 'codebase',
          });
        }
      }
    } catch {
      // No package.json or error reading it
    }

    // Check for Python
    try {
      const reqPath = path.join(cwd, 'requirements.txt');
      await fs.access(reqPath);
      if (!this.isAlreadyInProfile(profile, 'technical.languages', 'Python')) {
        inferences.push({
          field: 'technical.languages',
          value: 'Python',
          confidence: 'high',
          evidence: 'Found requirements.txt',
          source: 'codebase',
        });
      }
    } catch {
      // No requirements.txt
    }

    // Check pyproject.toml
    try {
      const pyprojectPath = path.join(cwd, 'pyproject.toml');
      await fs.access(pyprojectPath);
      if (!this.isAlreadyInProfile(profile, 'technical.languages', 'Python')) {
        inferences.push({
          field: 'technical.languages',
          value: 'Python',
          confidence: 'high',
          evidence: 'Found pyproject.toml',
          source: 'codebase',
        });
      }
    } catch {
      // No pyproject.toml
    }

    // Check for Go
    try {
      const goModPath = path.join(cwd, 'go.mod');
      await fs.access(goModPath);
      if (!this.isAlreadyInProfile(profile, 'technical.languages', 'Go')) {
        inferences.push({
          field: 'technical.languages',
          value: 'Go',
          confidence: 'high',
          evidence: 'Found go.mod',
          source: 'codebase',
        });
      }
    } catch {
      // No go.mod
    }

    // Check for Rust
    try {
      const cargoPath = path.join(cwd, 'Cargo.toml');
      await fs.access(cargoPath);
      if (!this.isAlreadyInProfile(profile, 'technical.languages', 'Rust')) {
        inferences.push({
          field: 'technical.languages',
          value: 'Rust',
          confidence: 'high',
          evidence: 'Found Cargo.toml',
          source: 'codebase',
        });
      }
    } catch {
      // No Cargo.toml
    }

    // Check for editor configs
    try {
      await fs.access(path.join(cwd, '.vscode'));
      if (!this.isAlreadyInProfile(profile, 'technical.editors', 'VS Code')) {
        inferences.push({
          field: 'technical.editors',
          value: 'VS Code',
          confidence: 'medium',
          evidence: 'Found .vscode directory',
          source: 'codebase',
        });
      }
    } catch {
      // No .vscode
    }

    try {
      await fs.access(path.join(cwd, '.idea'));
      if (!this.isAlreadyInProfile(profile, 'technical.editors', 'JetBrains')) {
        inferences.push({
          field: 'technical.editors',
          value: 'JetBrains',
          confidence: 'medium',
          evidence: 'Found .idea directory',
          source: 'codebase',
        });
      }
    } catch {
      // No .idea
    }

    // Check git config for name
    try {
      const gitConfigPath = path.join(cwd, '.git', 'config');
      const gitConfig = await fs.readFile(gitConfigPath, 'utf-8');
      const nameMatch = gitConfig.match(/name\s*=\s*(.+)/);
      if (nameMatch && !profile.identity.name) {
        const name = nameMatch[1].trim();
        if (name && !name.includes('@')) {
          inferences.push({
            field: 'identity.name',
            value: name,
            confidence: 'medium',
            evidence: 'Found name in .git/config',
            source: 'config',
          });
        }
      }
    } catch {
      // No git config or error
    }

    return inferences;
  }

  /**
   * Checks if a value is already in the profile.
   */
  private isAlreadyInProfile(profile: UserProfile, field: string, value: string): boolean {
    const parts = field.split('.');
    let current: unknown = profile;

    for (const part of parts) {
      if (current === null || current === undefined) return false;
      current = (current as Record<string, unknown>)[part];
    }

    if (Array.isArray(current)) {
      return current.some((v) => v.toLowerCase() === value.toLowerCase());
    }

    if (typeof current === 'string') {
      return current.toLowerCase() === value.toLowerCase();
    }

    return false;
  }

  /**
   * Splits a comma-separated list into array.
   */
  private splitList(text: string): string[] {
    return text
      .split(/\s*,\s*|\s+and\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /**
   * Cleans up extracted topic text.
   */
  private cleanTopic(text: string): string {
    return text
      .trim()
      .replace(/^(?:about|how to|to)\s+/i, '')
      .replace(/\s+$/, '');
  }

  /**
   * Truncates evidence to reasonable length.
   */
  private truncateEvidence(text: string, maxLength: number = 100): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
}
