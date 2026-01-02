#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
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
const configDir = join(os.homedir(), '.config', 'brain-jar');
const configPath = join(configDir, 'config.json');

async function promptForConfig() {
  const { input } = await import('@inquirer/prompts');

  console.error('\n🧠 Brain-Jar Shared Memory Setup\n');
  console.error('To get your Mem0 API key:');
  console.error('1. Go to https://app.mem0.ai');
  console.error('2. Sign up (free tier: 10,000 memories)');
  console.error('3. Navigate to Settings -> API Keys');
  console.error('4. Create and copy your key\n');

  const apiKey = await input({
    message: 'Enter your Mem0 API key (or press Enter for local-only):',
  });

  if (apiKey && apiKey.trim()) {
    mkdirSync(configDir, { recursive: true });
    writeFileSync(configPath, JSON.stringify({
      mem0_api_key: apiKey.trim(),
      default_scope: 'global',
      auto_summarize: true
    }, null, 2));
    console.error('\n✅ Configuration saved! Cloud sync enabled.\n');
  } else {
    console.error('\n✅ Using local-only storage. Cloud sync disabled.\n');
    console.error('To enable cloud sync later, create:', configPath, '\n');
  }
}

async function main() {
  // If no config and running in a TTY, prompt for it
  if (!existsSync(configPath)) {
    if (process.stdin.isTTY) {
      await promptForConfig();
    } else {
      // Non-interactive - just log and continue with local-only
      console.error('[shared-memory] No config found. Running with local-only storage.');
      console.error('[shared-memory] To configure Mem0, run: node ' + __filename);
    }
  }

  // Start the MCP server
  require('./dist/index.js');
}

main().catch(err => {
  console.error('[shared-memory] Error:', err.message);
  process.exit(1);
});
