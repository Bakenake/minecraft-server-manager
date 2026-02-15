import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../auth/middleware';
import { PlayerService } from '../services/player.service';

export async function playerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  const playerService = PlayerService.getInstance();

  // Get online players
  app.get('/api/servers/:id/players/online', async (request) => {
    const { id } = request.params as { id: string };
    return playerService.getOnlinePlayers(id);
  });

  // Get all known players
  app.get('/api/servers/:id/players', async (request) => {
    const { id } = request.params as { id: string };
    return playerService.getAllPlayers(id);
  });

  // Kick player
  app.post(
    '/api/servers/:id/players/:username/kick',
    { preHandler: requireRole('admin', 'moderator') },
    async (request) => {
      const { id, username } = request.params as { id: string; username: string };
      const body = request.body as { reason?: string } | undefined;
      await playerService.kickPlayer(id, username, body?.reason);
      return { message: `Player ${username} kicked` };
    }
  );

  // Ban player
  app.post(
    '/api/servers/:id/players/:username/ban',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id, username } = request.params as { id: string; username: string };
      const schema = z.object({
        reason: z.string().optional(),
        duration: z.number().int().positive().optional(), // minutes
        uuid: z.string().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      await playerService.banPlayer(
        id, username, parsed.data.uuid || username,
        request.user!.username, parsed.data.reason, parsed.data.duration
      );
      return { message: `Player ${username} banned` };
    }
  );

  // Unban player
  app.post(
    '/api/servers/:id/players/:username/unban',
    { preHandler: requireRole('admin', 'moderator') },
    async (request) => {
      const { id, username } = request.params as { id: string; username: string };
      await playerService.unbanPlayer(id, username);
      return { message: `Player ${username} unbanned` };
    }
  );

  // Get bans
  app.get('/api/servers/:id/bans', async (request) => {
    const { id } = request.params as { id: string };
    return playerService.getBans(id);
  });

  // Whitelist
  app.get('/api/servers/:id/whitelist', async (request) => {
    const { id } = request.params as { id: string };
    const entries = await playerService.getWhitelist(id);
    return entries.map((e: any) => e.playerName);
  });

  app.post(
    '/api/servers/:id/whitelist',
    { preHandler: requireRole('admin', 'moderator') },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        playerName: z.string(),
        playerUuid: z.string().optional(),
      });

      const parsed = schema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send({ error: 'Invalid request' });

      await playerService.addToWhitelist(
        id, parsed.data.playerName,
        parsed.data.playerUuid || parsed.data.playerName,
        request.user!.username
      );
      return { message: `${parsed.data.playerName} added to whitelist` };
    }
  );

  app.delete(
    '/api/servers/:id/whitelist/:username',
    { preHandler: requireRole('admin', 'moderator') },
    async (request) => {
      const { id, username } = request.params as { id: string; username: string };
      await playerService.removeFromWhitelist(id, username);
      return { message: `${username} removed from whitelist` };
    }
  );
}
