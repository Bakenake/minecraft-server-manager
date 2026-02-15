import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import { cn } from '../lib/utils';
import {
  GlobeAltIcon,
  FireIcon,
  SparklesIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useNotificationStore } from '../stores/notificationStore';

interface WorldInfo {
  name: string;
  dimension: 'overworld' | 'nether' | 'the_end';
  path: string;
  sizeMB: number;
  lastModified: string;
  seed?: string;
  levelName?: string;
}

type WorldSettings = Record<string, string>;

const dimensionConfig = {
  overworld: { icon: GlobeAltIcon, label: 'Overworld', color: 'text-green-400', bg: 'bg-green-500/10' },
  nether: { icon: FireIcon, label: 'Nether', color: 'text-red-400', bg: 'bg-red-500/10' },
  the_end: { icon: SparklesIcon, label: 'The End', color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

export default function Worlds() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();
  const addNotification = useNotificationStore((s) => s.addNotification);

  const [worlds, setWorlds] = useState<WorldInfo[]>([]);
  const [settings, setSettings] = useState<WorldSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState<string | null>(null);
  const [showResetAllConfirm, setShowResetAllConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editSettings, setEditSettings] = useState<WorldSettings>({});

  const selectedId = id || servers[0]?.id;
  const activeServer = servers.find((s) => s.id === selectedId);

  useEffect(() => { fetchServers(); }, [fetchServers]);

  const loadData = useCallback(async () => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      const [worldsRes, settingsRes] = await Promise.all([
        api.get(`/servers/${selectedId}/worlds`),
        api.get(`/servers/${selectedId}/worlds/settings`),
      ]);
      setWorlds(worldsRes.data as WorldInfo[]);
      const s = settingsRes.data as WorldSettings;
      setSettings(s);
      setEditSettings(s);
    } catch {
      // Server might not have worlds yet
      setWorlds([]);
    }
    setIsLoading(false);
  }, [selectedId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResetWorld = async (worldDir: string) => {
    try {
      await api.post(`/servers/${selectedId}/worlds/reset`, { worldDir });
      addNotification({ type: 'success', title: 'World Reset', message: `"${worldDir}" has been deleted. It will regenerate on next server start.` });
      setShowResetConfirm(null);
      loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Reset Failed', message: err.response?.data?.error || 'Failed to reset world' });
    }
  };

  const handleResetAll = async () => {
    try {
      await api.post(`/servers/${selectedId}/worlds/reset-all`);
      addNotification({ type: 'success', title: 'All Worlds Reset', message: 'All worlds have been deleted. They will regenerate on next server start.' });
      setShowResetAllConfirm(false);
      loadData();
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Reset Failed', message: err.response?.data?.error || 'Failed to reset worlds' });
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await api.put(`/servers/${selectedId}/worlds/settings`, editSettings);
      addNotification({ type: 'success', title: 'Settings Saved', message: 'World settings updated. Restart the server for changes to take effect.' });
      setSettings(editSettings);
    } catch (err: any) {
      addNotification({ type: 'error', title: 'Save Failed', message: err.response?.data?.error || 'Failed to save settings' });
    }
    setIsSaving(false);
  };

  const totalSize = worlds.reduce((sum, w) => sum + w.sizeMB, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">World Management</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/worlds/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setShowSettings(!showSettings)}>
            <Cog6ToothIcon className="w-4 h-4" />
            Settings
          </button>
          <button className="btn-secondary btn-sm" onClick={loadData}>
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
          {worlds.length > 0 && (
            <button
              className="btn-sm bg-danger-600 hover:bg-danger-500 text-white"
              onClick={() => setShowResetAllConfirm(true)}
            >
              <TrashIcon className="w-4 h-4" />
              Reset All
            </button>
          )}
        </div>
      </div>

      {/* World Settings Panel */}
      {showSettings && (
        <div className="card p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-dark-100">World Generation Settings</h3>
            <button onClick={() => setShowSettings(false)} className="text-dark-400 hover:text-dark-200">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-dark-500">
            These settings affect world generation. Changes require a server restart (and world reset for some settings) to take effect.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">World Seed</label>
              <input
                className="input w-full"
                type="text"
                value={editSettings['level-seed'] || ''}
                onChange={(e) => setEditSettings({ ...editSettings, 'level-seed': e.target.value })}
                placeholder="Leave empty for random"
              />
              <p className="text-xs text-dark-500 mt-1">Only applies when world is first generated</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Level Type</label>
              <select
                className="input w-full"
                value={editSettings['level-type'] || 'minecraft\\:normal'}
                onChange={(e) => setEditSettings({ ...editSettings, 'level-type': e.target.value })}
              >
                <option value="minecraft\:normal">Normal</option>
                <option value="minecraft\:flat">Superflat</option>
                <option value="minecraft\:large_biomes">Large Biomes</option>
                <option value="minecraft\:amplified">Amplified</option>
                <option value="minecraft\:single_biome_surface">Single Biome</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Max World Size (blocks)</label>
              <input
                className="input w-full"
                type="number"
                value={editSettings['max-world-size'] || '29999984'}
                onChange={(e) => setEditSettings({ ...editSettings, 'max-world-size': e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-1">Spawn Protection (blocks)</label>
              <input
                className="input w-full"
                type="number"
                value={editSettings['spawn-protection'] || '16'}
                onChange={(e) => setEditSettings({ ...editSettings, 'spawn-protection': e.target.value })}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500"
                  checked={editSettings['allow-nether'] !== 'false'}
                  onChange={(e) => setEditSettings({ ...editSettings, 'allow-nether': String(e.target.checked) })}
                />
                <span className="text-sm text-dark-200">Allow Nether</span>
              </label>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500"
                  checked={editSettings['generate-structures'] !== 'false'}
                  onChange={(e) => setEditSettings({ ...editSettings, 'generate-structures': String(e.target.checked) })}
                />
                <span className="text-sm text-dark-200">Generate Structures</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary btn-sm"
              onClick={handleSaveSettings}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-dark-400 text-xs">Total Worlds</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">{worlds.length}</p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-xs">Total Size</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">{totalSize.toFixed(1)} MB</p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-xs">Seed</p>
          <p className="text-lg font-mono text-dark-200 mt-1 truncate" title={settings['level-seed'] || 'Random'}>
            {settings['level-seed'] || 'Random'}
          </p>
        </div>
      </div>

      {/* World Cards */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : worlds.length === 0 ? (
        <div className="card text-center py-16">
          <GlobeAltIcon className="w-16 h-16 text-dark-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-dark-300 mb-2">No Worlds Found</h3>
          <p className="text-dark-500 text-sm">Start the server to generate world files</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {worlds.map((world) => {
            const config = dimensionConfig[world.dimension];
            const Icon = config.icon;
            return (
              <div key={world.name} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', config.bg)}>
                      <Icon className={cn('w-5 h-5', config.color)} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-dark-100">{config.label}</h3>
                      <p className="text-xs text-dark-500 font-mono">{world.name}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-dark-400">Size</span>
                    <span className="text-dark-200 font-medium">{world.sizeMB.toFixed(1)} MB</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-400">Modified</span>
                    <span className="text-dark-200">{new Date(world.lastModified).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  className="btn-sm w-full bg-danger-600/10 text-danger-400 hover:bg-danger-600/20 border border-danger-600/20"
                  onClick={() => setShowResetConfirm(world.path)}
                >
                  <TrashIcon className="w-4 h-4" />
                  Reset {config.label}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Reset single world confirm modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowResetConfirm(null)}>
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-danger-500/10 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-danger-400" />
              </div>
              <h3 className="text-lg font-semibold text-dark-100">Reset World?</h3>
            </div>
            <p className="text-dark-300 text-sm mb-4">
              This will permanently delete <span className="font-mono text-danger-400">{showResetConfirm}</span>.
              The world will regenerate fresh when the server starts again.
            </p>
            <p className="text-xs text-dark-500 mb-6">This action cannot be undone. Consider creating a backup first.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setShowResetConfirm(null)}>Cancel</button>
              <button
                className="btn-sm bg-danger-600 hover:bg-danger-500 text-white"
                onClick={() => handleResetWorld(showResetConfirm)}
              >
                Reset World
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset all worlds confirm modal */}
      {showResetAllConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowResetAllConfirm(false)}>
          <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-danger-500/10 rounded-full flex items-center justify-center">
                <ExclamationTriangleIcon className="w-5 h-5 text-danger-400" />
              </div>
              <h3 className="text-lg font-semibold text-dark-100">Reset ALL Worlds?</h3>
            </div>
            <p className="text-dark-300 text-sm mb-4">
              This will permanently delete all world data ({worlds.length} worlds, {totalSize.toFixed(1)} MB total).
              All worlds will regenerate fresh when the server starts again.
            </p>
            <p className="text-xs text-dark-500 mb-6">This action cannot be undone. Consider creating a backup first.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setShowResetAllConfirm(false)}>Cancel</button>
              <button
                className="btn-sm bg-danger-600 hover:bg-danger-500 text-white"
                onClick={handleResetAll}
              >
                Reset All Worlds
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
