import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import * as schema from './schema';

const log = createChildLogger('database');

let db: BetterSQLite3Database<typeof schema>;
let sqlite: Database.Database;

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (db) return db;

  const dbDir = path.dirname(config.db.path);
  fs.mkdirSync(dbDir, { recursive: true });

  log.info(`Initializing SQLite database at ${config.db.path}`);

  sqlite = new Database(config.db.path);

  // Enable WAL mode for better concurrent performance
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  db = drizzle(sqlite, { schema });

  // Run migrations
  runMigrations(sqlite);

  log.info('Database initialized successfully');
  return db;
}

function runMigrations(sqlite: Database.Database): void {
  log.info('Running database migrations...');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'moderator', 'viewer')),
      totp_secret TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('vanilla', 'paper', 'spigot', 'forge', 'fabric')),
      version TEXT NOT NULL,
      directory TEXT NOT NULL,
      jar_file TEXT NOT NULL,
      java_path TEXT NOT NULL DEFAULT 'java',
      min_ram INTEGER NOT NULL DEFAULT 1024,
      max_ram INTEGER NOT NULL DEFAULT 4096,
      jvm_flags TEXT DEFAULT '',
      port INTEGER NOT NULL DEFAULT 25565,
      auto_start INTEGER NOT NULL DEFAULT 0,
      auto_restart INTEGER NOT NULL DEFAULT 1,
      max_players INTEGER NOT NULL DEFAULT 20,
      status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped', 'starting', 'running', 'stopping', 'crashed')),
      pid INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS server_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      cpu_usage REAL,
      ram_usage INTEGER,
      tps REAL,
      player_count INTEGER NOT NULL DEFAULT 0,
      disk_usage INTEGER,
      network_in INTEGER,
      network_out INTEGER,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_server_time ON server_metrics(server_id, timestamp);

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL UNIQUE,
      username TEXT NOT NULL,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      play_time INTEGER NOT NULL DEFAULT 0,
      is_online INTEGER NOT NULL DEFAULT 0,
      server_id TEXT REFERENCES servers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS bans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_uuid TEXT NOT NULL,
      player_name TEXT NOT NULL,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      reason TEXT DEFAULT '',
      banned_by TEXT NOT NULL,
      expires_at INTEGER,
      is_permanent INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_uuid TEXT NOT NULL,
      player_name TEXT NOT NULL,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      added_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('manual', 'scheduled', 'pre_update')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')),
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('restart', 'backup', 'command')),
      cron_expression TEXT NOT NULL,
      command TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      next_run_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('bug', 'feature', 'general')),
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'reviewed', 'resolved')),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id TEXT NOT NULL,
      server_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'failed')),
      message TEXT,
      duration INTEGER,
      executed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_task_history_server ON task_history(server_id);
    CREATE INDEX IF NOT EXISTS idx_task_history_time ON task_history(executed_at);

    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer' CHECK(role IN ('admin', 'moderator', 'viewer')),
      last_used_at INTEGER,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      granted INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_permissions_server ON user_permissions(server_id);
  `);

  log.info('Migrations completed');
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    log.info('Database connection closed');
  }
}
