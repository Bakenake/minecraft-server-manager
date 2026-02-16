import { eq, and } from 'drizzle-orm';
import { getDb } from '../db';
import { serverNetworks, networkServers, servers } from '../db/schema';
import type { ServerNetwork, NewServerNetwork, NetworkServer, NewNetworkServer } from '../db/schema';
import { ServerManager } from './server-manager';
import { createChildLogger } from '../utils/logger';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const log = createChildLogger('network-service');

export interface NetworkWithServers extends ServerNetwork {
  servers: (NetworkServer & {
    serverName: string;
    serverStatus: string;
    serverPort: number;
    playerCount?: number;
  })[];
  proxyServerName?: string;
  proxyServerStatus?: string;
}

export interface ProxyConfigTemplate {
  proxyType: 'bungeecord' | 'waterfall' | 'velocity';
  listeners: Array<{
    host: string;
    port: number;
    motd: string;
    maxPlayers: number;
    onlineMode: boolean;
  }>;
  servers: Record<string, {
    address: string;
    restricted: boolean;
    motd: string;
  }>;
  ipForwarding: boolean;
  defaultServer: string;
  fallbackServer: string;
}

export class NetworkService {
  private static instance: NetworkService;

  static getInstance(): NetworkService {
    if (!this.instance) {
      this.instance = new NetworkService();
    }
    return this.instance;
  }

  // ─── CRUD ─────────────────────────────────────────────

  async listNetworks(): Promise<NetworkWithServers[]> {
    const db = getDb();

    const networks = await db.select().from(serverNetworks).orderBy(serverNetworks.createdAt);
    const result: NetworkWithServers[] = [];

    for (const network of networks) {
      result.push(await this.enrichNetwork(network));
    }

    return result;
  }

  async getNetwork(id: string): Promise<NetworkWithServers | null> {
    const db = getDb();
    const [network] = await db.select().from(serverNetworks).where(eq(serverNetworks.id, id)).limit(1);
    if (!network) return null;
    return this.enrichNetwork(network);
  }

  async createNetwork(data: {
    name: string;
    proxyType: 'bungeecord' | 'waterfall' | 'velocity';
    description?: string;
    proxyPort?: number;
    motd?: string;
    maxPlayers?: number;
    onlineMode?: boolean;
    ipForwarding?: boolean;
  }): Promise<NetworkWithServers> {
    const db = getDb();
    const id = crypto.randomUUID();
    const now = new Date();

    await db.insert(serverNetworks).values({
      id,
      name: data.name,
      proxyType: data.proxyType,
      description: data.description || '',
      proxyPort: data.proxyPort || 25577,
      motd: data.motd || 'A CraftOS Network',
      maxPlayers: data.maxPlayers || 100,
      onlineMode: data.onlineMode ?? true,
      ipForwarding: data.ipForwarding ?? true,
      status: 'stopped',
      autoStart: false,
      createdAt: now,
      updatedAt: now,
    });

    log.info({ id, name: data.name, proxyType: data.proxyType }, 'Network created');
    return (await this.getNetwork(id))!;
  }

  async updateNetwork(id: string, data: Partial<{
    name: string;
    description: string;
    proxyType: 'bungeecord' | 'waterfall' | 'velocity';
    proxyPort: number;
    motd: string;
    maxPlayers: number;
    onlineMode: boolean;
    ipForwarding: boolean;
    autoStart: boolean;
  }>): Promise<NetworkWithServers | null> {
    const db = getDb();
    const existing = await this.getNetwork(id);
    if (!existing) return null;

    await db.update(serverNetworks)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(eq(serverNetworks.id, id));

    log.info({ id, ...data }, 'Network updated');
    return this.getNetwork(id);
  }

  async deleteNetwork(id: string): Promise<boolean> {
    const db = getDb();
    const existing = await this.getNetwork(id);
    if (!existing) return false;

    // Stop the network first if running
    if (existing.status === 'running' || existing.status === 'starting') {
      await this.stopNetwork(id);
    }

    await db.delete(networkServers).where(eq(networkServers.networkId, id));
    await db.delete(serverNetworks).where(eq(serverNetworks.id, id));

    log.info({ id, name: existing.name }, 'Network deleted');
    return true;
  }

  // ─── Server Management ────────────────────────────────

