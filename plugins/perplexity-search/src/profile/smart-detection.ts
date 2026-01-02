import type { UserProfile } from '../types';

interface Pattern {
  regex: RegExp;
  category: 'language' | 'framework' | 'tool' | 'pattern' | 'learning' | 'expert' | 'proficient' | 'domain' | 'project';
  extract: (match: RegExpMatchArray) => { key?: string; value: string };
}

export class SmartDetector {
  private patterns: Pattern[] = [
    // Languages
    {
      regex: /\b(TypeScript|JavaScript|Python|Java|Go|Rust|C\+\+|Ruby|PHP|Swift|Kotlin|C#|Scala|Haskell|Elixir)\b/g,
      category: 'language',
      extract: (match) => ({ value: match[1] })
    },

    // Frameworks
    {
      regex: /\b(React|Vue|Angular|Express|Django|Flask|Rails|Spring|Next\.js|Nuxt|Svelte|FastAPI|NestJS)\b/g,
      category: 'framework',
      extract: (match) => ({ value: match[1] })
    },

    // Tools
    {
      regex: /\b(Docker|Kubernetes|Git|PostgreSQL|MongoDB|Redis|Webpack|Vite|Jest|Vitest|Playwright|Cypress)\b/g,
      category: 'tool',
      extract: (match) => ({ value: match[1] })
    },

    // Patterns
    {
      regex: /\b(MVC|MVVM|microservices|monolith|REST|GraphQL|event-driven|functional programming|OOP|TDD|BDD)\b/gi,
      category: 'pattern',
      extract: (match) => ({ value: match[1] })
    },

    // Learning topics
    {
      regex: /(?:want to learn|learning|study|improve my understanding of)\s+([^.,!?]+)/gi,
      category: 'learning',
      extract: (match) => ({ value: match[1].trim() })
    },

    // Expert topics
    {
      regex: /(?:expert at|expert in|very experienced with|mastered)\s+([^.,!?]+)/gi,
      category: 'expert',
      extract: (match) => ({ value: match[1].trim() })
    },

    // Proficient topics
    {
      regex: /(?:proficient at|proficient in|good at|comfortable with|experienced with)\s+([^.,!?]+)/gi,
      category: 'proficient',
      extract: (match) => ({ value: match[1].trim() })
    },

    // Domains
    {
      regex: /\b(web development|mobile development|data science|machine learning|DevOps|security|blockchain|IoT|cloud computing|AI)\b/gi,
      category: 'domain',
      extract: (match) => ({ value: match[1] })
    },

    // Projects
    {
      regex: /(?:working on|building|developing)\s+(?:a\s+|an\s+)?([^.,!?]+)/gi,
      category: 'project',
      extract: (match) => ({ value: match[1].trim() })
    }
  ];

  detectAndUpdate(text: string, profile: UserProfile): UserProfile {
    let updated = false;
    const newProfile: UserProfile = {
      version: profile.version,
      lastUpdated: profile.lastUpdated,
      lastRefresh: profile.lastRefresh,
      profile: {
        technicalPreferences: {
          languages: [...profile.profile.technicalPreferences.languages],
          frameworks: [...profile.profile.technicalPreferences.frameworks],
          tools: [...profile.profile.technicalPreferences.tools],
          patterns: [...profile.profile.technicalPreferences.patterns]
        },
        workingStyle: {
          explanationPreference: profile.profile.workingStyle.explanationPreference,
          communicationStyle: profile.profile.workingStyle.communicationStyle,
          priorities: [...profile.profile.workingStyle.priorities]
        },
        projectContext: {
          domains: [...profile.profile.projectContext.domains],
          currentProjects: [...profile.profile.projectContext.currentProjects],
          commonTasks: [...profile.profile.projectContext.commonTasks]
        },
        knowledgeLevel: {
          expert: [...profile.profile.knowledgeLevel.expert],
          proficient: [...profile.profile.knowledgeLevel.proficient],
          learning: [...profile.profile.knowledgeLevel.learning]
        }
      }
    };

    for (const pattern of this.patterns) {
      const matches = Array.from(text.matchAll(pattern.regex));

      for (const match of matches) {
        const extracted = pattern.extract(match);
        const value = extracted.value;

        switch (pattern.category) {
          case 'language':
            if (!newProfile.profile.technicalPreferences.languages.includes(value)) {
              newProfile.profile.technicalPreferences.languages.push(value);
              updated = true;
            }
            break;

          case 'framework':
            if (!newProfile.profile.technicalPreferences.frameworks.includes(value)) {
              newProfile.profile.technicalPreferences.frameworks.push(value);
              updated = true;
            }
            break;

          case 'tool':
            if (!newProfile.profile.technicalPreferences.tools.includes(value)) {
              newProfile.profile.technicalPreferences.tools.push(value);
              updated = true;
            }
            break;

          case 'pattern':
            if (!newProfile.profile.technicalPreferences.patterns.includes(value)) {
              newProfile.profile.technicalPreferences.patterns.push(value);
              updated = true;
            }
            break;

          case 'learning': {
            // Split by "and" to handle multiple topics in one sentence
            const topics = value.split(/\s+and\s+/);
            for (const topic of topics) {
              const trimmedTopic = topic.trim()
                .replace(/^(?:want to learn|learning|study|improve my understanding of)\s+/i, '');
              if (trimmedTopic && !newProfile.profile.knowledgeLevel.learning.includes(trimmedTopic)) {
                newProfile.profile.knowledgeLevel.learning.push(trimmedTopic);
                updated = true;
              }
            }
            break;
          }

          case 'expert': {
            // Split by "and" to handle multiple topics in one sentence
            const topics = value.split(/\s+and\s+/);
            for (const topic of topics) {
              const trimmedTopic = topic.trim()
                .replace(/^(?:expert at|expert in|very experienced with|mastered)\s+/i, '');
              if (trimmedTopic && !newProfile.profile.knowledgeLevel.expert.includes(trimmedTopic)) {
                newProfile.profile.knowledgeLevel.expert.push(trimmedTopic);
                updated = true;
              }
            }
            break;
          }

          case 'proficient': {
            // Split by "and" to handle multiple topics in one sentence
            const topics = value.split(/\s+and\s+/);
            for (const topic of topics) {
              const trimmedTopic = topic.trim()
                .replace(/^(?:proficient at|proficient in|good at|comfortable with|experienced with)\s+/i, '');
              if (trimmedTopic && !newProfile.profile.knowledgeLevel.proficient.includes(trimmedTopic)) {
                newProfile.profile.knowledgeLevel.proficient.push(trimmedTopic);
                updated = true;
              }
            }
            break;
          }

          case 'domain':
            if (!newProfile.profile.projectContext.domains.includes(value)) {
              newProfile.profile.projectContext.domains.push(value);
              updated = true;
            }
            break;

          case 'project': {
            // Split by "and" to handle multiple projects in one sentence
            const projects = value.split(/\s+and\s+/);
            for (const project of projects) {
              const trimmedProject = project.trim()
                .replace(/^(?:working on|building|developing)\s+(?:a\s+|an\s+)?/i, '');
              if (trimmedProject && !newProfile.profile.projectContext.currentProjects.includes(trimmedProject)) {
                newProfile.profile.projectContext.currentProjects.push(trimmedProject);
                updated = true;
              }
            }
            break;
          }
        }
      }
    }

    if (updated) {
      newProfile.lastUpdated = new Date().toISOString();
    }

    return newProfile;
  }
}
