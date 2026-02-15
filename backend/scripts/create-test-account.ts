/**
 * CraftOS — Reset/Create Test Admin Account
 *
 * Run with:  npx tsx scripts/create-test-account.ts
 *
 * Credentials:
 *   Username: admin
 *   Password: Admin123!
 */

import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.resolve(__dirname, '..', 'data', 'craftos.db');

async function main() {
  // Ensure data dir exists
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Ensure users table exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  const username = 'admin';
  const password = 'Admin123!';
  const email = 'admin@craftos.local';
  const hash = await bcrypt.hash(password, 12);
  const now = Date.now();
  const id = randomUUID();

  // Delete existing admin account if present
  sqlite.prepare('DELETE FROM users WHERE username = ?').run(username);

  // Insert new admin
  sqlite.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, totp_enabled, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'admin', 0, 1, ?, ?)
  `).run(id, username, email, hash, now, now);

  sqlite.close();

  console.log('');
  console.log('  ✅ Test admin account created!');
  console.log('');
  console.log('  ┌──────────────────────────────┐');
  console.log('  │  Username:  admin             │');
  console.log('  │  Password:  Admin123!         │');
  console.log('  │  Role:      admin             │');
  console.log('  └──────────────────────────────┘');
  console.log('');
  console.log(`  Database: ${DB_PATH}`);
  console.log('');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
