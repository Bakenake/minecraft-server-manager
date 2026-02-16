import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { authMiddleware, requireRole } from '../auth/middleware';
import { MetricsService } from '../services/metrics.service';
import { SchedulerService } from '../services/scheduler.service';
import { getDb } from '../db';
import { feedback, settings, auditLog } from '../db/schema';
import { config } from '../config';
import { NotificationService } from '../services/notification.service';
import { requireFeature } from '../auth/feature-gate';

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const metricsService = MetricsService.getInstance();
  const schedulerService = SchedulerService.getInstance();

  // ─── System metrics ──────────────────────────────────────
  app.get('/api/system/metrics', async () => {
    return metricsService.getSystemMetrics();
  });

  // ─── Server metrics history ──────────────────────────────
  app.get('/api/servers/:id/metrics', async (request) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };
    return metricsService.getMetrics(id, parseInt(limit ?? '100', 10));
  });

  // ─── Scheduled tasks ────────────────────────────────────
  app.get('/api/servers/:id/schedule', { preHandler: requireFeature('scheduledTasks') }, async (request) => {
    const { id } = request.params as { id: string };
    return schedulerService.getTasksForServer(id);
  });

  app.post(
    '/api/servers/:id/schedule',
    { preHandler: [requireRole('admin', 'moderator'), requireFeature('scheduledTasks')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        type: z.enum(['restart', 'backup', 'command']),
        cronExpression: z.string(),
        command: z.string().optional(),
        enabled: z.boolean().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const task = await schedulerService.createTask({ serverId: id, ...parsed.data });
      return task;
    }
  );

  app.delete(
    '/api/schedule/:taskId',
    { preHandler: [requireRole('admin'), requireFeature('scheduledTasks')] },
    async (request) => {
      const { taskId } = request.params as { taskId: string };
      await schedulerService.deleteTask(taskId);
      return { message: 'Task deleted' };
    }
  );

  app.patch(
    '/api/schedule/:taskId/toggle',
    { preHandler: [requireRole('admin', 'moderator'), requireFeature('scheduledTasks')] },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const schema = z.object({ enabled: z.boolean() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      await schedulerService.toggleTask(taskId, parsed.data.enabled);
      return { message: `Task ${parsed.data.enabled ? 'enabled' : 'disabled'}` };
    }
  );

  // ─── Edit Task ───────────────────────────────────────────
  app.put(
    '/api/schedule/:taskId',
    { preHandler: [requireRole('admin', 'moderator'), requireFeature('scheduledTasks')] },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      const schema = z.object({
        cronExpression: z.string().optional(),
        command: z.string().optional(),
        type: z.enum(['restart', 'backup', 'command']).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const task = await schedulerService.updateTask(taskId, parsed.data);
      if (!task) return reply.status(404).send({ error: 'Task not found' });
      return task;
    }
  );

  // ─── Run Task Now ────────────────────────────────────────
  app.post(
    '/api/schedule/:taskId/run',
    { preHandler: [requireRole('admin', 'moderator'), requireFeature('scheduledTasks')] },
    async (request, reply) => {
      const { taskId } = request.params as { taskId: string };
      try {
        await schedulerService.runNow(taskId);
        return { message: 'Task executed' };
      } catch (err: any) {
        return reply.status(400).send({ error: err.message || 'Failed to run task' });
      }
    }
  );

  // ─── Task History ────────────────────────────────────────
  app.get('/api/schedule/history', async (request) => {
    const { serverId, limit } = request.query as { serverId?: string; limit?: string };
    return schedulerService.getHistory(serverId, limit ? parseInt(limit) : 50);
  });

  // ─── Feedback ────────────────────────────────────────────
  app.post('/api/feedback', async (request, reply) => {
    const schema = z.object({
      type: z.enum(['bug', 'feature', 'general']),
      subject: z.string().min(1).max(256),
      message: z.string().min(1).max(4096),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

    const db = getDb();
    await db.insert(feedback).values({
      userId: request.user?.userId,
      type: parsed.data.type,
      subject: parsed.data.subject,
      message: parsed.data.message,
      createdAt: new Date(),
    });

    return { message: 'Feedback submitted, thank you!' };
  });

  app.get(
    '/api/feedback',
    { preHandler: requireRole('admin') },
    async () => {
      const db = getDb();
      return db.select().from(feedback);
    }
  );

  // ─── Settings ────────────────────────────────────────────
  app.get(
    '/api/settings',
    { preHandler: requireRole('admin') },
    async () => {
      const db = getDb();
      return db.select().from(settings);
    }
  );

  app.put(
    '/api/settings',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const schema = z.object({
        key: z.string(),
        value: z.string(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const db = getDb();
      const existing = await db.select().from(settings).where(eq(settings.key, parsed.data.key));

      if (existing.length > 0) {
        await db
          .update(settings)
          .set({ value: parsed.data.value, updatedAt: new Date() })
          .where(eq(settings.key, parsed.data.key));
      } else {
        await db.insert(settings).values({
          key: parsed.data.key,
          value: parsed.data.value,
          updatedAt: new Date(),
        });
      }

      return { message: 'Setting updated' };
    }
  );

  // ─── App info ────────────────────────────────────────────
  app.get('/api/system/info', async () => {
    return {
      version: config.version,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      features: config.features,
    };
  });

  // ─── Audit log ───────────────────────────────────────────
  app.get(
    '/api/system/audit',
    { preHandler: requireRole('admin') },
    async (request) => {
      const { limit } = request.query as { limit?: string };
      const db = getDb();
      return db.select().from(auditLog).limit(parseInt(limit ?? '100', 10));
    }
  );

  // ─── Discord webhook ────────────────────────────────────
  app.get(
    '/api/system/discord-webhook',
    { preHandler: [requireRole('admin'), requireFeature('discordBridge')] },
    async () => {
      const ns = NotificationService.getInstance();
      return { enabled: ns.enabled };
    }
  );

  app.put(
    '/api/system/discord-webhook',
    { preHandler: [requireRole('admin'), requireFeature('discordBridge')] },
    async (request, reply) => {
      const schema = z.object({ url: z.string() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      const ns = NotificationService.getInstance();
      ns.setWebhookUrl(parsed.data.url);

      // Also persist to settings table
      const db = getDb();
      const existing = await db.select().from(settings).where(eq(settings.key, 'discord_webhook_url'));
      if (existing.length > 0) {
        await db.update(settings).set({ value: parsed.data.url, updatedAt: new Date() }).where(eq(settings.key, 'discord_webhook_url'));
      } else {
        await db.insert(settings).values({ key: 'discord_webhook_url', value: parsed.data.url, updatedAt: new Date() });
      }

      return { message: 'Webhook URL updated', enabled: ns.enabled };
    }
  );

  app.post(
    '/api/system/discord-webhook/test',
    { preHandler: [requireRole('admin'), requireFeature('discordBridge')] },
    async (request, reply) => {
      const ns = NotificationService.getInstance();
      if (!ns.enabled) return reply.status(400).send({ error: 'Discord webhook URL not configured' });

      await ns.serverStarted('Test Server');
      return { message: 'Test notification sent' };
    }
  );

  // ─── Alert thresholds ──────────────────────────────────
  app.get('/api/system/alerts/thresholds', async (request) => {
    const { serverId } = request.query as { serverId?: string };
    return metricsService.getThresholds(serverId);
  });

  app.put(
    '/api/system/alerts/thresholds',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { serverId, ...thresholds } = request.body as any;
      await metricsService.setThresholds(thresholds, serverId);
      return { message: 'Alert thresholds updated' };
    }
  );

  // ─── SFTP Settings ───────────────────────────────────────
  app.get(
    '/api/system/sftp',
    { preHandler: [requireRole('admin'), requireFeature('sftpAccess')] },
    async () => {
      const db = getDb();
      const allSettings = await db.select().from(settings);
      const portSetting = allSettings.find((s) => s.key === 'sftp_port');
      const enabledSetting = allSettings.find((s) => s.key === 'sftp_enabled');

      return {
        enabled: enabledSetting ? enabledSetting.value === 'true' : config.sftp.enabled,
        port: portSetting ? parseInt(portSetting.value, 10) : config.sftp.port,
        defaultPort: config.sftp.port,
        authMethod: 'password',
        authNote: 'SFTP uses the same username/password as your CraftOS login',
      };
    }
  );

  app.put(
    '/api/system/sftp',
    { preHandler: [requireRole('admin'), requireFeature('sftpAccess')] },
    async (request, reply) => {
      const schema = z.object({
        enabled: z.boolean().optional(),
        port: z.number().int().min(1).max(65535).optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid SFTP settings' });

      const db = getDb();

      if (parsed.data.enabled !== undefined) {
        const existing = await db.select().from(settings).where(eq(settings.key, 'sftp_enabled'));
        if (existing.length > 0) {
          await db.update(settings).set({ value: String(parsed.data.enabled), updatedAt: new Date() }).where(eq(settings.key, 'sftp_enabled'));
        } else {
          await db.insert(settings).values({ key: 'sftp_enabled', value: String(parsed.data.enabled), updatedAt: new Date() });
        }
      }

      if (parsed.data.port !== undefined) {
        const existing = await db.select().from(settings).where(eq(settings.key, 'sftp_port'));
        if (existing.length > 0) {
          await db.update(settings).set({ value: String(parsed.data.port), updatedAt: new Date() }).where(eq(settings.key, 'sftp_port'));
        } else {
          await db.insert(settings).values({ key: 'sftp_port', value: String(parsed.data.port), updatedAt: new Date() });
        }
      }

      return {
        message: 'SFTP settings updated. Restart the application for port changes to take effect.',
        requiresRestart: parsed.data.port !== undefined,
      };
    }
  );
}
