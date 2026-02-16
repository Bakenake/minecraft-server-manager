#!/usr/bin/env node
/**
 * CraftOS Server Manager — Windows Packaging Script
 * Creates a standalone executable for Windows using pkg.
 */

const { execSync } = require('child_process');
const { mkdirSync, writeFileSync, existsSync, cpSync } = require('fs');
const { resolve } = require('path');

const ROOT = resolve(__dirname, '..');

function run(cmd, cwd = ROOT) {
  console.log(`  > ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function packageWin() {
  console.log('\n  Packaging for Windows...\n');

  const outDir = resolve(ROOT, 'release', 'win');
  mkdirSync(outDir, { recursive: true });

  // Ensure dist exists
  if (!existsSync(resolve(ROOT, 'dist'))) {
    console.log('  Building first...');
    run('node scripts/build.js');
  }

  // Create pkg config
  const pkgConfig = {
    pkg: {
      scripts: ['dist/backend/**/*.js'],
      assets: ['dist/public/**/*'],
      targets: ['node20-win-x64'],
      outputPath: outDir,
    },
  };

  writeFileSync(
    resolve(ROOT, 'pkg.json'),
    JSON.stringify(pkgConfig, null, 2)
  );

  // Run pkg
  run(`npx pkg dist/backend/index.js --config pkg.json --output "${resolve(outDir, 'CraftOS.exe')}" --target node20-win-x64`);

  // Copy static assets alongside binary
  cpSync(resolve(ROOT, 'dist', 'public'), resolve(outDir, 'public'), { recursive: true });
  cpSync(resolve(ROOT, '.env.example'), resolve(outDir, '.env.example'));

  console.log(`\n  Windows package created: ${outDir}\n`);
}

packageWin().catch((err) => {
  console.error('\n  Packaging failed:', err.message);
  process.exit(1);
});
