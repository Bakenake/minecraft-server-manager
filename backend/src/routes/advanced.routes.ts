import { FastifyInstance } from 'fastify';
import { authMiddleware } from '../auth/middleware';
import { ServerManager } from '../services/server-manager';
import { CrashAnalyzer } from '../services/crash-analyzer.service';
import { JVM_PRESETS, JVM_FLAG_EXPLANATIONS, buildJvmArgs, estimateRealMemory } from '../services/jvm-tuner';
import { getDb } from '../db';
import { servers } from '../db/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('advanced-routes');

export async function advancedRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const crashAnalyzer = CrashAnalyzer.getInstance();
  const manager = ServerManager.getInstance();

  // ═══════════════════════════════════════════════════════════
  // JVM TUNER
  // ═══════════════════════════════════════════════════════════

  // ─── List JVM presets ─────────────────────────────────────
  app.get('/api/jvm/presets', async () => {
    return JVM_PRESETS;
  });

  // ─── Get flag explanations ────────────────────────────────
  app.get('/api/jvm/flags', async () => {
    return JVM_FLAG_EXPLANATIONS;
  });

  // ─── Build JVM args ───────────────────────────────────────
  app.post('/api/jvm/build', async (request) => {
    const { minRam, maxRam, presetId, customFlags } = request.body as {
      minRam: number;
      maxRam: number;
      presetId?: string;
      customFlags?: string[];
    };

    const args = buildJvmArgs(minRam, maxRam, presetId, customFlags);
    const memory = estimateRealMemory(maxRam);
    return { args, memory, command: args.join(' ') };
  });

  // ═══════════════════════════════════════════════════════════
  // CRASH REPORT ANALYZER
  // ═══════════════════════════════════════════════════════════

  // ─── List crash reports for a server ──────────────────────
  app.get('/api/servers/:id/crashes', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const reports = crashAnalyzer.findCrashReports(server.directory);
    return { reports, count: reports.length };
  });

  // ─── Analyze a specific crash report ──────────────────────
  app.get('/api/servers/:id/crashes/:filename', async (request, reply) => {
    const { id, filename } = request.params as { id: string; filename: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const report = crashAnalyzer.analyzeFile(server.directory, filename);
    if (!report) return reply.status(404).send({ error: 'Crash report not found' });

    return report;
  });

  // ─── Analyze pasted crash content ─────────────────────────
  app.post('/api/crashes/analyze', async (request) => {
    const { content } = request.body as { content: string };
    return crashAnalyzer.analyze(content);
  });

  // ─── Analyze latest.log for issues ────────────────────────
  app.get('/api/servers/:id/log-analysis', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    return crashAnalyzer.analyzeLatestLog(server.directory);
  });

  // ═══════════════════════════════════════════════════════════
  // LOG SEARCH
  // ═══════════════════════════════════════════════════════════

  // ─── Search through server logs ───────────────────────────
  app.get('/api/servers/:id/logs/search', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { query, file, limit } = request.query as {
      query?: string;
      file?: string;
      limit?: string;
    };

    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    if (!query) return reply.status(400).send({ error: 'Query parameter required' });

    const logsDir = path.join(server.directory, 'logs');
    if (!fs.existsSync(logsDir)) return { results: [], total: 0 };

    const maxResults = Math.min(parseInt(limit || '200'), 1000);
    const targetFile = file || 'latest.log';
    const logPath = path.join(logsDir, targetFile);
    const resolvedPath = path.resolve(logPath);

    // Path traversal protection
    if (!resolvedPath.startsWith(path.resolve(logsDir))) {
      return reply.status(400).send({ error: 'Invalid file path' });
    }

    if (!fs.existsSync(resolvedPath)) {
      return { results: [], total: 0 };
    }

    try {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      const lines = content.split('\n');
      const queryLower = query.toLowerCase();
      const isRegex = query.startsWith('/') && query.endsWith('/');

      let matcher: (line: string) => boolean;
      if (isRegex) {
        try {
          const regex = new RegExp(query.slice(1, -1), 'i');
          matcher = (line: string) => regex.test(line);
        } catch {
          matcher = (line: string) => line.toLowerCase().includes(queryLower);
        }
      } else {
        matcher = (line: string) => line.toLowerCase().includes(queryLower);
      }

      const results: Array<{ line: number; text: string }> = [];
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (matcher(lines[i])) {
          results.push({ line: i + 1, text: lines[i] });
        }
      }

      return { results, total: results.length, file: targetFile };
    } catch {
      return { results: [], total: 0, error: 'Failed to read log file' };
    }
  });

  // ─── List available log files ─────────────────────────────
  app.get('/api/servers/:id/logs/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const logsDir = path.join(server.directory, 'logs');
    if (!fs.existsSync(logsDir)) return [];

    try {
      const files = fs.readdirSync(logsDir)
        .filter((f) => f.endsWith('.log') || f.endsWith('.log.gz'))
        .map((f) => {
          const stat = fs.statSync(path.join(logsDir, f));
          return {
            name: f,
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

      return files;
    } catch {
      return [];
    }
  });

  // ═══════════════════════════════════════════════════════════
  // PLAYER ANALYTICS
  // ═══════════════════════════════════════════════════════════

  // ─── Player activity heatmap ──────────────────────────────
  app.get('/api/analytics/activity', async (request) => {
    const { serverId, days } = request.query as { serverId?: string; days?: string };
    const lookbackDays = parseInt(days || '30');
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const db = getDb();
    // Use server_metrics to build hourly player activity
    const { serverMetrics } = await import('../db/schema');

    let query = db.select({
      playerCount: serverMetrics.playerCount,
      timestamp: serverMetrics.timestamp,
    }).from(serverMetrics);

    if (serverId) {
      query = query.where(eq(serverMetrics.serverId, serverId)) as any;
    }

    const metrics = await (query as any);

    // Build hourly heatmap: { dayOfWeek: 0-6, hour: 0-23, avgPlayers: number }
    const hourBuckets: Record<string, { total: number; count: number }> = {};
    for (const m of metrics) {
      const ts = new Date(m.timestamp);
      if (ts < since) continue;
      const key = `${ts.getDay()}-${ts.getHours()}`;
      if (!hourBuckets[key]) hourBuckets[key] = { total: 0, count: 0 };
      hourBuckets[key].total += m.playerCount || 0;
      hourBuckets[key].count += 1;
    }

    const heatmap = Object.entries(hourBuckets).map(([key, data]) => {
      const [day, hour] = key.split('-').map(Number);
      return {
        dayOfWeek: day,
        hour,
        avgPlayers: Math.round((data.total / data.count) * 10) / 10,
      };
    });

    return { heatmap, days: lookbackDays };
  });

  // ─── Server uptime statistics ─────────────────────────────
  app.get('/api/analytics/uptime', async (request) => {
    const { serverId, days } = request.query as { serverId?: string; days?: string };
    const lookbackDays = parseInt(days || '30');
    const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const db = getDb();
    const { serverMetrics } = await import('../db/schema');

    let metrics: any[];
    if (serverId) {
      metrics = await db.select({
        timestamp: serverMetrics.timestamp,
        cpuUsage: serverMetrics.cpuUsage,
        tps: serverMetrics.tps,
        playerCount: serverMetrics.playerCount,
      }).from(serverMetrics)
        .where(eq(serverMetrics.serverId, serverId));
    } else {
      metrics = await db.select({
        timestamp: serverMetrics.timestamp,
        cpuUsage: serverMetrics.cpuUsage,
        tps: serverMetrics.tps,
        playerCount: serverMetrics.playerCount,
      }).from(serverMetrics);
    }

    const recentMetrics = metrics.filter((m: any) => new Date(m.timestamp) >= since);

    // Each metric represents ~15s of uptime
    const totalOnlineSeconds = recentMetrics.length * 15;
    const totalPossibleSeconds = lookbackDays * 24 * 60 * 60;
    const uptimePercent = totalPossibleSeconds > 0
      ? Math.round((totalOnlineSeconds / totalPossibleSeconds) * 10000) / 100
      : 0;

    // Peak player count
    const peakPlayers = Math.max(0, ...recentMetrics.map((m: any) => m.playerCount || 0));

    // Average TPS
    const tpsValues = recentMetrics.filter((m: any) => m.tps != null).map((m: any) => m.tps);
    const avgTps = tpsValues.length > 0
      ? Math.round((tpsValues.reduce((a: number, b: number) => a + b, 0) / tpsValues.length) * 10) / 10
      : 20.0;

    // Average CPU
    const cpuValues = recentMetrics.filter((m: any) => m.cpuUsage != null).map((m: any) => m.cpuUsage);
    const avgCpu = cpuValues.length > 0
      ? Math.round((cpuValues.reduce((a: number, b: number) => a + b, 0) / cpuValues.length) * 10) / 10
      : 0;

    return {
      uptimePercent,
      totalOnlineHours: Math.round(totalOnlineSeconds / 3600 * 10) / 10,
      peakPlayers,
      avgTps,
      avgCpu,
      days: lookbackDays,
      dataPoints: recentMetrics.length,
    };
  });

  // ─── Player retention ─────────────────────────────────────
  app.get('/api/analytics/retention', async () => {
    const db = getDb();
    const { players } = await import('../db/schema');

    const allPlayers = await db.select().from(players);

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    // Active in last 24h, 7d, 30d
    const active24h = allPlayers.filter((p) => now - new Date(p.lastSeen).getTime() < day).length;
    const active7d = allPlayers.filter((p) => now - new Date(p.lastSeen).getTime() < 7 * day).length;
    const active30d = allPlayers.filter((p) => now - new Date(p.lastSeen).getTime() < 30 * day).length;

    // New players this week
    const newThisWeek = allPlayers.filter((p) => now - new Date(p.firstSeen).getTime() < 7 * day).length;

    // Average playtime
    const totalPlaytime = allPlayers.reduce((a, p) => a + (p.playTime || 0), 0);
    const avgPlaytime = allPlayers.length > 0 ? Math.round(totalPlaytime / allPlayers.length) : 0;

    // Top players by playtime
    const topPlayers = [...allPlayers]
      .sort((a, b) => (b.playTime || 0) - (a.playTime || 0))
      .slice(0, 10)
      .map((p) => ({
        username: p.username,
        playTime: p.playTime,
        lastSeen: p.lastSeen,
        firstSeen: p.firstSeen,
      }));

    return {
      totalPlayers: allPlayers.length,
      active24h,
      active7d,
      active30d,
      newThisWeek,
      avgPlaytimeSeconds: avgPlaytime,
      topPlayers,
    };
  });
}
