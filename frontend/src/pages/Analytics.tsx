import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  ChartBarIcon,
  UsersIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  CpuChipIcon,
  SignalIcon,
} from '@heroicons/react/24/outline';

interface RetentionData {
  totalPlayers: number;
  active24h: number;
  active7d: number;
  active30d: number;
  newThisWeek: number;
  avgPlaytimeSeconds: number;
  topPlayers: Array<{
    username: string;
    playTime: number;
    lastSeen: string;
    firstSeen: string;
  }>;
}

interface UptimeData {
  uptimePercent: number;
  totalOnlineHours: number;
  peakPlayers: number;
  avgTps: number;
  avgCpu: number;
  days: number;
  dataPoints: number;
}

interface HeatmapData {
  heatmap: Array<{
    dayOfWeek: number;
    hour: number;
    avgPlayers: number;
  }>;
  days: number;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function Analytics() {
  const token = useAuthStore((s) => s.token);
  const [retention, setRetention] = useState<RetentionData | null>(null);
  const [uptime, setUptime] = useState<UptimeData | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lookback, setLookback] = useState(30);

  useEffect(() => {
    loadData();
  }, [lookback]);

  const loadData = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [retRes, upRes, heatRes] = await Promise.all([
        fetch('/api/analytics/retention', { headers }),
        fetch(`/api/analytics/uptime?days=${lookback}`, { headers }),
        fetch(`/api/analytics/activity?days=${lookback}`, { headers }),
      ]);
      if (retRes.ok) setRetention(await retRes.json());
      if (upRes.ok) setUptime(await upRes.json());
      if (heatRes.ok) setHeatmap(await heatRes.json());
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const formatPlaytime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) return `${Math.round(h / 24)}d ${h % 24}h`;
    return `${h}h ${m}m`;
  };

  const getHeatmapColor = (value: number, max: number) => {
    if (max === 0 || value === 0) return 'bg-dark-800';
    const intensity = value / max;
    if (intensity > 0.8) return 'bg-accent-500';
    if (intensity > 0.6) return 'bg-accent-600';
    if (intensity > 0.4) return 'bg-accent-700';
    if (intensity > 0.2) return 'bg-accent-800';
    return 'bg-accent-900/50';
  };

  const maxHeatmapVal = Math.max(1, ...(heatmap?.heatmap.map((h) => h.avgPlayers) || [1]));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Player Analytics</h1>
          <p className="text-dark-400 text-sm mt-1">Server statistics and player insights</p>
        </div>
        <select
          value={lookback}
          onChange={(e) => setLookback(Number(e.target.value))}
          className="bg-dark-800 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={UsersIcon}
          label="Total Players"
          value={retention?.totalPlayers || 0}
          color="text-accent-400"
        />
        <StatCard
          icon={SignalIcon}
          label="Active (24h)"
          value={retention?.active24h || 0}
          color="text-success-400"
        />
        <StatCard
          icon={ChartBarIcon}
          label="Active (7d)"
          value={retention?.active7d || 0}
          color="text-blue-400"
        />
        <StatCard
          icon={ArrowTrendingUpIcon}
          label="New This Week"
          value={retention?.newThisWeek || 0}
          color="text-yellow-400"
        />
        <StatCard
          icon={CpuChipIcon}
          label="Avg TPS"
          value={uptime?.avgTps?.toFixed(1) || '20.0'}
          color="text-green-400"
        />
        <StatCard
          icon={ClockIcon}
          label="Uptime"
          value={`${uptime?.uptimePercent || 0}%`}
          color="text-purple-400"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Heatmap */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Player Activity Heatmap</h2>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour labels */}
              <div className="flex ml-12 mb-1">
                {HOURS.map((h) => (
                  <div key={h} className="flex-1 text-center text-xs text-dark-500">
                    {h % 3 === 0 ? `${h}:00` : ''}
                  </div>
                ))}
              </div>
              {/* Grid */}
              {DAYS.map((day, dayIdx) => (
                <div key={day} className="flex items-center gap-1 mb-1">
                  <div className="w-10 text-xs text-dark-400 text-right pr-1">{day}</div>
                  {HOURS.map((hour) => {
                    const cell = heatmap?.heatmap.find(
                      (h) => h.dayOfWeek === dayIdx && h.hour === hour
                    );
                    return (
                      <div
                        key={hour}
                        className={`flex-1 h-6 rounded-sm ${getHeatmapColor(cell?.avgPlayers || 0, maxHeatmapVal)} transition-colors`}
                        title={`${day} ${hour}:00 — ${cell?.avgPlayers?.toFixed(1) || 0} avg players`}
                      />
                    );
                  })}
                </div>
              ))}
              {/* Legend */}
              <div className="flex items-center justify-end mt-3 gap-2 text-xs text-dark-500">
                <span>Less</span>
                {['bg-dark-800', 'bg-accent-900/50', 'bg-accent-800', 'bg-accent-700', 'bg-accent-600', 'bg-accent-500'].map((c, i) => (
                  <div key={i} className={`w-4 h-4 rounded-sm ${c}`} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>

        {/* Server Stats */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Server Statistics</h2>
          <div className="space-y-4">
            <StatRow label="Total Online Hours" value={`${uptime?.totalOnlineHours || 0}h`} />
            <StatRow label="Peak Players" value={uptime?.peakPlayers || 0} />
            <StatRow label="Average TPS" value={uptime?.avgTps?.toFixed(1) || '20.0'} />
            <StatRow label="Average CPU" value={`${uptime?.avgCpu?.toFixed(1) || 0}%`} />
            <StatRow label="Data Points" value={uptime?.dataPoints || 0} />
            <StatRow label="Avg Playtime" value={formatPlaytime(retention?.avgPlaytimeSeconds || 0)} />
          </div>
        </div>

        {/* Top Players */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Top Players</h2>
          {(retention?.topPlayers?.length || 0) === 0 ? (
            <p className="text-dark-500 text-sm">No player data yet</p>
          ) : (
            <div className="space-y-3">
              {retention?.topPlayers.map((player, i) => (
                <div key={player.username} className="flex items-center gap-3">
                  <span className="text-dark-500 text-sm w-6 text-right font-mono">#{i + 1}</span>
                  <img
                    src={`https://mc-heads.net/avatar/${player.username}/32`}
                    className="w-8 h-8 rounded"
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-dark-200 text-sm font-medium truncate">{player.username}</p>
                    <p className="text-dark-500 text-xs">{formatPlaytime(player.playTime || 0)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: any;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-dark-500 text-xs">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-dark-700 last:border-0">
      <span className="text-dark-400 text-sm">{label}</span>
      <span className="text-dark-200 text-sm font-medium">{value}</span>
    </div>
  );
}
