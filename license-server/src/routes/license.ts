/**
 * License Validation Routes
 *
 * These are the PUBLIC endpoints that the CraftOS desktop app calls
 * to validate license keys. No admin auth required.
 *
 * POST /v1/license/validate  — Phone-home validation
 * POST /v1/license/activate  — Activate a key on a machine
 * POST /v1/license/deactivate — Deactivate a key from a machine
 */

import { Router, Request, Response } from 'express';
import { getDb } from '../db';
import { v4 as uuid } from 'uuid';

const router = Router();

// ─── Validate License (Phone-Home) ─────────────────────────

interface ValidateBody {
  licenseKey: string;
  hardwareId: string;
  hostname?: string;
  platform?: string;
  arch?: string;
  appVersion?: string;
  timestamp?: number;
  osVersion?: string;
  osRelease?: string;
  totalMemoryGb?: number;
  cpuModel?: string;
  cpuCores?: number;
  username?: string;
}

router.post('/validate', (req: Request<{}, {}, ValidateBody>, res: Response): void => {
  const { licenseKey, hardwareId, hostname, platform, appVersion, osVersion, osRelease, totalMemoryGb, cpuModel, cpuCores, username, arch } = req.body;

  if (!licenseKey || !hardwareId) {
    res.status(400).json({ valid: false, message: 'Missing licenseKey or hardwareId' });
    return;
  }

  const db = getDb();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  // Look up the license
  const license = db.prepare(
    'SELECT * FROM licenses WHERE license_key = ?'
  ).get(licenseKey) as any;

  if (!license) {
    // Log the attempt
    db.prepare(
      'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
    ).run(licenseKey, hardwareId, ip, 'not_found', 'License key not found');

    res.status(404).json({
      valid: false,
      tier: 'free',
      expiresAt: null,
      features: {},
      message: 'License key not found',
    });
    return;
  }

  // Check if revoked
  if (license.status === 'revoked') {
    db.prepare(
      'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
    ).run(licenseKey, hardwareId, ip, 'revoked', 'License revoked');

    res.status(403).json({
      valid: false,
      tier: 'free',
      expiresAt: null,
      features: {},
      revoked: true,
      message: 'License has been revoked',
    });
    return;
  }

  // Check if suspended
  if (license.status === 'suspended') {
    db.prepare(
      'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
    ).run(licenseKey, hardwareId, ip, 'invalid', 'License suspended');

    res.status(403).json({
      valid: false,
      tier: 'free',
      expiresAt: null,
      features: {},
      message: 'License has been suspended. Contact support.',
    });
    return;
  }

  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    db.prepare(
      'UPDATE licenses SET status = ?, updated_at = datetime(?) WHERE id = ?'
    ).run('expired', new Date().toISOString(), license.id);

    db.prepare(
      'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
    ).run(licenseKey, hardwareId, ip, 'expired', 'License expired');

    res.json({
      valid: false,
      tier: 'free',
      expiresAt: license.expires_at,
      features: {},
      message: 'License has expired',
    });
    return;
  }

  // Check hardware binding — is this hardware authorized for this key?
  const activation = db.prepare(
    'SELECT * FROM activations WHERE license_id = ? AND hardware_id = ? AND is_active = 1'
  ).get(license.id, hardwareId) as any;

  if (!activation) {
    // Check if there's room for another activation
    const activeCount = db.prepare(
      'SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND is_active = 1'
    ).get(license.id) as any;

    if (activeCount.count >= license.max_activations) {
      db.prepare(
        'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
      ).run(licenseKey, hardwareId, ip, 'hardware_mismatch', `Max activations (${license.max_activations}) reached`);

      res.json({
        valid: false,
        tier: 'free',
        expiresAt: license.expires_at,
        features: {},
        message: 'License is activated on the maximum number of machines',
      });
      return;
    }

    // Auto-activate on this hardware (within limit)
    db.prepare(
      `INSERT INTO activations (id, license_id, hardware_id, hostname, platform, app_version, ip_address, is_active, activated_at, last_seen_at, os_version, os_release, arch, total_memory_gb, cpu_model, cpu_cores, username)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), license.id, hardwareId, hostname || 'unknown', platform || 'unknown', appVersion || 'unknown', ip,
      osVersion || null, osRelease || null, arch || null, totalMemoryGb || null, cpuModel || null, cpuCores || null, username || null);

    // Update the license hardware_id to the latest activation
    db.prepare(
      'UPDATE licenses SET hardware_id = ?, updated_at = datetime(?) WHERE id = ?'
    ).run(hardwareId, new Date().toISOString(), license.id);
  } else {
    // Update last seen + enriched data
    db.prepare(
      `UPDATE activations SET last_seen_at = datetime(?), app_version = COALESCE(?, app_version), ip_address = ?,
       os_version = COALESCE(?, os_version), os_release = COALESCE(?, os_release), arch = COALESCE(?, arch),
       total_memory_gb = COALESCE(?, total_memory_gb), cpu_model = COALESCE(?, cpu_model), cpu_cores = COALESCE(?, cpu_cores),
       username = COALESCE(?, username)
       WHERE id = ?`
    ).run(new Date().toISOString(), appVersion || null, ip,
      osVersion || null, osRelease || null, arch || null, totalMemoryGb || null, cpuModel || null, cpuCores || null, username || null, activation.id);
  }

  // Build the full feature set for premium
  const features = license.tier === 'premium' ? getAllPremiumFeatures() : {};

  // Log successful validation
  db.prepare(
    'INSERT INTO validation_log (license_key, hardware_id, ip_address, result, message) VALUES (?, ?, ?, ?, ?)'
  ).run(licenseKey, hardwareId, ip, 'valid', `Valid ${license.tier} license`);

  res.json({
    valid: true,
    tier: license.tier,
    expiresAt: license.expires_at,
    features,
    message: 'License is valid',
  });
});

// ─── Activate License on Hardware ───────────────────────────

interface ActivateBody {
  licenseKey: string;
  hardwareId: string;
  hostname?: string;
  platform?: string;
  appVersion?: string;
  osVersion?: string;
  osRelease?: string;
  arch?: string;
  totalMemoryGb?: number;
  cpuModel?: string;
  cpuCores?: number;
  macAddresses?: string;
  username?: string;
}

router.post('/activate', (req: Request<{}, {}, ActivateBody>, res: Response): void => {
  const { licenseKey, hardwareId, hostname, platform, appVersion, osVersion, osRelease, arch, totalMemoryGb, cpuModel, cpuCores, macAddresses, username } = req.body;

  if (!licenseKey || !hardwareId) {
    res.status(400).json({ success: false, message: 'Missing licenseKey or hardwareId' });
    return;
  }

  const db = getDb();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  const license = db.prepare(
    'SELECT * FROM licenses WHERE license_key = ?'
  ).get(licenseKey) as any;

  if (!license) {
    res.status(404).json({ success: false, message: 'License key not found' });
    return;
  }

  if (license.status !== 'active') {
    res.status(403).json({ success: false, message: `License is ${license.status}` });
    return;
  }

  // Check expiration
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    db.prepare('UPDATE licenses SET status = ? WHERE id = ?').run('expired', license.id);
    res.status(403).json({ success: false, message: 'License has expired' });
    return;
  }

  // Check existing activation for this hardware
  const existing = db.prepare(
    'SELECT * FROM activations WHERE license_id = ? AND hardware_id = ?'
  ).get(license.id, hardwareId) as any;

  if (existing && existing.is_active) {
    res.json({
      success: true,
      message: 'Already activated on this machine',
      tier: license.tier,
      expiresAt: license.expires_at,
    });
    return;
  }

  // Check activation limit
  const activeCount = db.prepare(
    'SELECT COUNT(*) as count FROM activations WHERE license_id = ? AND is_active = 1'
  ).get(license.id) as any;

  if (activeCount.count >= license.max_activations) {
    res.status(403).json({
      success: false,
      message: `Maximum activations (${license.max_activations}) reached. Deactivate another machine first.`,
    });
    return;
  }

  // Create or reactivate
  if (existing) {
    db.prepare(
      `UPDATE activations SET is_active = 1, last_seen_at = datetime(?), ip_address = ?, deactivated_at = NULL,
       os_version = COALESCE(?, os_version), os_release = COALESCE(?, os_release), arch = COALESCE(?, arch),
       total_memory_gb = COALESCE(?, total_memory_gb), cpu_model = COALESCE(?, cpu_model), cpu_cores = COALESCE(?, cpu_cores),
       mac_addresses = COALESCE(?, mac_addresses), username = COALESCE(?, username), app_version = COALESCE(?, app_version)
       WHERE id = ?`
    ).run(new Date().toISOString(), ip, osVersion || null, osRelease || null, arch || null,
      totalMemoryGb || null, cpuModel || null, cpuCores || null, macAddresses || null, username || null, appVersion || null, existing.id);
  } else {
    db.prepare(
      `INSERT INTO activations (id, license_id, hardware_id, hostname, platform, app_version, ip_address, is_active, activated_at, last_seen_at, os_version, os_release, arch, total_memory_gb, cpu_model, cpu_cores, mac_addresses, username)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuid(), license.id, hardwareId, hostname || 'unknown', platform || 'unknown', appVersion || 'unknown', ip,
      osVersion || null, osRelease || null, arch || null, totalMemoryGb || null, cpuModel || null, cpuCores || null, macAddresses || null, username || null);
  }

  // Update license hardware_id
  db.prepare(
    'UPDATE licenses SET hardware_id = ?, updated_at = datetime(?) WHERE id = ?'
  ).run(hardwareId, new Date().toISOString(), license.id);

  console.log(`[license] Activated ${licenseKey} on ${hardwareId} (${hostname})`);

  res.json({
    success: true,
    message: 'License activated successfully',
    tier: license.tier,
    expiresAt: license.expires_at,
  });
});

