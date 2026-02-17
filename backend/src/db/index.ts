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

  // Restrict DB file permissions (owner-only on Unix, best effort on Windows)
  try {
    fs.chmodSync(config.db.path, 0o600);
    // Also protect the WAL and SHM files if they exist
    const walPath = config.db.path + '-wal';
    const shmPath = config.db.path + '-shm';
    if (fs.existsSync(walPath)) fs.chmodSync(walPath, 0o600);
    if (fs.existsSync(shmPath)) fs.chmodSync(shmPath, 0o600);
  } catch {
    // On Windows chmod may not fully apply — that's acceptable since
    // the data dir is already inside %APPDATA% which is user-scoped
  }

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

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      license_key TEXT NOT NULL UNIQUE,
      tier TEXT NOT NULL DEFAULT 'free' CHECK(tier IN ('free', 'premium')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'revoked', 'suspended')),
      email TEXT NOT NULL,
      hardware_id TEXT,
      activated_at INTEGER,
      expires_at INTEGER,
      max_servers INTEGER NOT NULL DEFAULT 1,
      max_ram_mb INTEGER NOT NULL DEFAULT 4096,
      max_players INTEGER NOT NULL DEFAULT 10,
      features TEXT NOT NULL DEFAULT '{}',
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      last_validated_at INTEGER,
      validation_failures INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS license_activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      hardware_id TEXT NOT NULL,
      hostname TEXT NOT NULL,
      platform TEXT NOT NULL,
      activated_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_license_activations ON license_activations(license_id);
  `);

  // Stripe column migrations for existing databases
  try {
    const cols = sqlite.pragma('table_info(licenses)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('stripe_customer_id')) {
      sqlite.exec(`ALTER TABLE licenses ADD COLUMN stripe_customer_id TEXT`);
      log.info('Added stripe_customer_id column to licenses table');
    }
    if (!colNames.includes('stripe_subscription_id')) {
      sqlite.exec(`ALTER TABLE licenses ADD COLUMN stripe_subscription_id TEXT`);
      log.info('Added stripe_subscription_id column to licenses table');
    }
  } catch (err) {
    log.warn({ err }, 'Stripe column migration check failed');
  }

  // Server Networks / Proxy management migration
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS server_networks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        proxy_type TEXT NOT NULL CHECK(proxy_type IN ('bungeecord', 'waterfall', 'velocity')),
        proxy_server_id TEXT REFERENCES servers(id) ON DELETE SET NULL,
        proxy_port INTEGER NOT NULL DEFAULT 25577,
        motd TEXT DEFAULT 'A CraftOS Network',
        max_players INTEGER NOT NULL DEFAULT 100,
        online_mode INTEGER NOT NULL DEFAULT 1,
        ip_forwarding INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'stopped' CHECK(status IN ('stopped', 'starting', 'running', 'stopping', 'degraded')),
        auto_start INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS network_servers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        network_id TEXT NOT NULL REFERENCES server_networks(id) ON DELETE CASCADE,
        server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
        server_alias TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_fallback INTEGER NOT NULL DEFAULT 0,
        restricted INTEGER NOT NULL DEFAULT 0,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_network_servers_network ON network_servers(network_id);
      CREATE INDEX IF NOT EXISTS idx_network_servers_server ON network_servers(server_id);
    `);
    log.info('Server networks tables initialized');
  } catch (err) {
    log.warn({ err }, 'Server networks migration check failed');
  }

  // License security columns migration (offline grace persistence)
  try {
    const cols = sqlite.pragma('table_info(licenses)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('last_online_validation')) {
      sqlite.exec(`ALTER TABLE licenses ADD COLUMN last_online_validation INTEGER`);
      log.info('Added last_online_validation column to licenses table');
    }
    if (!colNames.includes('consecutive_offline_starts')) {
      sqlite.exec(`ALTER TABLE licenses ADD COLUMN consecutive_offline_starts INTEGER NOT NULL DEFAULT 0`);
      log.info('Added consecutive_offline_starts column to licenses table');
    }
    if (!colNames.includes('integrity_signature')) {
      sqlite.exec(`ALTER TABLE licenses ADD COLUMN integrity_signature TEXT`);
      log.info('Added integrity_signature column to licenses table');
    }
  } catch (err) {
    log.warn({ err }, 'License security column migration failed');
  }

  log.info('Migrations completed');
}

export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    log.info('Database connection closed');
  }
}
