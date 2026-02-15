import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn, formatPlayTime } from '../lib/utils';
import type { Player, Ban } from '../types';
import {
  UserGroupIcon,
  ShieldExclamationIcon,
  ShieldCheckIcon,
  NoSymbolIcon,
  ArrowRightStartOnRectangleIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useRole } from '../hooks/useRole';

export default function Players() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();

  const [players, setPlayers] = useState<Player[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [tab, setTab] = useState<'online' | 'all' | 'bans' | 'whitelist'>('online');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Kick/ban dialogs
  const [kickPlayer, setKickPlayer] = useState<string | null>(null);
  const [banPlayer, setBanPlayer] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [whitelistInput, setWhitelistInput] = useState('');

  const selectedId = id || servers[0]?.id;
  const activeServer = servers.find((s) => s.id === selectedId);
  const { canOperate } = useRole();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (!selectedId) return;
    setIsLoading(true);
    Promise.all([
      api.get(`/servers/${selectedId}/players/online`).catch(() => ({ data: [] })),
      api.get(`/servers/${selectedId}/bans`).catch(() => ({ data: [] })),
      api.get(`/servers/${selectedId}/whitelist`).catch(() => ({ data: [] })),
    ]).then(([onlineRes, bansRes, whitelistRes]) => {
      setPlayers(onlineRes.data);
      setBans(bansRes.data);
      setWhitelist(whitelistRes.data);
    }).finally(() => setIsLoading(false));
  }, [selectedId]);

  const handleKick = async (player: string) => {
    try {
      await api.post(`/servers/${selectedId}/players/${encodeURIComponent(player)}/kick`, { reason: 'Kicked by admin' });
      toast.success(`Kicked ${player}`);
      setKickPlayer(null);
      // Refresh
      const { data } = await api.get(`/servers/${selectedId}/players/online`);
      setPlayers(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to kick');
    }
  };

  const handleBan = async () => {
    if (!banPlayer) return;
    try {
      await api.post(`/servers/${selectedId}/players/${encodeURIComponent(banPlayer)}/ban`, {
        reason: banReason || 'Banned by admin',
      });
      toast.success(`Banned ${banPlayer}`);
      setBanPlayer(null);
      setBanReason('');
      const { data } = await api.get(`/servers/${selectedId}/bans`);
      setBans(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to ban');
    }
  };

  const handleUnban = async (player: string) => {
    try {
      await api.post(`/servers/${selectedId}/players/${encodeURIComponent(player)}/unban`);
      toast.success(`Unbanned ${player}`);
      const { data } = await api.get(`/servers/${selectedId}/bans`);
      setBans(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to unban');
    }
  };

  const handleAddWhitelist = async () => {
    if (!whitelistInput.trim()) return;
    try {
      await api.post(`/servers/${selectedId}/whitelist`, { playerName: whitelistInput.trim() });
      toast.success(`Added ${whitelistInput.trim()} to whitelist`);
      setWhitelistInput('');
      const { data } = await api.get(`/servers/${selectedId}/whitelist`);
      setWhitelist(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to add to whitelist');
    }
  };

  const handleRemoveWhitelist = async (player: string) => {
    try {
      await api.delete(`/servers/${selectedId}/whitelist/${player}`);
      toast.success(`Removed ${player} from whitelist`);
      setWhitelist(whitelist.filter((p) => p !== player));
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove from whitelist');
    }
  };

  const onlinePlayers = players.filter((p) => p.isOnline);
  const filteredPlayers = (tab === 'online' ? onlinePlayers : players).filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'online' as const, label: 'Online', count: onlinePlayers.length, icon: UserGroupIcon },
    { id: 'all' as const, label: 'All Players', count: players.length, icon: UserGroupIcon },
    { id: 'bans' as const, label: 'Bans', count: bans.filter((b) => b.isActive).length, icon: ShieldExclamationIcon },
    { id: 'whitelist' as const, label: 'Whitelist', count: whitelist.length, icon: ShieldCheckIcon },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">Players</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/players/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-900 border border-dark-700 rounded-lg p-1 overflow-x-auto tabs-scroll">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap',
              tab === t.id
                ? 'bg-dark-800 text-dark-100 shadow-sm'
                : 'text-dark-400 hover:text-dark-200'
            )}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full',
              tab === t.id ? 'bg-accent-500/20 text-accent-400' : 'bg-dark-700 text-dark-500'
            )}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      {(tab === 'online' || tab === 'all') && (
        <div className="relative">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            className="input pl-10"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Players tab */}
      {(tab === 'online' || tab === 'all') && (
        <div className="space-y-2">
          {isLoading ? (
            <div className="card text-center py-12">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="card text-center py-12">
              <UserGroupIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">
                {tab === 'online' ? 'No players online' : 'No players found'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredPlayers.map((player) => (
                <div key={player.uuid || player.username} className="card-hover flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://mc-heads.net/avatar/${player.username}/40`}
                      alt={player.username}
                      className="w-10 h-10 rounded-lg"
                    />
                    <div>
                      <p className="font-medium text-dark-100">{player.username}</p>
                      <div className="flex items-center gap-2 text-xs text-dark-500">
                        {player.isOnline && (
                          <span className="text-success-400">● Online</span>
                        )}
                        {player.playTime > 0 && (
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3 h-3" />
                            {formatPlayTime(player.playTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {canOperate && player.isOnline && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => setKickPlayer(player.username)}
                        className="btn-ghost btn-sm text-warning-400"
                        title="Kick"
                      >
                        <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setBanPlayer(player.username)}
                        className="btn-ghost btn-sm text-danger-400"
                        title="Ban"
                      >
                        <NoSymbolIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bans tab */}
      {tab === 'bans' && (
        <div className="space-y-2">
          {bans.filter((b) => b.isActive).length === 0 ? (
            <div className="card text-center py-12">
              <ShieldCheckIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">No active bans</p>
            </div>
          ) : (
            bans.filter((b) => b.isActive).map((ban) => (
              <div key={ban.id} className="card flex items-center justify-between py-3 px-4">
                <div className="flex items-center gap-3">
                  <img
                    src={`https://mc-heads.net/avatar/${ban.playerName}/40`}
                    alt={ban.playerName}
                    className="w-10 h-10 rounded-lg"
                  />
                  <div>
                    <p className="font-medium text-dark-100">{ban.playerName}</p>
                    <p className="text-xs text-dark-500">
                      {ban.reason} · {ban.isPermanent ? 'Permanent' : `Expires ${new Date(ban.expiresAt!).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => handleUnban(ban.playerName)} className="btn-secondary btn-sm" disabled={!canOperate}>
                  Unban
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Whitelist tab */}
      {tab === 'whitelist' && (
        <div className="space-y-4">
          {canOperate && (
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder="Add player to whitelist..."
                value={whitelistInput}
                onChange={(e) => setWhitelistInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWhitelist()}
              />
              <button className="btn-primary" onClick={handleAddWhitelist} disabled={!whitelistInput.trim()}>
                Add
              </button>
            </div>
          )}

          {whitelist.length === 0 ? (
            <div className="card text-center py-12">
              <ShieldCheckIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">Whitelist is empty</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {whitelist.map((player) => (
                <div key={player} className="card flex items-center justify-between py-3 px-4">
                  <div className="flex items-center gap-3">
                    <img
                      src={`https://mc-heads.net/avatar/${player}/40`}
                      alt={player}
                      className="w-10 h-10 rounded-lg"
                    />
                    <span className="font-medium text-dark-100">{player}</span>
                  </div>
                  <button onClick={() => handleRemoveWhitelist(player)} className="btn-ghost btn-sm text-danger-400" disabled={!canOperate}>
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Kick/Ban confirmation dialogs */}
      {kickPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setKickPlayer(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-2">Kick {kickPlayer}?</h3>
            <p className="text-dark-400 text-sm mb-6">This will remove the player from the server.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setKickPlayer(null)}>Cancel</button>
              <button className="btn-danger flex-1" onClick={() => handleKick(kickPlayer)}>Kick</button>
            </div>
          </div>
        </div>
      )}

      {banPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setBanPlayer(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-2">Ban {banPlayer}?</h3>
            <div className="mb-4">
              <label className="label">Reason</label>
              <input
                className="input"
                placeholder="Reason for ban..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => { setBanPlayer(null); setBanReason(''); }}>Cancel</button>
              <button className="btn-danger flex-1" onClick={handleBan}>Ban</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
