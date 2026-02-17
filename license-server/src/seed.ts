/**
 * Seed script — ensures an admin user exists.
 *
 * Run standalone: npx tsx src/seed.ts
 * Also called on server startup.
 */

import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { getDb } from './db';

export function ensureAdminUser(): void {
  const db = getDb();
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'changeme';

  const existing = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username) as any;

  if (existing) {
    console.log(`[seed] Admin user '${username}' already exists`);
    return;
  }

  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    'INSERT INTO admin_users (id, username, password_hash) VALUES (?, ?, ?)'
  ).run(uuid(), username, hash);

  console.log(`[seed] Created admin user '${username}'`);
}

// Allow running directly: npx tsx src/seed.ts
if (require.main === module) {
  require('dotenv').config();
  ensureAdminUser();
  console.log('[seed] Done');
}
