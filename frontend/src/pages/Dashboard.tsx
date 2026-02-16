import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../lib/api';
import { formatBytes, formatUptime, getStatusColor, getServerTypeIcon, cn } from '../lib/utils';
import {
  ServerStackIcon,
  UserGroupIcon,
  CpuChipIcon,
  CircleStackIcon,
  ArrowTrendingUpIcon,
  PlayIcon,
  StopIcon,
  ExclamationTriangleIcon,
  SignalIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashboardAd } from '../components/AdBanner';

// Metric card component
function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'accent',
  progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  progress?: number;
}) {
  const colorClasses: Record<string, string> = {
    accent: 'bg-accent-500/20 text-accent-400',
    success: 'bg-success-500/20 text-success-400',
    warning: 'bg-warning-500/20 text-warning-400',
    danger: 'bg-danger-500/20 text-danger-400',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-400 text-sm">{label}</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">{value}</p>
          {subValue && <p className="text-dark-500 text-xs mt-1">{subValue}</p>}
        </div>
        <div className={cn('p-2.5 rounded-lg', colorClasses[color])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                progress > 90
                  ? 'bg-danger-500'
                  : progress > 70
                  ? 'bg-warning-500'
                  : 'bg-accent-500'
              )}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Server card for the overview grid
function ServerCard({ server }: { server: any }) {
  const { startServer, stopServer } = useServerStore();
  const isRunning = server.status === 'running';
  const isStopped = server.status === 'stopped';
  const isTransitioning = server.status === 'starting' || server.status === 'stopping';

  return (
    <div className="card-hover">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getServerTypeIcon(server.type)}</span>
          <div>
            <Link to={`/console/${server.id}`} className="font-semibold text-dark-100 hover:text-accent-400 transition-colors">
              {server.name}
            </Link>
            <p className="text-dark-500 text-xs capitalize">{server.type} {server.version}</p>
          </div>
        </div>
        <span className={cn('badge', {
          'badge-success': isRunning,
          'badge-warning': isTransitioning,
          'badge-danger': server.status === 'crashed',
          'badge-neutral': isStopped,
        })}>
          {server.status}
        </span>
      </div>

      {isRunning && (
        <div className="grid grid-cols-3 gap-3 mb-3 text-center">
          <div className="bg-dark-800/50 rounded-lg py-2">
            <p className="text-xs text-dark-400">Players</p>
            <p className="text-sm font-semibold text-dark-100">{server.playerCount ?? 0}/{server.maxPlayers}</p>
          </div>
          <div className="bg-dark-800/50 rounded-lg py-2">
            <p className="text-xs text-dark-400">TPS</p>
            <p className={cn('text-sm font-semibold', {
              'text-success-400': (server.tps ?? 20) >= 18,
              'text-warning-400': (server.tps ?? 20) >= 15 && (server.tps ?? 20) < 18,
              'text-danger-400': (server.tps ?? 20) < 15,
            })}>
              {server.tps?.toFixed(1) ?? '20.0'}
            </p>
          </div>
          <div className="bg-dark-800/50 rounded-lg py-2">
            <p className="text-xs text-dark-400">RAM</p>
            <p className="text-sm font-semibold text-dark-100">{server.ramUsage ? formatBytes(server.ramUsage) : '—'}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between pt-2 border-t border-dark-800">
        <span className="text-xs text-dark-500">
          {isRunning ? `Uptime: ${formatUptime(server.uptime ?? 0)}` : 'Port: ' + server.port}
        </span>
        <div className="flex gap-1">
          {isStopped && (
            <button onClick={() => startServer(server.id)} className="btn-ghost btn-sm text-success-400 hover:text-success-300" title="Start">
              <PlayIcon className="w-4 h-4" />
            </button>
          )}
          {isRunning && (
            <button onClick={() => stopServer(server.id)} className="btn-ghost btn-sm text-danger-400 hover:text-danger-300" title="Stop">
              <StopIcon className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { servers, systemMetrics, fetchServers } = useServerStore();
  const { isConnected } = useWebSocket();

  // ── Real metrics history ──────────────────────────────
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string; cpu: number; ram: number }>>([]);
  const [tpsHistory, setTpsHistory] = useState<Record<string, Array<{ time: string; tps: number }>>>({});

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Accumulate system metrics from WebSocket updates into chart history
  useEffect(() => {
    if (!systemMetrics) return;
    setCpuHistory((prev) => {
      const now = new Date();
      const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const next = [...prev, {
        time: timeLabel,
        cpu: Math.round(systemMetrics.cpu.usage * 10) / 10,
        ram: Math.round(systemMetrics.memory.usagePercent * 10) / 10,
      }];
      return next.length > 30 ? next.slice(-30) : next;
    });
  }, [systemMetrics]);

  // Accumulate TPS data from running servers
  useEffect(() => {
    const running = servers.filter((s) => s.status === 'running');
    if (running.length === 0) return;
    setTpsHistory((prev) => {
      const now = new Date();
      const timeLabel = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const next = { ...prev };
      for (const s of running) {
        const arr = next[s.name] || [];
        arr.push({ time: timeLabel, tps: s.tps ?? 20 });
        next[s.name] = arr.length > 30 ? arr.slice(-30) : arr;
      }
      return next;
    });
  }, [servers]);

  // Fetch historical metrics for running servers on mount
  useEffect(() => {
    const running = servers.filter((s) => s.status === 'running');
    running.forEach(async (s) => {
      try {
        const { data } = await api.get(`/servers/${s.id}/metrics?limit=30`);
        if (data && data.length > 0) {
          const history = data.reverse().map((m: any) => {
            const d = new Date(m.timestamp);
            return {
              time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
              tps: m.tps ?? 20,
            };
          });
          setTpsHistory((prev) => ({ ...prev, [s.name]: history }));
        }
      } catch {}
    });
  }, [servers.length]);

  const runningServers = servers.filter((s) => s.status === 'running');
  const totalPlayers = runningServers.reduce((acc, s) => acc + (s.playerCount ?? 0), 0);
  const crashedServers = servers.filter((s) => s.status === 'crashed');

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Dashboard</h1>
          <p className="text-dark-400 text-sm mt-0.5">Overview of your Minecraft servers</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('flex items-center gap-1.5 text-xs', isConnected ? 'text-success-400' : 'text-dark-500')}>
            <SignalIcon className="w-3.5 h-3.5" />
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
          <Link to="/servers" className="btn-primary btn-sm">
            <PlusIcon className="w-4 h-4" />
            New Server
          </Link>
        </div>
      </div>

      {/* Crashed servers warning */}
      {crashedServers.length > 0 && (
        <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-danger-400 flex-shrink-0" />
          <div>
            <p className="text-danger-300 font-medium">
              {crashedServers.length} server{crashedServers.length > 1 ? 's' : ''} crashed
            </p>
            <p className="text-danger-400/80 text-sm">
              {crashedServers.map((s) => s.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* Metrics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={ServerStackIcon}
          label="Servers"
          value={`${runningServers.length}/${servers.length}`}
          subValue="Active / Total"
          color="accent"
        />
        <MetricCard
          icon={UserGroupIcon}
          label="Online Players"
          value={totalPlayers}
          subValue={runningServers.length > 0 ? `Across ${runningServers.length} servers` : 'No servers running'}
          color="success"
        />
        <MetricCard
          icon={CpuChipIcon}
          label="CPU Usage"
          value={systemMetrics ? `${systemMetrics.cpu.usage.toFixed(1)}%` : '—'}
          subValue={systemMetrics?.cpu.model || 'Loading...'}
          color={systemMetrics && systemMetrics.cpu.usage > 80 ? 'danger' : 'accent'}
          progress={systemMetrics?.cpu.usage}
        />
        <MetricCard
          icon={CircleStackIcon}
          label="Memory"
          value={systemMetrics ? `${systemMetrics.memory.usagePercent.toFixed(1)}%` : '—'}
          subValue={systemMetrics ? `${formatBytes(systemMetrics.memory.used)} / ${formatBytes(systemMetrics.memory.total)}` : 'Loading...'}
          color={systemMetrics && systemMetrics.memory.usagePercent > 80 ? 'danger' : 'accent'}
          progress={systemMetrics?.memory.usagePercent}
        />
      </div>

      {/* Ad banner for free-tier users */}
      <DashboardAd />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CPU & Memory Chart */}
        <div className="card">
          <h3 className="text-sm font-medium text-dark-300 mb-4">System Resources</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cpuHistory.length > 0 ? cpuHistory : [{ time: 'now', cpu: systemMetrics?.cpu?.usage ?? 0, ram: systemMetrics?.memory?.usagePercent ?? 0 }]}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#6366f1" fill="url(#cpuGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="ram" name="RAM %" stroke="#22c55e" fill="url(#ramGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TPS Chart */}
        <div className="card">
          <h3 className="text-sm font-medium text-dark-300 mb-4">Server TPS</h3>
          <div className="h-48">
            {runningServers.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={(() => {
                    // Merge TPS histories from all running servers into chart data
                    const allTimes = new Set<string>();
                    for (const s of runningServers) {
                      (tpsHistory[s.name] || []).forEach((p) => allTimes.add(p.time));
                    }
                    const times = Array.from(allTimes).slice(-30);
                    if (times.length === 0) return [{ time: 'now', ...Object.fromEntries(runningServers.map((s) => [s.name, s.tps ?? 20])) }];
                    return times.map((t) => ({
                      time: t,
                      ...Object.fromEntries(
                        runningServers.map((s) => {
                          const hist = tpsHistory[s.name] || [];
                          const point = hist.find((p) => p.time === t);
                          return [s.name, point?.tps ?? (s.tps ?? 20)];
                        })
                      ),
                    }));
                  })()}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 22]} />
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                    labelStyle={{ color: '#9ca3af' }}
                  />
                  {runningServers.map((s, i) => {
                    const colors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];
                    return (
                      <Line key={s.id} type="monotone" dataKey={s.name} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-dark-500 text-sm">
                No running servers
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Server Grid */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-dark-300">
            Servers ({servers.length})
          </h3>
          <Link to="/servers" className="text-accent-400 hover:text-accent-300 text-sm">
            View all &rarr;
          </Link>
        </div>

        {servers.length === 0 ? (
          <div className="card text-center py-12">
            <ServerStackIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-dark-300 mb-2">No Servers Yet</h3>
            <p className="text-dark-500 text-sm mb-4">Create your first Minecraft server to get started</p>
            <Link to="/servers" className="btn-primary">
              <PlusIcon className="w-4 h-4" />
              Create Server
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {servers.map((server) => (
              <ServerCard key={server.id} server={server} />
            ))}
          </div>
        )}
      </div>

      {/* Disk Usage */}
      {systemMetrics && (
        <div className="card">
          <h3 className="text-sm font-medium text-dark-300 mb-4">Storage</h3>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-dark-400">Disk Usage</span>
                <span className="text-dark-200">{formatBytes(systemMetrics.disk.used)} / {formatBytes(systemMetrics.disk.total)}</span>
              </div>
              <div className="h-3 bg-dark-800 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', {
                    'bg-accent-500': systemMetrics.disk.usagePercent < 70,
                    'bg-warning-500': systemMetrics.disk.usagePercent >= 70 && systemMetrics.disk.usagePercent < 90,
                    'bg-danger-500': systemMetrics.disk.usagePercent >= 90,
                  })}
                  style={{ width: `${systemMetrics.disk.usagePercent}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-dark-100">{systemMetrics.disk.usagePercent.toFixed(1)}%</p>
              <p className="text-xs text-dark-500">{formatBytes(systemMetrics.disk.free)} free</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
