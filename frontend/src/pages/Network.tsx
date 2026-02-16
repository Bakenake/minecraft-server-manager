import { useEffect, useState } from 'react';
import { useNetworkStore } from '../stores/networkStore';
import { cn } from '../lib/utils';
import toast from 'react-hot-toast';
import type { ServerNetwork, ProxyType, AvailableServer } from '../types';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  XMarkIcon,
  ServerStackIcon,
  SignalIcon,
  Cog6ToothIcon,
  ArrowsPointingOutIcon,
  LinkIcon,
  ShieldCheckIcon,
  StarIcon,
  ArrowDownTrayIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  MinusCircleIcon,
  EllipsisVerticalIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

// ─── Status helpers ─────────────────────────────────────
function getNetworkStatusColor(status: string) {
  switch (status) {
    case 'running': return 'text-green-400';
    case 'starting': return 'text-yellow-400';
    case 'stopping': return 'text-orange-400';
    case 'degraded': return 'text-red-400';
    default: return 'text-dark-500';
  }
}

function getNetworkStatusBg(status: string) {
  switch (status) {
    case 'running': return 'bg-green-500/10 border-green-500/20';
    case 'starting': return 'bg-yellow-500/10 border-yellow-500/20';
    case 'stopping': return 'bg-orange-500/10 border-orange-500/20';
    case 'degraded': return 'bg-red-500/10 border-red-500/20';
    default: return 'bg-dark-800 border-dark-700';
  }
}

function getProxyIcon(type: ProxyType) {
  switch (type) {
    case 'velocity': return '⚡';
    case 'waterfall': return '💧';
    case 'bungeecord': return '🔗';
  }
}

function getProxyLabel(type: ProxyType) {
  switch (type) {
    case 'velocity': return 'Velocity';
    case 'waterfall': return 'Waterfall';
    case 'bungeecord': return 'BungeeCord';
  }
}

