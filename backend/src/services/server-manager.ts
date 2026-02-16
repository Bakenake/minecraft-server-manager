import { EventEmitter } from 'events';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db';
import { servers, Server, NewServer } from '../db/schema';
import { ServerInstance, ServerEvent, ServerStatus } from './server-instance';
import { config } from '../config';
import { createChildLogger } from '../utils/logger';
import { notify } from './notification.service';
import { getBestJavaPath } from '../utils/java-installer';
import { PlayerService } from './player.service';

const log = createChildLogger('server-manager');

export class ServerManager extends EventEmitter {
  private instances: Map<string, ServerInstance> = new Map();
  private static instance: ServerManager;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  public static getInstance(): ServerManager {
    if (!ServerManager.instance) {
      ServerManager.instance = new ServerManager();
    }
    return ServerManager.instance;
  }

  // ─── Initialization ──────────────────────────────────────────

  public async initialize(): Promise<void> {
    log.info('Initializing server manager...');

    // Ensure directories exist
    fs.mkdirSync(config.paths.servers, { recursive: true });
    fs.mkdirSync(config.paths.backups, { recursive: true });

    // Load all servers from database
    const db = getDb();
    const allServers = await db.select().from(servers);

    for (const server of allServers) {
      // Reset any servers that were "running" when app closed
      if (server.status !== 'stopped') {
        await db.update(servers).set({ status: 'stopped', pid: null }).where(eq(servers.id, server.id));
        server.status = 'stopped';
        server.pid = null;
      }

      const instance = new ServerInstance(server);
      this.setupInstanceListeners(instance);
      this.instances.set(server.id, instance);
    }

    // Auto-start servers
    for (const server of allServers) {
      if (server.autoStart) {
        log.info({ serverId: server.id, name: server.name }, 'Auto-starting server');
        try {
          await this.startServer(server.id);
        } catch (error) {
          log.error({ serverId: server.id, error }, 'Failed to auto-start server');
        }
      }
    }

    log.info(`Server manager initialized with ${allServers.length} servers`);
  }

  // ─── Server CRUD ──────────────────────────────────────────────

  public async createServer(data: {
    name: string;
    type: 'vanilla' | 'paper' | 'spigot' | 'forge' | 'fabric';
    version: string;
    jarFile: string;
    port?: number;
    minRam?: number;
    maxRam?: number;
    javaPath?: string;
    jvmFlags?: string;
    maxPlayers?: number;
    autoStart?: boolean;
    autoRestart?: boolean;
  }): Promise<Server> {
    const id = uuid();
    const serverDir = path.join(config.paths.servers, id);
    fs.mkdirSync(serverDir, { recursive: true });

    const now = new Date();
    const serverData: NewServer = {
      id,
      name: data.name,
      type: data.type,
      version: data.version,
      directory: serverDir,
      jarFile: data.jarFile,
      javaPath: data.javaPath || getBestJavaPath(),
      minRam: data.minRam ?? config.defaults.minRam,
      maxRam: data.maxRam ?? config.defaults.maxRam,
      jvmFlags: data.jvmFlags ?? '',
      port: data.port ?? 25565,
      autoStart: data.autoStart ?? false,
      autoRestart: data.autoRestart ?? true,
      maxPlayers: data.maxPlayers ?? 20,
      status: 'stopped',
      createdAt: now,
      updatedAt: now,
    };

    const db = getDb();
    await db.insert(servers).values(serverData);

    const server = (await db.select().from(servers).where(eq(servers.id, id)))[0];

    const instance = new ServerInstance(server);
    this.setupInstanceListeners(instance);
    this.instances.set(id, instance);

    log.info({ serverId: id, name: data.name, type: data.type }, 'Server created');
    return server;
  }

  public async getServer(id: string): Promise<Server | null> {
    const db = getDb();
    const result = await db.select().from(servers).where(eq(servers.id, id));
    return result[0] ?? null;
  }

  public async getAllServers(): Promise<Server[]> {
    const db = getDb();
    return db.select().from(servers);
  }

  public async updateServer(id: string, data: Partial<Omit<NewServer, 'id' | 'createdAt'>>): Promise<Server> {
    const db = getDb();
    await db
      .update(servers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(servers.id, id));

    const updated = (await db.select().from(servers).where(eq(servers.id, id)))[0];
    if (!updated) throw new Error(`Server ${id} not found`);

    // Update instance config
    const instance = this.instances.get(id);
    if (instance) {
      instance.updateConfig(updated);
    }

    return updated;
  }

  public async deleteServer(id: string, removeFiles: boolean = false): Promise<void> {
    const instance = this.instances.get(id);
    if (instance) {
      if (instance.status !== 'stopped') {
        await this.stopServer(id);
      }
      instance.destroy();
      this.instances.delete(id);
    }

    const db = getDb();
    const server = (await db.select().from(servers).where(eq(servers.id, id)))[0];

    if (server) {
      if (removeFiles && fs.existsSync(server.directory)) {
        fs.rmSync(server.directory, { recursive: true, force: true });
        log.info({ serverId: id }, 'Server files removed');
      }
      await db.delete(servers).where(eq(servers.id, id));
    }

    log.info({ serverId: id }, 'Server deleted');
  }

