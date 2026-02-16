import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = process.env.DB_PATH || './data/licenses.db';
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    runMigrations(db);
  }
  return db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      license_key TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'premium' CHECK(tier IN ('free', 'premium')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'revoked', 'suspended')),
      email TEXT,
      hardware_id TEXT,
      max_activations INTEGER NOT NULL DEFAULT 1,
      plan TEXT DEFAULT 'lifetime' CHECK(plan IN ('monthly', 'yearly', 'lifetime', 'trial')),
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT,
      created_by TEXT DEFAULT 'system',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT
    );

    CREATE TABLE IF NOT EXISTS activations (
      id TEXT PRIMARY KEY,
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      hardware_id TEXT NOT NULL,
      hostname TEXT,
      platform TEXT,
      app_version TEXT,
      ip_address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      deactivated_at TEXT,
      UNIQUE(license_id, hardware_id)
    );

    CREATE TABLE IF NOT EXISTS validation_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      hardware_id TEXT NOT NULL,
      ip_address TEXT,
      result TEXT NOT NULL CHECK(result IN ('valid', 'invalid', 'expired', 'revoked', 'not_found', 'hardware_mismatch')),
      message TEXT,
      validated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_licenses_status ON licenses(status);
    CREATE INDEX IF NOT EXISTS idx_licenses_hardware ON licenses(hardware_id);
    CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);
    CREATE INDEX IF NOT EXISTS idx_activations_hardware ON activations(hardware_id);
    CREATE INDEX IF NOT EXISTS idx_validation_log_key ON validation_log(license_key);
    CREATE INDEX IF NOT EXISTS idx_validation_log_time ON validation_log(validated_at);
  `);

  console.log('[db] Database initialized');
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
