import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useWebSocket } from '../hooks/useWebSocket';
import api from '../lib/api';
import { cn } from '../lib/utils';
import {
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  ChartBarIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  SignalIcon,
  SignalSlashIcon,
  ServerIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline';

interface MetricPoint {
  id: number;
  serverId: string;
  timestamp: string;
  cpuUsage: number;
  ramUsage: number;
  tps: number;
  playerCount: number;
}

// Colors for multi-server comparison
const SERVER_COLORS = [
  { stroke: '#6366f1', fill: 'rgba(99,102,241,0.2)' },  // indigo
  { stroke: '#10b981', fill: 'rgba(16,185,129,0.2)' },  // emerald
  { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.2)' },  // amber
  { stroke: '#ef4444', fill: 'rgba(239,68,68,0.2)' },   // red
  { stroke: '#8b5cf6', fill: 'rgba(139,92,246,0.2)' },  // violet
  { stroke: '#06b6d4', fill: 'rgba(6,182,212,0.2)' },   // cyan
];

export default function Performance() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();
  const { isConnected } = useWebSocket();

  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareMetrics, setCompareMetrics] = useState<Record<string, MetricPoint[]>>({});

  const selectedId = id || servers[0]?.id;
  const activeServer = servers.find((s) => s.id === selectedId);
  const runningServers = servers.filter((s) => s.status === 'running' || s.status === 'starting');

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // ── Load metrics for a single server ──────────────────────
  const loadMetrics = useCallback(async () => {
    if (!selectedId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/servers/${selectedId}/metrics?limit=${limit}`);
      const arr = data as MetricPoint[];
      setMetrics(arr.reverse());
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to load metrics';
      console.error('[Performance] API error:', msg, err);
      setError(msg);
      setMetrics([]);
    }
    setIsLoading(false);
  }, [selectedId, limit]);

  useEffect(() => {
    loadMetrics();
    const interval = setInterval(loadMetrics, 15000);
    return () => clearInterval(interval);
  }, [loadMetrics]);

  // ── Load metrics for comparison mode ──────────────────────
  const loadCompareMetrics = useCallback(async () => {
    if (compareIds.length === 0) return;
    const result: Record<string, MetricPoint[]> = {};
    await Promise.all(
      compareIds.map(async (sid) => {
        try {
          const { data } = await api.get(`/servers/${sid}/metrics?limit=${limit}`);
          result[sid] = (data as MetricPoint[]).reverse();
        } catch {
          result[sid] = [];
        }
      })
    );
    setCompareMetrics(result);
  }, [compareIds, limit]);

  useEffect(() => {
    if (compareMode && compareIds.length > 0) {
      loadCompareMetrics();
      const interval = setInterval(loadCompareMetrics, 15000);
      return () => clearInterval(interval);
    }
  }, [compareMode, loadCompareMetrics]);

  // ── Chart data for single server ──────────────────────────
  // ramUsage is stored in bytes; if pidusage/systeminformation
  // returned KB on some Windows builds, detect and auto-correct
  const convertRam = (raw: number) => {
    if (!raw) return 0;
    // If value is > 100 000 it's likely bytes; otherwise might be KB (legacy data)
    const bytes = raw > 100_000 ? raw : raw * 1024;
    return Math.round(bytes / (1024 * 1024)); // → MB
  };

  const chartData = useMemo(() =>
    metrics.map((m) => ({
      time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      cpu: Number((m.cpuUsage ?? 0).toFixed(1)) || 0,
      ram: convertRam(m.ramUsage || 0),
      tps: Number((m.tps ?? 20).toFixed(1)),
      players: m.playerCount || 0,
    })),
    [metrics]
  );

  // ── Live stats from store (WebSocket-powered) ─────────────
  const liveServer = servers.find((s) => s.id === selectedId);
  const liveCpu = liveServer?.cpuUsage ?? null;
  const liveRam = liveServer?.ramUsage ? convertRam(liveServer.ramUsage) : null;
  const liveTps = liveServer?.tps ?? null;
  const livePlayers = liveServer?.playerCount ?? 0;
  const isRunning = liveServer?.status === 'running' || liveServer?.status === 'starting';

  // Historical stats
  const latest = chartData[chartData.length - 1];
  const avgTps = chartData.length > 0 ? (chartData.reduce((sum, d) => sum + d.tps, 0) / chartData.length).toFixed(1) : '—';
  const maxCpu = chartData.length > 0 ? Math.max(...chartData.map((d) => d.cpu)).toFixed(1) : '—';
  const maxRam = chartData.length > 0 ? Math.max(...chartData.map((d) => d.ram)) : 0;

  // ── Compare chart data ────────────────────────────────────
  const compareChartData = useMemo(() => {
    if (!compareMode || compareIds.length === 0) return [];

    // Find the longest series and use its timestamps
    const allSeries = compareIds.map((sid) => compareMetrics[sid] || []);
    const maxLen = Math.max(...allSeries.map((s) => s.length), 0);
    if (maxLen === 0) return [];

    const longestSeries = allSeries.find((s) => s.length === maxLen) || allSeries[0];

    return longestSeries.map((m, i) => {
      const point: Record<string, any> = {
        time: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      for (const sid of compareIds) {
        const series = compareMetrics[sid] || [];
        const dp = series[i];
        const server = servers.find((s) => s.id === sid);
        const label = server?.name || sid.slice(0, 8);
        point[`cpu_${label}`] = dp ? Number((dp.cpuUsage ?? 0).toFixed(1)) : null;
        point[`ram_${label}`] = dp ? convertRam(dp.ramUsage || 0) : null;
        point[`tps_${label}`] = dp ? Number((dp.tps ?? 20).toFixed(1)) : null;
      }
      return point;
    });
  }, [compareMode, compareIds, compareMetrics, servers]);

  const toggleCompareServer = (sid: string) => {
    setCompareIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid].slice(0, 6)
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">Performance</h1>
          {/* Connection status */}
          <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', isConnected ? 'bg-success-500/20 text-success-400' : 'bg-danger-500/20 text-danger-400')}>
            {isConnected ? <SignalIcon className="w-3 h-3" /> : <SignalSlashIcon className="w-3 h-3" />}
            {isConnected ? 'Live' : 'Disconnected'}
          </span>
          {/* Server selector */}
          {servers.length > 0 && !compareMode && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/performance/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.status === 'running' ? '●' : '○'}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {servers.length > 1 && (
            <button
              className={cn('btn-sm', compareMode ? 'btn-primary' : 'btn-secondary')}
              onClick={() => {
                setCompareMode(!compareMode);
                if (!compareMode) {
                  setCompareIds(runningServers.length > 0 ? runningServers.slice(0, 4).map((s) => s.id) : servers.slice(0, 4).map((s) => s.id));
                }
              }}
            >
              <ArrowsPointingOutIcon className="w-4 h-4 mr-1" />
              Compare
            </button>
          )}
          <select
            className="input py-1.5 text-sm w-32"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={50}>Last 50</option>
            <option value={100}>Last 100</option>
            <option value={200}>Last 200</option>
            <option value={500}>Last 500</option>
          </select>
          <button className="btn-secondary btn-sm" onClick={compareMode ? loadCompareMetrics : loadMetrics}>
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Compare Mode: Server selector chips */}
      {compareMode && (
        <div className="card p-4">
          <p className="text-xs text-dark-400 mb-2">Select servers to compare (max 6):</p>
          <div className="flex flex-wrap gap-2">
            {servers.map((s) => {
              const selected = compareIds.includes(s.id);
              const color = selected ? SERVER_COLORS[compareIds.indexOf(s.id) % SERVER_COLORS.length] : null;
              return (
                <button
                  key={s.id}
                  onClick={() => toggleCompareServer(s.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all border',
                    selected
                      ? 'border-transparent text-white font-medium'
                      : 'border-dark-700 text-dark-400 hover:border-dark-500 hover:text-dark-200'
                  )}
                  style={selected && color ? { backgroundColor: color.stroke + '30', borderColor: color.stroke } : {}}
                >
                  <ServerIcon className="w-3.5 h-3.5" />
                  {s.name}
                  <span className={cn('w-2 h-2 rounded-full', s.status === 'running' ? 'bg-success-400' : s.status === 'starting' ? 'bg-warning-400' : 'bg-dark-600')} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="bg-danger-500/10 border border-danger-500/30 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-danger-300 text-sm font-medium">Failed to load metrics</p>
            <p className="text-danger-400 text-xs mt-1">{error}</p>
            <button className="text-danger-300 underline text-xs mt-2" onClick={loadMetrics}>Retry</button>
          </div>
        </div>
      )}

      {/* ─── COMPARE MODE ─────────────────────────────────────── */}
      {compareMode ? (
        compareIds.length === 0 ? (
          <div className="card text-center py-16">
            <ArrowsPointingOutIcon className="w-16 h-16 text-dark-700 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-dark-300 mb-2">Select Servers to Compare</h3>
            <p className="text-dark-500 text-sm">Click servers above to add them to the comparison</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Live stats grid for compared servers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {compareIds.map((sid, idx) => {
                const s = servers.find((sv) => sv.id === sid);
                const color = SERVER_COLORS[idx % SERVER_COLORS.length];
                return (
                  <div key={sid} className="card p-4" style={{ borderLeft: `3px solid ${color.stroke}` }}>
                    <h4 className="text-sm font-semibold text-dark-200 mb-2">{s?.name || sid.slice(0, 8)}</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-dark-500">CPU</p>
                        <p className="text-dark-100 font-medium text-lg">{s?.cpuUsage != null ? `${s.cpuUsage.toFixed(1)}%` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-dark-500">RAM</p>
                        <p className="text-dark-100 font-medium text-lg">{s?.ramUsage ? `${convertRam(s.ramUsage)} MB` : '—'}</p>
                      </div>
                      <div>
                        <p className="text-dark-500">TPS</p>
                        <p className={cn('font-medium text-lg', (s?.tps ?? 20) >= 18 ? 'text-success-400' : (s?.tps ?? 20) >= 15 ? 'text-warning-400' : 'text-danger-400')}>
                          {s?.tps != null ? s.tps.toFixed(1) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-dark-500">Players</p>
                        <p className="text-dark-100 font-medium text-lg">{s?.playerCount ?? 0}</p>
                      </div>
                    </div>
                    <p className={cn('text-xs mt-2', s?.status === 'running' ? 'text-success-500' : 'text-dark-600')}>
                      {s?.status || 'unknown'}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Comparison charts */}
            {compareChartData.length > 0 && (
              <>
                <ComparisonChart
                  title="CPU Usage (%)"
                  data={compareChartData}
                  metric="cpu"
                  domain={[0, 100]}
                  unit="%"
                  compareIds={compareIds}
                  servers={servers}
                />
                <ComparisonChart
                  title="RAM Usage (MB)"
                  data={compareChartData}
                  metric="ram"
                  unit="MB"
                  compareIds={compareIds}
                  servers={servers}
                />
                <ComparisonChart
                  title="TPS"
                  data={compareChartData}
                  metric="tps"
                  domain={[0, 20.5]}
                  unit=""
                  compareIds={compareIds}
                  servers={servers}
                />
              </>
            )}
          </div>
        )
      ) : (
        /* ─── SINGLE SERVER MODE ────────────────────────────── */
        <>
          {/* Live stats cards — show real-time WS data when available */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-dark-400 text-xs">CPU {isRunning && isConnected ? '(live)' : ''}</p>
              <p className="text-2xl font-bold text-dark-50 mt-1">
                {isRunning && liveCpu != null ? `${liveCpu.toFixed(1)}%` : latest?.cpu != null ? `${latest.cpu}%` : '—'}
              </p>
            </div>
            <div className="card">
              <p className="text-dark-400 text-xs">RAM {isRunning && isConnected ? '(live)' : ''}</p>
              <p className="text-2xl font-bold text-dark-50 mt-1">
                {isRunning && liveRam != null ? `${liveRam} MB` : latest?.ram != null ? `${latest.ram} MB` : '—'}
              </p>
            </div>
            <div className="card">
              <p className="text-dark-400 text-xs">TPS {isRunning && isConnected ? '(live)' : ''}</p>
              <p className={cn('text-2xl font-bold mt-1', ((isRunning && liveTps != null ? liveTps : latest?.tps) ?? 20) >= 18 ? 'text-success-400' : ((isRunning && liveTps != null ? liveTps : latest?.tps) ?? 20) >= 15 ? 'text-warning-400' : 'text-danger-400')}>
                {isRunning && liveTps != null ? liveTps.toFixed(1) : latest?.tps ?? '—'}
              </p>
            </div>
            <div className="card">
              <p className="text-dark-400 text-xs">Players</p>
              <p className="text-2xl font-bold text-dark-50 mt-1">
                {isRunning ? livePlayers : latest?.players ?? 0}
              </p>
            </div>
          </div>

          {/* Server status banner */}
          {!isRunning && activeServer && (
            <div className="bg-dark-800/50 border border-dark-700 rounded-lg p-4 flex items-center gap-3">
              <ServerIcon className="w-5 h-5 text-dark-500" />
              <p className="text-dark-400 text-sm">
                <span className="font-medium text-dark-300">{activeServer.name}</span> is {activeServer.status || 'stopped'}.{' '}
                {metrics.length > 0 ? 'Showing historical data.' : 'Start the server to collect performance data.'}
              </p>
            </div>
          )}

          {isLoading && metrics.length === 0 ? (
            <div className="card text-center py-12">
              <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-dark-500 text-sm mt-3">Loading metrics...</p>
            </div>
          ) : metrics.length === 0 && !error ? (
            <div className="card text-center py-16">
              <ChartBarIcon className="w-16 h-16 text-dark-700 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-dark-300 mb-2">No Metrics Data</h3>
              <p className="text-dark-500 text-sm">
                {isRunning
                  ? 'Metrics are being collected — data will appear shortly (every ~15 seconds).'
                  : 'Start the server to begin collecting performance data.'}
              </p>
              {isRunning && (
                <div className="mt-4">
                  <div className="w-6 h-6 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-dark-600 text-xs mt-2">Waiting for first data point...</p>
                </div>
              )}
            </div>
          ) : metrics.length > 0 ? (
            <div className="space-y-6">
              {/* CPU Chart */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-dark-200 mb-3">CPU Usage (%)</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#d1d5db' }}
                      />
                      <Area type="monotone" dataKey="cpu" stroke="#6366f1" fill="url(#cpuGradient)" strokeWidth={2} name="CPU %" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-dark-500 mt-1">Max: {maxCpu}%</p>
              </div>

              {/* RAM Chart */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-dark-200 mb-3">RAM Usage (MB)</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#d1d5db' }}
                      />
                      <Area type="monotone" dataKey="ram" stroke="#10b981" fill="url(#ramGradient)" strokeWidth={2} name="RAM (MB)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-dark-500 mt-1">Max: {maxRam} MB</p>
              </div>

              {/* TPS Chart */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-dark-200 mb-3">Ticks Per Second (TPS)</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 20.5]} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#d1d5db' }}
                      />
                      <Line type="monotone" dataKey="tps" stroke="#f59e0b" strokeWidth={2} dot={false} name="TPS" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-dark-500 mt-1">Average: {avgTps}</p>
              </div>

              {/* Players Chart */}
              <div className="card p-4">
                <h3 className="text-sm font-semibold text-dark-200 mb-3">Player Count</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="playerGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
                      <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#d1d5db' }}
                      />
                      <Area type="stepAfter" dataKey="players" stroke="#3b82f6" fill="url(#playerGradient)" strokeWidth={2} name="Players" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// ─── Comparison Chart Component ───────────────────────────────
function ComparisonChart({
  title,
  data,
  metric,
  domain,
  unit,
  compareIds,
  servers,
}: {
  title: string;
  data: Record<string, any>[];
  metric: string;
  domain?: [number, number];
  unit: string;
  compareIds: string[];
  servers: any[];
}) {
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-dark-200 mb-3">{title}</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" tick={{ fill: '#6b7280', fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} domain={domain} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#d1d5db' }}
              formatter={(value: any) => [`${value}${unit ? ` ${unit}` : ''}`, '']}
            />
            <Legend />
            {compareIds.map((sid, idx) => {
              const s = servers.find((sv: any) => sv.id === sid);
              const label = s?.name || sid.slice(0, 8);
              const color = SERVER_COLORS[idx % SERVER_COLORS.length];
              return (
                <Line
                  key={sid}
                  type="monotone"
                  dataKey={`${metric}_${label}`}
                  name={label}
                  stroke={color.stroke}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
