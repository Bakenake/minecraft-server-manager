import { FastifyInstance } from 'fastify';
import fs from 'fs';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../auth/middleware';
import { BackupService } from '../services/backup.service';
import { audit } from '../services/audit.service';
import { requireFeature, requireBackupSlot } from '../auth/feature-gate';

export async function backupRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const backupService = BackupService.getInstance();

  // List backups
  app.get('/api/servers/:id/backups', async (request) => {
    const { id } = request.params as { id: string };
    return backupService.listBackups(id);
  });

  // Create backup
  app.post(
    '/api/servers/:id/backups',
    { preHandler: [requireRole('admin', 'moderator'), requireBackupSlot()] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        name: z.string().min(1).max(128).default('Manual Backup'),
      });

      const parsed = schema.safeParse(request.body || {});
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      try {
        const backup = await backupService.createBackup(id, parsed.data.name, 'manual');
        audit({ userId: request.user!.userId, action: 'create_backup', resource: 'backup', resourceId: backup.id, details: { serverId: id, name: parsed.data.name }, ipAddress: request.ip });
        return backup;
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Backup failed';
        return reply.status(500).send({ error: msg });
      }
    }
  );

  // Restore backup
  app.post(
    '/api/backups/:backupId/restore',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { backupId } = request.params as { backupId: string };
      try {
        await backupService.restoreBackup(backupId);
        audit({ userId: request.user!.userId, action: 'restore_backup', resource: 'backup', resourceId: backupId, ipAddress: request.ip });
        return { message: 'Backup restored successfully' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Restore failed';
        return reply.status(500).send({ error: msg });
      }
    }
  );

  // Delete backup
  app.delete(
    '/api/backups/:backupId',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { backupId } = request.params as { backupId: string };
      try {
        await backupService.deleteBackup(backupId);
        audit({ userId: request.user!.userId, action: 'delete_backup', resource: 'backup', resourceId: backupId, ipAddress: request.ip });
        return { message: 'Backup deleted' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Delete failed';
        return reply.status(500).send({ error: msg });
      }
    }
  );

  // Get total backup size
  app.get('/api/servers/:id/backups/size', async (request) => {
    const { id } = request.params as { id: string };
    const size = await backupService.getBackupSize(id);
    return { totalSize: size };
  });

  // Download backup
  app.get('/api/backups/:backupId/download', { preHandler: requireFeature('backupDownload') }, async (request, reply) => {
    const { backupId } = request.params as { backupId: string };
    try {
      const { filePath, fileName } = await backupService.getBackupPath(backupId);
      const stream = fs.createReadStream(filePath);
      reply.header('Content-Disposition', `attachment; filename="${fileName}"`);
      reply.header('Content-Type', 'application/gzip');
      return reply.send(stream);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Download failed';
      return reply.status(404).send({ error: msg });
    }
  });

  // Apply retention policy
  app.post(
    '/api/servers/:id/backups/retention',
    { preHandler: [requireRole('admin'), requireFeature('backupRetention')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        maxBackups: z.number().min(1).optional(),
        maxAgeDays: z.number().min(1).optional(),
      });

      const parsed = schema.safeParse(request.body || {});
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      try {
        const deleted = await backupService.applyRetention(id, parsed.data);
        return { message: `Retention applied, ${deleted} backup(s) removed`, deleted };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Retention failed';
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
