/**
 * Scope detection utilities for brain-jar plugins.
 * Automatically detects project context from the current working directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ScopeDetectionResult {
  scope: string;
  projectName?: string;
  gitRoot?: string;
  source: 'package.json' | 'Cargo.toml' | 'pyproject.toml' | 'go.mod' | 'git' | 'directory' | 'none';
}

/**
 * Find the git root directory by walking up from the given directory.
 */
function findGitRoot(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Try to extract a project name from a marker file.
 */
function tryExtractName(
  dir: string,
  marker: { file: string; extract: (content: string) => string | undefined }
): string | undefined {
  const filePath = path.join(dir, marker.file);

  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return marker.extract(content);
  } catch {
    return undefined;
  }
}

/**
 * Simple TOML parser for extracting package/project names.
 * Only handles the specific cases we need (not a full TOML parser).
 */
function parseTomlName(content: string, section: string, key: string): string | undefined {
  // Match [section] followed by key = "value" or key = 'value'
  const sectionRegex = new RegExp(`\\[${section}\\]([\\s\\S]*?)(?=\\n\\[|$)`, 'm');
  const sectionMatch = content.match(sectionRegex);

  if (!sectionMatch) {
    return undefined;
  }

  const sectionContent = sectionMatch[1];
  const keyRegex = new RegExp(`^\\s*${key}\\s*=\\s*["']([^"']+)["']`, 'm');
  const keyMatch = sectionContent.match(keyRegex);

  return keyMatch?.[1];
}

/**
 * Project markers in priority order.
 */
const PROJECT_MARKERS = [
  {
    file: 'package.json',
    extract: (content: string): string | undefined => {
      try {
        const pkg = JSON.parse(content);
        // Skip generic names
        if (pkg.name && pkg.name !== 'undefined' && !pkg.name.startsWith('@types/')) {
          return pkg.name;
        }
      } catch {
        // Invalid JSON
      }
      return undefined;
    },
  },
  {
    file: 'Cargo.toml',
    extract: (content: string): string | undefined => {
      return parseTomlName(content, 'package', 'name');
    },
  },
  {
    file: 'pyproject.toml',
    extract: (content: string): string | undefined => {
      // Try [project] first (PEP 621), then [tool.poetry]
      return (
        parseTomlName(content, 'project', 'name') ||
        parseTomlName(content, 'tool.poetry', 'name')
      );
    },
  },
  {
    file: 'go.mod',
    extract: (content: string): string | undefined => {
      const match = content.match(/^module\s+(\S+)/m);
      if (match) {
        // Extract just the last part of the module path
        const parts = match[1].split('/');
        return parts[parts.length - 1];
      }
      return undefined;
    },
  },
];

/**
 * Detect the current project scope based on the working directory.
 *
 * Detection order:
 * 1. Find git root (if any)
 * 2. Check for project markers (package.json, Cargo.toml, etc.)
 * 3. Fall back to git directory name
 * 4. Return "global" if no project detected
 *
 * @param cwd - Directory to check (defaults to process.cwd())
 * @returns Scope string like "project:brain-jar" or "global"
 */
export function detectScope(cwd?: string): string {
  const result = detectScopeWithDetails(cwd);
  return result.scope;
}

/**
 * Detect scope with full details about how it was determined.
 *
 * @param cwd - Directory to check (defaults to process.cwd())
 * @returns Full detection result with scope, project name, and source
 */
export function detectScopeWithDetails(cwd?: string): ScopeDetectionResult {
  const dir = cwd || process.cwd();

  // 1. Find git root
  const gitRoot = findGitRoot(dir);
  const searchDir = gitRoot || dir;

  // 2. Check project markers
  for (const marker of PROJECT_MARKERS) {
    const name = tryExtractName(searchDir, marker);
    if (name) {
      return {
        scope: `project:${sanitizeProjectName(name)}`,
        projectName: name,
        gitRoot: gitRoot || undefined,
        source: marker.file as ScopeDetectionResult['source'],
      };
    }
  }

  // 3. Fall back to git directory name
  if (gitRoot) {
    const dirName = path.basename(gitRoot);
    return {
      scope: `project:${sanitizeProjectName(dirName)}`,
      projectName: dirName,
      gitRoot,
      source: 'git',
    };
  }

  // 4. No project detected
  return {
    scope: 'global',
    source: 'none',
  };
}

/**
 * Sanitize a project name for use in a scope string.
 * Removes characters that might cause issues in queries.
 */
function sanitizeProjectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^@/, '') // Remove leading @ from scoped packages
    .replace(/\//g, '-') // Replace / with -
    .replace(/[^a-z0-9-_.]/g, '') // Remove other special chars
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing dashes
}

/**
 * Validate a scope string format.
 *
 * @param scope - Scope string to validate
 * @returns true if valid, false otherwise
 */
export function isValidScope(scope: string): boolean {
  if (scope === 'global') {
    return true;
  }

  if (scope.startsWith('project:')) {
    const projectName = scope.slice(8);
    // Must have a name, only allowed characters
    return projectName.length > 0 && /^[a-z0-9-_.]+$/.test(projectName);
  }

  return false;
}

/**
 * Parse a scope string into its components.
 *
 * @param scope - Scope string to parse
 * @returns Object with type and optional project name
 */
export function parseScope(scope: string): { type: 'global' | 'project'; projectName?: string } {
  if (scope === 'global') {
    return { type: 'global' };
  }

  if (scope.startsWith('project:')) {
    return {
      type: 'project',
      projectName: scope.slice(8),
    };
  }

  // Invalid format, treat as global
  return { type: 'global' };
}
