import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface ConfigStatus {
  status: 'configured' | 'missing';
  apiKey?: string;
  configPath: string;
}

export async function checkConfig(): Promise<ConfigStatus> {
  const configPath = path.join(
    os.homedir(),
    '.claude',
    'perplexity-search',
    'config.json'
  );

  // Check environment variable first
  if (process.env.PERPLEXITY_API_KEY) {
    return {
      status: 'configured',
      apiKey: process.env.PERPLEXITY_API_KEY,
      configPath,
    };
  }

  // Check config file
  try {
    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    if (config.apiKey) {
      return {
        status: 'configured',
        apiKey: config.apiKey,
        configPath,
      };
    }
  } catch {
    // Config doesn't exist or is invalid
  }

  return { status: 'missing', configPath };
}

export function getMissingConfigMessage(configPath: string): string {
  return `
[Perplexity Search] Configuration required.

To set up, run one of:

  1. Set environment variable:
     export PERPLEXITY_API_KEY=pplx-your-key-here

  2. Create config file at ${configPath}:
     {"apiKey": "pplx-your-key-here"}

  3. Run interactive setup:
     node ${process.argv[1]} --setup

Get your API key at: https://www.perplexity.ai/settings/api
`.trim();
}
