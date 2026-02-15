import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn, formatBytes } from '../lib/utils';
import type { Backup } from '../types';
import {
  ArchiveBoxIcon,
  PlusIcon,
  ArrowPathIcon,
  TrashIcon,
  CloudArrowDownIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowDownTrayIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { format } from 'date-fns';
import { useRole } from '../hooks/useRole';

export default function Backups() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers } = useServerStore();

  const [backups, setBackups] = useState<Backup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showRetention, setShowRetention] = useState(false);
  const [retentionMaxBackups, setRetentionMaxBackups] = useState('');
  const [retentionMaxDays, setRetentionMaxDays] = useState('');
  const [totalSize, setTotalSize] = useState(0);

  const selectedId = id || servers[0]?.id;
  const { canOperate, canManage } = useRole();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const loadBackups = async () => {
    if (!selectedId) return;
    setIsLoading(true);
    try {
      const [backupsRes, sizeRes] = await Promise.all([
        api.get(`/servers/${selectedId}/backups`),
        api.get(`/servers/${selectedId}/backups/size`).catch(() => ({ data: { totalSize: 0 } })),
      ]);
      setBackups(backupsRes.data);
      setTotalSize(sizeRes.data.totalSize || 0);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load backups');
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadBackups();
  }, [selectedId]);

  const handleCreate = async () => {
    if (!selectedId) return;
    setIsCreating(true);
    try {
      await api.post(`/servers/${selectedId}/backups`);
      toast.success('Backup created');
      loadBackups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Backup failed');
    }
    setIsCreating(false);
  };

  const handleRestore = async () => {
    if (!restoreId || !selectedId) return;
    try {
      await api.post(`/backups/${restoreId}/restore`);
      toast.success('Backup restored. Server files have been replaced.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Restore failed');
    }
    setRestoreId(null);
  };

  const handleDelete = async () => {
    if (!deleteId || !selectedId) return;
    try {
      await api.delete(`/backups/${deleteId}`);
      toast.success('Backup deleted');
      loadBackups();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
    setDeleteId(null);
  };

  const handleDownload = (backupId: string) => {
    window.open(`${api.defaults.baseURL}/backups/${backupId}/download`, '_blank');
  };

  const handleApplyRetention = async () => {
    if (!selectedId) return;
    const opts: any = {};
    if (retentionMaxBackups) opts.maxBackups = parseInt(retentionMaxBackups);
    if (retentionMaxDays) opts.maxAgeDays = parseInt(retentionMaxDays);

    if (!opts.maxBackups && !opts.maxAgeDays) {
      toast.error('Specify at least one retention rule');
      return;
    }

    try {
      const { data } = await api.post(`/servers/${selectedId}/backups/retention`, opts);
      toast.success(data.message);
      loadBackups();
      setShowRetention(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Retention failed');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon className="w-5 h-5 text-success-400" />;
      case 'failed':
        return <ExclamationCircleIcon className="w-5 h-5 text-danger-400" />;
      case 'in_progress':
        return <ArrowPathIcon className="w-5 h-5 text-accent-400 animate-spin" />;
      default:
        return <ClockIcon className="w-5 h-5 text-dark-400" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">Backups</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/backups/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>
        {canOperate && (
          <div className="flex items-center gap-2">
            {canManage && (
              <button className="btn-secondary btn-sm" onClick={() => setShowRetention(!showRetention)}>
                <AdjustmentsHorizontalIcon className="w-4 h-4" />
                Retention
              </button>
            )}
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="w-4 h-4" />
                  Create Backup
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-dark-400 text-sm">Total Backups</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">{backups.length}</p>
        </div>
        <div className="card">
          <p className="text-dark-400 text-sm">Total Size</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">{formatBytes(totalSize)}</p>
        </div>
        <div className="card hidden sm:block">
          <p className="text-dark-400 text-sm">Last Backup</p>
          <p className="text-2xl font-bold text-dark-50 mt-1">
            {backups.length > 0
              ? format(new Date(backups[0].createdAt), 'MMM d, HH:mm')
              : '—'}
          </p>
        </div>
      </div>

      {/* Retention panel */}
      {showRetention && (
        <div className="card p-4 border-accent-500/20">
          <h3 className="text-sm font-medium text-dark-200 mb-3">Retention Policy</h3>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs text-dark-400 mb-1 block">Max Backups to Keep</label>
              <input
                type="number"
                className="input text-sm py-1.5"
                placeholder="e.g. 10"
                value={retentionMaxBackups}
                onChange={(e) => setRetentionMaxBackups(e.target.value)}
                min={1}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-dark-400 mb-1 block">Max Age (days)</label>
              <input
                type="number"
                className="input text-sm py-1.5"
                placeholder="e.g. 30"
                value={retentionMaxDays}
                onChange={(e) => setRetentionMaxDays(e.target.value)}
                min={1}
              />
            </div>
            <button className="btn-primary btn-sm" onClick={handleApplyRetention}>
              Apply & Clean Up
            </button>
          </div>
          <p className="text-xs text-dark-500 mt-2">
            This will delete old backups exceeding the limits. Older backups are removed first.
          </p>
        </div>
      )}
      {isLoading ? (
        <div className="card text-center py-12">
          <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : backups.length === 0 ? (
        <div className="card text-center py-16">
          <ArchiveBoxIcon className="w-16 h-16 text-dark-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-dark-300 mb-2">No Backups</h3>
          <p className="text-dark-500 text-sm mb-6">Create a backup to protect your server data</p>
          {canOperate && (
            <button className="btn-primary" onClick={handleCreate}>
              <PlusIcon className="w-4 h-4" />
              Create First Backup
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {backups.map((backup) => (
            <div key={backup.id} className="card-hover flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getStatusIcon(backup.status)}
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-dark-100">{backup.name || backup.fileName}</h3>
                    <span className={cn('badge', {
                      'badge-info': backup.type === 'manual',
                      'badge-success': backup.type === 'scheduled',
                      'badge-warning': backup.type === 'pre_update',
                    })}>
                      {backup.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-dark-500 mt-1">
                    <span>{format(new Date(backup.createdAt), 'PPp')}</span>
                    <span>{formatBytes(backup.fileSize)}</span>
                    {backup.status === 'failed' && backup.error && (
                      <span className="text-danger-400">{backup.error}</span>
                    )}
                  </div>
                </div>
              </div>

              {backup.status === 'completed' && canOperate && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDownload(backup.id)}
                    className="btn-ghost btn-sm text-dark-400"
                    title="Download"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                  {canManage && (
                    <button
                      onClick={() => setRestoreId(backup.id)}
                      className="btn-secondary btn-sm"
                      title="Restore"
                    >
                      <CloudArrowDownIcon className="w-4 h-4" />
                      Restore
                    </button>
                  )}
                  {canManage && (
                    <button
                      onClick={() => setDeleteId(backup.id)}
                      className="btn-ghost btn-sm text-danger-400"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Restore confirmation */}
      {restoreId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRestoreId(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-2">Restore Backup?</h3>
            <p className="text-dark-400 text-sm mb-4">
              This will replace the current server files with the backup. The server should be stopped before restoring.
            </p>
            <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 mb-4">
              <p className="text-warning-400 text-sm">A pre-restore backup will be created automatically.</p>
            </div>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setRestoreId(null)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={handleRestore}>Restore</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-2">Delete Backup?</h3>
            <p className="text-dark-400 text-sm mb-6">This will permanently delete the backup file.</p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-danger flex-1" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
