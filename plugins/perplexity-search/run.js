#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const { join } = require('path');
const os = require('os');

const root = __dirname;
process.chdir(root);

// Install dependencies if needed
if (!existsSync(join(root, 'node_modules'))) {
  console.error('[perplexity-search] Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
}

// Build if needed
if (!existsSync(join(root, 'dist'))) {
  console.error('[perplexity-search] Building...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Check if config exists
const configDir = join(os.homedir(), '.claude', 'perplexity-search');
const configPath = join(configDir, 'config.json');

async function promptForConfig() {
  const { input } = await import('@inquirer/prompts');

  console.error('\n🔍 Perplexity Search Setup\n');
  console.error('To get your Perplexity API key:');
  console.error('1. Go to https://www.perplexity.ai/settings/api');
  console.error('2. Create an API key');
  console.error('3. Copy your key (starts with pplx-)\n');

  const apiKey = await input({
    message: 'Enter your Perplexity API key:',
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return 'API key is required for Perplexity search';
      }
      if (!value.startsWith('pplx-')) {
        return 'Perplexity API keys typically start with "pplx-"';
      }
      return true;
    },
  });

  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({
    apiKey: apiKey.trim(),
    defaultMaxResults: 5
  }, null, 2));
  console.error('\n✅ Configuration saved!\n');
}

async function main() {
  // If no config and running in a TTY, prompt for it
  if (!existsSync(configPath)) {
    if (process.stdin.isTTY) {
      await promptForConfig();
    } else {
      // Non-interactive - log error and exit (perplexity requires API key)
      console.error('[perplexity-search] No config found. API key required.');
      console.error('[perplexity-search] To configure, run: node ' + __filename);
      process.exit(1);
    }
  }

  // Start the MCP server
  require('./dist/index.js');
}

main().catch(err => {
  console.error('[perplexity-search] Error:', err.message);
  process.exit(1);
});
