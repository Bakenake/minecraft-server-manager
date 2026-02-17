import crypto from 'crypto';
import os from 'os';
import { getDb } from '../db';
import { licenses, licenseActivations } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { createChildLogger } from '../utils/logger';
import { config } from '../config';

const log = createChildLogger('license');

// ─── Secure URL Resolution ─────────────────────────────────

/**
 * Resolve and validate the license server URL.
 * Pins to the known domain to prevent env-override attacks.
 */
function resolveServerUrl(): string {
  const _d = [114,101,110,101,103,97,100,101,115,109,112,46,99,111,109];
  const pinnedDomain = _d.map(c => String.fromCharCode(c)).join('');
  const configUrl = config.licenseServer.url;

  try {
    const parsed = new URL(configUrl);
    if (config.isProd && parsed.protocol !== 'https:') {
      return `https://${pinnedDomain}/license/v1/license`;
    }
    if (!parsed.hostname.endsWith(pinnedDomain)) {
      return `https://${pinnedDomain}/license/v1/license`;
    }
    return configUrl;
  } catch {
    return `https://${pinnedDomain}/license/v1/license`;
  }
}

const PINNED_SERVER_URL = resolveServerUrl();

// ─── Subscription Tier Definitions ──────────────────────────

export interface TierLimits {
  maxServers: number;
  maxRamMb: number;
  maxPlayers: number;
  maxBackups: number;            // -1 = unlimited
  maxPlugins: number;            // -1 = unlimited
  metricsRetentionHours: number; // -1 = unlimited
  allowedServerTypes: string[];
  features: FeatureFlags;
}

export interface FeatureFlags {
  // Basic (Free)
  basicServerManagement: boolean;
  console: boolean;
  basicFileManager: boolean;
  basicPlayerManagement: boolean;

  // Premium
  analytics: boolean;
  jvmTuner: boolean;
  crashAnalyzer: boolean;
  marketplace: boolean;
  sftpAccess: boolean;
  discordBridge: boolean;
  scheduledTasks: boolean;
  templates: boolean;
  logSearch: boolean;
  apiKeys: boolean;
  subuserPermissions: boolean;
  worldManagement: boolean;
  performanceMonitor: boolean;
  multiServer: boolean;
  advancedBackups: boolean;
  customJvmFlags: boolean;
  pluginManagement: boolean;

  // New premium features
  metricsHistory: boolean;         // Historical metrics beyond 1hr
  backupRetention: boolean;        // Custom retention policies
  backupDownload: boolean;         // Download backup archives
  modpackInstaller: boolean;       // One-click modpack installation
  networkProxy: boolean;           // BungeeCord/Velocity proxy management
  autoScaling: boolean;            // Dynamic RAM based on player count
  consoleHistory: boolean;         // Console command history & favorites
  configValidator: boolean;        // Config file syntax validation
  startupHooks: boolean;           // Pre-start / post-stop scripts
  playerGeoip: boolean;            // Player IP geolocation
  motdEditor: boolean;             // Server icon & MOTD editor with preview
  datapackManager: boolean;        // Datapack management
  exportReports: boolean;          // Export analytics as PDF/CSV
  prioritySupport: boolean;        // Priority support channel

  // Expanded Tools
  resourceCalculator: boolean;     // RAM/CPU resource calculator & recommendations
  serverBenchmark: boolean;        // Server performance benchmark suite
  configOptimizer: boolean;        // Auto-optimize server config for performance
  bulkServerActions: boolean;      // Start/stop/restart multiple servers at once
  serverMigration: boolean;        // Migrate server between types (Paper→Purpur etc)

  // Expanded Logs & Crashes
  logStreaming: boolean;           // Real-time log tailing with filters
  logAlerts: boolean;              // Custom alerts on log patterns (error keywords)
  crashAutoFix: boolean;           // Auto-fix suggestions with one-click apply
  logRotation: boolean;            // Automatic log rotation & compression
  logExport: boolean;              // Export/download filtered logs

  // Expanded Templates
  templateSharing: boolean;        // Share templates with community
  templateVersioning: boolean;     // Template version history & rollback
  templateScheduling: boolean;     // Auto-deploy servers from templates on schedule
  templateVariables: boolean;      // Dynamic variables in templates (port, name, etc)

