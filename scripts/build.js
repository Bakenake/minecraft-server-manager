#!/usr/bin/env node
/**
 * CraftOS Server Manager — Build Script
 * Builds both backend and frontend for production.
 */

import { execSync } from 'child_process';
import { rmSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function run(cmd, cwd = ROOT) {
  console.log(`\n  > ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
}

function step(msg) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${msg}`);
  console.log('─'.repeat(50));
}

async function build() {
  const start = Date.now();

  // Clean
  step('Cleaning previous build...');
  const distDir = resolve(ROOT, 'dist');
  if (existsSync(distDir)) rmSync(distDir, { recursive: true });
  mkdirSync(distDir, { recursive: true });

  // Build frontend
  step('Building frontend...');
  run('npx vite build', resolve(ROOT, 'frontend'));

  // Build backend
  step('Building backend...');
  run('npx tsc --project tsconfig.json', resolve(ROOT, 'backend'));

  // Copy backend build to dist
  step('Assembling distribution...');
  mkdirSync(resolve(distDir, 'backend'), { recursive: true });
  cpSync(resolve(ROOT, 'backend', 'dist'), resolve(distDir, 'backend'), { recursive: true });
  cpSync(resolve(ROOT, 'backend', 'package.json'), resolve(distDir, 'backend', 'package.json'));

  // Copy frontend build to dist
  mkdirSync(resolve(distDir, 'public'), { recursive: true });
  cpSync(resolve(ROOT, 'frontend', 'dist'), resolve(distDir, 'public'), { recursive: true });

  // Copy root files
  if (existsSync(resolve(ROOT, '.env.example'))) {
    cpSync(resolve(ROOT, '.env.example'), resolve(distDir, '.env.example'));
  }

  // Install production dependencies
  step('Installing production dependencies...');
  run('npm install --production --ignore-scripts', resolve(distDir, 'backend'));

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  step(`Build complete in ${elapsed}s`);
  console.log(`  Output: ${distDir}\n`);
}

build().catch((err) => {
  console.error('\n  Build failed:', err.message);
  process.exit(1);
});