  async addServer(networkId: string, data: {
    serverId: string;
    serverAlias: string;
    isDefault?: boolean;
    isFallback?: boolean;
    restricted?: boolean;
    priority?: number;
  }): Promise<NetworkServer | null> {
    const db = getDb();
    const network = await this.getNetwork(networkId);
    if (!network) return null;

    // Check if server is already in this network
    const existing = await db.select().from(networkServers)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, data.serverId),
      )).limit(1);

    if (existing.length > 0) {
      throw new Error('Server is already part of this network');
    }

    // Check server exists
    const [server] = await db.select().from(servers)
      .where(eq(servers.id, data.serverId)).limit(1);
    if (!server) throw new Error('Server not found');

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await db.update(networkServers)
        .set({ isDefault: false })
        .where(eq(networkServers.networkId, networkId));
    }

    // If setting as fallback, unset other fallbacks
    if (data.isFallback) {
      await db.update(networkServers)
        .set({ isFallback: false })
        .where(eq(networkServers.networkId, networkId));
    }

    await db.insert(networkServers).values({
      networkId,
      serverId: data.serverId,
      serverAlias: data.serverAlias,
      isDefault: data.isDefault ?? false,
      isFallback: data.isFallback ?? false,
      restricted: data.restricted ?? false,
      priority: data.priority ?? 0,
      createdAt: new Date(),
    });

    // Get the inserted record
    const [inserted] = await db.select().from(networkServers)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, data.serverId),
      )).limit(1);

    log.info({ networkId, serverId: data.serverId, alias: data.serverAlias }, 'Server added to network');
    return inserted;
  }

  async removeServer(networkId: string, serverId: string): Promise<boolean> {
    const db = getDb();

    const [existing] = await db.select().from(networkServers)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, serverId),
      )).limit(1);

    if (!existing) return false;

    await db.delete(networkServers)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, serverId),
      ));

    log.info({ networkId, serverId }, 'Server removed from network');
    return true;
  }

  async updateServer(networkId: string, serverId: string, data: Partial<{
    serverAlias: string;
    isDefault: boolean;
    isFallback: boolean;
    restricted: boolean;
    priority: number;
  }>): Promise<NetworkServer | null> {
    const db = getDb();

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await db.update(networkServers)
        .set({ isDefault: false })
        .where(eq(networkServers.networkId, networkId));
    }

    // If setting as fallback, unset other fallbacks
    if (data.isFallback) {
      await db.update(networkServers)
        .set({ isFallback: false })
        .where(eq(networkServers.networkId, networkId));
    }

    await db.update(networkServers)
      .set(data as any)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, serverId),
      ));

    const [updated] = await db.select().from(networkServers)
      .where(and(
        eq(networkServers.networkId, networkId),
        eq(networkServers.serverId, serverId),
      )).limit(1);

    return updated || null;
  }

  // ─── Network Lifecycle ────────────────────────────────

  async startNetwork(id: string): Promise<{ success: boolean; message: string }> {
    const network = await this.getNetwork(id);
    if (!network) return { success: false, message: 'Network not found' };

    if (network.status === 'running') {
      return { success: false, message: 'Network is already running' };
    }

    const db = getDb();
    const manager = ServerManager.getInstance();

    // Update network status
    await db.update(serverNetworks)
      .set({ status: 'starting', updatedAt: new Date() })
      .where(eq(serverNetworks.id, id));

    try {
      // Start backend servers first
      for (const ns of network.servers) {
        if (ns.serverStatus === 'stopped') {
          try {
            await manager.startServer(ns.serverId);
            log.info({ serverId: ns.serverId, alias: ns.serverAlias }, 'Started backend server');
          } catch (err) {
            log.warn({ serverId: ns.serverId, err }, 'Failed to start backend server');
          }
        }
      }

      // Wait a moment for backend servers to initialize
      await new Promise(r => setTimeout(r, 5000));

      // Start the proxy server
      if (network.proxyServerId) {
        try {
          await manager.startServer(network.proxyServerId);
          log.info({ proxyId: network.proxyServerId }, 'Started proxy server');
        } catch (err) {
          log.error({ proxyId: network.proxyServerId, err }, 'Failed to start proxy');
          await db.update(serverNetworks)
            .set({ status: 'degraded', updatedAt: new Date() })
            .where(eq(serverNetworks.id, id));
          return { success: false, message: 'Failed to start proxy server' };
        }
      }

      await db.update(serverNetworks)
        .set({ status: 'running', updatedAt: new Date() })
        .where(eq(serverNetworks.id, id));

      return { success: true, message: 'Network started successfully' };
    } catch (err: any) {
      await db.update(serverNetworks)
        .set({ status: 'degraded', updatedAt: new Date() })
        .where(eq(serverNetworks.id, id));
      return { success: false, message: err.message || 'Failed to start network' };
    }
  }

  async stopNetwork(id: string): Promise<{ success: boolean; message: string }> {
    const network = await this.getNetwork(id);
    if (!network) return { success: false, message: 'Network not found' };

    const db = getDb();
    const manager = ServerManager.getInstance();

    await db.update(serverNetworks)
      .set({ status: 'stopping', updatedAt: new Date() })
      .where(eq(serverNetworks.id, id));

    try {
      // Stop proxy first
      if (network.proxyServerId) {
        try {
          await manager.stopServer(network.proxyServerId);
        } catch (err) {
          log.warn({ proxyId: network.proxyServerId, err }, 'Failed to stop proxy');
        }
      }

      // Then stop backend servers
      for (const ns of network.servers) {
        if (ns.serverStatus === 'running' || ns.serverStatus === 'starting') {
          try {
            await manager.stopServer(ns.serverId);
          } catch (err) {
            log.warn({ serverId: ns.serverId, err }, 'Failed to stop backend server');
          }
        }
      }

      await db.update(serverNetworks)
        .set({ status: 'stopped', updatedAt: new Date() })
        .where(eq(serverNetworks.id, id));

      return { success: true, message: 'Network stopped successfully' };
    } catch (err: any) {
      await db.update(serverNetworks)
        .set({ status: 'stopped', updatedAt: new Date() })
        .where(eq(serverNetworks.id, id));
      return { success: false, message: err.message || 'Failed to stop network' };
    }
  }

  async restartNetwork(id: string): Promise<{ success: boolean; message: string }> {
    await this.stopNetwork(id);
    await new Promise(r => setTimeout(r, 3000));
    return this.startNetwork(id);
  }

  // ─── Proxy Config Generation ──────────────────────────

  async generateProxyConfig(id: string): Promise<ProxyConfigTemplate | null> {
    const network = await this.getNetwork(id);
    if (!network) return null;

    const defaultServer = network.servers.find(s => s.isDefault);
    const fallbackServer = network.servers.find(s => s.isFallback) || defaultServer;

    const serverMap: Record<string, { address: string; restricted: boolean; motd: string }> = {};
    for (const ns of network.servers) {
      serverMap[ns.serverAlias] = {
        address: `127.0.0.1:${ns.serverPort}`,
        restricted: ns.restricted,
        motd: `&1${ns.serverAlias}`,
      };
    }

    return {
      proxyType: network.proxyType,
      listeners: [{
        host: `0.0.0.0:${network.proxyPort}`,
        port: network.proxyPort,
        motd: network.motd || 'A CraftOS Network',
        maxPlayers: network.maxPlayers,
        onlineMode: network.onlineMode,
      }],
      servers: serverMap,
      ipForwarding: network.ipForwarding,
      defaultServer: defaultServer?.serverAlias || 'lobby',
      fallbackServer: fallbackServer?.serverAlias || defaultServer?.serverAlias || 'lobby',
    };
  }

  async writeProxyConfig(id: string): Promise<boolean> {
    const network = await this.getNetwork(id);
    if (!network || !network.proxyServerId) return false;

    const config = await this.generateProxyConfig(id);
    if (!config) return false;

    const db = getDb();
    const [proxyServer] = await db.select().from(servers)
      .where(eq(servers.id, network.proxyServerId)).limit(1);
    if (!proxyServer) return false;

    try {
      if (network.proxyType === 'velocity') {
        // Write velocity.toml
        const tomlContent = this.generateVelocityToml(config);
        fs.writeFileSync(path.join(proxyServer.directory, 'velocity.toml'), tomlContent);
      } else {
        // BungeeCord/Waterfall: config.yml
        const yamlContent = this.generateBungeeConfig(config);
        fs.writeFileSync(path.join(proxyServer.directory, 'config.yml'), yamlContent);
      }
      log.info({ networkId: id, proxyType: network.proxyType }, 'Proxy config written');
      return true;
    } catch (err) {
      log.error({ err, networkId: id }, 'Failed to write proxy config');
      return false;
    }
  }

  // ─── Config generators ────────────────────────────────

  private generateBungeeConfig(config: ProxyConfigTemplate): string {
    const listener = config.listeners[0];
    const serverEntries = Object.entries(config.servers).map(
      ([name, s]) => `    ${name}:\n      motd: '${s.motd}'\n      address: ${s.address}\n      restricted: ${s.restricted}`
    ).join('\n');

    const priorities = Object.keys(config.servers);

    return `# Auto-generated by CraftOS Network Manager
# Do not edit manually — changes will be overwritten

server_connect_timeout: 5000
remote_ping_timeout: 5000
remote_ping_cache: -1
player_limit: ${listener.maxPlayers}
ip_forward: ${config.ipForwarding}
online_mode: ${listener.onlineMode}

listeners:
  - query_port: ${listener.port}
    motd: '${listener.motd}'
    max_players: ${listener.maxPlayers}
    host: ${listener.host}
    forced_hosts: {}
    tab_list: GLOBAL_PING
    bind_local_address: true
    ping_passthrough: false
    query_enabled: false
    proxy_protocol: false
    priorities:
${priorities.map(p => `      - ${p}`).join('\n')}

servers:
${serverEntries}

groups: {}
permissions:
  default: []
  admin:
    - bungeecord.command.alert
    - bungeecord.command.end
    - bungeecord.command.ip
    - bungeecord.command.reload
    - bungeecord.command.send
    - bungeecord.command.server
    - bungeecord.command.list

connection_throttle: 4000
connection_throttle_limit: 3
timeout: 30000
log_commands: false
forge_support: true

disabled_commands:
  - disabledcommandhere
`;
  }

  private generateVelocityToml(config: ProxyConfigTemplate): string {
    const listener = config.listeners[0];
    const serverEntries = Object.entries(config.servers).map(
      ([name, s]) => `${name} = "${s.address}"`
    ).join('\n');

    const tryOrder = Object.keys(config.servers);

    return `# Auto-generated by CraftOS Network Manager
# Do not edit manually — changes will be overwritten

config-version = "2.7"
bind = "${listener.host}"
motd = "${listener.motd}"
show-max-players = ${listener.maxPlayers}
online-mode = ${listener.onlineMode}
force-key-authentication = true
announce-forge = false
prevent-client-proxy-connections = false
player-info-forwarding-mode = "modern"

[servers]
${serverEntries}
try = [${tryOrder.map(s => `"${s}"`).join(', ')}]

[forced-hosts]

[advanced]
compression-threshold = 256
compression-level = -1
login-ratelimit = 3000
connection-timeout = 5000
read-timeout = 30000
haproxy-protocol = false
tcp-fast-open = false
bungee-plugin-message-channel = true
show-ping-requests = false
failover-on-unexpected-server-disconnect = true
announce-proxy-commands = true
log-command-executions = false
log-player-connections = true

[query]
enabled = false
port = ${listener.port}
map = "Velocity"
show-plugins = false
`;
  }

  // ─── Helpers ──────────────────────────────────────────

  private async enrichNetwork(network: ServerNetwork): Promise<NetworkWithServers> {
    const db = getDb();

    // Get linked servers
    const linkedServers = await db.select().from(networkServers)
      .where(eq(networkServers.networkId, network.id))
      .orderBy(networkServers.priority);

    const enrichedServers = [];
    const manager = ServerManager.getInstance();

    for (const ns of linkedServers) {
      const [server] = await db.select().from(servers)
        .where(eq(servers.id, ns.serverId)).limit(1);

      let playerCount = 0;
      try {
        const instance = manager.getServerInstance(ns.serverId);
        if (instance) playerCount = instance.getPlayerCount();
      } catch {}

      enrichedServers.push({
        ...ns,
        serverName: server?.name || 'Unknown',
        serverStatus: server?.status || 'stopped',
        serverPort: server?.port || 25565,
        playerCount,
      });
    }

    // Get proxy server info
    let proxyServerName: string | undefined;
    let proxyServerStatus: string | undefined;
    if (network.proxyServerId) {
      const [proxy] = await db.select().from(servers)
        .where(eq(servers.id, network.proxyServerId)).limit(1);
      proxyServerName = proxy?.name;
      proxyServerStatus = proxy?.status;
    }

    return {
      ...network,
      servers: enrichedServers,
      proxyServerName,
      proxyServerStatus,
    };
  }

  // Get servers NOT in any network (available to join)
  async getAvailableServers(): Promise<Array<{ id: string; name: string; type: string; port: number; status: string }>> {
    const db = getDb();
    const allServers = await db.select().from(servers);
    const usedServerIds = await db.select({ serverId: networkServers.serverId }).from(networkServers);
    const usedIds = new Set(usedServerIds.map(s => s.serverId));

    // Exclude proxy-type servers from backend servers — they can only be proxies
    const proxyTypes = new Set(['bungeecord', 'waterfall', 'velocity']);

    return allServers
      .filter(s => !usedIds.has(s.id) && !proxyTypes.has(s.type))
      .map(s => ({ id: s.id, name: s.name, type: s.type, port: s.port, status: s.status }));
  }

  // Get proxy-capable servers (for assigning as network proxy)
  async getProxyServers(): Promise<Array<{ id: string; name: string; type: string; port: number; status: string }>> {
    const db = getDb();
    const proxyTypes = ['bungeecord', 'waterfall', 'velocity'];
    const allServers = await db.select().from(servers);

    return allServers
      .filter(s => proxyTypes.includes(s.type))
      .map(s => ({ id: s.id, name: s.name, type: s.type, port: s.port, status: s.status }));
  }
}