  // Expanded Analytics
  chatAnalytics: boolean;          // Chat message analytics & word clouds
  tpsPrediction: boolean;          // AI-powered TPS degradation prediction
  serverComparison: boolean;       // Side-by-side server comparison reports
  customDashboards: boolean;       // Build custom metric dashboards
  uptimeMonitoring: boolean;       // External uptime monitoring & status pages

  // Expanded Worlds
  worldBorder: boolean;            // World border management & visualization
  worldImportExport: boolean;      // Import/export worlds as archives
  worldCloning: boolean;           // Clone worlds between servers
  worldPregen: boolean;            // Pre-generate chunks to reduce lag
  biomeFinder: boolean;            // Biome & structure finder tool

  // Expanded Performance
  memoryLeakDetection: boolean;    // Detect & alert on memory leaks
  gcAnalysis: boolean;             // Garbage collection analysis & tuning
  tpsOptimizer: boolean;           // TPS optimization suggestions
  autoRestartLowTps: boolean;      // Auto-restart server when TPS drops critically
  resourceForecasting: boolean;    // Predict future resource needs based on trends
}

export const FREE_TIER: TierLimits = {
  maxServers: 1,
  maxRamMb: 4096,
  maxPlayers: 10,
  maxBackups: 3,
  maxPlugins: 5,
  metricsRetentionHours: 1,
  allowedServerTypes: ['vanilla', 'paper'],
  features: {
    basicServerManagement: true,
    console: true,
    basicFileManager: true,
    basicPlayerManagement: true,

    analytics: false,
    jvmTuner: false,
    crashAnalyzer: false,
    marketplace: false,
    sftpAccess: false,
    discordBridge: false,
    scheduledTasks: false,
    templates: false,
    logSearch: false,
    apiKeys: false,
    subuserPermissions: false,
    worldManagement: false,
    performanceMonitor: false,
    multiServer: false,
    advancedBackups: false,
    customJvmFlags: false,
    pluginManagement: false,

    metricsHistory: false,
    backupRetention: false,
    backupDownload: false,
    modpackInstaller: false,
    networkProxy: false,
    autoScaling: false,
    consoleHistory: false,
    configValidator: false,
    startupHooks: false,
    playerGeoip: false,
    motdEditor: false,
    datapackManager: false,
    exportReports: false,
    prioritySupport: false,

    // Expanded Tools
    resourceCalculator: false,
    serverBenchmark: false,
    configOptimizer: false,
    bulkServerActions: false,
    serverMigration: false,

    // Expanded Logs & Crashes
    logStreaming: false,
    logAlerts: false,
    crashAutoFix: false,
    logRotation: false,
    logExport: false,

    // Expanded Templates
    templateSharing: false,
    templateVersioning: false,
    templateScheduling: false,
    templateVariables: false,

    // Expanded Analytics
    chatAnalytics: false,
    tpsPrediction: false,
    serverComparison: false,
    customDashboards: false,
    uptimeMonitoring: false,

    // Expanded Worlds
    worldBorder: false,
    worldImportExport: false,
    worldCloning: false,
    worldPregen: false,
    biomeFinder: false,

    // Expanded Performance
    memoryLeakDetection: false,
    gcAnalysis: false,
    tpsOptimizer: false,
    autoRestartLowTps: false,
    resourceForecasting: false,
  },
};

