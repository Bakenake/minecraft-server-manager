import { useEffect, useState } from 'react';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn } from '../lib/utils';
import {
  ClipboardDocumentListIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  UserIcon,
  ServerStackIcon,
  ShieldCheckIcon,
  ArchiveBoxIcon,
  PuzzlePieceIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';

interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  timestamp: string;
}

const actionColors: Record<string, string> = {
  login: 'text-accent-400',
  create_server: 'text-success-400',
  delete_server: 'text-danger-400',
  start_server: 'text-success-400',
  stop_server: 'text-warning-400',
  restart_server: 'text-warning-400',
  kill_server: 'text-danger-400',
  create_backup: 'text-accent-400',
  restore_backup: 'text-warning-400',
  delete_backup: 'text-danger-400',
  create_user: 'text-success-400',
  delete_user: 'text-danger-400',
  change_password: 'text-warning-400',
  '2fa_enabled': 'text-success-400',
  '2fa_disabled': 'text-warning-400',
  send_command: 'text-accent-400',
  enable_plugin: 'text-success-400',
  disable_plugin: 'text-warning-400',
  remove_plugin: 'text-danger-400',
  upload_plugin: 'text-accent-400',
  install_marketplace_plugin: 'text-accent-400',
};

function getResourceIcon(resource: string) {
  switch (resource) {
    case 'auth': return <UserIcon className="w-4 h-4" />;
    case 'server': return <ServerStackIcon className="w-4 h-4" />;
    case 'backup': return <ArchiveBoxIcon className="w-4 h-4" />;
    case 'plugin': return <PuzzlePieceIcon className="w-4 h-4" />;
    case 'user': return <ShieldCheckIcon className="w-4 h-4" />;
    default: return <ClipboardDocumentListIcon className="w-4 h-4" />;
  }
}

function formatAction(action: string): string {
  return action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterResource, setFilterResource] = useState<string>('all');

  useEffect(() => {
    loadAudit();
  }, []);

  const loadAudit = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/system/audit?limit=500');
      setEntries(data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load audit log');
    }
    setIsLoading(false);
  };

  const resources = ['all', ...Array.from(new Set(entries.map((e) => e.resource)))];

  const filtered = entries
    .filter((e) => filterResource === 'all' || e.resource === filterResource)
    .filter((e) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        e.action.toLowerCase().includes(s) ||
        e.resource.toLowerCase().includes(s) ||
        (e.userId || '').toLowerCase().includes(s) ||
        (e.details || '').toLowerCase().includes(s) ||
        (e.ipAddress || '').toLowerCase().includes(s)
      );
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-dark-50">Audit Log</h1>
        <div className="flex items-center gap-2">
          <span className="text-dark-400 text-sm">{filtered.length} entries</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dark-500" />
          <input
            className="input pl-10"
            placeholder="Search actions, users, IPs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <FunnelIcon className="w-4 h-4 text-dark-400" />
          <select
            className="input py-2 text-sm w-36"
            value={filterResource}
            onChange={(e) => setFilterResource(e.target.value)}
          >
            {resources.map((r) => (
              <option key={r} value={r}>{r === 'all' ? 'All Resources' : r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit entries */}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <ClipboardDocumentListIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400">No audit log entries found</p>
        </div>
      ) : (
        <div className="border border-dark-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-dark-800/50 border-b border-dark-700">
                <th className="text-left px-4 py-3 text-dark-400 font-medium">Time</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium">Action</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium hidden md:table-cell">Resource</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">Details</th>
                <th className="text-left px-4 py-3 text-dark-400 font-medium hidden lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                let details: Record<string, any> = {};
                try { details = entry.details ? JSON.parse(entry.details) : {}; } catch {}
                
                return (
                  <tr key={entry.id} className="border-b border-dark-800 last:border-0 hover:bg-dark-800/30">
                    <td className="px-4 py-3 text-dark-300 whitespace-nowrap text-xs">
                      {format(new Date(entry.timestamp), 'MMM d, HH:mm:ss')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('font-medium', actionColors[entry.action] || 'text-dark-200')}>
                        {formatAction(entry.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-2 text-dark-400">
                        {getResourceIcon(entry.resource)}
                        <span className="capitalize">{entry.resource}</span>
                        {entry.resourceId && (
                          <span className="text-dark-500 text-xs font-mono truncate max-w-[120px]">
                            {entry.resourceId.substring(0, 8)}...
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-dark-400 text-xs max-w-[200px] truncate">
                      {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-dark-500 text-xs font-mono">
                      {entry.ipAddress || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
