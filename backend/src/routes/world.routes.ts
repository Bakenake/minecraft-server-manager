import { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../auth/middleware';
import { ServerManager } from '../services/server-manager';
import { WorldService } from '../services/world.service';
import { createChildLogger } from '../utils/logger';
import { audit } from '../services/audit.service';
import path from 'path';

const log = createChildLogger('world-routes');

export async function worldRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const worldService = WorldService.getInstance();
  const manager = ServerManager.getInstance();

  // ─── List worlds ──────────────────────────────────────────
  app.get('/api/servers/:id/worlds', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const worlds = await worldService.getWorlds(server.directory);
    return worlds;
  });

  // ─── Get world settings ───────────────────────────────────
  app.get('/api/servers/:id/worlds/settings', async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const settings = await worldService.getWorldSettings(server.directory);
    return settings;
  });

  // ─── Update world settings ────────────────────────────────
  app.put('/api/servers/:id/worlds/settings', {
    preHandler: requireRole('admin', 'moderator'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const status = manager.getServerStatus(id);
    if (status.status === 'running') {
      return reply.status(400).send({ error: 'Server must be stopped to change world settings' });
    }

    const settingsBody = request.body as Record<string, string>;
    await worldService.updateWorldSettings(server.directory, settingsBody);

    audit({
      userId: (request as any).user?.id,
      action: 'update',
      resource: 'server',
      resourceId: id,
      details: { description: `Updated world settings for ${server.name}` },
      ipAddress: request.ip,
    });

    return { success: true };
  });

  // ─── Reset a specific world ───────────────────────────────
  app.post('/api/servers/:id/worlds/reset', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { worldDir } = request.body as { worldDir: string };

    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const status = manager.getServerStatus(id);
    if (status.status === 'running') {
      return reply.status(400).send({ error: 'Server must be stopped to reset worlds' });
    }

    await worldService.resetWorld(server.directory, worldDir);

    audit({
      userId: (request as any).user?.id,
      action: 'delete',
      resource: 'server',
      resourceId: id,
      details: { description: `Reset world "${worldDir}" for ${server.name}` },
      ipAddress: request.ip,
    });

    return { success: true, message: `World "${worldDir}" has been reset` };
  });

  // ─── Reset all worlds ─────────────────────────────────────
  app.post('/api/servers/:id/worlds/reset-all', {
    preHandler: requireRole('admin'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const status = manager.getServerStatus(id);
    if (status.status === 'running') {
      return reply.status(400).send({ error: 'Server must be stopped to reset worlds' });
    }

    const count = await worldService.resetAllWorlds(server.directory);

    audit({
      userId: (request as any).user?.id,
      action: 'delete',
      resource: 'server',
      resourceId: id,
      details: { description: `Reset all worlds (${count}) for ${server.name}` },
      ipAddress: request.ip,
    });

    return { success: true, message: `${count} world(s) have been reset` };
  });

  // ─── Update seed ──────────────────────────────────────────
  app.put('/api/servers/:id/worlds/seed', {
    preHandler: requireRole('admin', 'moderator'),
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { seed } = request.body as { seed: string };

    const server = await manager.getServer(id);
    if (!server) return reply.status(404).send({ error: 'Server not found' });

    await worldService.setSeed(server.directory, seed || '');

    audit({
      userId: (request as any).user?.id,
      action: 'update',
      resource: 'server',
      resourceId: id,
      details: { description: `Updated world seed for ${server.name}` },
      ipAddress: request.ip,
    });

    return { success: true };
  });
}
