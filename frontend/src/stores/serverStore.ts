import { create } from 'zustand';
import api from '../lib/api';
import type { Server, SystemMetrics } from '../types';

interface ServerState {
  servers: Server[];
  activeServerId: string | null;
  systemMetrics: SystemMetrics | null;
  isLoading: boolean;

  fetchServers: () => Promise<void>;
  setActiveServer: (id: string | null) => void;
  updateServerStatus: (serverId: string, data: Partial<Server>) => void;
  updateSystemMetrics: (metrics: SystemMetrics) => void;
  startServer: (id: string) => Promise<void>;
  stopServer: (id: string) => Promise<void>;
  restartServer: (id: string) => Promise<void>;
  killServer: (id: string) => Promise<void>;
  createServer: (data: Partial<Server>) => Promise<Server>;
  deleteServer: (id: string) => Promise<void>;
}

export const useServerStore = create<ServerState>()((set, get) => ({
  servers: [],
  activeServerId: null,
  systemMetrics: null,
  isLoading: false,

  fetchServers: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get<Server[]>('/servers');
      set({ servers: data, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  setActiveServer: (id) => {
    set({ activeServerId: id });
  },

  updateServerStatus: (serverId, data) => {
    set((state) => ({
      servers: state.servers.map((s) =>
        s.id === serverId ? { ...s, ...data } : s
      ),
    }));
  },

  updateSystemMetrics: (metrics) => {
    set({ systemMetrics: metrics });
  },

  startServer: async (id) => {
    await api.post(`/servers/${id}/start`);
    get().updateServerStatus(id, { status: 'starting' });
  },

  stopServer: async (id) => {
    await api.post(`/servers/${id}/stop`);
    get().updateServerStatus(id, { status: 'stopping' });
  },

  restartServer: async (id) => {
    await api.post(`/servers/${id}/restart`);
    get().updateServerStatus(id, { status: 'stopping' });
  },

  killServer: async (id) => {
    await api.post(`/servers/${id}/kill`);
    get().updateServerStatus(id, { status: 'stopped' });
  },

  createServer: async (data) => {
    const { data: server } = await api.post<Server>('/servers', data);
    set((state) => ({ servers: [...state.servers, server] }));
    return server;
  },

  deleteServer: async (id) => {
    await api.delete(`/servers/${id}`);
    set((state) => ({
      servers: state.servers.filter((s) => s.id !== id),
      activeServerId: state.activeServerId === id ? null : state.activeServerId,
    }));
  },
}));
