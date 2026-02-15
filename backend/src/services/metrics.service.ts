import { eq, desc, lt } from 'drizzle-orm';
import { getDb } from '../db';
import { serverMetrics, ServerMetric, settings, servers } from '../db/schema';
import { ServerManager } from './server-manager';
import { getProcessMetrics, getSystemMetrics, SystemMetrics } from '../utils/system-metrics';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('metrics');

export interface AlertThresholds {
  cpuWarning?: number;   // percent
  cpuCritical?: number;
  ramWarning?: number;   // MB
  ramCritical?: number;
  tpsWarning?: number;   // below this value
  tpsCritical?: number;
  enabled: boolean;
  cooldownMinutes: number; // min minutes between same alert
}

const DEFAULT_THRESHOLDS: AlertThresholds = {
  cpuWarning: 80,
  cpuCritical: 95,
  ramWarning: undefined,
  ramCritical: undefined,
  tpsWarning: 15,
  tpsCritical: 10,
  enabled: false,
  cooldownMinutes: 5,
};

// Track last alert time per server+type to avoid spam
const lastAlertTimes: Map<string, number> = new Map();

export class MetricsService {
  private static instance: MetricsService;
  private collectionInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Start collecting metrics at regular intervals
   */
  start(intervalMs = 15000): void {
    if (this.collectionInterval) return;

    log.info(`Starting metrics collection (every ${intervalMs / 1000}s)`);

    this.collectionInterval = setInterval(() => {
      this.collectMetrics().catch((err) => {
        log.error({ err }, 'Failed to collect metrics');
      });
    }, intervalMs);

    // Clean up old metrics every hour
    this.cleanupInterval = setInterval(
      () => this.cleanupOldMetrics().catch(() => {}),
      60 * 60 * 1000
    );
  }

  stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Collect metrics for all running servers
   */
  private async collectMetrics(): Promise<void> {
    const manager = ServerManager.getInstance();
    const statuses = manager.getAllStatuses();

    for (const [serverId, status] of statuses) {
      // Collect for both 'starting' and 'running' servers
      if ((status.status !== 'running' && status.status !== 'starting') || !status.pid) continue;

      try {
        const procMetrics = await getProcessMetrics(status.pid);
        const instance = manager.getServerInstance(serverId);

        if (instance && procMetrics) {
          instance.cpuUsage = procMetrics.cpu;
          instance.ramUsage = procMetrics.memory;
        }

        const cpu = procMetrics?.cpu ?? 0;
        const ram = procMetrics?.memory ?? 0;
        const tps = instance?.tps ?? 20.0;

        const db = getDb();
        await db.insert(serverMetrics).values({
          serverId,
          cpuUsage: cpu,
          ramUsage: ram,
          tps,
          playerCount: status.playerCount ?? 0,
          timestamp: new Date(),
        });
      } catch (err) {
        log.error({ err, serverId }, 'Failed to collect metrics for server');
      }

      // Check alert thresholds (only for running servers)
      if (status.status === 'running') {
        const serverRecord = await manager.getServer(serverId);
        const serverName = serverRecord?.name || serverId;
        const instance = manager.getServerInstance(serverId);
        await this.evaluateAlerts(serverId, serverName, instance?.cpuUsage ?? 0, instance?.ramUsage ?? 0, instance?.tps ?? 20);
      }
    }
  }

