import { FastifyInstance } from 'fastify';
import { authMiddleware, requireRole } from '../auth/middleware';
import { requireFeature } from '../auth/feature-gate';
import { NetworkService } from '../services/network.service';
import { audit } from '../services/audit.service';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('network-routes');

export async function networkRoutes(fastify: FastifyInstance): Promise<void> {
  // All network routes require auth
  fastify.addHook('preHandler', authMiddleware);

  const networkService = NetworkService.getInstance();

  // ─── List Networks ────────────────────────────────────
  fastify.get(
    '/api/networks',
    { preHandler: [requireFeature('networkProxy')] },
    async (request, reply) => {
      const networks = await networkService.listNetworks();
      return reply.send({ networks });
    }
  );

  // ─── Get Network ─────────────────────────────────────
  fastify.get(
    '/api/networks/:id',
    { preHandler: [requireFeature('networkProxy')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const network = await networkService.getNetwork(id);
      if (!network) {
        return reply.code(404).send({ error: 'Network not found' });
      }
      return reply.send(network);
    }
  );

  // ─── Create Network ──────────────────────────────────
  fastify.post(
    '/api/networks',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        proxyType: string;
        description?: string;
        proxyPort?: number;
        motd?: string;
        maxPlayers?: number;
        onlineMode?: boolean;
        ipForwarding?: boolean;
      };

      if (!body.name || !body.proxyType) {
        return reply.code(400).send({ error: 'name and proxyType are required' });
      }

      const validTypes = ['bungeecord', 'waterfall', 'velocity'];
      if (!validTypes.includes(body.proxyType)) {
        return reply.code(400).send({ error: `proxyType must be one of: ${validTypes.join(', ')}` });
      }

      try {
        const network = await networkService.createNetwork(body as any);
        audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.create', resource: 'network', resourceId: network.id, details: { name: body.name, proxyType: body.proxyType }, ipAddress: request.ip });
        return reply.code(201).send(network);
      } catch (err: any) {
        return reply.code(500).send({ error: err.message || 'Failed to create network' });
      }
    }
  );

  // ─── Update Network ──────────────────────────────────
  fastify.put(
    '/api/networks/:id',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as Record<string, any>;
      const network = await networkService.updateNetwork(id, body);
      if (!network) {
        return reply.code(404).send({ error: 'Network not found' });
      }
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.update', resource: 'network', resourceId: id, details: body, ipAddress: request.ip });
      return reply.send(network);
    }
  );

  // ─── Delete Network ──────────────────────────────────
  fastify.delete(
    '/api/networks/:id',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = await networkService.deleteNetwork(id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Network not found' });
      }
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.delete', resource: 'network', resourceId: id, ipAddress: request.ip });
      return reply.send({ message: 'Network deleted' });
    }
  );

  // ─── Add Server to Network ───────────────────────────
  fastify.post(
    '/api/networks/:id/servers',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as {
        serverId: string;
        serverAlias: string;
        isDefault?: boolean;
        isFallback?: boolean;
        restricted?: boolean;
        priority?: number;
      };

      if (!body.serverId || !body.serverAlias) {
        return reply.code(400).send({ error: 'serverId and serverAlias are required' });
      }

      try {
        const result = await networkService.addServer(id, body);
        if (!result) {
          return reply.code(404).send({ error: 'Network not found' });
        }
        audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.addServer', resource: 'network', resourceId: id, details: { serverId: body.serverId, alias: body.serverAlias }, ipAddress: request.ip });
        return reply.code(201).send(result);
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  // ─── Remove Server from Network ──────────────────────
  fastify.delete(
    '/api/networks/:id/servers/:serverId',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id, serverId } = request.params as { id: string; serverId: string };
      const removed = await networkService.removeServer(id, serverId);
      if (!removed) {
        return reply.code(404).send({ error: 'Server not found in network' });
      }
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.removeServer', resource: 'network', resourceId: id, details: { serverId }, ipAddress: request.ip });
      return reply.send({ message: 'Server removed from network' });
    }
  );

  // ─── Update Server in Network ────────────────────────
  fastify.put(
    '/api/networks/:id/servers/:serverId',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id, serverId } = request.params as { id: string; serverId: string };
      const body = request.body as Record<string, any>;
      const updated = await networkService.updateServer(id, serverId, body);
      if (!updated) {
        return reply.code(404).send({ error: 'Server not found in network' });
      }
      return reply.send(updated);
    }
  );

  // ─── Start Network ───────────────────────────────────
  fastify.post(
    '/api/networks/:id/start',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await networkService.startNetwork(id);
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.start', resource: 'network', resourceId: id, ipAddress: request.ip });
      return reply.send(result);
    }
  );

  // ─── Stop Network ────────────────────────────────────
  fastify.post(
    '/api/networks/:id/stop',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await networkService.stopNetwork(id);
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.stop', resource: 'network', resourceId: id, ipAddress: request.ip });
      return reply.send(result);
    }
  );

  // ─── Restart Network ─────────────────────────────────
  fastify.post(
    '/api/networks/:id/restart',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const result = await networkService.restartNetwork(id);
      audit({ userId: (request as any).user?.id || (request as any).user?.userId, action: 'network.restart', resource: 'network', resourceId: id, ipAddress: request.ip });
      return reply.send(result);
    }
  );

  // ─── Generate / Write Proxy Config ────────────────────
  fastify.post(
    '/api/networks/:id/sync-config',
    { preHandler: [requireFeature('networkProxy'), requireRole('admin', 'moderator')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const proxyConfig = await networkService.generateProxyConfig(id);
      if (!proxyConfig) {
        return reply.code(404).send({ error: 'Network not found' });
      }

      const written = await networkService.writeProxyConfig(id);
      return reply.send({ config: proxyConfig, written, message: written ? 'Config synced to proxy' : 'Config generated (no proxy server assigned)' });
    }
  );

  // ─── Get proxy config preview ─────────────────────────
  fastify.get(
    '/api/networks/:id/config',
    { preHandler: [requireFeature('networkProxy')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const proxyConfig = await networkService.generateProxyConfig(id);
      if (!proxyConfig) {
        return reply.code(404).send({ error: 'Network not found' });
      }
      return reply.send(proxyConfig);
    }
  );

  // ─── Available servers (not in any network) ───────────
  fastify.get(
    '/api/networks/available-servers',
    { preHandler: [requireFeature('networkProxy')] },
    async (_request, reply) => {
      const available = await networkService.getAvailableServers();
      return reply.send({ servers: available });
    }
  );

  // ─── Proxy servers (bungeecord/waterfall/velocity type) ─
  fastify.get(
    '/api/networks/proxy-servers',
    { preHandler: [requireFeature('networkProxy')] },
    async (_request, reply) => {
      const proxies = await networkService.getProxyServers();
      return reply.send({ servers: proxies });
    }
  );
}
