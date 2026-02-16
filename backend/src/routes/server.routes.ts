import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../auth/middleware';
import { ServerManager } from '../services/server-manager';
import { downloadFile, getVanillaServerUrl, getPaperServerUrl, getMinecraftVersions, getPaperVersions } from '../utils/download';
import { detectJavaInstallations, getRecommendedJavaVersion } from '../utils/java';
import { createChildLogger } from '../utils/logger';
import path from 'path';
import { config } from '../config';
import { audit } from '../services/audit.service';
import { requireServerSlot, requireRamLimit, requireServerType } from '../auth/feature-gate';

const log = createChildLogger('server-routes');

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth to all routes
  app.addHook('preHandler', authMiddleware);

  // ─── List servers ─────────────────────────────────────────
  app.get('/api/servers', async () => {
    const manager = ServerManager.getInstance();
    const servers = await manager.getAllServers();

    return servers.map((server) => {
      const status = manager.getServerStatus(server.id);
      return { ...server, ...status };
    });
  });

  // ─── Get server ──────────────────────────────────────────
  app.get('/api/servers/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const manager = ServerManager.getInstance();
    const server = await manager.getServer(id);

    if (!server) return reply.status(404).send({ error: 'Server not found' });

    const status = manager.getServerStatus(id);
    return { ...server, ...status };
  });

  // ─── Create server ───────────────────────────────────────
  app.post(
    '/api/servers',
    { preHandler: [requireRole('admin', 'moderator'), requireServerSlot(), requireServerType(), requireRamLimit()] },
    async (request, reply) => {
      const schema = z.object({
        name: z.string().min(1).max(64),
        type: z.enum(['vanilla', 'paper', 'spigot', 'forge', 'fabric']),
        version: z.string(),
        port: z.number().int().min(1024).max(65535).optional(),
        minRam: z.number().int().min(256).optional(),
        maxRam: z.number().int().min(512).optional(),
        javaPath: z.string().optional(),
        jvmFlags: z.string().optional(),
        maxPlayers: z.number().int().min(1).optional(),
        autoStart: z.boolean().optional(),
        autoRestart: z.boolean().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const data = parsed.data;
      const manager = ServerManager.getInstance();

      try {
        // Determine JAR filename
        let jarFile = 'server.jar';

        // Create server record first to get the directory
        const server = await manager.createServer({
          ...data,
          jarFile,
        });
        audit({ userId: request.user!.userId, action: 'create_server', resource: 'server', resourceId: server.id, details: { name: data.name, type: data.type, version: data.version }, ipAddress: request.ip });

        // Download server JAR
        let downloadUrl: string;
        try {
          switch (data.type) {
            case 'vanilla':
              downloadUrl = await getVanillaServerUrl(data.version);
              break;
            case 'paper':
              downloadUrl = await getPaperServerUrl(data.version);
              break;
            default:
              // For Spigot/Forge/Fabric, the user will need to provide the JAR
              log.info({ type: data.type }, 'Server JAR must be uploaded manually for this type');
              return server;
          }

          const jarPath = path.join(server.directory, jarFile);
          log.info({ serverId: server.id, url: downloadUrl }, 'Downloading server JAR');
          await downloadFile(downloadUrl, jarPath);
          log.info({ serverId: server.id }, 'Server JAR downloaded');
        } catch (downloadError) {
          log.warn({ serverId: server.id, error: downloadError }, 'Failed to download JAR - manual upload required');
        }

        return server;
      } catch (error) {
        log.error({ error }, 'Failed to create server');
        return reply.status(500).send({ error: 'Failed to create server' });
      }
    }
  );

  // ─── Update server ───────────────────────────────────────
  app.put(
    '/api/servers/:id',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        name: z.string().min(1).max(64).optional(),
        port: z.number().int().min(1024).max(65535).optional(),
        minRam: z.number().int().min(256).optional(),
        maxRam: z.number().int().min(512).optional(),
        javaPath: z.string().optional(),
        jvmFlags: z.string().optional(),
        maxPlayers: z.number().int().min(1).optional(),
        autoStart: z.boolean().optional(),
        autoRestart: z.boolean().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const manager = ServerManager.getInstance();
      try {
        const updated = await manager.updateServer(id, parsed.data);
        return updated;
      } catch (error) {
        return reply.status(404).send({ error: 'Server not found' });
      }
    }
  );

  // ─── Delete server ───────────────────────────────────────
  app.delete(
    '/api/servers/:id',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { removeFiles } = request.query as { removeFiles?: string };
      const manager = ServerManager.getInstance();

      try {
        await manager.deleteServer(id, removeFiles === 'true');
        audit({ userId: request.user!.userId, action: 'delete_server', resource: 'server', resourceId: id, ipAddress: request.ip });
        return { message: 'Server deleted' };
      } catch (error) {
        return reply.status(404).send({ error: 'Server not found' });
      }
    }
  );

  // ─── Server actions ──────────────────────────────────────
  app.post(
    '/api/servers/:id/start',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await ServerManager.getInstance().startServer(id);
        audit({ userId: request.user!.userId, action: 'start_server', resource: 'server', resourceId: id, ipAddress: request.ip });
        return { message: 'Server starting' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to start server';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  app.post(
    '/api/servers/:id/stop',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await ServerManager.getInstance().stopServer(id);
        audit({ userId: request.user!.userId, action: 'stop_server', resource: 'server', resourceId: id, ipAddress: request.ip });
        return { message: 'Server stopped' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to stop server';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  app.post(
    '/api/servers/:id/restart',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await ServerManager.getInstance().restartServer(id);
        audit({ userId: request.user!.userId, action: 'restart_server', resource: 'server', resourceId: id, ipAddress: request.ip });
        return { message: 'Server restarting' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to restart server';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  app.post(
    '/api/servers/:id/kill',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await ServerManager.getInstance().killServer(id);
        audit({ userId: request.user!.userId, action: 'kill_server', resource: 'server', resourceId: id, ipAddress: request.ip });
        return { message: 'Server killed' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to kill server';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // ─── Console ─────────────────────────────────────────────
  app.post(
    '/api/servers/:id/command',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({ command: z.string().min(1).max(1000) });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid command' });

      try {
        ServerManager.getInstance().sendCommand(id, parsed.data.command);
        audit({ userId: request.user!.userId, action: 'send_command', resource: 'server', resourceId: id, details: { command: parsed.data.command }, ipAddress: request.ip });
        return { message: 'Command sent' };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to send command';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  app.get('/api/servers/:id/logs', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { count } = request.query as { count?: string };
    const lines = parseInt(count ?? '200', 10);

    try {
      const logs = ServerManager.getInstance().getServerLogs(id, lines);
      return { logs };
    } catch (error) {
      return reply.status(404).send({ error: 'Server not found' });
    }
  });

  // ─── Available versions (unified endpoint for frontend) ──
  app.get('/api/servers/versions/:type', async (request, reply) => {
    const { type } = request.params as { type: string };
    try {
      switch (type) {
        case 'vanilla':
        case 'spigot': {
          const mcVersions = await getMinecraftVersions();
          return { versions: mcVersions.filter((v) => v.type === 'release').map((v) => v.id).slice(0, 50) };
        }
        case 'paper': {
          const paperVersions = await getPaperVersions();
          return { versions: [...paperVersions].reverse() };
        }
        case 'forge':
        case 'fabric': {
          const forgeVersions = await getMinecraftVersions();
          return { versions: forgeVersions.filter((v) => v.type === 'release').map((v) => v.id).slice(0, 50) };
        }
        default:
          return reply.status(400).send({ error: `Unsupported server type: ${type}` });
      }
    } catch (error) {
      log.error({ error, type }, 'Failed to fetch versions');
      return reply.status(500).send({ error: 'Failed to fetch versions' });
    }
  });

  // ─── Update server version (JAR) ──────────────────────────
  app.post(
    '/api/servers/:id/update-version',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { version, createBackup } = request.body as { version: string; createBackup?: boolean };

      const manager = ServerManager.getInstance();
      const server = await manager.getServer(id);
      if (!server) return reply.status(404).send({ error: 'Server not found' });

      const status = manager.getServerStatus(id);
      if (status.status === 'running') {
        return reply.status(400).send({ error: 'Server must be stopped before updating' });
      }

      try {
        // Optionally create a backup before updating
        if (createBackup) {
          const { BackupService } = await import('../services/backup.service');
          log.info({ serverId: id }, 'Creating pre-update backup');
          await BackupService.getInstance().createBackup(id, 'Pre-update backup');
        }

        // Download new JAR
        let downloadUrl: string;
        switch (server.type) {
          case 'vanilla':
            downloadUrl = await getVanillaServerUrl(version);
            break;
          case 'paper':
            downloadUrl = await getPaperServerUrl(version);
            break;
          default:
            return reply.status(400).send({ error: `Automatic updates not supported for ${server.type}. Please upload the JAR manually.` });
        }

        const jarPath = path.join(server.directory, server.jarFile || 'server.jar');
        log.info({ serverId: id, version, url: downloadUrl }, 'Downloading new server JAR');
        await downloadFile(downloadUrl, jarPath);

        // Update version in database
        await manager.updateServer(id, { version } as any);

        audit({ userId: request.user!.userId, action: 'update_server', resource: 'server', resourceId: id, details: { version, previousVersion: server.version }, ipAddress: request.ip });

        return { success: true, message: `Server updated to version ${version}` };
      } catch (error: any) {
        log.error({ error, serverId: id }, 'Failed to update server version');
        return reply.status(500).send({ error: error.message || 'Failed to update server version' });
      }
    }
  );

  // Legacy version endpoints (kept for API compatibility)
  app.get('/api/versions/minecraft', async (_, reply) => {
    try {
      const versions = await getMinecraftVersions();
      return versions.filter((v) => v.type === 'release').slice(0, 50);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch versions' });
    }
  });

  app.get('/api/versions/paper', async (_, reply) => {
    try {
      const versions = await getPaperVersions();
      return versions.reverse();
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to fetch Paper versions' });
    }
  });

  // ─── Java detection ──────────────────────────────────────
  app.get('/api/servers/java', async () => {
    const installations = await detectJavaInstallations();
    return { installations };
  });

  app.get('/api/java/installations', async () => {
    const installations = await detectJavaInstallations();
    return installations;
  });

  app.get('/api/java/recommended/:mcVersion', async (request) => {
    const { mcVersion } = request.params as { mcVersion: string };
    return { recommended: getRecommendedJavaVersion(mcVersion) };
  });
}
