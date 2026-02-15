import { useEffect, useRef, useCallback, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import { useNotificationStore } from '../stores/notificationStore';
import type { WsMessage } from '../types';

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const token = useAuthStore((s) => s.token);
  const updateServerStatus = useServerStore((s) => s.updateServerStatus);
  const updateSystemMetrics = useServerStore((s) => s.updateSystemMetrics);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const connect = useCallback(() => {
    if (!token) return;
    // Don't create duplicate connections
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:3001' : window.location.host;
    const url = `${protocol}//${host}/ws?token=${token}`;

    const socket = new WebSocket(url);
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      console.log('[WS] Connected');
    };

    socket.onmessage = (event) => {
      try {
        const message: WsMessage = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('[WS] Invalid message:', err);
      }
    };

    socket.onclose = (event) => {
      setIsConnected(false);
      ws.current = null;

      // Auto-reconnect unless deliberately closed
      if (event.code !== 4001 && token) {
        reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };

    socket.onerror = () => {
      setIsConnected(false);
    };
  }, [token]);

  const handleMessage = useCallback(
    (message: WsMessage) => {
      switch (message.type) {
        case 'metrics': {
          const { system, servers } = message.data as {
            system: any;
            servers: Record<string, any>;
          };
          updateSystemMetrics(system);
          for (const [serverId, status] of Object.entries(servers)) {
            updateServerStatus(serverId, status as any);
          }
          break;
        }

        case 'server:log': {
          const { line } = message.data as { line: string; serverId: string };
          setConsoleLogs((prev) => {
            const next = [...prev, line];
            return next.length > 500 ? next.slice(-500) : next;
          });
          break;
        }

        case 'server:status': {
          const { serverId, newStatus } = message.data as {
            serverId: string;
            newStatus: string;
          };
          updateServerStatus(serverId, { status: newStatus as any });
          if (newStatus === 'running') {
            addNotification({ type: 'success', title: 'Server Started', message: `Server is now running`, serverId });
          } else if (newStatus === 'crashed') {
            addNotification({ type: 'error', title: 'Server Crashed', message: `Server has crashed`, serverId });
          }
          break;
        }

        case 'server:player_join':
        case 'server:player_leave': {
          const { serverId, playerCount, username } = message.data as {
            serverId: string;
            playerCount: number;
            username?: string;
          };
          updateServerStatus(serverId, { playerCount });
          if (message.type === 'server:player_join' && username) {
            addNotification({ type: 'info', title: 'Player Joined', message: `${username} joined the server`, serverId });
          }
          break;
        }

        case 'server:tps': {
          const { serverId, tps } = message.data as {
            serverId: string;
            tps: number;
          };
          updateServerStatus(serverId, { tps });
          break;
        }

        case 'logs': {
          const { logs } = message.data as { logs: string[] };
          setConsoleLogs(logs);
          break;
        }

        case 'server:crash': {
          const { serverId } = message.data as { serverId: string };
          updateServerStatus(serverId, { status: 'crashed' });
          addNotification({ type: 'error', title: 'Server Crash Detected', message: 'A crash report was generated', serverId });
          break;
        }

        case 'server:performance_alert': {
          const { serverId, serverName, level, metric, value, message: alertMsg } = message.data as any;
          addNotification({
            type: level === 'critical' ? 'error' : 'warning',
            title: `${metric} ${level === 'critical' ? 'Critical' : 'Warning'}`,
            message: alertMsg || `${serverName}: ${metric} = ${value}`,
            serverId,
          });
          break;
        }
      }
    },
    [updateServerStatus, updateSystemMetrics]
  );

  const subscribe = useCallback((serverId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      setConsoleLogs([]);
      ws.current.send(JSON.stringify({ type: 'subscribe', data: { serverId } }));
    }
  }, []);

  const unsubscribe = useCallback((serverId: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'unsubscribe', data: { serverId } }));
    }
  }, []);

  const sendCommand = useCallback((serverId: string, command: string) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({ type: 'command', data: { serverId, command } })
      );
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      ws.current?.close();
    };
  }, [connect]);

  const clearLogs = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  return {
    isConnected,
    consoleLogs,
    subscribe,
    unsubscribe,
    sendCommand,
    clearLogs,
  };
}
