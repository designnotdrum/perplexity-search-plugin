#!/usr/bin/env node
const { execSync } = require('child_process');
const { existsSync } = require('fs');
const { join } = require('path');

const root = __dirname;
process.chdir(root);

if (!existsSync(join(root, 'node_modules'))) {
  console.error('[perplexity-search] Installing dependencies...');
  execSync('npm install', { stdio: 'inherit' });
}

if (!existsSync(join(root, 'dist'))) {
  console.error('[perplexity-search] Building...');
  execSync('npm run build', { stdio: 'inherit' });
}

require('./dist/index.js');
