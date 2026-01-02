#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');
const os = require('os');

const root = __dirname;
process.chdir(root);

// Install dependencies if needed
if (!existsSync(join(root, 'node_modules'))) {
  console.error('[shared-memory] Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
}

// Build if needed
if (!existsSync(join(root, 'dist'))) {
  console.error('[shared-memory] Building...');
  execSync('npm run build', { stdio: 'inherit' });
}

// Check if Mem0 config exists
const configPath = join(os.homedir(), '.config', 'brain-jar', 'config.json');
const needsSetup = !existsSync(configPath);

// If no config and running interactively (TTY), run setup first
if (needsSetup && process.stdin.isTTY && !process.argv.includes('--no-setup')) {
  console.error('[shared-memory] First run detected - starting setup...\n');

  // Run setup synchronously, inheriting stdio for interactive prompts
  const result = execSync('node dist/index.js --setup', {
    stdio: 'inherit',
    cwd: root
  });

  console.error('\n[shared-memory] Setup complete! Starting MCP server...\n');
}

// Start the MCP server
require('./dist/index.js');