// ─── Deactivate License from Hardware ───────────────────────

interface DeactivateBody {
  licenseKey: string;
  hardwareId: string;
}

router.post('/deactivate', (req: Request<{}, {}, DeactivateBody>, res: Response): void => {
  const { licenseKey, hardwareId } = req.body;

  if (!licenseKey || !hardwareId) {
    res.status(400).json({ success: false, message: 'Missing licenseKey or hardwareId' });
    return;
  }

  const db = getDb();

  const license = db.prepare(
    'SELECT * FROM licenses WHERE license_key = ?'
  ).get(licenseKey) as any;

  if (!license) {
    res.status(404).json({ success: false, message: 'License key not found' });
    return;
  }

  const result = db.prepare(
    'UPDATE activations SET is_active = 0, deactivated_at = datetime(?) WHERE license_id = ? AND hardware_id = ? AND is_active = 1'
  ).run(new Date().toISOString(), license.id, hardwareId);

  if (result.changes === 0) {
    res.json({ success: true, message: 'No active activation found for this machine' });
    return;
  }

  console.log(`[license] Deactivated ${licenseKey} from ${hardwareId}`);
  res.json({ success: true, message: 'License deactivated from this machine' });
});

// ─── Helpers ────────────────────────────────────────────────

function getAllPremiumFeatures(): Record<string, boolean> {
  return {
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
    resourceCalculator: true,
    serverBenchmark: true,
    configOptimizer: true,
    bulkServerActions: true,
    serverMigration: true,
    logStreaming: true,
    logAlerts: true,
    crashAutoFix: true,
    logRotation: true,
    logExport: true,
    templateSharing: true,
    templateVersioning: true,
    templateScheduling: true,
    templateVariables: true,
    chatAnalytics: true,
    tpsPrediction: true,
    serverComparison: true,
    customDashboards: true,
    uptimeMonitoring: true,
    worldBorder: true,
    worldImportExport: true,
    worldCloning: true,
    worldPregen: true,
    biomeFinder: true,
    memoryLeakDetection: true,
    gcAnalysis: true,
    tpsOptimizer: true,
    autoRestartLowTps: true,
    resourceForecasting: true,
  };
}

export default router;