// ─── Create Network Dialog ──────────────────────────────
function CreateNetworkDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { createNetwork, fetchNetworks } = useNetworkStore();
  const [form, setForm] = useState({
    name: '',
    proxyType: 'velocity' as ProxyType,
    description: '',
    proxyPort: 25577,
    motd: 'A CraftOS Network',
    maxPlayers: 100,
    onlineMode: true,
    ipForwarding: true,
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Network name is required');
      return;
    }
    setIsLoading(true);
    try {
      await createNetwork(form);
      toast.success(`Network "${form.name}" created`);
      await fetchNetworks();
      onClose();
      setForm({
        name: '',
        proxyType: 'velocity',
        description: '',
        proxyPort: 25577,
        motd: 'A CraftOS Network',
        maxPlayers: 100,
        onlineMode: true,
        ipForwarding: true,
      });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create network');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <div>
            <h2 className="text-lg font-semibold text-dark-100">Create Network</h2>
            <p className="text-sm text-dark-400 mt-1">Set up a proxy network to connect multiple servers</p>
          </div>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Network Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
              placeholder="My Network"
              required
            />
          </div>

          {/* Proxy Type */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Proxy Type</label>
            <div className="grid grid-cols-3 gap-2">
              {(['velocity', 'waterfall', 'bungeecord'] as ProxyType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm({ ...form, proxyType: type })}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all',
                    form.proxyType === type
                      ? 'border-accent-500 bg-accent-500/10 text-accent-400'
                      : 'border-dark-600 bg-dark-800 text-dark-400 hover:border-dark-500'
                  )}
                >
                  <span className="text-xl">{getProxyIcon(type)}</span>
                  <span className="text-sm font-medium">{getProxyLabel(type)}</span>
                  {type === 'velocity' && (
                    <span className="text-xs text-green-400">Recommended</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
              placeholder="Optional description"
            />
          </div>

          {/* Port & Players row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Proxy Port</label>
              <input
                type="number"
                value={form.proxyPort}
                onChange={(e) => setForm({ ...form, proxyPort: parseInt(e.target.value) || 25577 })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
                min={1024}
                max={65535}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1.5">Max Players</label>
              <input
                type="number"
                value={form.maxPlayers}
                onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 100 })}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
                min={1}
              />
            </div>
          </div>

          {/* MOTD */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">MOTD</label>
            <input
              type="text"
              value={form.motd}
              onChange={(e) => setForm({ ...form, motd: e.target.value })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500"
              placeholder="A Minecraft Network"
            />
          </div>

          {/* Toggles */}
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.onlineMode}
                onChange={(e) => setForm({ ...form, onlineMode: e.target.checked })}
                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50"
              />
              <span className="text-sm text-dark-300">Online Mode</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ipForwarding}
                onChange={(e) => setForm({ ...form, ipForwarding: e.target.checked })}
                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50"
              />
              <span className="text-sm text-dark-300">IP Forwarding</span>
            </label>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-dark-300 bg-dark-800 rounded-lg border border-dark-600 hover:bg-dark-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Network'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Server Dialog ──────────────────────────────────
function AddServerDialog({
  isOpen,
  onClose,
  networkId,
  availableServers,
}: {
  isOpen: boolean;
  onClose: () => void;
  networkId: string;
  availableServers: AvailableServer[];
}) {
  const { addServer } = useNetworkStore();
  const [selectedServer, setSelectedServer] = useState('');
  const [alias, setAlias] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isFallback, setIsFallback] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServer || !alias.trim()) {
      toast.error('Select a server and provide an alias');
      return;
    }
    setIsLoading(true);
    try {
      await addServer(networkId, {
        serverId: selectedServer,
        serverAlias: alias.trim().toLowerCase().replace(/\s+/g, '-'),
        isDefault,
        isFallback,
        restricted,
      });
      toast.success('Server added to network');
      onClose();
      setSelectedServer('');
      setAlias('');
      setIsDefault(false);
      setIsFallback(false);
      setRestricted(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add server');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-dark-900 border border-dark-700 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-dark-100">Add Server to Network</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Server Selection */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Server</label>
            {availableServers.length === 0 ? (
              <p className="text-sm text-dark-500 bg-dark-800 rounded-lg p-3">
                No available servers. Create a game server first, then add it to this network.
              </p>
            ) : (
              <select
                value={selectedServer}
                onChange={(e) => {
                  setSelectedServer(e.target.value);
                  if (!alias) {
                    const server = availableServers.find(s => s.id === e.target.value);
                    if (server) setAlias(server.name.toLowerCase().replace(/\s+/g, '-'));
                  }
                }}
                className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
                required
              >
                <option value="">Select a server...</option>
                {availableServers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type} — port {s.port})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Alias */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">
              Server Alias
              <span className="text-dark-500 font-normal ml-1">(used in proxy config)</span>
            </label>
            <input
              type="text"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
              placeholder="e.g., lobby, survival, creative"
              required
            />
          </div>

          {/* Flags */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50"
              />
              <span className="text-sm text-dark-300">Default Server</span>
              <span className="text-xs text-dark-500">(players join here first)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isFallback}
                onChange={(e) => setIsFallback(e.target.checked)}
                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50"
              />
              <span className="text-sm text-dark-300">Fallback Server</span>
              <span className="text-xs text-dark-500">(redirect here if current goes down)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
                className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50"
              />
              <span className="text-sm text-dark-300">Restricted</span>
              <span className="text-xs text-dark-500">(require permission to join)</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-dark-300 bg-dark-800 rounded-lg border border-dark-600 hover:bg-dark-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || availableServers.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-500 transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Network Detail Panel ───────────────────────────────
function NetworkDetail({
  network,
  onBack,
}: {
  network: ServerNetwork;
  onBack: () => void;
}) {
  const {
    fetchNetwork, updateNetwork, deleteNetwork,
    removeServer, startNetwork, stopNetwork, restartNetwork,
    syncConfig, fetchAvailableServers, availableServers,
  } = useNetworkStore();
  const [showAddServer, setShowAddServer] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchAvailableServers();
    // Refresh every 10s when running
    const interval = setInterval(() => {
      fetchNetwork(network.id);
    }, 10000);
    return () => clearInterval(interval);
  }, [network.id]);

  const handleAction = async (action: string) => {
    setActionLoading(action);
    try {
      let result: { success: boolean; message: string };
      if (action === 'start') result = await startNetwork(network.id);
      else if (action === 'stop') result = await stopNetwork(network.id);
      else result = await restartNetwork(network.id);

      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSyncConfig = async () => {
    setActionLoading('sync');
    try {
      const result = await syncConfig(network.id);
      if (result.written) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete network "${network.name}"? This cannot be undone.`)) return;
    await deleteNetwork(network.id);
    toast.success('Network deleted');
    onBack();
  };

  const handleRemoveServer = async (serverId: string, alias: string) => {
    if (!confirm(`Remove "${alias}" from network?`)) return;
    await removeServer(network.id, serverId);
    toast.success(`Removed "${alias}" from network`);
  };

  const totalPlayers = network.servers.reduce((sum, s) => sum + (s.playerCount || 0), 0);
  const runningServers = network.servers.filter(s => s.serverStatus === 'running').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-dark-400 hover:text-dark-200 transition-colors"
          >
            ← Back
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-dark-100">{network.name}</h1>
              <span className={cn(
                'px-2.5 py-0.5 text-xs font-medium rounded-full border',
                getNetworkStatusBg(network.status),
                getNetworkStatusColor(network.status)
              )}>
                {network.status}
              </span>
            </div>
            <p className="text-sm text-dark-400 mt-1">
              {getProxyIcon(network.proxyType)} {getProxyLabel(network.proxyType)} Network
              {network.description && ` — ${network.description}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAction('start')}
            disabled={network.status === 'running' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-400 bg-green-500/10 rounded-lg border border-green-500/20 hover:bg-green-500/20 transition-colors disabled:opacity-40"
          >
            <PlayIcon className="w-4 h-4" />
            {actionLoading === 'start' ? 'Starting...' : 'Start'}
          </button>
          <button
            onClick={() => handleAction('stop')}
            disabled={network.status === 'stopped' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-40"
          >
            <StopIcon className="w-4 h-4" />
            {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
          </button>
          <button
            onClick={() => handleAction('restart')}
            disabled={network.status === 'stopped' || !!actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-yellow-400 bg-yellow-500/10 rounded-lg border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors disabled:opacity-40"
          >
            <ArrowPathIcon className="w-4 h-4" />
            {actionLoading === 'restart' ? '...' : 'Restart'}
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <ServerStackIcon className="w-4 h-4" />
            Backend Servers
          </div>
          <div className="text-2xl font-bold text-dark-100">
            {runningServers}/{network.servers.length}
          </div>
          <div className="text-xs text-dark-500 mt-0.5">running</div>
        </div>
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <GlobeAltIcon className="w-4 h-4" />
            Players Online
          </div>
          <div className="text-2xl font-bold text-dark-100">{totalPlayers}</div>
          <div className="text-xs text-dark-500 mt-0.5">across network</div>
        </div>
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <SignalIcon className="w-4 h-4" />
            Proxy Port
          </div>
          <div className="text-2xl font-bold text-dark-100">{network.proxyPort}</div>
          <div className="text-xs text-dark-500 mt-0.5">{network.onlineMode ? 'online mode' : 'offline mode'}</div>
        </div>
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-dark-400 text-sm mb-1">
            <ShieldCheckIcon className="w-4 h-4" />
            Proxy Status
          </div>
          <div className="text-2xl font-bold text-dark-100 capitalize">
            {network.proxyServerStatus || 'No proxy'}
          </div>
          <div className="text-xs text-dark-500 mt-0.5">{network.proxyServerName || 'Assign a proxy server'}</div>
        </div>
      </div>

      {/* Network Topology Visualization */}
      <div className="bg-dark-800/50 border border-dark-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
          <h2 className="text-base font-semibold text-dark-100 flex items-center gap-2">
            <ArrowsPointingOutIcon className="w-5 h-5 text-accent-400" />
            Network Topology
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncConfig}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-400 bg-accent-500/10 rounded-lg border border-accent-500/20 hover:bg-accent-500/20 transition-colors"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
              {actionLoading === 'sync' ? 'Syncing...' : 'Sync Config'}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-dark-400 bg-dark-700 rounded-lg border border-dark-600 hover:bg-dark-600 transition-colors"
            >
              <Cog6ToothIcon className="w-3.5 h-3.5" />
              Settings
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-colors"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Visual topology: Proxy → Backend Servers */}
          <div className="flex flex-col items-center gap-6">
            {/* Proxy Node */}
            <div className={cn(
              'flex items-center gap-4 px-6 py-4 rounded-xl border-2 w-full max-w-md',
              network.proxyServerId
                ? 'border-accent-500/30 bg-accent-500/5'
                : 'border-dashed border-dark-600 bg-dark-800/50'
            )}>
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center text-2xl',
                network.proxyServerId ? 'bg-accent-500/20' : 'bg-dark-700'
              )}>
                {getProxyIcon(network.proxyType)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-dark-100 truncate">
                  {network.proxyServerName || 'No Proxy Assigned'}
                </div>
                <div className="text-sm text-dark-400">
                  {getProxyLabel(network.proxyType)} Proxy — Port {network.proxyPort}
                </div>
              </div>
              {network.proxyServerStatus && (
                <span className={cn(
                  'px-2 py-0.5 text-xs font-medium rounded-full',
                  network.proxyServerStatus === 'running'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-dark-700 text-dark-400'
                )}>
                  {network.proxyServerStatus}
                </span>
              )}
            </div>

            {/* Connection Lines */}
            {network.servers.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="w-px h-6 bg-dark-600" />
                <LinkIcon className="w-4 h-4 text-dark-500" />
                <div className="w-px h-6 bg-dark-600" />
              </div>
            )}

            {/* Backend Servers Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
              {network.servers.map((ns) => (
                <div
                  key={ns.serverId}
                  className={cn(
                    'relative flex items-start gap-3 p-4 rounded-xl border transition-all group',
                    ns.serverStatus === 'running'
                      ? 'border-green-500/20 bg-green-500/5'
                      : 'border-dark-600 bg-dark-800/50 hover:border-dark-500'
                  )}
                >
                  {/* Status dot */}
                  <div className={cn(
                    'w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0',
                    ns.serverStatus === 'running' ? 'bg-green-400 animate-pulse' :
                    ns.serverStatus === 'starting' ? 'bg-yellow-400 animate-pulse' :
                    ns.serverStatus === 'crashed' ? 'bg-red-400' : 'bg-dark-600'
                  )} />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-dark-100 truncate">{ns.serverName}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-xs text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded">
                        {ns.serverAlias}
                      </span>
                      <span className="text-xs text-dark-500">:{ns.serverPort}</span>
                      {ns.isDefault && (
                        <span className="text-xs text-accent-400 bg-accent-500/10 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                          <StarIcon className="w-3 h-3" /> Default
                        </span>
                      )}
                      {ns.isFallback && (
                        <span className="text-xs text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                          Fallback
                        </span>
                      )}
                      {ns.restricted && (
                        <span className="text-xs text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
                          Restricted
                        </span>
                      )}
                    </div>
                    {ns.playerCount !== undefined && ns.playerCount > 0 && (
                      <div className="text-xs text-dark-400 mt-1">
                        {ns.playerCount} player{ns.playerCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <button
                    onClick={() => handleRemoveServer(ns.serverId, ns.serverAlias)}
                    className="opacity-0 group-hover:opacity-100 text-dark-500 hover:text-red-400 transition-all"
                    title="Remove from network"
                  >
                    <MinusCircleIcon className="w-5 h-5" />
                  </button>
                </div>
              ))}

              {/* Add Server Button */}
              <button
                onClick={() => {
                  fetchAvailableServers();
                  setShowAddServer(true);
                }}
                className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-dark-600 text-dark-500 hover:border-accent-500/30 hover:text-accent-400 hover:bg-accent-500/5 transition-all min-h-[100px]"
              >
                <PlusIcon className="w-6 h-6" />
                <span className="text-sm font-medium">Add Server</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <NetworkSettings network={network} onClose={() => setShowSettings(false)} />
      )}

      {/* Add Server Dialog */}
      <AddServerDialog
        isOpen={showAddServer}
        onClose={() => setShowAddServer(false)}
        networkId={network.id}
        availableServers={availableServers}
      />
    </div>
  );
}

// ─── Network Settings ───────────────────────────────────
function NetworkSettings({
  network,
  onClose,
}: {
  network: ServerNetwork;
  onClose: () => void;
}) {
  const { updateNetwork } = useNetworkStore();
  const [form, setForm] = useState({
    name: network.name,
    description: network.description,
    proxyPort: network.proxyPort,
    motd: network.motd,
    maxPlayers: network.maxPlayers,
    onlineMode: network.onlineMode,
    ipForwarding: network.ipForwarding,
    autoStart: network.autoStart,
  });

  const handleSave = async () => {
    await updateNetwork(network.id, form);
    toast.success('Network settings updated');
    onClose();
  };

  return (
    <div className="bg-dark-800/50 border border-dark-700 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700">
        <h2 className="text-base font-semibold text-dark-100 flex items-center gap-2">
          <Cog6ToothIcon className="w-5 h-5 text-dark-400" />
          Network Settings
        </h2>
        <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Proxy Port</label>
            <input
              type="number"
              value={form.proxyPort}
              onChange={(e) => setForm({ ...form, proxyPort: parseInt(e.target.value) || 25577 })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-1.5">Max Players</label>
            <input
              type="number"
              value={form.maxPlayers}
              onChange={(e) => setForm({ ...form, maxPlayers: parseInt(e.target.value) || 100 })}
              className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-1.5">MOTD</label>
          <input
            type="text"
            value={form.motd}
            onChange={(e) => setForm({ ...form, motd: e.target.value })}
            className="w-full bg-dark-800 border border-dark-600 rounded-lg px-3 py-2 text-dark-100 focus:outline-none focus:ring-2 focus:ring-accent-500/50"
          />
        </div>
        <div className="flex items-center gap-6 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.onlineMode} onChange={(e) => setForm({ ...form, onlineMode: e.target.checked })}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50" />
            <span className="text-sm text-dark-300">Online Mode</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.ipForwarding} onChange={(e) => setForm({ ...form, ipForwarding: e.target.checked })}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50" />
            <span className="text-sm text-dark-300">IP Forwarding</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.autoStart} onChange={(e) => setForm({ ...form, autoStart: e.target.checked })}
              className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500/50" />
            <span className="text-sm text-dark-300">Auto Start</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-dark-300 bg-dark-800 rounded-lg border border-dark-600 hover:bg-dark-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-accent-600 rounded-lg hover:bg-accent-500 transition-colors">
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Network Page ──────────────────────────────────
export default function Network() {
  const { networks, activeNetwork, isLoading, fetchNetworks, setActiveNetwork, fetchNetwork } = useNetworkStore();
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    fetchNetworks();
  }, []);

  // If viewing a specific network
  if (activeNetwork) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <NetworkDetail
          network={activeNetwork}
          onBack={() => setActiveNetwork(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Networks</h1>
          <p className="text-sm text-dark-400 mt-1">
            Manage proxy networks to connect multiple Minecraft servers together
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-500 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          Create Network
        </button>
      </div>

      {/* Info Banner */}
      {networks.length === 0 && !isLoading && (
        <div className="bg-dark-800/50 border border-dark-700 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-accent-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <SignalIcon className="w-8 h-8 text-accent-400" />
          </div>
          <h2 className="text-lg font-semibold text-dark-100 mb-2">No Networks Yet</h2>
          <p className="text-dark-400 max-w-md mx-auto mb-6">
            Create a proxy network to connect your Minecraft servers. Supports BungeeCord, Waterfall, and Velocity proxies.
            Players will connect to a single port and can switch between your servers seamlessly.
          </p>
          <div className="flex justify-center gap-6 mb-6">
            <div className="text-center">
              <div className="text-2xl mb-1">⚡</div>
              <div className="text-sm font-medium text-dark-200">Velocity</div>
              <div className="text-xs text-dark-500">Modern & fast</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">💧</div>
              <div className="text-sm font-medium text-dark-200">Waterfall</div>
              <div className="text-xs text-dark-500">BungeeCord fork</div>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">🔗</div>
              <div className="text-sm font-medium text-dark-200">BungeeCord</div>
              <div className="text-xs text-dark-500">Classic proxy</div>
            </div>
          </div>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-600 text-white text-sm font-medium rounded-lg hover:bg-accent-500 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Create Your First Network
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading && networks.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-3 border-accent-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Network Cards */}
      {networks.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {networks.map((network) => {
            const runningCount = network.servers.filter(s => s.serverStatus === 'running').length;
            const totalPlayers = network.servers.reduce((sum, s) => sum + (s.playerCount || 0), 0);

            return (
              <button
                key={network.id}
                onClick={() => {
                  setActiveNetwork(network);
                  fetchNetwork(network.id);
                }}
                className={cn(
                  'text-left p-5 rounded-xl border transition-all hover:border-accent-500/30 hover:shadow-lg hover:shadow-accent-500/5',
                  getNetworkStatusBg(network.status)
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-dark-700 rounded-xl flex items-center justify-center text-xl">
                      {getProxyIcon(network.proxyType)}
                    </div>
                    <div>
                      <h3 className="font-semibold text-dark-100">{network.name}</h3>
                      <p className="text-xs text-dark-400">{getProxyLabel(network.proxyType)} Network</p>
                    </div>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full capitalize',
                    getNetworkStatusColor(network.status)
                  )}>
                    {network.status}
                  </span>
                </div>

                {network.description && (
                  <p className="text-sm text-dark-400 mb-3 line-clamp-2">{network.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-dark-500">
                  <span className="flex items-center gap-1">
                    <ServerStackIcon className="w-3.5 h-3.5" />
                    {runningCount}/{network.servers.length} servers
                  </span>
                  <span className="flex items-center gap-1">
                    <GlobeAltIcon className="w-3.5 h-3.5" />
                    {totalPlayers} players
                  </span>
                  <span className="flex items-center gap-1">
                    <SignalIcon className="w-3.5 h-3.5" />
                    Port {network.proxyPort}
                  </span>
                </div>

                {/* Server tags */}
                {network.servers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {network.servers.slice(0, 5).map((ns) => (
                      <span
                        key={ns.serverId}
                        className={cn(
                          'text-xs px-2 py-0.5 rounded-full',
                          ns.serverStatus === 'running'
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-dark-700 text-dark-400'
                        )}
                      >
                        {ns.serverAlias}
                      </span>
                    ))}
                    {network.servers.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-400">
                        +{network.servers.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Create Dialog */}
      <CreateNetworkDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </div>
  );
}
