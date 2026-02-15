import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

// ─── Users ──────────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), // UUID
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'moderator', 'viewer'] }).notNull().default('viewer'),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ─── Servers ────────────────────────────────────────────────────────
export const servers = sqliteTable('servers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['vanilla', 'paper', 'spigot', 'forge', 'fabric'] }).notNull(),
  version: text('version').notNull(),
  directory: text('directory').notNull(),
  jarFile: text('jar_file').notNull(),
  javaPath: text('java_path').notNull().default('java'),
  minRam: integer('min_ram').notNull().default(1024),
  maxRam: integer('max_ram').notNull().default(4096),
  jvmFlags: text('jvm_flags').default(''),
  port: integer('port').notNull().default(25565),
  autoStart: integer('auto_start', { mode: 'boolean' }).notNull().default(false),
  autoRestart: integer('auto_restart', { mode: 'boolean' }).notNull().default(true),
  maxPlayers: integer('max_players').notNull().default(20),
  status: text('status', { enum: ['stopped', 'starting', 'running', 'stopping', 'crashed'] }).notNull().default('stopped'),
  pid: integer('pid'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ─── Server Metrics ─────────────────────────────────────────────────
export const serverMetrics = sqliteTable('server_metrics', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  cpuUsage: real('cpu_usage'),
  ramUsage: integer('ram_usage'),
  tps: real('tps'),
  playerCount: integer('player_count').notNull().default(0),
  diskUsage: integer('disk_usage'),
  networkIn: integer('network_in'),
  networkOut: integer('network_out'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// ─── Players ────────────────────────────────────────────────────────
export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  uuid: text('uuid').notNull().unique(),
  username: text('username').notNull(),
  firstSeen: integer('first_seen', { mode: 'timestamp' }).notNull(),
  lastSeen: integer('last_seen', { mode: 'timestamp' }).notNull(),
  playTime: integer('play_time').notNull().default(0), // seconds
  isOnline: integer('is_online', { mode: 'boolean' }).notNull().default(false),
  serverId: text('server_id').references(() => servers.id, { onDelete: 'set null' }),
});

// ─── Bans ───────────────────────────────────────────────────────────
export const bans = sqliteTable('bans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  reason: text('reason').default(''),
  bannedBy: text('banned_by').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  isPermanent: integer('is_permanent', { mode: 'boolean' }).notNull().default(true),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ─── Whitelist ──────────────────────────────────────────────────────
export const whitelist = sqliteTable('whitelist', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerUuid: text('player_uuid').notNull(),
  playerName: text('player_name').notNull(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  addedBy: text('added_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ─── Backups ────────────────────────────────────────────────────────
export const backups = sqliteTable('backups', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size').notNull(),
  type: text('type', { enum: ['manual', 'scheduled', 'pre_update'] }).notNull(),
  status: text('status', { enum: ['pending', 'in_progress', 'completed', 'failed'] }).notNull().default('pending'),
  error: text('error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// ─── Scheduled Tasks ────────────────────────────────────────────────
export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: text('id').primaryKey(),
  serverId: text('server_id').notNull().references(() => servers.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['restart', 'backup', 'command'] }).notNull(),
  cronExpression: text('cron_expression').notNull(),
  command: text('command'), // for 'command' type tasks
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ─── Audit Log ──────────────────────────────────────────────────────
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  details: text('details'), // JSON string
  ipAddress: text('ip_address'),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

// ─── Task Execution History ─────────────────────────────────────────
export const taskHistory = sqliteTable('task_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  serverId: text('server_id').notNull(),
  type: text('type').notNull(),
  status: text('status', { enum: ['success', 'failed'] }).notNull(),
  message: text('message'),
  duration: integer('duration'), // ms
  executedAt: integer('executed_at', { mode: 'timestamp' }).notNull(),
});

// ─── Feedback ───────────────────────────────────────────────────────
export const feedback = sqliteTable('feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  type: text('type', { enum: ['bug', 'feature', 'general'] }).notNull(),
  subject: text('subject').notNull(),
  message: text('message').notNull(),
  status: text('status', { enum: ['pending', 'reviewed', 'resolved'] }).notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ─── Settings ───────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ─── API Keys ───────────────────────────────────────────────────────
export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull(),
  keyPrefix: text('key_prefix').notNull(), // first 8 chars for identification
  role: text('role', { enum: ['admin', 'moderator', 'viewer'] }).notNull().default('viewer'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
// ─── User Permissions (granular subuser access control) ─────
export const userPermissions = sqliteTable('user_permissions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  permission: text('permission').notNull(), // e.g., 'server.start', 'server.console', 'plugins.install'
  serverId: text('server_id').references(() => servers.id, { onDelete: 'cascade' }), // null = all servers
  granted: integer('granted', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type ServerMetric = typeof serverMetrics.$inferSelect;
export type Player = typeof players.$inferSelect;
export type Ban = typeof bans.$inferSelect;
export type Backup = typeof backups.$inferSelect;
export type ScheduledTask = typeof scheduledTasks.$inferSelect;
export type TaskHistory = typeof taskHistory.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type UserPermission = typeof userPermissions.$inferSelect;
