import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import { z } from 'zod';

dotenvConfig();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),

  JWT_SECRET: z.string().min(16).default('change-me-to-a-random-64-char-string'),
  JWT_EXPIRY: z.string().default('24h'),
  BCRYPT_ROUNDS: z.coerce.number().min(8).max(16).default(12),

  DB_TYPE: z.enum(['sqlite', 'postgresql']).default('sqlite'),
  DB_PATH: z.string().default('./data/craftos.db'),
  DATABASE_URL: z.string().optional(),

  SERVERS_DIR: z.string().default('./servers'),
  BACKUPS_DIR: z.string().default('./backups'),
  LOGS_DIR: z.string().default('./logs'),

  ENABLE_TELEMETRY: z.coerce.boolean().default(false),
  ENABLE_AUTO_UPDATE: z.coerce.boolean().default(true),
  ENABLE_2FA: z.coerce.boolean().default(true),

  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),

  DEFAULT_MIN_RAM: z.coerce.number().default(1024),
  DEFAULT_MAX_RAM: z.coerce.number().default(4096),
  DEFAULT_JAVA_PATH: z.string().default('java'),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DISCORD_WEBHOOK_URL: z.string().url().optional(),

  SFTP_ENABLED: z.coerce.boolean().default(true),
  SFTP_PORT: z.coerce.number().default(2022),

  HTTPS_ENABLED: z.coerce.boolean().default(false),
  HTTPS_CERT: z.string().optional(),
  HTTPS_KEY: z.string().optional(),

  LICENSE_SERVER_URL: z.string().default('https://api.craftos.app/v1/license'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const env = parsed.data;

export const config = {
  port: env.PORT,
  host: env.HOST,
  isDev: env.NODE_ENV === 'development',
  isProd: env.NODE_ENV === 'production',

  jwt: {
    secret: env.JWT_SECRET,
    expiry: env.JWT_EXPIRY,
  },

  bcrypt: {
    rounds: env.BCRYPT_ROUNDS,
  },

  db: {
    type: env.DB_TYPE as 'sqlite' | 'postgresql',
    path: path.resolve(env.DB_PATH),
    url: env.DATABASE_URL,
  },

  paths: {
    servers: path.resolve(env.SERVERS_DIR),
    backups: path.resolve(env.BACKUPS_DIR),
    logs: path.resolve(env.LOGS_DIR),
    data: path.dirname(path.resolve(env.DB_PATH)),
  },

  features: {
    telemetry: env.ENABLE_TELEMETRY,
    autoUpdate: env.ENABLE_AUTO_UPDATE,
    twoFactor: env.ENABLE_2FA,
  },

  discord: {
    webhookUrl: env.DISCORD_WEBHOOK_URL || '',
  },

  sftp: {
    enabled: env.SFTP_ENABLED,
    port: env.SFTP_PORT,
  },

  licenseServer: {
    url: env.LICENSE_SERVER_URL,
  },

  https: {
    enabled: env.HTTPS_ENABLED,
    certPath: env.HTTPS_CERT,
    keyPath: env.HTTPS_KEY,
  },

  rateLimit: {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
  },

  defaults: {
    minRam: env.DEFAULT_MIN_RAM,
    maxRam: env.DEFAULT_MAX_RAM,
    javaPath: env.DEFAULT_JAVA_PATH,
  },

  version: (() => {
    try {
      const pkgPath = require('path').resolve(__dirname, '..', 'package.json');
      const pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '1.0.0';
    } catch {
      // Fallback: try root package.json (Electron production)
      try {
        const rootPkg = require('path').resolve(__dirname, '..', '..', 'package.json');
        const pkg = JSON.parse(require('fs').readFileSync(rootPkg, 'utf-8'));
        return pkg.version || '1.0.0';
      } catch {
        return '1.0.0';
      }
    }
  })(),
} as const;

export type Config = typeof config;
