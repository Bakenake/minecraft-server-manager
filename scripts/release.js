#!/usr/bin/env node
/**
 * CraftOS Release Script
 *
 * Usage: node scripts/release.js [patch|minor|major|x.y.z]
 *
 * This script:
 * 1. Bumps the version in package.json (root, backend, frontend)
 * 2. Commits the version bump
 * 3. Creates a git tag (v1.x.x)
 * 4. Pushes the commit and tag to trigger the CI/CD release pipeline
 *
 * That's it — push once and GitHub Actions builds + publishes the
 * Electron installers. Users with existing installs get auto-updated.
 */

const { execSync } = require('child_process');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd) {
  console.log(`  $ ${cmd}`);
  return execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

function bumpVersion(current, type) {
  // If type looks like a version, use it directly
  if (/^\d+\.\d+\.\d+/.test(type)) return type;

  const [major, minor, patch] = current.replace(/-.+$/, '').split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch':
    default:      return `${major}.${minor}.${patch + 1}`;
  }
}

async function release() {
  const type = process.argv[2] || 'patch';

  // 1. Read current version
  const rootPkg = readJSON(path.resolve(ROOT, 'package.json'));
  const oldVersion = rootPkg.version;
  const newVersion = bumpVersion(oldVersion, type);

  console.log(`\n  Releasing: v${oldVersion} → v${newVersion}\n`);

  // 2. Update all package.json files
  const files = [
    path.resolve(ROOT, 'package.json'),
    path.resolve(ROOT, 'backend', 'package.json'),
    path.resolve(ROOT, 'frontend', 'package.json'),
  ];

  for (const file of files) {
    try {
      const pkg = readJSON(file);
      pkg.version = newVersion;
      writeJSON(file, pkg);
      console.log(`  ✓ Updated ${file.replace(ROOT, '.')}`);
    } catch {
      // Skip if file doesn't have a version field
    }
  }

  // 3. Git commit + tag
  console.log('');
  run('git add -A');
  run(`git commit -m "release: v${newVersion}"`);
  run(`git tag -a v${newVersion} -m "Release v${newVersion}"`);

  // 4. Push (this triggers the GitHub Actions release workflow)
  run('git push');
  run('git push --tags');

  console.log(`\n  ✅ Release v${newVersion} pushed!`);
  console.log('  GitHub Actions will now build & publish the installers.');
  console.log('  Users will be auto-updated when the build completes.\n');
}

release().catch((err) => {
  console.error(`\n  Release failed: ${err.message}\n`);
  process.exit(1);
});
