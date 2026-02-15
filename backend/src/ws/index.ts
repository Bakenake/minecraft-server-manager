import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { verifyToken, JwtPayload } from '../auth/jwt';
import { ServerManager } from '../services/server-manager';
import { ServerEvent } from '../services/server-instance';
import { getSystemMetrics } from '../utils/system-metrics';
import { createChildLogger } from '../utils/logger';

const log = createChildLogger('websocket');

interface AuthenticatedSocket {
  ws: WebSocket;
  user: JwtPayload;
  subscribedServers: Set<string>;
  isAlive: boolean;
}

const clients: Map<WebSocket, AuthenticatedSocket> = new Map();
let metricsInterval: NodeJS.Timeout | null = null;

export async function setupWebSocket(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const ws = socket;

    // Authenticate via query param or first message
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Authentication required' } }));
      ws.close(4001, 'Authentication required');
      return;
    }

    let user: JwtPayload;
    try {
      user = verifyToken(token);
    } catch {
      ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid token' } }));
      ws.close(4001, 'Invalid token');
      return;
    }

    const client: AuthenticatedSocket = {
      ws,
      user,
      subscribedServers: new Set(),
      isAlive: true,
    };

    clients.set(ws, client);

    log.info({ username: user.username }, 'WebSocket client connected');

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      data: { username: user.username, role: user.role },
    }));

    // Handle messages
    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        handleMessage(client, message);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message format' } }));
      }
    });

    // Handle pong
    ws.on('pong', () => {
      client.isAlive = true;
    });

    // Handle close
    ws.on('close', () => {
      clients.delete(ws);
      log.info({ username: user.username }, 'WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      log.error({ error, username: user.username }, 'WebSocket error');
      clients.delete(ws);
    });
  });

  // Setup server event forwarding
  const manager = ServerManager.getInstance();
  manager.on('serverEvent', (event: ServerEvent) => {
    broadcastServerEvent(event);
  });

  // Ping/pong interval for connection health
  const pingInterval = setInterval(() => {
    for (const [ws, client] of clients) {
      if (!client.isAlive) {
        ws.terminate();
        clients.delete(ws);
        continue;
      }
      client.isAlive = false;
      ws.ping();
    }
  }, 30000);

  // System metrics broadcast every 5 seconds
  metricsInterval = setInterval(async () => {
    if (clients.size === 0) return;

    try {
      const metrics = await getSystemMetrics();
      const statuses: Record<string, unknown> = {};

      const allStatuses = manager.getAllStatuses();
      for (const [id, status] of allStatuses) {
        statuses[id] = status;
      }

      broadcast({
        type: 'metrics',
        data: {
          system: metrics,
          servers: statuses,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      // Silently skip metrics errors
    }
  }, 5000);

  // Cleanup on server close
  app.addHook('onClose', () => {
    clearInterval(pingInterval);
    if (metricsInterval) clearInterval(metricsInterval);
    for (const [ws] of clients) {
      ws.close();
    }
    clients.clear();
  });
}

function handleMessage(client: AuthenticatedSocket, message: { type: string; data?: unknown }): void {
  switch (message.type) {
    case 'subscribe': {
      const { serverId } = message.data as { serverId: string };
      client.subscribedServers.add(serverId);

      // Send current logs for the server
      const manager = ServerManager.getInstance();
      try {
        const logs = manager.getServerLogs(serverId, 200);
        client.ws.send(JSON.stringify({
          type: 'logs',
          data: { serverId, logs },
        }));
      } catch {
        // Server might not exist
      }

      log.debug({ username: client.user.username, serverId }, 'Client subscribed to server');
      break;
    }

    case 'unsubscribe': {
      const { serverId } = message.data as { serverId: string };
      client.subscribedServers.delete(serverId);
      break;
    }

    case 'command': {
      if (client.user.role === 'viewer') {
        client.ws.send(JSON.stringify({
          type: 'error',
          data: { message: 'Insufficient permissions' },
        }));
        return;
      }

      const { serverId, command } = message.data as { serverId: string; command: string };
      try {
        ServerManager.getInstance().sendCommand(serverId, command);
      } catch (err) {
        client.ws.send(JSON.stringify({
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'Command failed' },
        }));
      }
      break;
    }

    default:
      client.ws.send(JSON.stringify({
        type: 'error',
        data: { message: `Unknown message type: ${message.type}` },
      }));
  }
}

function broadcastServerEvent(event: ServerEvent): void {
  const message = JSON.stringify({
    type: `server:${event.type}`,
    data: {
      serverId: event.serverId,
      ...event.data as object,
      timestamp: event.timestamp.toISOString(),
    },
  });

  for (const [, client] of clients) {
    if (client.subscribedServers.has(event.serverId) || client.subscribedServers.size === 0) {
      try {
        client.ws.send(message);
      } catch {
        // Client might have disconnected
      }
    }
  }
}

function broadcast(payload: { type: string; data: unknown }): void {
  const message = JSON.stringify(payload);
  for (const [, client] of clients) {
    try {
      client.ws.send(message);
    } catch {
      // Client might have disconnected
    }
  }
}

export function getConnectedClients(): number {
  return clients.size;
}