  /**
   * Evaluate performance thresholds and emit alerts
   */
  private async evaluateAlerts(serverId: string, serverName: string, cpu: number, ram: number, tps: number): Promise<void> {
    const thresholds = await this.getThresholds(serverId);
    if (!thresholds.enabled) return;

    const cooldownMs = (thresholds.cooldownMinutes || 5) * 60 * 1000;
    const now = Date.now();
    const alerts: Array<{ level: 'warning' | 'critical'; metric: string; value: number; threshold: number }> = [];

    // CPU checks
    if (thresholds.cpuCritical && cpu >= thresholds.cpuCritical) {
      alerts.push({ level: 'critical', metric: 'CPU', value: cpu, threshold: thresholds.cpuCritical });
    } else if (thresholds.cpuWarning && cpu >= thresholds.cpuWarning) {
      alerts.push({ level: 'warning', metric: 'CPU', value: cpu, threshold: thresholds.cpuWarning });
    }

    // RAM checks (in MB)
    const ramMB = Math.round(ram / (1024 * 1024));
    if (thresholds.ramCritical && ramMB >= thresholds.ramCritical) {
      alerts.push({ level: 'critical', metric: 'RAM', value: ramMB, threshold: thresholds.ramCritical });
    } else if (thresholds.ramWarning && ramMB >= thresholds.ramWarning) {
      alerts.push({ level: 'warning', metric: 'RAM', value: ramMB, threshold: thresholds.ramWarning });
    }

    // TPS checks (below threshold is bad)
    if (thresholds.tpsCritical && tps <= thresholds.tpsCritical) {
      alerts.push({ level: 'critical', metric: 'TPS', value: tps, threshold: thresholds.tpsCritical });
    } else if (thresholds.tpsWarning && tps <= thresholds.tpsWarning) {
      alerts.push({ level: 'warning', metric: 'TPS', value: tps, threshold: thresholds.tpsWarning });
    }

    const manager = ServerManager.getInstance();
    for (const alert of alerts) {
      const key = `${serverId}:${alert.metric}:${alert.level}`;
      const lastTime = lastAlertTimes.get(key) || 0;
      if (now - lastTime < cooldownMs) continue;

      lastAlertTimes.set(key, now);
      log.warn({ serverId, ...alert }, 'Performance alert triggered');

      // Emit as server event for WebSocket broadcast
      manager.emit('serverEvent', {
        serverId,
        type: 'performance_alert',
        data: {
          serverName,
          level: alert.level,
          metric: alert.metric,
          value: alert.metric === 'TPS' ? alert.value.toFixed(1) : Math.round(alert.value),
          threshold: alert.threshold,
          message: `${serverName}: ${alert.metric} ${alert.level === 'critical' ? 'CRITICAL' : 'warning'} — ${alert.metric === 'RAM' ? `${Math.round(alert.value)} MB` : alert.metric === 'TPS' ? alert.value.toFixed(1) : `${Math.round(alert.value)}%`} (threshold: ${alert.threshold}${alert.metric === 'RAM' ? ' MB' : alert.metric === 'CPU' ? '%' : ''})`,
        },
      });
    }
  }

  /**
   * Get alert thresholds for a server (falls back to global defaults)
   */
  async getThresholds(serverId?: string): Promise<AlertThresholds> {
    const db = getDb();

    // Try server-specific first
    if (serverId) {
      const row = await db.select().from(settings).where(eq(settings.key, `alerts:${serverId}`));
      if (row.length > 0) {
        try { return { ...DEFAULT_THRESHOLDS, ...JSON.parse(row[0].value) }; } catch {}
      }
    }

    // Try global
    const globalRow = await db.select().from(settings).where(eq(settings.key, 'alerts:global'));
    if (globalRow.length > 0) {
      try { return { ...DEFAULT_THRESHOLDS, ...JSON.parse(globalRow[0].value) }; } catch {}
    }

    return { ...DEFAULT_THRESHOLDS };
  }

  /**
   * Set alert thresholds
   */
  async setThresholds(thresholds: Partial<AlertThresholds>, serverId?: string): Promise<void> {
    const db = getDb();
    const key = serverId ? `alerts:${serverId}` : 'alerts:global';
    const existing = await db.select().from(settings).where(eq(settings.key, key));
    const merged = { ...DEFAULT_THRESHOLDS, ...(existing.length ? JSON.parse(existing[0].value) : {}), ...thresholds };

    if (existing.length > 0) {
      await db.update(settings).set({ value: JSON.stringify(merged), updatedAt: new Date() }).where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({ key, value: JSON.stringify(merged), updatedAt: new Date() });
    }
  }

  /**
   * Get recent metrics for a server
   */
  async getMetrics(serverId: string, limit = 100): Promise<ServerMetric[]> {
    const db = getDb();
    return db
      .select()
      .from(serverMetrics)
      .where(eq(serverMetrics.serverId, serverId))
      .orderBy(desc(serverMetrics.timestamp))
      .limit(limit);
  }

  /**
   * Get system-level metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    return getSystemMetrics();
  }

  /**
   * Remove metrics older than 7 days
   */
  private async cleanupOldMetrics(): Promise<void> {
    const db = getDb();
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const cutoffTimestamp = Math.floor(cutoff.getTime() / 1000);
    try {
      // Use the underlying better-sqlite3 connection for raw SQL
      const rawDb = (db as any).session?.client;
      if (rawDb && typeof rawDb.prepare === 'function') {
        const stmt = rawDb.prepare('DELETE FROM server_metrics WHERE timestamp < ?');
        const result = stmt.run(cutoffTimestamp);
        log.info({ deleted: result.changes }, 'Old metrics cleanup completed');
      } else {
        // Fallback to drizzle lt operator
        await db.delete(serverMetrics).where(lt(serverMetrics.timestamp, cutoff));
        log.info('Old metrics cleanup completed (drizzle)');
      }
    } catch (err) {
      log.error({ err }, 'Failed to clean up old metrics');
    }
  }
}
