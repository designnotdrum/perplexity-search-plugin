#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs');
const { join } = require('path');
const os = require('os');

const root = __dirname;
process.chdir(root);

// Install dependencies if needed
if (!existsSync(join(root, 'node_modules'))) {
  console.error('[visual-thinking] Installing dependencies...');
  execSync('npm install --legacy-peer-deps', { stdio: 'inherit' });
}

// Build if needed
if (!existsSync(join(root, 'dist'))) {
  console.error('[visual-thinking] Building...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Check if brain-jar config exists (shared with shared-memory)
const configDir = join(os.homedir(), '.config', 'brain-jar');
const configPath = join(configDir, 'config.json');

async function promptForConfig() {
  const { input } = await import('@inquirer/prompts');

  console.error('\n🎨 Brain-Jar Visual Thinking Setup\n');
  console.error('Visual-thinking works locally without Mem0.');
  console.error('For cloud sync (diagrams available on all machines),');
  console.error('configure Mem0 via the shared-memory plugin.\n');

  const existing = existsSync(configPath);
  if (existing) {
    console.error('✅ Found existing brain-jar config. Cloud sync enabled.\n');
  } else {
    console.error('ℹ️  No Mem0 config found. Using local-only storage.');
    console.error('   To enable cloud sync, install shared-memory plugin first.\n');
  }
}

async function main() {
  // If no config and running in a TTY, show status
  if (process.stdin.isTTY && !existsSync(configPath)) {
    await promptForConfig();
  }

  // Start the MCP server
  require('./dist/index.js');
}

main().catch(err => {
  console.error('[visual-thinking] Error:', err.message);
  process.exit(1);
});