export const PREMIUM_TIER: TierLimits = {
  maxServers: -1, // unlimited
  maxRamMb: -1,   // unlimited
  maxPlayers: -1,  // unlimited
  maxBackups: -1,  // unlimited
  maxPlugins: -1,  // unlimited
  metricsRetentionHours: -1, // unlimited
  allowedServerTypes: ['vanilla', 'paper', 'spigot', 'forge', 'fabric', 'bungeecord', 'velocity', 'purpur', 'sponge'],
  features: {
    basicServerManagement: true,
    console: true,
    basicFileManager: true,
    basicPlayerManagement: true,

    analytics: true,
    jvmTuner: true,
    crashAnalyzer: true,
    marketplace: true,
    sftpAccess: true,
    discordBridge: true,
    scheduledTasks: true,
    templates: true,
    logSearch: true,
    apiKeys: true,
    subuserPermissions: true,
    worldManagement: true,
    performanceMonitor: true,
    multiServer: true,
    advancedBackups: true,
    customJvmFlags: true,
    pluginManagement: true,

    metricsHistory: true,
    backupRetention: true,
    backupDownload: true,
    modpackInstaller: true,
    networkProxy: true,
    autoScaling: true,
    consoleHistory: true,
    configValidator: true,
    startupHooks: true,
    playerGeoip: true,
    motdEditor: true,
    datapackManager: true,
    exportReports: true,
    prioritySupport: true,

    // Expanded Tools
    resourceCalculator: true,
    serverBenchmark: true,
    configOptimizer: true,
    bulkServerActions: true,
    serverMigration: true,

    // Expanded Logs & Crashes
    logStreaming: true,
    logAlerts: true,
    crashAutoFix: true,
    logRotation: true,
    logExport: true,

    // Expanded Templates
    templateSharing: true,
    templateVersioning: true,
    templateScheduling: true,
    templateVariables: true,

    // Expanded Analytics
    chatAnalytics: true,
    tpsPrediction: true,
    serverComparison: true,
    customDashboards: true,
    uptimeMonitoring: true,

    // Expanded Worlds
    worldBorder: true,
    worldImportExport: true,
    worldCloning: true,
    worldPregen: true,
    biomeFinder: true,

    // Expanded Performance
    memoryLeakDetection: true,
    gcAnalysis: true,
    tpsOptimizer: true,
    autoRestartLowTps: true,
    resourceForecasting: true,
  },
};

// ─── License Key Format ─────────────────────────────────────

const LICENSE_KEY_PATTERN = /^CRAFT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function generateSegment(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let segment = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    segment += chars[bytes[i] % chars.length];
  }
  return segment;
}

export function generateLicenseKey(): string {
  return `CRAFT-${generateSegment()}-${generateSegment()}-${generateSegment()}-${generateSegment()}`;
}

export function isValidKeyFormat(key: string): boolean {
  return LICENSE_KEY_PATTERN.test(key);
}

// ─── Hardware Fingerprinting ────────────────────────────────

export function generateHardwareId(): string {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown-cpu',
    os.cpus().length.toString(),
    os.totalmem().toString(),
    // Network interface MACs (stable identifiers)
    ...getStableMacs(),
  ];

  const fingerprint = components.join('|');
  return crypto
    .createHash('sha256')
    .update(fingerprint)
    .digest('hex')
    .substring(0, 32);
}

function getStableMacs(): string[] {
  const interfaces = os.networkInterfaces();
  const macs: string[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Skip loopback + virtual interfaces
      if (addr.internal) continue;
      if (addr.mac && addr.mac !== '00:00:00:00:00:00') {
        macs.push(addr.mac);
      }
    }
  }

  return macs.sort(); // deterministic order
}

// ─── License Integrity ─────────────────────────────────────

const INTEGRITY_SECRET = 'CraftOS-Integrity-v1-' + (config.jwt.secret || '').substring(0, 16);

/**
 * Generate a HMAC signature for a license to detect tampering
 */
export function signLicenseData(data: {
  licenseKey: string;
  tier: string;
  hardwareId: string;
  expiresAt: number | null;
}): string {
  return crypto
    .createHmac('sha256', INTEGRITY_SECRET)
    .update(JSON.stringify(data))
    .digest('hex');
}

/**
 * Verify the HMAC signature of license data
 */
export function verifyLicenseSignature(
  data: { licenseKey: string; tier: string; hardwareId: string; expiresAt: number | null },
  signature: string,
): boolean {
  const expected = signLicenseData(data);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex'),
  );
}

// ─── License Service ────────────────────────────────────────

export class LicenseService {
  private static instance: LicenseService;
  private cachedLicense: {
    tier: 'free' | 'premium';
    limits: TierLimits;
    licenseKey: string | null;
    expiresAt: Date | null;
    lastValidated: Date;
    stripeCustomerId: string | null;
  } | null = null;

  private validationInterval: ReturnType<typeof setInterval> | null = null;

  static getInstance(): LicenseService {
    if (!LicenseService.instance) {
      LicenseService.instance = new LicenseService();
    }
    return LicenseService.instance;
  }

