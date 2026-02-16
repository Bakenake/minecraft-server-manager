/**
 * Anti-Piracy & License Integrity Module
 *
 * Multiple layers of protection:
 * 1. Hardware-bound license keys
 * 2. Periodic validation (phone-home when online)
 * 3. Runtime integrity checks
 * 4. DB tamper detection
 * 5. Code integrity verification
 * 6. Persistent offline grace period (survives restarts)
 * 7. URL domain pinning
 * 8. Env-override protection
 */

import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';
import { LicenseService, generateHardwareId, FREE_TIER } from '../services/license.service';
import { getDb } from '../db';
import { licenses } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { config } from '../config';

const log = createChildLogger('security');

// ─── Constants ──────────────────────────────────────────────

const OFFLINE_GRACE_PERIOD_DAYS = 7;
const MAX_VALIDATION_FAILURES = 10;
const INTEGRITY_CHECK_INTERVAL_MS = 300_000; // 5 minutes

// ─── Secure URL Resolution ─────────────────────────────────

/**
 * Resolve the license server URL with domain pinning.
 * Even if someone overrides LICENSE_SERVER_URL env var, we validate
 * that the domain is one of our allowed origins.
 */
function resolveServerUrl(): string {
  // Pinned domain fragments — reconstructed at runtime to avoid static extraction
  const _p = [0x72, 0x65, 0x6e, 0x65, 0x67, 0x61, 0x64, 0x65, 0x73, 0x6d, 0x70, 0x2e, 0x63, 0x6f, 0x6d];
  const pinnedDomain = _p.map(c => String.fromCharCode(c)).join('');

  const configUrl = config.licenseServer.url;

  try {
    const parsed = new URL(configUrl);

    // Must be HTTPS in production
    if (config.isProd && parsed.protocol !== 'https:') {
      log.warn('License server URL is not HTTPS — using pinned URL');
      return `https://${pinnedDomain}/license/v1/license`;
    }

    // Domain must match pinned domain
    if (!parsed.hostname.endsWith(pinnedDomain)) {
      log.warn('License server URL domain mismatch — using pinned URL');
      return `https://${pinnedDomain}/license/v1/license`;
    }

    return configUrl;
  } catch {
    // Invalid URL — use pinned
    return `https://${pinnedDomain}/license/v1/license`;
  }
}

const VALIDATION_SERVER_URL = resolveServerUrl();

// ─── Obfuscation Helpers ────────────────────────────────────

/**
 * Simple string obfuscation to make static analysis harder.
 * NOT cryptographically secure — just raises the bar.
 */
function _xor(input: string, key: number): string {
  return Array.from(input)
    .map((c) => String.fromCharCode(c.charCodeAt(0) ^ key))
    .join('');
}

/** Encode a string for storage */
export function encodeStr(s: string): string {
  const key = 0x5a;
  const xored = _xor(s, key);
  return Buffer.from(xored).toString('base64');
}

/** Decode an encoded string */
export function decodeStr(s: string): string {
  const key = 0x5a;
  const decoded = Buffer.from(s, 'base64').toString();
  return _xor(decoded, key);
}

// ─── Runtime Integrity Checks ───────────────────────────────

/**
 * Computes a checksum of critical source files to detect tampering.
 * In production (compiled), checks the compiled output.
 */
