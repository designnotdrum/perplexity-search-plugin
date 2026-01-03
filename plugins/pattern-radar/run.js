#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const os = require('os');

const root = __dirname;
process.chdir(root);

// Install dependencies if needed
if (!existsSync(join(root, 'node_modules'))) {
  console.error('[pattern-radar] Installing dependencies...');
  execSync('npm install --legacy-peer-deps', { stdio: 'inherit' });
}

// Build if needed
if (!existsSync(join(root, 'dist'))) {
  console.error('[pattern-radar] Building...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Check for radar-specific config
const configDir = join(os.homedir(), '.config', 'brain-jar');
const radarConfigPath = join(configDir, 'pattern-radar.json');
const brainJarConfigPath = join(configDir, 'config.json');

async function promptForConfig() {
  const { input, confirm } = await import('@inquirer/prompts');

  console.error('\n📡 Pattern Radar Setup\n');
  console.error('Pattern Radar scans tech trends from multiple sources.');
  console.error('It works best with the shared-memory plugin for profile data.\n');

  // Check if shared-memory config exists
  const hasSharedMemory = existsSync(brainJarConfigPath);
  if (hasSharedMemory) {
    console.error('✅ Found brain-jar config. Profile integration enabled.\n');
  } else {
    console.error('ℹ️  No shared-memory config found.');
    console.error('   Install shared-memory plugin for profile-aware recommendations.\n');
  }

  // Optional: GitHub token for higher rate limits
  console.error('GitHub API (optional - for higher rate limits):');
  console.error('Create a token at https://github.com/settings/tokens\n');

  const githubToken = await input({
    message: 'Enter GitHub token (or press Enter to skip):',
  });

  if (githubToken && githubToken.trim()) {
    mkdirSync(configDir, { recursive: true });
    const config = existsSync(radarConfigPath)
      ? JSON.parse(readFileSync(radarConfigPath, 'utf-8'))
      : {};
    config.github_token = githubToken.trim();
    writeFileSync(radarConfigPath, JSON.stringify(config, null, 2));
    console.error('\n✅ GitHub token saved. Higher rate limits enabled.\n');
  } else {
    console.error('\n✅ Using anonymous GitHub API (60 requests/hour).\n');
  }
}

async function main() {
  // If no config and running in a TTY, prompt for optional config
  if (process.stdin.isTTY && !existsSync(radarConfigPath)) {
    await promptForConfig();
  }

  // Start the MCP server
  require('./dist/index.js');
}

main().catch(err => {
  console.error('[pattern-radar] Error:', err.message);
  process.exit(1);
});