  // ─── Server Lifecycle ─────────────────────────────────────────

  public async startServer(id: string): Promise<void> {
    const instance = this.getInstance(id);
    await instance.start();
    await this.updateServerStatus(id, 'starting', instance.pid);
  }

  public async stopServer(id: string): Promise<void> {
    const instance = this.getInstance(id);
    await instance.stop();
    await this.updateServerStatus(id, 'stopped', null);
  }

  public async restartServer(id: string): Promise<void> {
    const instance = this.getInstance(id);
    await instance.restart();
    await this.updateServerStatus(id, 'starting', instance.pid);
  }

  public async killServer(id: string): Promise<void> {
    const instance = this.getInstance(id);
    instance.kill();
    await this.updateServerStatus(id, 'stopped', null);
  }

  public sendCommand(id: string, command: string): void {
    const instance = this.getInstance(id);
    instance.sendCommand(command);
  }

  public getServerLogs(id: string, count = 100): string[] {
    const instance = this.getInstance(id);
    return instance.getLogs(count);
  }

  // ─── Server Status ───────────────────────────────────────────

  public getServerStatus(id: string): {
    status: ServerStatus;
    pid: number | null;
    uptime: number;
    playerCount: number;
    players: string[];
    tps: number;
    cpuUsage: number;
    ramUsage: number;
  } {
    const instance = this.instances.get(id);
    if (!instance) {
      return {
        status: 'stopped',
        pid: null,
        uptime: 0,
        playerCount: 0,
        players: [],
        tps: 20.0,
        cpuUsage: 0,
        ramUsage: 0,
      };
    }

    return {
      status: instance.status,
      pid: instance.pid,
      uptime: instance.getUptime(),
      playerCount: instance.getPlayerCount(),
      players: Array.from(instance.players.keys()),
      tps: instance.tps,
      cpuUsage: instance.cpuUsage,
      ramUsage: instance.ramUsage,
    };
  }

  public getAllStatuses(): Map<string, ReturnType<ServerManager['getServerStatus']>> {
    const statuses = new Map<string, ReturnType<ServerManager['getServerStatus']>>();
    for (const [id] of this.instances) {
      statuses.set(id, this.getServerStatus(id));
    }
    return statuses;
  }

  // ─── Instance Management ──────────────────────────────────────

  public getServerInstance(id: string): ServerInstance | undefined {
    return this.instances.get(id);
  }

  private getInstance(id: string): ServerInstance {
    const instance = this.instances.get(id);
    if (!instance) {
      throw new Error(`Server ${id} not found`);
    }
    return instance;
  }

  private setupInstanceListeners(instance: ServerInstance): void {
    instance.on('event', (event: ServerEvent) => {
      this.emit('serverEvent', event);

      // Update database status on status change
      if (event.type === 'status') {
        const { newStatus } = event.data as { newStatus: ServerStatus };
        this.updateServerStatus(instance.id, newStatus, instance.pid).catch((err) => {
          log.error({ serverId: instance.id, err }, 'Failed to update server status in DB');
        });

        // Discord notifications for status changes
        const serverName = instance.getConfig().name;
        if (newStatus === 'running') {
          notify().serverStarted(serverName);
        } else if (newStatus === 'stopped') {
          notify().serverStopped(serverName);
        }
      }

      // Discord notification for crashes
      if (event.type === 'crash') {
        const serverName = instance.getConfig().name;
        const errorMsg = typeof event.data === 'string' ? event.data : (event.data as any)?.message || '';
        notify().serverCrashed(serverName, errorMsg);
      }

      // Discord notifications for player events
      if (event.type === 'player_join') {
        const serverName = instance.getConfig().name;
        const playerName = (event.data as any)?.username || '';
        const playerUuid = (event.data as any)?.uuid || playerName;
        if (playerName) {
          notify().playerJoined(serverName, playerName);
          PlayerService.getInstance().trackPlayerJoin(instance.id, playerName, playerUuid).catch(() => {});
        }
      }
      if (event.type === 'player_leave') {
        const serverName = instance.getConfig().name;
        const playerName = (event.data as any)?.username || '';
        if (playerName) {
          notify().playerLeft(serverName, playerName);
          PlayerService.getInstance().trackPlayerLeave(playerName).catch(() => {});
        }
      }
    });
  }

  private async updateServerStatus(id: string, status: ServerStatus, pid: number | null): Promise<void> {
    const db = getDb();
    await db
      .update(servers)
      .set({ status, pid, updatedAt: new Date() })
      .where(eq(servers.id, id));
  }

  // ─── Shutdown ─────────────────────────────────────────────────

  public async shutdown(): Promise<void> {
    log.info('Shutting down server manager...');
    const stopPromises: Promise<void>[] = [];

    for (const [id, instance] of this.instances) {
      if (instance.status === 'running' || instance.status === 'starting') {
        log.info({ serverId: id }, 'Stopping server for shutdown');
        stopPromises.push(
          instance.stop().catch((err) => {
            log.error({ serverId: id, err }, 'Error stopping server during shutdown');
            instance.kill();
          })
        );
      }
    }

    await Promise.allSettled(stopPromises);
    this.instances.clear();
    log.info('Server manager shut down');
  }
}
