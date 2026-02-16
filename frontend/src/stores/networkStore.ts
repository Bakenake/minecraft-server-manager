import { create } from 'zustand';
import api from '../lib/api';
import type { ServerNetwork, NetworkServer, AvailableServer, ProxyConfig } from '../types';

interface NetworkState {
  networks: ServerNetwork[];
  activeNetwork: ServerNetwork | null;
  availableServers: AvailableServer[];
  proxyServers: AvailableServer[];
  proxyConfig: ProxyConfig | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchNetworks: () => Promise<void>;
  fetchNetwork: (id: string) => Promise<void>;
  setActiveNetwork: (network: ServerNetwork | null) => void;
  createNetwork: (data: {
    name: string;
    proxyType: 'bungeecord' | 'waterfall' | 'velocity';
    description?: string;
    proxyPort?: number;
    motd?: string;
    maxPlayers?: number;
    onlineMode?: boolean;
    ipForwarding?: boolean;
  }) => Promise<ServerNetwork>;
  updateNetwork: (id: string, data: Partial<ServerNetwork>) => Promise<void>;
  deleteNetwork: (id: string) => Promise<void>;
  addServer: (networkId: string, data: {
    serverId: string;
    serverAlias: string;
    isDefault?: boolean;
    isFallback?: boolean;
    restricted?: boolean;
    priority?: number;
  }) => Promise<void>;
  removeServer: (networkId: string, serverId: string) => Promise<void>;
  updateServer: (networkId: string, serverId: string, data: Partial<NetworkServer>) => Promise<void>;
  startNetwork: (id: string) => Promise<{ success: boolean; message: string }>;
  stopNetwork: (id: string) => Promise<{ success: boolean; message: string }>;
  restartNetwork: (id: string) => Promise<{ success: boolean; message: string }>;
  syncConfig: (id: string) => Promise<{ written: boolean; message: string }>;
  fetchAvailableServers: () => Promise<void>;
  fetchProxyServers: () => Promise<void>;
  fetchProxyConfig: (id: string) => Promise<void>;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  networks: [],
  activeNetwork: null,
  availableServers: [],
  proxyServers: [],
  proxyConfig: null,
  isLoading: false,
  error: null,

  fetchNetworks: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<{ networks: ServerNetwork[] }>('/networks');
      set({ networks: data.networks, isLoading: false });
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch networks', isLoading: false });
    }
  },

  fetchNetwork: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get<ServerNetwork>(`/networks/${id}`);
      set({ activeNetwork: data, isLoading: false });
      // Also update in networks list
      set((state) => ({
        networks: state.networks.map(n => n.id === id ? data : n),
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to fetch network', isLoading: false });
    }
  },

  setActiveNetwork: (network) => set({ activeNetwork: network }),

  createNetwork: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const { data: network } = await api.post<ServerNetwork>('/networks', data);
      set((state) => ({ networks: [...state.networks, network], isLoading: false }));
      return network;
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to create network', isLoading: false });
      throw err;
    }
  },

  updateNetwork: async (id, data) => {
    try {
      const { data: updated } = await api.put<ServerNetwork>(`/networks/${id}`, data);
      set((state) => ({
        networks: state.networks.map(n => n.id === id ? updated : n),
        activeNetwork: state.activeNetwork?.id === id ? updated : state.activeNetwork,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to update network' });
    }
  },

  deleteNetwork: async (id) => {
    try {
      await api.delete(`/networks/${id}`);
      set((state) => ({
        networks: state.networks.filter(n => n.id !== id),
        activeNetwork: state.activeNetwork?.id === id ? null : state.activeNetwork,
      }));
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to delete network' });
    }
  },

  addServer: async (networkId, data) => {
    try {
      await api.post(`/networks/${networkId}/servers`, data);
      await get().fetchNetwork(networkId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to add server' });
      throw err;
    }
  },

  removeServer: async (networkId, serverId) => {
    try {
      await api.delete(`/networks/${networkId}/servers/${serverId}`);
      await get().fetchNetwork(networkId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to remove server' });
    }
  },

  updateServer: async (networkId, serverId, data) => {
    try {
      await api.put(`/networks/${networkId}/servers/${serverId}`, data);
      await get().fetchNetwork(networkId);
    } catch (err: any) {
      set({ error: err.response?.data?.error || 'Failed to update server' });
    }
  },

  startNetwork: async (id) => {
    try {
      const { data } = await api.post<{ success: boolean; message: string }>(`/networks/${id}/start`);
      await get().fetchNetwork(id);
      return data;
    } catch (err: any) {
      return { success: false, message: err.response?.data?.error || 'Failed to start network' };
    }
  },

  stopNetwork: async (id) => {
    try {
      const { data } = await api.post<{ success: boolean; message: string }>(`/networks/${id}/stop`);
      await get().fetchNetwork(id);
      return data;
    } catch (err: any) {
      return { success: false, message: err.response?.data?.error || 'Failed to stop network' };
    }
  },

  restartNetwork: async (id) => {
    try {
      const { data } = await api.post<{ success: boolean; message: string }>(`/networks/${id}/restart`);
      await get().fetchNetwork(id);
      return data;
    } catch (err: any) {
      return { success: false, message: err.response?.data?.error || 'Failed to restart network' };
    }
  },

  syncConfig: async (id) => {
    try {
      const { data } = await api.post<{ written: boolean; message: string }>(`/networks/${id}/sync-config`);
      return data;
    } catch (err: any) {
      return { written: false, message: err.response?.data?.error || 'Failed to sync config' };
    }
  },

  fetchAvailableServers: async () => {
    try {
      const { data } = await api.get<{ servers: AvailableServer[] }>('/networks/available-servers');
      set({ availableServers: data.servers });
    } catch {}
  },

  fetchProxyServers: async () => {
    try {
      const { data } = await api.get<{ servers: AvailableServer[] }>('/networks/proxy-servers');
      set({ proxyServers: data.servers });
    } catch {}
  },

  fetchProxyConfig: async (id) => {
    try {
      const { data } = await api.get<ProxyConfig>(`/networks/${id}/config`);
      set({ proxyConfig: data });
    } catch {
      set({ proxyConfig: null });
    }
  },
}));