function computeSourceChecksum(): string {
  const criticalFiles = [
    'license.service.js',
    'feature-gate.js',
    'anti-piracy.js',
    'middleware.js',
  ];

  const hashes: string[] = [];

  for (const file of criticalFiles) {
    // Check both source and compiled paths
    const possiblePaths = [
      path.join(__dirname, file),
      path.join(__dirname, '..', 'services', file),
      path.join(__dirname, file.replace('.js', '.ts')),
      path.join(__dirname, '..', 'services', file.replace('.js', '.ts')),
    ];

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          // Hash the content, ignoring whitespace changes
          const normalized = content.replace(/\s+/g, ' ').trim();
          hashes.push(
            crypto.createHash('sha256').update(normalized).digest('hex').substring(0, 16),
          );
          break;
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  return crypto.createHash('sha256').update(hashes.join(':')).digest('hex');
}

// ─── DB Tamper Detection ────────────────────────────────────

/**
 * Verify that license data in the database hasn't been manually tampered with.
 * Checks: free-tier limits not inflated, status not manually changed, etc.
 */
async function detectDatabaseTampering(): Promise<boolean> {
  try {
    const db = getDb();
    const hardwareId = generateHardwareId();

    const activeLicenses = await db
      .select()
      .from(licenses)
      .where(eq(licenses.hardwareId, hardwareId));

    for (const license of activeLicenses) {
      // Free tier should have specific limits
      if (license.tier === 'free') {
        if (
          license.maxServers > FREE_TIER.maxServers ||
          license.maxRamMb > FREE_TIER.maxRamMb ||
          license.maxPlayers > FREE_TIER.maxPlayers
        ) {
          log.warn('Database tampering detected: free-tier limits inflated');
          // Reset to proper values
          await db
            .update(licenses)
            .set({
              maxServers: FREE_TIER.maxServers,
              maxRamMb: FREE_TIER.maxRamMb,
              maxPlayers: FREE_TIER.maxPlayers,
              status: 'suspended',
              updatedAt: new Date(),
            })
            .where(eq(licenses.id, license.id));
          return true;
        }
      }

      // Check for suspiciously many active licenses (should be 0 or 1)
      if (activeLicenses.length > 2) {
        log.warn('Database tampering detected: multiple active licenses');
        // Keep the first, suspend the rest
        for (let i = 1; i < activeLicenses.length; i++) {
          await db
            .update(licenses)
            .set({ status: 'suspended', updatedAt: new Date() })
            .where(eq(licenses.id, activeLicenses[i].id));
        }
        return true;
      }
    }

    return false;
  } catch (err) {
    log.error({ err }, 'Error checking database integrity');
    return false;
  }
}

// ─── Online License Validation ──────────────────────────────

interface ServerValidationResponse {
  valid: boolean;
  tier: 'free' | 'premium';
  expiresAt: string | null;
  features: Record<string, boolean>;
  message?: string;
  revoked?: boolean;
}

/**
 * Validate the license against the remote licensing server.
 * Returns null if the server is unreachable (offline mode).
 */
async function validateWithServer(
  licenseKey: string,
  hardwareId: string,
): Promise<ServerValidationResponse | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(`${VALIDATION_SERVER_URL}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CraftOS-ServerManager/1.0',
      },
      body: JSON.stringify({
        licenseKey,
        hardwareId,
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        appVersion: '1.0.0',
        timestamp: Date.now(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      if (response.status === 403) {
        // License explicitly revoked
        return {
          valid: false,
          tier: 'free',
          expiresAt: null,
          features: {},
          revoked: true,
          message: 'License has been revoked',
        };
      }
      return null;
    }

    return (await response.json()) as ServerValidationResponse;
  } catch {
    // Server unreachable — offline mode
    return null;
  }
}

// ─── Anti-Piracy Service ────────────────────────────────────

export class AntiPiracyService {
  private static instance: AntiPiracyService;
  private integrityCheckInterval: ReturnType<typeof setInterval> | null = null;
  private baselineChecksum: string | null = null;
  private lastOnlineValidation: Date | null = null;
  private tamperDetectedCount = 0;

  static getInstance(): AntiPiracyService {
    if (!AntiPiracyService.instance) {
      AntiPiracyService.instance = new AntiPiracyService();
    }
    return AntiPiracyService.instance;
  }

  // ── Persistent offline tracking ──────────────────────────

  /**
   * Read the last successful online validation timestamp from the DB.
   * This survives app restarts — unlike the old in-memory counter.
   */
  private async getPersistedOfflineState(): Promise<{
    lastOnline: Date | null;
    consecutiveOfflineStarts: number;
  }> {
    const db = getDb();
    const hardwareId = generateHardwareId();
    const activeLicense = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.hardwareId, hardwareId),
          eq(licenses.status, 'active'),
        ),
      )
      .limit(1);

    if (activeLicense.length === 0) {
      return { lastOnline: null, consecutiveOfflineStarts: 0 };
    }

    const lic = activeLicense[0];
    return {
      lastOnline: (lic as any).lastOnlineValidation
        ? new Date((lic as any).lastOnlineValidation)
        : null,
      consecutiveOfflineStarts: (lic as any).consecutiveOfflineStarts || 0,
    };
  }

  /**
   * Persist a successful online validation to the DB.
   */
  private async persistOnlineSuccess(): Promise<void> {
    const db = getDb();
    const hardwareId = generateHardwareId();
    const now = new Date();

    await db
      .update(licenses)
      .set({
        lastOnlineValidation: now,
        consecutiveOfflineStarts: 0,
        updatedAt: now,
      } as any)
      .where(
        and(
          eq(licenses.hardwareId, hardwareId),
          eq(licenses.status, 'active'),
        ),
      );

    this.lastOnlineValidation = now;
  }

  /**
   * Increment the consecutive offline starts counter.
   */
  private async incrementOfflineStart(): Promise<number> {
    const db = getDb();
    const hardwareId = generateHardwareId();

    const current = await this.getPersistedOfflineState();
    const newCount = current.consecutiveOfflineStarts + 1;

    await db
      .update(licenses)
      .set({
        consecutiveOfflineStarts: newCount,
        updatedAt: new Date(),
      } as any)
      .where(
        and(
          eq(licenses.hardwareId, hardwareId),
          eq(licenses.status, 'active'),
        ),
      );

    return newCount;
  }

  /**
   * Initialize anti-piracy protections
   */
  async initialize(): Promise<void> {
    // Compute baseline checksum on startup
    this.baselineChecksum = computeSourceChecksum();
    log.info('Security module initialized');

    // Initial DB integrity check
    const tampered = await detectDatabaseTampering();
    if (tampered) {
      log.warn('License tampering was detected and corrected');
      this.tamperDetectedCount++;
    }

    // Restore persisted offline state
    const offlineState = await this.getPersistedOfflineState();
    this.lastOnlineValidation = offlineState.lastOnline;

    // Start periodic integrity checks
    this.startIntegrityChecks();

    // Perform initial online validation (blocking for premium)
    await this.performOnlineValidation(true);
  }

  /**
   * Start periodic runtime integrity checks
   */
  private startIntegrityChecks(): void {
    if (this.integrityCheckInterval) return;

    this.integrityCheckInterval = setInterval(async () => {
      try {
        // Check source integrity
        const currentChecksum = computeSourceChecksum();
        if (this.baselineChecksum && currentChecksum !== this.baselineChecksum) {
          log.warn('Runtime integrity check failed — source files modified');
          this.tamperDetectedCount++;

          const licenseService = LicenseService.getInstance();
          licenseService.clearCache();

          // On repeated tampering, downgrade to free
          if (this.tamperDetectedCount >= 3) {
            log.warn('Repeated tampering detected — suspending license');
            const db = getDb();
            const hardwareId = generateHardwareId();
            await db
              .update(licenses)
              .set({ status: 'suspended', updatedAt: new Date() })
              .where(
                and(
                  eq(licenses.hardwareId, hardwareId),
                  eq(licenses.status, 'active'),
                ),
              );
          }
        }

        // Check DB integrity
        const dbTampered = await detectDatabaseTampering();
        if (dbTampered) {
          this.tamperDetectedCount++;
        }

        // Periodic online validation (every hour)
        const hourAgo = new Date(Date.now() - 3600000);
        if (!this.lastOnlineValidation || this.lastOnlineValidation < hourAgo) {
          await this.performOnlineValidation(false);
        }
      } catch (err) {
        log.error({ err }, 'Integrity check error');
      }
    }, INTEGRITY_CHECK_INTERVAL_MS);
  }

  /**
   * Perform online license validation.
   * @param isStartup — if true, this is the initial boot check (persists offline start count)
   */
  private async performOnlineValidation(isStartup: boolean): Promise<void> {
    const licenseService = LicenseService.getInstance();
    const { licenseKey } = await licenseService.getCurrentTier();

    if (!licenseKey) {
      // Free tier — no need to phone home
      this.lastOnlineValidation = new Date();
      return;
    }

    const hardwareId = generateHardwareId();
    const result = await validateWithServer(licenseKey, hardwareId);

    if (result === null) {
      // ── Offline — use persistent grace period ──
      if (isStartup) {
        const offlineStarts = await this.incrementOfflineStart();

        // Check persisted last-online timestamp
        const offlineState = await this.getPersistedOfflineState();
        const lastOnline = offlineState.lastOnline;

        if (lastOnline) {
          const daysSinceOnline = Math.floor(
            (Date.now() - lastOnline.getTime()) / (1000 * 60 * 60 * 24),
          );
          const daysRemaining = OFFLINE_GRACE_PERIOD_DAYS - daysSinceOnline;

          if (daysRemaining <= 0) {
            log.warn('Offline grace period expired — suspending premium license');
            const db = getDb();
            await db
              .update(licenses)
              .set({ status: 'suspended', updatedAt: new Date() })
              .where(
                and(
                  eq(licenses.licenseKey, licenseKey),
                  eq(licenses.hardwareId, hardwareId),
                ),
              );
            licenseService.clearCache();
            return;
          }

          log.info({ daysRemaining, offlineStarts }, 'Operating in offline mode (persistent)');
        } else {
          // Never validated online — allow a few starts to handle first-install scenarios
          if (offlineStarts > 3) {
            log.warn('License never validated online after multiple starts — suspending');
            const db = getDb();
            await db
              .update(licenses)
              .set({ status: 'suspended', updatedAt: new Date() })
              .where(
                and(
                  eq(licenses.licenseKey, licenseKey),
                  eq(licenses.hardwareId, hardwareId),
                ),
              );
            licenseService.clearCache();
          }
        }
      } else {
        log.debug('Periodic online validation failed — server unreachable');
      }
      return;
    }

    // ── Online validation successful ──
    await this.persistOnlineSuccess();

    if (result.revoked) {
      log.warn('License revoked by server');
      const db = getDb();
      await db
        .update(licenses)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(eq(licenses.licenseKey, licenseKey));
      licenseService.clearCache();
      return;
    }

    if (!result.valid) {
      log.warn({ message: result.message }, 'License validation failed');
      const db = getDb();
      const current = await db
        .select()
        .from(licenses)
        .where(eq(licenses.licenseKey, licenseKey))
        .limit(1);

      if (current.length > 0) {
        const failures = (current[0].validationFailures || 0) + 1;
        await db
          .update(licenses)
          .set({
            validationFailures: failures,
            ...(failures >= MAX_VALIDATION_FAILURES ? { status: 'suspended' as const } : {}),
            updatedAt: new Date(),
          })
          .where(eq(licenses.id, current[0].id));
      }
      licenseService.clearCache();
    }
  }

  /**
   * Generate a machine-specific activation token for support requests
   */
  generateActivationToken(): string {
    const data = {
      hwid: generateHardwareId(),
      host: os.hostname(),
      platform: `${os.platform()}-${os.arch()}`,
      ts: Date.now(),
    };

    const token = Buffer.from(JSON.stringify(data)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', 'CraftOS-ActivationToken-v1')
      .update(token)
      .digest('hex')
      .substring(0, 16);

    return `${token}.${signature}`;
  }

  /**
   * Check if the current environment is being debugged/inspected
   * (basic anti-debugging measure)
   */
  detectDebugger(): boolean {
    // Check for Node.js inspector
    const inspectorActive = typeof (globalThis as any).inspector !== 'undefined' ||
      process.execArgv.some((arg) =>
        arg.includes('--inspect') || arg.includes('--debug'),
      );

    if (inspectorActive) {
      log.warn('Debugger detected');
    }

    return inspectorActive;
  }

  /**
   * Stop all integrity checks
   */
  shutdown(): void {
    if (this.integrityCheckInterval) {
      clearInterval(this.integrityCheckInterval);
      this.integrityCheckInterval = null;
    }
  }
}

// ─── Electron-specific protections ──────────────────────────

/**
 * Configuration for Electron builder to enable code signing and ASAR integrity.
 * Add these to electron-builder.json:
 *
 * {
 *   "asar": true,
 *   "asarUnpack": ["node_modules/better-sqlite3/**"],
 *   "afterSign": "scripts/notarize.js",
 *   "win": {
 *     "certificateFile": "path/to/cert.pfx",
 *     "certificatePassword": "...",
 *     "signingHashAlgorithms": ["sha256"]
 *   }
 * }
 */
export const ELECTRON_SECURITY_RECOMMENDATIONS = {
  // Enable ASAR archive (makes extraction harder)
  asar: true,
  // Code signing prevents tampering with the executable
  codeSigning: 'Required for distribution — get a code signing certificate',
  // Content Security Policy for the renderer process
  csp: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
  // Disable Node integration in renderer for security
  nodeIntegration: false,
  contextIsolation: true,
};
