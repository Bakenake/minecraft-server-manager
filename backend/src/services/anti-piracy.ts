/**
 * Anti-Piracy & License Integrity Module
 *
 * Multiple layers of protection:
 * 1. Hardware-bound license keys
 * 2. Periodic validation (phone-home when online)
 * 3. Runtime integrity checks
 * 4. DB tamper detection
 * 5. Code integrity verification
 * 6. Grace period for offline use
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

// Use the centralized config for the license server URL
const VALIDATION_SERVER_URL = config.licenseServer.url;
const OFFLINE_GRACE_PERIOD_DAYS = 7;
const MAX_VALIDATION_FAILURES = 10;
const INTEGRITY_CHECK_INTERVAL_MS = 300_000; // 5 minutes

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
  private offlineDays = 0;

  static getInstance(): AntiPiracyService {
    if (!AntiPiracyService.instance) {
      AntiPiracyService.instance = new AntiPiracyService();
    }
    return AntiPiracyService.instance;
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
    }

    // Start periodic integrity checks
    this.startIntegrityChecks();

    // Perform initial online validation
    await this.performOnlineValidation();
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
          // Don't crash — just log and downgrade to free
          const licenseService = LicenseService.getInstance();
          licenseService.clearCache();
        }

        // Check DB integrity
        await detectDatabaseTampering();

        // Periodic online validation (every hour)
        const hourAgo = new Date(Date.now() - 3600000);
        if (!this.lastOnlineValidation || this.lastOnlineValidation < hourAgo) {
          await this.performOnlineValidation();
        }
      } catch (err) {
        log.error({ err }, 'Integrity check error');
      }
    }, INTEGRITY_CHECK_INTERVAL_MS);
  }

  /**
   * Perform online license validation
   */
  private async performOnlineValidation(): Promise<void> {
    const licenseService = LicenseService.getInstance();
    const { licenseKey } = await licenseService.getCurrentTier();

    if (!licenseKey) {
      // Free tier — no need to phone home
      this.lastOnlineValidation = new Date();
      this.offlineDays = 0;
      return;
    }

    const hardwareId = generateHardwareId();
    const result = await validateWithServer(licenseKey, hardwareId);

    if (result === null) {
      // Offline — check grace period
      this.offlineDays++;
      const daysRemaining = OFFLINE_GRACE_PERIOD_DAYS - this.offlineDays;

      if (daysRemaining <= 0) {
        log.warn('Offline grace period expired — downgrading to free tier');
        // Downgrade until online validation succeeds
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
      } else {
        log.info({ daysRemaining }, 'Operating in offline mode');
      }
      return;
    }

    // Online validation successful
    this.lastOnlineValidation = new Date();
    this.offlineDays = 0;

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
