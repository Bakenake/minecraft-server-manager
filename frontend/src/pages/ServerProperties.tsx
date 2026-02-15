import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import {
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
import { useRole } from '../hooks/useRole';

// ─── Server property definitions with descriptions ───────
interface PropDef {
  key: string;
  label: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  category: string;
  default?: string;
}

const PROPERTY_DEFINITIONS: PropDef[] = [
  // General
  { key: 'server-name', label: 'Server Name (MOTD)', description: 'Message shown in the server browser', type: 'string', category: 'General', default: 'A Minecraft Server' },
  { key: 'motd', label: 'MOTD', description: 'Message of the day shown in the server list', type: 'string', category: 'General', default: 'A Minecraft Server' },
  { key: 'server-port', label: 'Server Port', description: 'Port the server listens on', type: 'number', category: 'General', default: '25565' },
  { key: 'max-players', label: 'Max Players', description: 'Maximum number of players allowed', type: 'number', category: 'General', default: '20' },
  { key: 'level-name', label: 'World Name', description: 'Name of the world folder', type: 'string', category: 'General', default: 'world' },
  { key: 'level-seed', label: 'World Seed', description: 'Seed for world generation (blank for random)', type: 'string', category: 'General', default: '' },
  { key: 'level-type', label: 'World Type', description: 'Type of world generation', type: 'select', options: ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified', 'minecraft:single_biome_surface'], category: 'General', default: 'minecraft:normal' },
  { key: 'gamemode', label: 'Default Gamemode', description: 'Default gamemode for new players', type: 'select', options: ['survival', 'creative', 'adventure', 'spectator'], category: 'General', default: 'survival' },
  { key: 'difficulty', label: 'Difficulty', description: 'Game difficulty level', type: 'select', options: ['peaceful', 'easy', 'normal', 'hard'], category: 'General', default: 'easy' },
  { key: 'hardcore', label: 'Hardcore', description: 'Enable hardcore mode (permadeath)', type: 'boolean', category: 'General', default: 'false' },
  { key: 'pvp', label: 'PvP', description: 'Allow player vs player combat', type: 'boolean', category: 'General', default: 'true' },
  { key: 'allow-flight', label: 'Allow Flight', description: 'Allow players to fly (without hacks kick)', type: 'boolean', category: 'General', default: 'false' },

  // Network
  { key: 'server-ip', label: 'Server IP', description: 'IP to bind the server to (blank for all)', type: 'string', category: 'Network', default: '' },
  { key: 'online-mode', label: 'Online Mode', description: 'Verify player accounts with Mojang (disable for offline/cracked)', type: 'boolean', category: 'Network', default: 'true' },
  { key: 'enable-query', label: 'Enable Query', description: 'Enable GameSpy4 query protocol', type: 'boolean', category: 'Network', default: 'false' },
  { key: 'query.port', label: 'Query Port', description: 'Port for query protocol', type: 'number', category: 'Network', default: '25565' },
  { key: 'enable-rcon', label: 'Enable RCON', description: 'Enable remote console access', type: 'boolean', category: 'Network', default: 'false' },
  { key: 'rcon.port', label: 'RCON Port', description: 'Port for RCON', type: 'number', category: 'Network', default: '25575' },
  { key: 'rcon.password', label: 'RCON Password', description: 'Password for RCON access', type: 'string', category: 'Network', default: '' },
  { key: 'network-compression-threshold', label: 'Compression Threshold', description: 'Packet size threshold for compression (bytes, -1 to disable)', type: 'number', category: 'Network', default: '256' },
  { key: 'rate-limit', label: 'Rate Limit', description: 'Packets per second before kick (0 to disable)', type: 'number', category: 'Network', default: '0' },

  // World
  { key: 'generate-structures', label: 'Generate Structures', description: 'Generate villages, temples, etc.', type: 'boolean', category: 'World', default: 'true' },
  { key: 'allow-nether', label: 'Allow Nether', description: 'Enable the Nether dimension', type: 'boolean', category: 'World', default: 'true' },
  { key: 'spawn-monsters', label: 'Spawn Monsters', description: 'Spawn hostile mobs', type: 'boolean', category: 'World', default: 'true' },
  { key: 'spawn-animals', label: 'Spawn Animals', description: 'Spawn passive animals', type: 'boolean', category: 'World', default: 'true' },
  { key: 'spawn-npcs', label: 'Spawn NPCs', description: 'Spawn villagers', type: 'boolean', category: 'World', default: 'true' },
  { key: 'max-world-size', label: 'Max World Size', description: 'Maximum world radius in blocks', type: 'number', category: 'World', default: '29999984' },
  { key: 'view-distance', label: 'View Distance', description: 'Chunk render distance (3-32)', type: 'number', category: 'World', default: '10' },
  { key: 'simulation-distance', label: 'Simulation Distance', description: 'Chunk simulation distance (3-32)', type: 'number', category: 'World', default: '10' },
  { key: 'spawn-protection', label: 'Spawn Protection', description: 'Radius of spawn protection (0 to disable)', type: 'number', category: 'World', default: '16' },
  { key: 'max-build-height', label: 'Max Build Height', description: 'Maximum build height', type: 'number', category: 'World', default: '256' },

  // Performance
  { key: 'max-tick-time', label: 'Max Tick Time', description: 'Max milliseconds per tick before watchdog crash (-1 to disable)', type: 'number', category: 'Performance', default: '60000' },
  { key: 'entity-broadcast-range-percentage', label: 'Entity Broadcast Range %', description: 'Entity visibility range percentage (10-1000)', type: 'number', category: 'Performance', default: '100' },
  { key: 'sync-chunk-writes', label: 'Sync Chunk Writes', description: 'Synchronize chunk writes (safer but slower)', type: 'boolean', category: 'Performance', default: 'true' },

  // Security
  { key: 'white-list', label: 'Whitelist', description: 'Only allow whitelisted players', type: 'boolean', category: 'Security', default: 'false' },
  { key: 'enforce-whitelist', label: 'Enforce Whitelist', description: 'Kick non-whitelisted players when list reloads', type: 'boolean', category: 'Security', default: 'false' },
  { key: 'enforce-secure-profile', label: 'Enforce Secure Profile', description: 'Require signed chat messages', type: 'boolean', category: 'Security', default: 'true' },
  { key: 'max-chained-neighbor-updates', label: 'Max Chained Updates', description: 'Max chained neighbor updates before skipping (-1 for unlimited)', type: 'number', category: 'Security', default: '1000000' },
  { key: 'op-permission-level', label: 'OP Permission Level', description: 'Default OP permission level (1-4)', type: 'select', options: ['1', '2', '3', '4'], category: 'Security', default: '4' },
  { key: 'function-permission-level', label: 'Function Permission Level', description: 'Permission level for function commands (1-4)', type: 'select', options: ['1', '2', '3', '4'], category: 'Security', default: '2' },

  // Misc
  { key: 'enable-command-block', label: 'Command Blocks', description: 'Enable command blocks', type: 'boolean', category: 'Misc', default: 'false' },
  { key: 'enable-status', label: 'Enable Status', description: 'Show server in server list', type: 'boolean', category: 'Misc', default: 'true' },
  { key: 'hide-online-players', label: 'Hide Online Players', description: 'Hide player list from status', type: 'boolean', category: 'Misc', default: 'false' },
  { key: 'resource-pack', label: 'Resource Pack URL', description: 'URL to a resource pack', type: 'string', category: 'Misc', default: '' },
  { key: 'resource-pack-sha1', label: 'Resource Pack SHA1', description: 'SHA1 hash for resource pack verification', type: 'string', category: 'Misc', default: '' },
  { key: 'require-resource-pack', label: 'Require Resource Pack', description: 'Kick players who decline the resource pack', type: 'boolean', category: 'Misc', default: 'false' },
  { key: 'enable-jmx-monitoring', label: 'JMX Monitoring', description: 'Expose JMX MBeans', type: 'boolean', category: 'Misc', default: 'false' },
  { key: 'text-filtering-config', label: 'Text Filtering Config', description: 'Text filtering configuration', type: 'string', category: 'Misc', default: '' },
  { key: 'player-idle-timeout', label: 'Idle Timeout', description: 'Minutes before kicking idle players (0 to disable)', type: 'number', category: 'Misc', default: '0' },
  { key: 'force-gamemode', label: 'Force Gamemode', description: 'Force default gamemode on join', type: 'boolean', category: 'Misc', default: 'false' },
];

const CATEGORIES = ['General', 'Network', 'World', 'Performance', 'Security', 'Misc'];

function parseProperties(content: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const value = trimmed.substring(eqIdx + 1).trim();
    props[key] = value;
  }
  return props;
}

function serializeProperties(props: Record<string, string>, originalContent: string): string {
  const lines = originalContent.split('\n');
  const seen = new Set<string>();
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      result.push(line);
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) {
      result.push(line);
      continue;
    }
    const key = trimmed.substring(0, eqIdx).trim();
    seen.add(key);
    result.push(`${key}=${props[key] ?? ''}`);
  }

  // Add any new properties that weren't in the original
  for (const [key, value] of Object.entries(props)) {
    if (!seen.has(key)) {
      result.push(`${key}=${value}`);
    }
  }

  return result.join('\n');
}