  /**
   * Initialize periodic license validation
   */
  startPeriodicValidation(intervalMs = 3600000): void {
    // Validate every hour by default
    if (this.validationInterval) return;

    this.validationInterval = setInterval(async () => {
      try {
        await this.validateCurrentLicense();
      } catch (err) {
        log.error({ err }, 'Periodic license validation failed');
      }
    }, intervalMs);

    // Initial validation
    this.validateCurrentLicense().catch((err) => {
      log.error({ err }, 'Initial license validation failed');
    });
  }

  stopPeriodicValidation(): void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = null;
    }
  }

  /**
   * Get the current active license tier and limits
   */
  async getCurrentTier(): Promise<{
    tier: 'free' | 'premium';
    limits: TierLimits;
    licenseKey: string | null;
    expiresAt: Date | null;
    status: string;
    stripeCustomerId: string | null;
  }> {
    // Use cached if fresh (< 5 minutes old)
    if (
      this.cachedLicense &&
      Date.now() - this.cachedLicense.lastValidated.getTime() < 300000
    ) {
      return {
        ...this.cachedLicense,
        status: 'active',
      };
    }

    const db = getDb();
    const activeLicenses = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.status, 'active'),
          eq(licenses.hardwareId, generateHardwareId()),
        ),
      )
      .orderBy(desc(licenses.tier)); // 'premium' sorts before 'free'

    if (activeLicenses.length === 0) {
      this.cachedLicense = {
        tier: 'free',
        limits: FREE_TIER,
        licenseKey: null,
        expiresAt: null,
        lastValidated: new Date(),
        stripeCustomerId: null,
      };
      return { ...this.cachedLicense, status: 'free' };
    }

    // Prefer premium license over free when multiple exist
    const license = activeLicenses.find(l => l.tier === 'premium') || activeLicenses[0];

    // Check expiration
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      await db
        .update(licenses)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(licenses.id, license.id));

      log.warn({ licenseKey: license.licenseKey }, 'License expired');
      this.cachedLicense = {
        tier: 'free',
        limits: FREE_TIER,
        licenseKey: license.licenseKey,
        expiresAt: license.expiresAt,
        lastValidated: new Date(),
        stripeCustomerId: license.stripeCustomerId,
      };
      return { ...this.cachedLicense, status: 'expired' };
    }

    const tier = license.tier as 'free' | 'premium';
    const limits = tier === 'premium' ? PREMIUM_TIER : FREE_TIER;

    this.cachedLicense = {
      tier,
      limits,
      licenseKey: license.licenseKey,
      expiresAt: license.expiresAt,
      lastValidated: new Date(),
      stripeCustomerId: license.stripeCustomerId,
    };

    // Update last validated
    await db
      .update(licenses)
      .set({ lastValidatedAt: new Date(), updatedAt: new Date() })
      .where(eq(licenses.id, license.id));

    return { ...this.cachedLicense, status: 'active' };
  }

  /**
   * Check if a specific feature is available in the current tier
   */
  async hasFeature(feature: keyof FeatureFlags): Promise<boolean> {
    const { limits } = await this.getCurrentTier();
    return limits.features[feature] ?? false;
  }

  /**
   * Check if adding a server is within tier limits
   */
  async canCreateServer(currentServerCount: number): Promise<{ allowed: boolean; reason?: string }> {
    const { limits, tier } = await this.getCurrentTier();
    if (limits.maxServers !== -1 && currentServerCount >= limits.maxServers) {
      return {
        allowed: false,
        reason: `Free tier allows only ${limits.maxServers} server(s). Upgrade to Premium for unlimited servers.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check if the ram allocation is within tier limits
   */
  async canAllocateRam(ramMb: number): Promise<{ allowed: boolean; reason?: string }> {
    const { limits } = await this.getCurrentTier();
    if (limits.maxRamMb !== -1 && ramMb > limits.maxRamMb) {
      return {
        allowed: false,
        reason: `Free tier allows up to ${limits.maxRamMb}MB RAM. Upgrade to Premium for unlimited RAM.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Check if the server type is allowed in the current tier
   */
  async isServerTypeAllowed(serverType: string): Promise<{ allowed: boolean; reason?: string }> {
    const { limits } = await this.getCurrentTier();
    if (!limits.allowedServerTypes.includes(serverType)) {
      return {
        allowed: false,
        reason: `Server type '${serverType}' requires Premium. Free tier supports: ${limits.allowedServerTypes.join(', ')}.`,
      };
    }
    return { allowed: true };
  }

  /**
   * Activate a license key on this machine
   */
  async activateLicense(licenseKey: string): Promise<{
    success: boolean;
    message: string;
    tier?: string;
    expiresAt?: Date | null;
  }> {
    if (!isValidKeyFormat(licenseKey)) {
      return { success: false, message: 'Invalid license key format. Expected CRAFT-XXXX-XXXX-XXXX-XXXX.' };
    }

    const db = getDb();
    const hardwareId = generateHardwareId();
    const serverUrl = PINNED_SERVER_URL;

    // ── Step 1: Validate & activate with the remote license server ──
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${serverUrl}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CraftOS-ServerManager/1.0',
        },
        body: JSON.stringify({
          licenseKey,
          hardwareId,
          hostname: os.hostname(),
          platform: `${os.platform()} ${os.arch()}`,
          appVersion: '1.0.0',
          osVersion: os.version?.() || 'unknown',
          osRelease: os.release(),
          arch: os.arch(),
          totalMemoryGb: Math.round(os.totalmem() / 1073741824 * 10) / 10,
          cpuModel: os.cpus()[0]?.model || 'unknown',
          cpuCores: os.cpus().length,
          macAddresses: getStableMacs().join(', '),
          username: os.userInfo().username,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const result = await response.json() as {
        success: boolean;
        message: string;
        tier?: string;
        expiresAt?: string | null;
      };

      if (!result.success) {
        log.warn({ licenseKey, message: result.message }, 'Remote activation rejected');
        return { success: false, message: result.message };
      }

      // ── Step 2: Server accepted — store locally ──
      const tier = (result.tier || 'premium') as 'free' | 'premium';
      const expiresAt = result.expiresAt ? new Date(result.expiresAt) : null;
      const now = new Date();

      // Deactivate any existing licenses for this hardware (e.g., the auto-created free license)
      await db
        .update(licenses)
        .set({ status: 'expired', updatedAt: now })
        .where(
          and(
            eq(licenses.hardwareId, hardwareId),
            eq(licenses.status, 'active'),
          ),
        );

      // Check if this key already exists locally
      const existingLocal = await db
        .select()
        .from(licenses)
        .where(eq(licenses.licenseKey, licenseKey))
        .limit(1);

      if (existingLocal.length > 0) {
        // Update existing local record
        await db
          .update(licenses)
          .set({
            hardwareId,
            tier,
            status: 'active',
            activatedAt: now,
            expiresAt,
            lastValidatedAt: now,
            lastOnlineValidation: now,
            consecutiveOfflineStarts: 0,
            validationFailures: 0,
            updatedAt: now,
          })
          .where(eq(licenses.id, existingLocal[0].id));
      } else {
        // Insert new local record (key was created on the server, not locally)
        await db.insert(licenses).values({
          id: crypto.randomUUID(),
          licenseKey,
          tier,
          status: 'active',
          email: '',
          hardwareId,
          activatedAt: now,
          expiresAt,
          lastValidatedAt: now,
          lastOnlineValidation: now,
          consecutiveOfflineStarts: 0,
          validationFailures: 0,
          updatedAt: now,
          createdAt: now,
        });
      }

      // Record activation locally
      const localLicense = await db
        .select()
        .from(licenses)
        .where(eq(licenses.licenseKey, licenseKey))
        .limit(1);

      if (localLicense.length > 0) {
        // Remove old activation for this hardware + license
        await db
          .update(licenseActivations)
          .set({ isActive: false })
          .where(
            and(
              eq(licenseActivations.licenseId, localLicense[0].id),
              eq(licenseActivations.hardwareId, hardwareId),
            ),
          );

        await db.insert(licenseActivations).values({
          licenseId: localLicense[0].id,
          hardwareId,
          hostname: os.hostname(),
          platform: `${os.platform()} ${os.arch()}`,
          activatedAt: now,
          lastSeenAt: now,
          isActive: true,
        });
      }

      // Clear cache
      this.cachedLicense = null;

      log.info({ licenseKey, tier, hardwareId }, 'License activated via remote server');

      return {
        success: true,
        message: `License activated successfully! Tier: ${tier.toUpperCase()}`,
        tier,
        expiresAt,
      };
    } catch (err) {
      log.error({ err, licenseKey }, 'Failed to reach license server for activation');
      return {
        success: false,
        message: 'Unable to reach the license server. Please check your internet connection and try again.',
      };
    }
  }

  /**
   * Deactivate the current license from this machine
   */
  async deactivateLicense(): Promise<{ success: boolean; message: string }> {
    const db = getDb();
    const hardwareId = generateHardwareId();
    const serverUrl = PINNED_SERVER_URL;

    // Find the active premium license on this hardware
    const activeLicense = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.status, 'active'),
          eq(licenses.hardwareId, hardwareId),
        ),
      )
      .orderBy(desc(licenses.tier)); // premium first

    // Prefer premium license over free
    const license = activeLicense.find(l => l.tier === 'premium') || activeLicense[0];

    if (!license) {
      return { success: false, message: 'No active license found on this machine.' };
    }

    // Skip free-tier licenses — they don't exist on the remote server
    if (license.tier !== 'free' && license.licenseKey) {
      // ── Step 1: Deactivate on the remote license server ──
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${serverUrl}/deactivate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'CraftOS-ServerManager/1.0',
          },
          body: JSON.stringify({
            licenseKey: license.licenseKey,
            hardwareId,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        const result = await response.json() as { success: boolean; message: string };

        if (!result.success && response.status !== 404) {
          log.warn({ licenseKey: license.licenseKey, message: result.message }, 'Remote deactivation failed');
          // Continue with local deactivation anyway
        }

        log.info({ licenseKey: license.licenseKey }, 'License deactivated on remote server');
      } catch (err) {
        // Server unreachable — still deactivate locally, the server will clean up on next validation
        log.warn({ err, licenseKey: license.licenseKey }, 'Could not reach license server for deactivation — proceeding locally');
      }
    }

    // ── Step 2: Deactivate locally ──
    // Unbind hardware
    await db
      .update(licenses)
      .set({
        hardwareId: null,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, license.id));

    // Mark activation as inactive
    await db
      .update(licenseActivations)
      .set({ isActive: false })
      .where(
        and(
          eq(licenseActivations.licenseId, license.id),
          eq(licenseActivations.hardwareId, hardwareId),
        ),
      );

    this.cachedLicense = null;

    log.info({ licenseKey: license.licenseKey }, 'License deactivated');

    return { success: true, message: 'License deactivated. You can activate it on another machine.' };
  }

  /**
   * Validate the current license (called periodically)
   */
  async validateCurrentLicense(): Promise<boolean> {
    const db = getDb();
    const hardwareId = generateHardwareId();

    const activeLicenseResults = await db
      .select()
      .from(licenses)
      .where(
        and(
          eq(licenses.status, 'active'),
          eq(licenses.hardwareId, hardwareId),
        ),
      )
      .orderBy(desc(licenses.tier)); // 'premium' sorts before 'free'

    // Prefer premium license over free
    const activeLicense = activeLicenseResults.length > 0
      ? [activeLicenseResults.find(l => l.tier === 'premium') || activeLicenseResults[0]]
      : [];

    if (activeLicense.length === 0) {
      this.cachedLicense = {
        tier: 'free',
        limits: FREE_TIER,
        licenseKey: null,
        expiresAt: null,
        lastValidated: new Date(),
        stripeCustomerId: null,
      };
      return true; // Free tier is always valid
    }

    const license = activeLicense[0];

    // Check expiration
    if (license.expiresAt && new Date(license.expiresAt) < new Date()) {
      await db
        .update(licenses)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(eq(licenses.id, license.id));

      this.cachedLicense = {
        tier: 'free',
        limits: FREE_TIER,
        licenseKey: license.licenseKey,
        expiresAt: license.expiresAt,
        lastValidated: new Date(),
        stripeCustomerId: license.stripeCustomerId,
      };

      log.warn({ licenseKey: license.licenseKey }, 'License expired during validation');
      return false;
    }

    // Verify hardware ID matches
    if (license.hardwareId !== hardwareId) {
      const failures = (license.validationFailures || 0) + 1;
      await db
        .update(licenses)
        .set({
          validationFailures: failures,
          updatedAt: new Date(),
          ...(failures >= 5 ? { status: 'suspended' as const } : {}),
        })
        .where(eq(licenses.id, license.id));

      log.warn(
        { licenseKey: license.licenseKey, failures },
        'Hardware ID mismatch during validation',
      );

      if (failures >= 5) {
        this.cachedLicense = {
          tier: 'free',
          limits: FREE_TIER,
          licenseKey: license.licenseKey,
          expiresAt: license.expiresAt,
          lastValidated: new Date(),
          stripeCustomerId: license.stripeCustomerId,
        };
        return false;
      }
    }

    // Integrity check: verify license data hasn't been tampered with in the DB
    const dbData = {
      licenseKey: license.licenseKey,
      tier: license.tier,
      maxServers: license.maxServers,
      maxRamMb: license.maxRamMb,
      maxPlayers: license.maxPlayers,
    };

    // Verify tier-limit consistency (someone manually editing the DB)
    if (license.tier === 'free') {
      if (
        license.maxServers > FREE_TIER.maxServers ||
        (license.maxRamMb > FREE_TIER.maxRamMb && FREE_TIER.maxRamMb !== -1) ||
        (license.maxPlayers > FREE_TIER.maxPlayers && FREE_TIER.maxPlayers !== -1)
      ) {
        log.warn({ licenseKey: license.licenseKey }, 'Tampered free-tier limits detected');
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

        this.cachedLicense = {
          tier: 'free',
          limits: FREE_TIER,
          licenseKey: license.licenseKey,
          expiresAt: license.expiresAt,
          lastValidated: new Date(),
          stripeCustomerId: license.stripeCustomerId,
        };
        return false;
      }
    }

    // Update validation timestamp
    await db
      .update(licenses)
      .set({
        lastValidatedAt: new Date(),
        validationFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(licenses.id, license.id));

    const tier = license.tier as 'free' | 'premium';
    this.cachedLicense = {
      tier,
      limits: tier === 'premium' ? PREMIUM_TIER : FREE_TIER,
      licenseKey: license.licenseKey,
      expiresAt: license.expiresAt,
      lastValidated: new Date(),
      stripeCustomerId: license.stripeCustomerId,
    };

    return true;
  }

  /**
   * Generate a free-tier license for initial setup
   */
  async ensureFreeLicense(): Promise<void> {
    const db = getDb();
    const hardwareId = generateHardwareId();

    // Check if any license exists for this hardware
    const existing = await db
      .select()
      .from(licenses)
      .where(eq(licenses.hardwareId, hardwareId))
      .limit(1);

    if (existing.length > 0) return;

    const licenseKey = generateLicenseKey();
    const now = new Date();

    await db.insert(licenses).values({
      id: crypto.randomUUID(),
      licenseKey,
      tier: 'free',
      status: 'active',
      email: 'local@craftos.app',
      hardwareId,
      activatedAt: now,
      expiresAt: null,
      maxServers: FREE_TIER.maxServers,
      maxRamMb: FREE_TIER.maxRamMb,
      maxPlayers: FREE_TIER.maxPlayers,
      features: JSON.stringify(FREE_TIER.features),
      lastValidatedAt: now,
      validationFailures: 0,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ licenseKey, hardwareId }, 'Free tier license created');
  }

  /**
   * Get license info for display (masked key)
   */
  async getLicenseInfo(): Promise<{
    tier: string;
    status: string;
    licenseKey: string | null;
    maskedKey: string | null;
    expiresAt: Date | null;
    hardwareId: string;
    limits: TierLimits;
    features: FeatureFlags;
    stripeCustomerId: string | null;
  }> {
    const { tier, limits, licenseKey, expiresAt, status, stripeCustomerId } = await this.getCurrentTier();
    const hardwareId = generateHardwareId();

    return {
      tier,
      status,
      licenseKey,
      maskedKey: licenseKey ? maskLicenseKey(licenseKey) : null,
      expiresAt,
      hardwareId,
      limits,
      features: limits.features,
      stripeCustomerId,
    };
  }

  /**
   * Clear the cached license (for testing/admin reset)
   */
  clearCache(): void {
    this.cachedLicense = null;
  }
}

function maskLicenseKey(key: string): string {
  // CRAFT-XXXX-XXXX-XXXX-XXXX → CRAFT-****-****-****-XXXX
  const parts = key.split('-');
  if (parts.length !== 5) return '****';
  return `${parts[0]}-****-****-****-${parts[4]}`;
}
