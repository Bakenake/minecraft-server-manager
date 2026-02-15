import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn, formatBytes } from '../lib/utils';
import type {
  PluginInfo,
  MarketplaceSearchResult,
  MarketplaceVersionInfo,
  MarketplaceCategory,
} from '../types';
import {
  PuzzlePieceIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  GlobeAltIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
  XMarkIcon,
  ServerIcon,
} from '@heroicons/react/24/outline';
import { useRole } from '../hooks/useRole';

// ─── Format helpers ───────────────────────────────────────
function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ─── Tab type ─────────────────────────────────────────────
type TabKey = 'installed' | 'browse';

export default function Plugins() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();

  const [activeTab, setActiveTab] = useState<TabKey>('installed');

  // ── Installed plugins state ────────────────────────────
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'enabled' | 'disabled' | 'errors'>('all');

  // ── Marketplace state ──────────────────────────────────
  const [marketResults, setMarketResults] = useState<MarketplaceSearchResult[]>([]);
  const [marketTotal, setMarketTotal] = useState(0);
  const [marketSearch, setMarketSearch] = useState('');
  const [marketCategory, setMarketCategory] = useState('all');
  const [marketSource, setMarketSource] = useState<'all' | 'modrinth' | 'hangar'>('all');
  const [marketPage, setMarketPage] = useState(0);
  const [marketLoading, setMarketLoading] = useState(false);
  const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [showVersionPicker, setShowVersionPicker] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<MarketplaceVersionInfo[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // ── Server picker for install ────────────────────────
  const [showServerPicker, setShowServerPicker] = useState<{ result: MarketplaceSearchResult; version?: MarketplaceVersionInfo } | null>(null);
  const [installTargetServer, setInstallTargetServer] = useState<string>('');

  // ── Installed plugin names for "installed" badge ─────
  const [installedPluginNames, setInstalledPluginNames] = useState<Set<string>>(new Set());

  // ── Plugin update checker state ────────────────────────
  interface PluginUpdate {
    fileName: string;
    projectName: string;
    source: 'modrinth' | 'hangar';
    projectId: string;
    currentVersion: string;
    latestVersion: string;
    latestVersionId: string;
    downloadUrl: string;
    latestFileName: string;
  }
  const [pluginUpdates, setPluginUpdates] = useState<PluginUpdate[]>([]);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updatingPlugin, setUpdatingPlugin] = useState<string | null>(null);

  const selectedId = id || servers[0]?.id;
  const activeServer = servers.find((s) => s.id === selectedId);
  const typeLabel = activeServer?.type === 'forge' || activeServer?.type === 'fabric' ? 'Mods' : 'Plugins';
  const isVanilla = activeServer?.type === 'vanilla';

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // ── Load installed plugins ────────────────────────────
  const loadPlugins = useCallback(async () => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      const { data } = await api.get(`/servers/${selectedId}/plugins`);
      setPlugins(data);
      // Track installed plugin names for "Installed" badge in marketplace
      const names = new Set<string>(data.map((p: PluginInfo) => p.name.toLowerCase()));
      setInstalledPluginNames(names);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load plugins');
    }
    setIsLoading(false);
  }, [selectedId]);

  useEffect(() => {
    loadPlugins();
  }, [loadPlugins]);

  // ── Check for plugin updates ───────────────────────────
  const checkForUpdates = useCallback(async () => {
    if (!selectedId) return;
    setCheckingUpdates(true);
    try {
      const { data } = await api.get(`/servers/${selectedId}/plugins/check-updates`);
      setPluginUpdates(data);
      if (data.length > 0) {
        toast.success(`${data.length} update(s) available`);
      } else {
        toast(`All plugins are up to date`, { icon: '✓' });
      }
    } catch {
      // silently ignore – metadata may not exist for manually installed plugins
    }
    setCheckingUpdates(false);
  }, [selectedId]);

  const handleUpdatePlugin = async (update: PluginUpdate) => {
    if (!selectedId) return;
    setUpdatingPlugin(update.fileName);
    try {
      await api.post(`/servers/${selectedId}/marketplace/install`, {
        downloadUrl: update.downloadUrl,
        fileName: update.latestFileName,
        source: update.source,
        projectId: update.projectId,
        versionId: update.latestVersionId,
        versionNumber: update.latestVersion,
        projectName: update.projectName,
      });
      toast.success(`Updated ${update.projectName} to v${update.latestVersion}`);
      setPluginUpdates((prev) => prev.filter((u) => u.fileName !== update.fileName));
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Update failed');
    }
    setUpdatingPlugin(null);
  };

  // ── Load marketplace categories ──────────────────────
  useEffect(() => {
    if (!selectedId || isVanilla) return;
    api.get(`/servers/${selectedId}/marketplace/categories`)
      .then(({ data }) => setCategories(data))
      .catch(() => {});
  }, [selectedId, isVanilla]);

  // ── Marketplace search ──────────────────────────────
  const searchMarketplace = useCallback(async (
    query: string,
    page: number,
    category: string,
    source: string
  ) => {
    if (!selectedId || isVanilla) return;
    setMarketLoading(true);
    try {
      const params = new URLSearchParams({
        q: query,
        page: String(page),
        limit: '20',
        source,
        ...(category !== 'all' ? { category } : {}),
      });
      const { data } = await api.get(`/servers/${selectedId}/marketplace/search?${params}`);
      setMarketResults(data.results);
      setMarketTotal(data.total);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Marketplace search failed');
    }
    setMarketLoading(false);
  }, [selectedId, isVanilla]);

  // Trigger search when tab changes to browse or filters change
  useEffect(() => {
    if (activeTab !== 'browse' || isVanilla) return;
    searchMarketplace(marketSearch, marketPage, marketCategory, marketSource);
  }, [activeTab, marketPage, marketCategory, marketSource]);

  // Debounced search input
  const handleMarketSearchChange = (value: string) => {
    setMarketSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setMarketPage(0);
      searchMarketplace(value, 0, marketCategory, marketSource);
    }, 400);
  };

  // ── Fetch versions for install ──────────────────────
  const fetchVersions = async (result: MarketplaceSearchResult) => {
    if (showVersionPicker === result.id) {
      setShowVersionPicker(null);
      return;
    }
    setShowVersionPicker(result.id);
    setVersionsLoading(true);
    try {
      const { data } = await api.get(
        `/servers/${selectedId}/marketplace/versions/${result.source}/${encodeURIComponent(result.id)}`
      );
      setSelectedVersions(data);
    } catch (err: any) {
      toast.error('Failed to load versions');
      setShowVersionPicker(null);
    }
    setVersionsLoading(false);
  };

  // ── Install plugin/mod ─────────────────────────────
  const handleInstall = async (version: MarketplaceVersionInfo, projectName: string, result?: MarketplaceSearchResult) => {
    // If multiple servers, show server picker
    const nonVanillaServers = servers.filter(s => s.type !== 'vanilla');
    if (nonVanillaServers.length > 1 && result) {
      setShowServerPicker({ result, version });
      setInstallTargetServer(selectedId || nonVanillaServers[0]?.id || '');
      return;
    }
    await doInstall(selectedId!, version, projectName, result);
  };

  // ── Actually perform install to a specific server ─────
  const doInstall = async (targetServerId: string, version: MarketplaceVersionInfo, projectName: string, result?: MarketplaceSearchResult) => {
    setInstalling(version.id);
    try {
      await api.post(`/servers/${targetServerId}/marketplace/install`, {
        downloadUrl: version.downloadUrl,
        fileName: version.fileName,
        source: result?.source,
        projectId: result?.id,
        versionId: version.id,
        versionNumber: version.versionNumber,
        projectName,
      });
      const targetServer = servers.find(s => s.id === targetServerId);
      toast.success(`Installed ${projectName} v${version.versionNumber}${targetServer && targetServerId !== selectedId ? ` on ${targetServer.name}` : ''}`);
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Install failed');
    }
    setInstalling(null);
  };

  // ── Quick install (latest compatible version) ──────
  const handleQuickInstall = async (result: MarketplaceSearchResult) => {
    // If multiple servers, show server picker
    const nonVanillaServers = servers.filter(s => s.type !== 'vanilla');
    if (nonVanillaServers.length > 1) {
      setShowServerPicker({ result });
      setInstallTargetServer(selectedId || nonVanillaServers[0]?.id || '');
      return;
    }
    await doQuickInstall(selectedId!, result);
  };

  // ── Actually perform quick install to a specific server ──
  const doQuickInstall = async (targetServerId: string, result: MarketplaceSearchResult) => {
    setInstalling(result.id);
    try {
      const { data: versions } = await api.get(
        `/servers/${targetServerId}/marketplace/versions/${result.source}/${encodeURIComponent(result.id)}`
      );
      if (!versions || versions.length === 0) {
        toast.error('No compatible version found');
        setInstalling(null);
        return;
      }
      const latest = versions[0];
      await api.post(`/servers/${targetServerId}/marketplace/install`, {
        downloadUrl: latest.downloadUrl,
        fileName: latest.fileName,
        source: result.source,
        projectId: result.id,
        versionId: latest.id,
        versionNumber: latest.versionNumber,
        projectName: result.name,
      });
      const targetServer = servers.find(s => s.id === targetServerId);
      toast.success(`Installed ${result.name} v${latest.versionNumber}${targetServer && targetServerId !== selectedId ? ` on ${targetServer.name}` : ''}`);
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Install failed');
    }
    setInstalling(null);
  };

  // ── Toggle plugin ─────────────────────────────────
  const handleToggle = async (plugin: PluginInfo) => {
    try {
      if (plugin.enabled) {
        await api.post(`/servers/${selectedId}/plugins/${encodeURIComponent(plugin.fileName)}/disable`);
        toast.success(`Disabled ${plugin.name}`);
      } else {
        await api.post(`/servers/${selectedId}/plugins/${encodeURIComponent(plugin.fileName)}/enable`);
        toast.success(`Enabled ${plugin.name}`);
      }
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to toggle plugin');
    }
  };

  // ── Remove plugin ─────────────────────────────────
  const handleRemove = async (plugin: PluginInfo) => {
    if (!confirm(`Remove ${plugin.name}? This will delete the file.`)) return;
    try {
      await api.delete(`/servers/${selectedId}/plugins/${encodeURIComponent(plugin.fileName)}`);
      toast.success(`Removed ${plugin.name}`);
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove plugin');
    }
  };

  // ── Upload plugin ─────────────────────────────────
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.jar')) {
      toast.error('Only .jar files are supported');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      await api.post(`/servers/${selectedId}/plugins/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Uploaded ${file.name}`);
      loadPlugins();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Upload failed');
    }
    e.target.value = '';
  };

  // ── Filter installed plugins ──────────────────────
  const filtered = plugins
    .filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.fileName.toLowerCase().includes(search.toLowerCase())
    )
    .filter((p) => {
      if (filter === 'enabled') return p.enabled;
      if (filter === 'disabled') return !p.enabled;
      if (filter === 'errors') return p.hasError;
      return true;
    });

  const enabledCount = plugins.filter((p) => p.enabled).length;
  const disabledCount = plugins.filter((p) => !p.enabled).length;
  const errorCount = plugins.filter((p) => p.hasError).length;
  const totalPages = Math.ceil(marketTotal / 20);
  const { canOperate, canManage } = useRole();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">{typeLabel}</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/plugins/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        {activeTab === 'installed' && canOperate && (
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={checkForUpdates}
              disabled={checkingUpdates}
            >
              <ArrowPathIcon className={cn('w-4 h-4', checkingUpdates && 'animate-spin')} />
              {checkingUpdates ? 'Checking...' : 'Check Updates'}
              {pluginUpdates.length > 0 && (
                <span className="ml-1 bg-accent-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pluginUpdates.length}
                </span>
              )}
            </button>
            <label className="btn-primary btn-sm cursor-pointer">
              <ArrowUpTrayIcon className="w-4 h-4" />
              Upload {typeLabel === 'Mods' ? 'Mod' : 'Plugin'}
              <input type="file" accept=".jar" className="hidden" onChange={handleUpload} />
            </label>
          </div>
        )}
      </div>

      {/* Tabs */}
      {!isVanilla && (
        <div className="flex border-b border-dark-700">
          <button
            className={cn(
              'px-4 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px',
              activeTab === 'installed'
                ? 'text-accent-400 border-accent-500'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            )}
            onClick={() => setActiveTab('installed')}
          >
            <PuzzlePieceIcon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Installed ({plugins.length})
          </button>
          <button
            className={cn(
              'px-4 py-2.5 font-medium text-sm transition-colors border-b-2 -mb-px',
              activeTab === 'browse'
                ? 'text-accent-400 border-accent-500'
                : 'text-dark-400 border-transparent hover:text-dark-200'
            )}
            onClick={() => setActiveTab('browse')}
          >
            <GlobeAltIcon className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Browse Marketplace
          </button>
        </div>
      )}

      {/* ─── INSTALLED TAB ──────────────────────────────── */}
      {activeTab === 'installed' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              className={cn('card text-center cursor-pointer transition-all', filter === 'all' && 'ring-1 ring-accent-500')}
              onClick={() => setFilter('all')}
            >
              <p className="text-2xl font-bold text-dark-100">{plugins.length}</p>
              <p className="text-xs text-dark-500">Total</p>
            </button>
            <button
              className={cn('card text-center cursor-pointer transition-all', filter === 'enabled' && 'ring-1 ring-success-500')}
              onClick={() => setFilter('enabled')}
            >
              <p className="text-2xl font-bold text-success-400">{enabledCount}</p>
              <p className="text-xs text-dark-500">Enabled</p>
            </button>
            <button
              className={cn('card text-center cursor-pointer transition-all', filter === 'disabled' && 'ring-1 ring-dark-500')}
              onClick={() => setFilter('disabled')}
            >
              <p className="text-2xl font-bold text-dark-400">{disabledCount}</p>
              <p className="text-xs text-dark-500">Disabled</p>
            </button>
            <button
              className={cn('card text-center cursor-pointer transition-all', filter === 'errors' && 'ring-1 ring-danger-500')}
              onClick={() => setFilter('errors')}
            >
              <p className="text-2xl font-bold text-danger-400">{errorCount}</p>
              <p className="text-xs text-dark-500">Errors</p>
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
            <input
              className="input pl-10"
              placeholder={`Search ${typeLabel.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Plugin list */}
          {isLoading ? (
            <div className="card text-center py-12">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="card text-center py-12">
              <PuzzlePieceIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">
                {plugins.length === 0
                  ? `No ${typeLabel.toLowerCase()} installed`
                  : 'No matches found'}
              </p>
              {plugins.length === 0 && !isVanilla && (
                <button
                  className="btn-primary btn-sm mt-3"
                  onClick={() => setActiveTab('browse')}
                >
                  <GlobeAltIcon className="w-4 h-4" />
                  Browse Marketplace
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((plugin) => (
                <div
                  key={plugin.fileName}
                  className={cn('card-hover flex items-center justify-between', {
                    'border-danger-500/30': plugin.hasError,
                    'opacity-60': !plugin.enabled,
                  })}
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                      plugin.hasError
                        ? 'bg-danger-500/20'
                        : plugin.enabled
                        ? 'bg-accent-500/20'
                        : 'bg-dark-800'
                    )}>
                      {plugin.hasError ? (
                        <ExclamationTriangleIcon className="w-5 h-5 text-danger-400" />
                      ) : (
                        <PuzzlePieceIcon className={cn('w-5 h-5', plugin.enabled ? 'text-accent-400' : 'text-dark-500')} />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-dark-100 truncate">{plugin.name}</h3>
                        {plugin.version && (
                          <span className="text-xs text-dark-500 flex-shrink-0">v{plugin.version}</span>
                        )}
                        {pluginUpdates.find(u => u.fileName === plugin.fileName) && (
                          <span className="text-xs bg-accent-500/20 text-accent-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                            Update: v{pluginUpdates.find(u => u.fileName === plugin.fileName)!.latestVersion}
                          </span>
                        )}
                      </div>
                      {plugin.description && (
                        <p className="text-sm text-dark-400 truncate">{plugin.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-dark-500 mt-0.5">
                        <span>{plugin.fileName}</span>
                        <span>{formatBytes(plugin.size)}</span>
                        {plugin.authors && plugin.authors.length > 0 && (
                          <span>by {plugin.authors.join(', ')}</span>
                        )}
                      </div>
                      {plugin.hasError && plugin.errorMessage && (
                        <p className="text-xs text-danger-400 mt-1">{plugin.errorMessage}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    {(() => {
                      const update = pluginUpdates.find(u => u.fileName === plugin.fileName);
                      if (update && canOperate) {
                        return (
                          <button
                            onClick={() => handleUpdatePlugin(update)}
                            disabled={updatingPlugin === update.fileName}
                            className="btn-primary btn-sm"
                          >
                            {updatingPlugin === update.fileName ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                            )}
                            Update
                          </button>
                        );
                      }
                      return null;
                    })()}
                    {canOperate && (
                      <button
                        onClick={() => handleToggle(plugin)}
                        className={cn('btn-sm', plugin.enabled ? 'btn-secondary' : 'btn-success')}
                      >
                        {plugin.enabled ? (
                          <>
                            <XCircleIcon className="w-3.5 h-3.5" />
                            Disable
                          </>
                        ) : (
                          <>
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Enable
                          </>
                        )}
                      </button>
                    )}
                    {canManage && (
                      <button
                        onClick={() => handleRemove(plugin)}
                        className="btn-ghost btn-sm text-danger-400"
                        title="Remove"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {plugins.length > 0 && (
            <p className="text-xs text-dark-500 text-center">
              Changes to {typeLabel.toLowerCase()} may require a server restart to take effect.
            </p>
          )}
        </>
      )}

      {/* ─── BROWSE MARKETPLACE TAB ────────────────────── */}
      {activeTab === 'browse' && (
        <>
          {/* Search & Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                className="input pl-10"
                placeholder={`Search ${typeLabel.toLowerCase()} on marketplace...`}
                value={marketSearch}
                onChange={(e) => handleMarketSearchChange(e.target.value)}
              />
              {marketSearch && (
                <button
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-dark-300"
                  onClick={() => { setMarketSearch(''); searchMarketplace('', 0, marketCategory, marketSource); }}
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <select
                className="input py-1.5 text-sm w-36"
                value={marketCategory}
                onChange={(e) => { setMarketCategory(e.target.value); setMarketPage(0); }}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <select
                className="input py-1.5 text-sm w-32"
                value={marketSource}
                onChange={(e) => { setMarketSource(e.target.value as any); setMarketPage(0); }}
              >
                <option value="all">All Sources</option>
                <option value="modrinth">Modrinth</option>
                {(activeServer?.type === 'paper') && (
                  <option value="hangar">Hangar</option>
                )}
              </select>
              <button
                className="btn-ghost btn-sm"
                onClick={() => searchMarketplace(marketSearch, marketPage, marketCategory, marketSource)}
                title="Refresh"
              >
                <ArrowPathIcon className={cn('w-4 h-4', marketLoading && 'animate-spin')} />
              </button>
            </div>
          </div>

          {/* Server info badge */}
          <div className="flex items-center gap-2 text-xs text-dark-500">
            <FunnelIcon className="w-3.5 h-3.5" />
            Showing {typeLabel.toLowerCase()} compatible with
            <span className="text-accent-400 font-medium">
              {activeServer?.type?.toUpperCase()} {activeServer?.version}
            </span>
            {marketTotal > 0 && (
              <span className="ml-1">({formatNumber(marketTotal)} results)</span>
            )}
          </div>

          {/* Results */}
          {marketLoading && marketResults.length === 0 ? (
            <div className="card text-center py-16">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-dark-400">Searching marketplace...</p>
            </div>
          ) : marketResults.length === 0 ? (
            <div className="card text-center py-16">
              <GlobeAltIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">
                {marketSearch
                  ? `No ${typeLabel.toLowerCase()} found matching "${marketSearch}"`
                  : `Search for ${typeLabel.toLowerCase()} to get started`}
              </p>
              <p className="text-xs text-dark-600 mt-1">
                Try searching for popular {typeLabel.toLowerCase()} like "essentials", "worldedit", or "permissions"
              </p>
            </div>
          ) : (
            <>
              <div className={cn('grid gap-3', marketLoading && 'opacity-60 pointer-events-none')}>
                {marketResults.map((result) => (
                  <div key={`${result.source}:${result.id}`} className="card-hover">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="w-12 h-12 rounded-lg bg-dark-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {result.iconUrl ? (
                          <img
                            src={result.iconUrl}
                            alt=""
                            className="w-12 h-12 rounded-lg object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <PuzzlePieceIcon className="w-6 h-6 text-dark-500" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-dark-100">{result.name}</h3>
                          <span className={cn(
                            'text-[10px] font-medium px-1.5 py-0.5 rounded',
                            result.source === 'modrinth'
                              ? 'bg-green-500/15 text-green-400'
                              : 'bg-blue-500/15 text-blue-400'
                          )}>
                            {result.source === 'modrinth' ? 'Modrinth' : 'Hangar'}
                          </span>
                          {installedPluginNames.has(result.name.toLowerCase()) && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-success-500/15 text-success-400 flex items-center gap-0.5">
                              <CheckCircleIcon className="w-3 h-3" />
                              Installed
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-dark-400 mt-0.5 line-clamp-2">{result.description}</p>
                        <div className="flex items-center gap-4 text-xs text-dark-500 mt-1.5 flex-wrap">
                          <span>by {result.author}</span>
                          <span className="flex items-center gap-1">
                            <ArrowDownTrayIcon className="w-3 h-3" />
                            {formatNumber(result.downloads)}
                          </span>
                          <span>Updated {timeAgo(result.dateUpdated)}</span>
                          {result.categories.slice(0, 3).map((cat) => (
                            <span
                              key={cat}
                              className="text-[10px] bg-dark-700 px-1.5 py-0.5 rounded"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-ghost btn-sm"
                          title="View on website"
                        >
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        </a>
                        {canOperate && (
                          <div className="flex items-center">
                            <button
                              onClick={() => handleQuickInstall(result)}
                              disabled={installing === result.id}
                              className="btn-primary btn-sm rounded-r-none"
                            >
                              {installing === result.id ? (
                                <>
                                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                                  Installing...
                                </>
                              ) : (
                                <>
                                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                                  Install
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => fetchVersions(result)}
                              className="btn-primary btn-sm rounded-l-none border-l border-accent-600 px-1.5"
                              title="Pick version"
                            >
                              <ChevronDownIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Version picker dropdown */}
                    {showVersionPicker === result.id && (
                      <div className="mt-3 pt-3 border-t border-dark-700">
                        {versionsLoading ? (
                          <div className="flex items-center gap-2 text-dark-400 text-sm py-2">
                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            Loading versions...
                          </div>
                        ) : selectedVersions.length === 0 ? (
                          <p className="text-sm text-dark-500 py-2">No compatible versions found</p>
                        ) : (
                          <div className="max-h-48 overflow-y-auto space-y-1">
                            {selectedVersions.slice(0, 10).map((version) => (
                              <div
                                key={version.id}
                                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-dark-700/50"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-sm font-medium text-dark-200">
                                    {version.versionNumber}
                                  </span>
                                  <span className="text-xs text-dark-500">
                                    {version.gameVersions.slice(0, 3).join(', ')}
                                  </span>
                                  <span className="text-xs text-dark-600">
                                    {formatBytes(version.fileSize)}
                                  </span>
                                  <span className="text-xs text-dark-600">
                                    {timeAgo(version.datePublished)}
                                  </span>
                                  {version.dependencies.filter((d: any) => d.dependencyType === 'required').length > 0 && (
                                    <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1 py-0.5 rounded">
                                      deps
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="btn-primary btn-sm text-xs"
                                  onClick={() => handleInstall(version, result.name, result)}
                                  disabled={installing === version.id}
                                >
                                  {installing === version.id ? (
                                    <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <>
                                      <ArrowDownTrayIcon className="w-3 h-3" />
                                      Install
                                    </>
                                  )}
                                </button>
                              </div>
                            ))}
                            {selectedVersions.length > 10 && (
                              <p className="text-xs text-dark-500 text-center py-1">
                                + {selectedVersions.length - 10} more versions
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <button
                    className="btn-secondary btn-sm"
                    disabled={marketPage === 0}
                    onClick={() => setMarketPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="text-sm text-dark-400">
                    Page {marketPage + 1} of {totalPages}
                  </span>
                  <button
                    className="btn-secondary btn-sm"
                    disabled={marketPage >= totalPages - 1}
                    onClick={() => setMarketPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {/* ─── SERVER PICKER MODAL ──────────────────────── */}
      {showServerPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowServerPicker(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-dark-50">Choose Server</h3>
              <button onClick={() => setShowServerPicker(null)} className="text-dark-400 hover:text-dark-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-dark-400">
              Which server should <span className="text-dark-200 font-medium">{showServerPicker.result.name}</span> be installed on?
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {servers.filter(s => s.type !== 'vanilla').map((s) => (
                <button
                  key={s.id}
                  onClick={() => setInstallTargetServer(s.id)}
                  className={cn(
                    'w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left',
                    installTargetServer === s.id
                      ? 'border-accent-500 bg-accent-500/10'
                      : 'border-dark-700 hover:border-dark-600'
                  )}
                >
                  <ServerIcon className={cn('w-5 h-5 flex-shrink-0', installTargetServer === s.id ? 'text-accent-400' : 'text-dark-500')} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('font-medium text-sm', installTargetServer === s.id ? 'text-accent-400' : 'text-dark-200')}>{s.name}</p>
                    <p className="text-xs text-dark-500">{s.type} {s.version}</p>
                  </div>
                  {installTargetServer === s.id && (
                    <CheckCircleIcon className="w-5 h-5 text-accent-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <div className="flex gap-3 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setShowServerPicker(null)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                disabled={!installTargetServer}
                onClick={async () => {
                  const { result, version } = showServerPicker;
                  setShowServerPicker(null);
                  if (version) {
                    await doInstall(installTargetServer, version, result.name, result);
                  } else {
                    await doQuickInstall(installTargetServer, result);
                  }
                }}
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Install
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