export default function ServerProperties() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();
  const { canOperate } = useRole();

  const [properties, setProperties] = useState<Record<string, string>>({});
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('General');
  const [hasChanges, setHasChanges] = useState(false);
  const [originalProps, setOriginalProps] = useState<Record<string, string>>({});

  const selectedId = id || servers[0]?.id;

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const loadProperties = useCallback(async () => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      const { data } = await api.get(`/servers/${selectedId}/files/read?path=server.properties`);
      const content = typeof data === 'string' ? data : data.content;
      setOriginalContent(content);
      const parsed = parseProperties(content);
      setProperties(parsed);
      setOriginalProps({ ...parsed });
      setHasChanges(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load server.properties');
    }
    setIsLoading(false);
  }, [selectedId]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  const handleChange = (key: string, value: string) => {
    setProperties((prev) => {
      const next = { ...prev, [key]: value };
      setHasChanges(JSON.stringify(next) !== JSON.stringify(originalProps));
      return next;
    });
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    try {
      const content = serializeProperties(properties, originalContent);
      await api.put(`/servers/${selectedId}/files/write`, {
        path: 'server.properties',
        content,
      });
      setOriginalContent(content);
      setOriginalProps({ ...properties });
      setHasChanges(false);
      toast.success('server.properties saved! Restart the server for changes to take effect.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save');
    }
    setIsSaving(false);
  };

  const filteredProps = PROPERTY_DEFINITIONS.filter((p) => {
    if (search) {
      const s = search.toLowerCase();
      return (
        p.key.toLowerCase().includes(s) ||
        p.label.toLowerCase().includes(s) ||
        p.description.toLowerCase().includes(s)
      );
    }
    return p.category === activeCategory;
  });

  // Find unknown properties (in file but not in our definitions)
  const knownKeys = new Set(PROPERTY_DEFINITIONS.map((p) => p.key));
  const unknownProps = Object.entries(properties)
    .filter(([k]) => !knownKeys.has(k))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Server Properties</h1>
          <p className="text-dark-400 text-sm mt-1">Visual editor for server.properties</p>
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 1 && (
            <select
              className="input text-sm py-1.5 w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/properties/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          {hasChanges && canOperate && (
            <button
              className="btn-primary btn-sm"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <CheckIcon className="w-4 h-4" />
              )}
              Save Changes
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Category sidebar */}
          <div className="lg:w-48 flex-shrink-0">
            <div className="relative mb-3">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
              <input
                className="input pl-10 text-sm"
                placeholder="Search properties..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!search && (
              <nav className="space-y-1">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      activeCategory === cat
                        ? 'bg-accent-600/10 text-accent-400'
                        : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                    )}
                  >
                    {cat}
                    <span className="text-dark-600 ml-1.5 text-xs">
                      ({PROPERTY_DEFINITIONS.filter((p) => p.category === cat).length})
                    </span>
                  </button>
                ))}
                {unknownProps.length > 0 && (
                  <button
                    onClick={() => setActiveCategory('Other')}
                    className={cn(
                      'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      activeCategory === 'Other'
                        ? 'bg-accent-600/10 text-accent-400'
                        : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800'
                    )}
                  >
                    Other
                    <span className="text-dark-600 ml-1.5 text-xs">({unknownProps.length})</span>
                  </button>
                )}
              </nav>
            )}
          </div>

          {/* Properties editor */}
          <div className="flex-1 space-y-2">
            {search ? (
              <h2 className="text-lg font-semibold text-dark-200 mb-3">
                Search results for "{search}" ({filteredProps.length})
              </h2>
            ) : activeCategory !== 'Other' ? (
              <h2 className="text-lg font-semibold text-dark-200 mb-3">{activeCategory}</h2>
            ) : (
              <h2 className="text-lg font-semibold text-dark-200 mb-3">Other Properties</h2>
            )}

            {!search && activeCategory !== 'Other' && filteredProps.map((def) => {
              const value = properties[def.key] ?? def.default ?? '';
              const isDefault = value === (def.default ?? '');

              return (
                <div key={def.key} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-dark-100">
                        {def.label}
                      </label>
                      {!isDefault && (
                        <span className="text-xs bg-accent-500/15 text-accent-400 px-1.5 py-0.5 rounded">Modified</span>
                      )}
                    </div>
                    <p className="text-xs text-dark-500 mt-0.5">{def.description}</p>
                    <p className="text-xs text-dark-600 font-mono mt-0.5">{def.key}</p>
                  </div>
                  <div className="sm:w-56 flex-shrink-0">
                    {def.type === 'boolean' ? (
                      <button
                        onClick={() => canOperate && handleChange(def.key, value === 'true' ? 'false' : 'true')}
                        disabled={!canOperate}
                        className={cn(
                          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                          value === 'true' ? 'bg-accent-600' : 'bg-dark-700'
                        )}
                      >
                        <span className={cn(
                          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                          value === 'true' ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    ) : def.type === 'select' ? (
                      <select
                        className="input text-sm py-1.5 w-full"
                        value={value}
                        onChange={(e) => handleChange(def.key, e.target.value)}
                        disabled={!canOperate}
                      >
                        {def.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : def.type === 'number' ? (
                      <input
                        type="number"
                        className="input text-sm py-1.5 w-full"
                        value={value}
                        onChange={(e) => handleChange(def.key, e.target.value)}
                        disabled={!canOperate}
                      />
                    ) : (
                      <input
                        type="text"
                        className="input text-sm py-1.5 w-full"
                        value={value}
                        onChange={(e) => handleChange(def.key, e.target.value)}
                        disabled={!canOperate}
                        placeholder={def.default}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {search && filteredProps.map((def) => {
              const value = properties[def.key] ?? def.default ?? '';
              return (
                <div key={def.key} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-dark-100">{def.label}</label>
                      <span className="text-xs text-dark-600 bg-dark-800 px-1.5 py-0.5 rounded">{def.category}</span>
                    </div>
                    <p className="text-xs text-dark-500 mt-0.5">{def.description}</p>
                    <p className="text-xs text-dark-600 font-mono mt-0.5">{def.key}</p>
                  </div>
                  <div className="sm:w-56 flex-shrink-0">
                    {def.type === 'boolean' ? (
                      <button
                        onClick={() => canOperate && handleChange(def.key, value === 'true' ? 'false' : 'true')}
                        disabled={!canOperate}
                        className={cn(
                          'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                          value === 'true' ? 'bg-accent-600' : 'bg-dark-700'
                        )}
                      >
                        <span className={cn(
                          'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                          value === 'true' ? 'translate-x-6' : 'translate-x-1'
                        )} />
                      </button>
                    ) : def.type === 'select' ? (
                      <select className="input text-sm py-1.5 w-full" value={value} onChange={(e) => handleChange(def.key, e.target.value)} disabled={!canOperate}>
                        {def.options?.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                      </select>
                    ) : def.type === 'number' ? (
                      <input type="number" className="input text-sm py-1.5 w-full" value={value} onChange={(e) => handleChange(def.key, e.target.value)} disabled={!canOperate} />
                    ) : (
                      <input type="text" className="input text-sm py-1.5 w-full" value={value} onChange={(e) => handleChange(def.key, e.target.value)} disabled={!canOperate} placeholder={def.default} />
                    )}
                  </div>
                </div>
              );
            })}

            {/* Unknown / other properties */}
            {!search && activeCategory === 'Other' && unknownProps.map(([key, value]) => (
              <div key={key} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-dark-100 font-mono">{key}</label>
                </div>
                <div className="sm:w-56 flex-shrink-0">
                  <input
                    type="text"
                    className="input text-sm py-1.5 w-full"
                    value={value}
                    onChange={(e) => handleChange(key, e.target.value)}
                    disabled={!canOperate}
                  />
                </div>
              </div>
            ))}

            {filteredProps.length === 0 && (!search || activeCategory !== 'Other') && (
              <div className="card text-center py-8">
                <Cog6ToothIcon className="w-10 h-10 text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No matching properties found</p>
              </div>
            )}

            {/* Restart notice */}
            {hasChanges && (
              <div className="flex items-center gap-2 px-4 py-3 bg-warning-500/10 border border-warning-500/20 rounded-lg">
                <InformationCircleIcon className="w-5 h-5 text-warning-400 flex-shrink-0" />
                <p className="text-sm text-warning-300">
                  Changes require a server restart to take effect.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
