import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../db';
import { players, bans, whitelist, Player, Ban } from '../db/schema';
import { ServerManager } from './server-manager';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('player-service');

export class PlayerService {
  private static instance: PlayerService;

  static getInstance(): PlayerService {
    if (!PlayerService.instance) {
      PlayerService.instance = new PlayerService();
    }
    return PlayerService.instance;
  }

  async getOnlinePlayers(serverId: string): Promise<{ username: string; uuid: string; isOnline: boolean; playTime: number }[]> {
    const manager = ServerManager.getInstance();
    const status = manager.getServerStatus(serverId);
    const instance = manager.getServerInstance(serverId);
    
    return status.players.map((name) => {
      const playerInfo = instance?.players.get(name);
      return {
        username: name,
        uuid: playerInfo?.uuid || name,
        isOnline: true,
        playTime: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        serverId,
      };
    });
  }

  async getAllPlayers(serverId?: string): Promise<Player[]> {
    const db = getDb();
    if (serverId) {
      return db.select().from(players).where(eq(players.serverId, serverId));
    }
    return db.select().from(players);
  }

  async trackPlayerJoin(serverId: string, username: string, playerUuid?: string): Promise<void> {
    const db = getDb();
    const now = new Date();
    const uuid = playerUuid || username; // Use username as fallback

    const existing = await db.select().from(players).where(eq(players.uuid, uuid));

    if (existing.length > 0) {
      await db
        .update(players)
        .set({
          username,
          lastSeen: now,
          isOnline: true,
          serverId,
        })
        .where(eq(players.uuid, uuid));
    } else {
      await db.insert(players).values({
        uuid,
        username,
        firstSeen: now,
        lastSeen: now,
        isOnline: true,
        serverId,
      });
    }
  }

  async trackPlayerLeave(username: string): Promise<void> {
    const db = getDb();
    const player = (
      await db.select().from(players).where(eq(players.username, username))
    )[0];

    if (player) {
      const sessionTime = Math.floor((Date.now() - player.lastSeen.getTime()) / 1000);
      await db
        .update(players)
        .set({
          lastSeen: new Date(),
          isOnline: false,
          playTime: player.playTime + sessionTime,
        })
        .where(eq(players.id, player.id));
    }
  }

  // ─── Kick / Ban / Whitelist ────────────────────────────────

  async kickPlayer(serverId: string, username: string, reason?: string): Promise<void> {
    const manager = ServerManager.getInstance();
    const cmd = reason ? `kick ${username} ${reason}` : `kick ${username}`;
    manager.sendCommand(serverId, cmd);
    log.info({ serverId, username, reason }, 'Player kicked');
  }

  async banPlayer(
    serverId: string,
    playerName: string,
    playerUuid: string,
    bannedBy: string,
    reason?: string,
    duration?: number // minutes, null = permanent
  ): Promise<void> {
    const db = getDb();
    const manager = ServerManager.getInstance();
    const now = new Date();

    const isPermanent = !duration;
    const expiresAt = duration ? new Date(now.getTime() + duration * 60000) : undefined;

    await db.insert(bans).values({
      playerUuid,
      playerName,
      serverId,
      reason: reason || '',
      bannedBy,
      expiresAt,
      isPermanent,
      createdAt: now,
    });

    // Execute ban command
    const cmd = reason ? `ban ${playerName} ${reason}` : `ban ${playerName}`;
    manager.sendCommand(serverId, cmd);

    log.info({ serverId, playerName, isPermanent, duration }, 'Player banned');
  }

  async unbanPlayer(serverId: string, playerName: string): Promise<void> {
    const db = getDb();
    const manager = ServerManager.getInstance();

    await db
      .update(bans)
      .set({ isActive: false })
      .where(and(eq(bans.playerName, playerName), eq(bans.serverId, serverId), eq(bans.isActive, true)));

    manager.sendCommand(serverId, `pardon ${playerName}`);
    log.info({ serverId, playerName }, 'Player unbanned');
  }

  async getBans(serverId: string): Promise<Ban[]> {
    const db = getDb();
    return db
      .select()
      .from(bans)
      .where(and(eq(bans.serverId, serverId), eq(bans.isActive, true)))
      .orderBy(desc(bans.createdAt));
  }

  async addToWhitelist(serverId: string, playerName: string, playerUuid: string, addedBy: string): Promise<void> {
    const db = getDb();
    const manager = ServerManager.getInstance();

    await db.insert(whitelist).values({
      playerUuid,
      playerName,
      serverId,
      addedBy,
      createdAt: new Date(),
    });

    manager.sendCommand(serverId, `whitelist add ${playerName}`);
    log.info({ serverId, playerName }, 'Player added to whitelist');
  }

  async removeFromWhitelist(serverId: string, playerName: string): Promise<void> {
    const db = getDb();
    const manager = ServerManager.getInstance();

    await db
      .delete(whitelist)
      .where(and(eq(whitelist.playerName, playerName), eq(whitelist.serverId, serverId)));

    manager.sendCommand(serverId, `whitelist remove ${playerName}`);
    log.info({ serverId, playerName }, 'Player removed from whitelist');
  }

  async getWhitelist(serverId: string) {
    const db = getDb();
    return db.select().from(whitelist).where(eq(whitelist.serverId, serverId));
  }
}
