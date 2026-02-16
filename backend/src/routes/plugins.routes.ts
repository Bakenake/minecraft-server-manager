import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../auth/middleware';
import { PluginService } from '../services/plugin.service';
import { MarketplaceService } from '../services/marketplace.service';
import { ServerManager } from '../services/server-manager';
import { audit } from '../services/audit.service';
import { requireFeature } from '../auth/feature-gate';

export async function pluginRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const pluginService = PluginService.getInstance();
  const marketplace = MarketplaceService.getInstance();

  async function getServerDir(serverId: string): Promise<{ dir: string; type: string }> {
    const server = await ServerManager.getInstance().getServer(serverId);
    if (!server) throw new Error('Server not found');
    return { dir: server.directory, type: server.type };
  }

  // List plugins/mods
  app.get('/api/servers/:id/plugins', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const { dir, type } = await getServerDir(id);
      if (type === 'forge' || type === 'fabric') {
        return pluginService.listMods(dir);
      }
      return pluginService.listPlugins(dir);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to list plugins';
      return reply.status(400).send({ error: msg });
    }
  });

  // Enable plugin/mod
  app.post(
    '/api/servers/:id/plugins/:fileName/enable',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id, fileName } = request.params as { id: string; fileName: string };
      try {
        const { dir, type } = await getServerDir(id);
        const pType = type === 'forge' || type === 'fabric' ? 'mod' : 'plugin';
        pluginService.enable(dir, fileName, pType);
        audit({ userId: request.user!.userId, action: 'enable_plugin', resource: 'plugin', resourceId: fileName, details: { serverId: id }, ipAddress: request.ip });
        return { message: `${pType} enabled` };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to enable';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Disable plugin/mod
  app.post(
    '/api/servers/:id/plugins/:fileName/disable',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id, fileName } = request.params as { id: string; fileName: string };
      try {
        const { dir, type } = await getServerDir(id);
        const pType = type === 'forge' || type === 'fabric' ? 'mod' : 'plugin';
        pluginService.disable(dir, fileName, pType);
        audit({ userId: request.user!.userId, action: 'disable_plugin', resource: 'plugin', resourceId: fileName, details: { serverId: id }, ipAddress: request.ip });
        return { message: `${pType} disabled` };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to disable';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Remove plugin/mod
  app.delete(
    '/api/servers/:id/plugins/:fileName',
    { preHandler: requireRole('admin') },
    async (request, reply) => {
      const { id, fileName } = request.params as { id: string; fileName: string };
      try {
        const { dir, type } = await getServerDir(id);
        const pType = type === 'forge' || type === 'fabric' ? 'mod' : 'plugin';
        pluginService.remove(dir, fileName, pType);
        audit({ userId: request.user!.userId, action: 'remove_plugin', resource: 'plugin', resourceId: fileName, details: { serverId: id }, ipAddress: request.ip });
        return { message: `${pType} removed` };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Failed to remove';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Upload plugin/mod
  app.post(
    '/api/servers/:id/plugins/upload',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      try {
        const data = await request.file();
        if (!data) return reply.status(400).send({ error: 'No file provided' });

        const { dir, type } = await getServerDir(id);
        const pType = type === 'forge' || type === 'fabric' ? 'mod' : 'plugin';
        const buffer = await data.toBuffer();

        await pluginService.upload(dir, data.filename, buffer, pType);
        audit({ userId: request.user!.userId, action: 'upload_plugin', resource: 'plugin', resourceId: data.filename, details: { serverId: id }, ipAddress: request.ip });
        return { message: `${pType} uploaded`, fileName: data.filename };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Upload failed';
        return reply.status(400).send({ error: msg });
      }
    }
  );

  // Detect errors
  app.get('/api/servers/:id/plugins/errors', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { dir } = await getServerDir(id);
      return pluginService.detectErrors(dir);
    } catch (error) {
      return reply.status(400).send({ error: 'Failed to detect errors' });
    }
  });

  // ─── Marketplace Endpoints ──────────────────────────────────

  // Search marketplace
  app.get('/api/servers/:id/marketplace/search', { preHandler: requireFeature('marketplace') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as {
      q?: string;
      page?: string;
      limit?: string;
      category?: string;
      source?: string;
      mcVersion?: string;
    };

    try {
      const { type } = await getServerDir(id);
      const server = await ServerManager.getInstance().getServer(id);
      const mcVersion = query.mcVersion || server?.version || undefined;

      const result = await marketplace.search(
        query.q || '',
        type,
        mcVersion,
        parseInt(query.page || '0', 10),
        parseInt(query.limit || '20', 10),
        query.category,
        (query.source as 'modrinth' | 'hangar' | 'all') || 'all'
      );

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Search failed';
      return reply.status(400).send({ error: msg });
    }
  });

  // Get project details
  app.get('/api/servers/:id/marketplace/project/:source/:projectId', { preHandler: requireFeature('marketplace') }, async (request, reply) => {
    const { id, source, projectId } = request.params as {
      id: string;
      source: string;
      projectId: string;
    };

    try {
      const detail = await marketplace.getProject(
        source as 'modrinth' | 'hangar',
        projectId
      );
      return detail;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to get project';
      return reply.status(400).send({ error: msg });
    }
  });

  // Get project versions (filtered by server type and MC version)
  app.get('/api/servers/:id/marketplace/versions/:source/:projectId', { preHandler: requireFeature('marketplace') }, async (request, reply) => {
    const { id, source, projectId } = request.params as {
      id: string;
      source: string;
      projectId: string;
    };
    const query = request.query as { mcVersion?: string };

    try {
      const { type } = await getServerDir(id);
      const server = await ServerManager.getInstance().getServer(id);
      const mcVersion = query.mcVersion || server?.version || undefined;

      const versions = await marketplace.getVersions(
        source as 'modrinth' | 'hangar',
        projectId,
        type,
        mcVersion
      );
      return versions;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to get versions';
      return reply.status(400).send({ error: msg });
    }
  });

  // Install plugin/mod from marketplace
  app.post(
    '/api/servers/:id/marketplace/install',
    { preHandler: [requireRole('admin', 'moderator'), requireFeature('marketplace')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        downloadUrl: string;
        fileName: string;
        source?: 'modrinth' | 'hangar';
        projectId?: string;
        versionId?: string;
        versionNumber?: string;
        projectName?: string;
      };

      if (!body.downloadUrl || !body.fileName) {
        return reply.status(400).send({ error: 'downloadUrl and fileName are required' });
      }

      try {
        const { dir, type } = await getServerDir(id);
        const meta = body.source && body.projectId && body.versionId ? {
          source: body.source,
          projectId: body.projectId,
          versionId: body.versionId,
          versionNumber: body.versionNumber || 'unknown',
          projectName: body.projectName || body.fileName,
        } : undefined;
        const result = await marketplace.installPlugin(dir, type, body.downloadUrl, body.fileName, meta);
        audit({ userId: request.user!.userId, action: 'install_marketplace_plugin', resource: 'plugin', resourceId: body.fileName, details: { serverId: id, downloadUrl: body.downloadUrl }, ipAddress: request.ip });
        return { message: 'Plugin installed successfully', ...result };
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Install failed';
        return reply.status(500).send({ error: msg });
      }
    }
  );

  // Check plugins for available updates
  app.get('/api/servers/:id/plugins/check-updates', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { dir, type } = await getServerDir(id);
      const updates = await marketplace.checkUpdates(dir, type);
      return updates;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Update check failed';
      return reply.status(500).send({ error: msg });
    }
  });

  // Get available categories for server type
  app.get('/api/servers/:id/marketplace/categories', { preHandler: requireFeature('marketplace') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const { type } = await getServerDir(id);
      return marketplace.getCategories(type);
    } catch (error) {
      return reply.status(400).send({ error: 'Failed to get categories' });
    }
  });
}
