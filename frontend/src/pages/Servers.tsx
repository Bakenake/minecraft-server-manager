import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import {
  formatBytes, formatUptime, getServerTypeIcon, getStatusColor, cn,
} from '../lib/utils';
import api from '../lib/api';
import toast from 'react-hot-toast';
import type { JavaInstallation, ServerType } from '../types';
import { useRole } from '../hooks/useRole';
import {
  PlusIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  CommandLineIcon,
  FolderIcon,
  PuzzlePieceIcon,
  XMarkIcon,
  Cog6ToothIcon,
  ArrowUpCircleIcon,
} from '@heroicons/react/24/outline';

interface CreateServerForm {
  name: string;
  type: ServerType;
  version: string;
  minRam: number;
  maxRam: number;
  port: number;
  autoStart: boolean;
  autoRestart: boolean;
  javaPath: string;
}

function CreateServerDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { createServer, fetchServers } = useServerStore();
  const [form, setForm] = useState<CreateServerForm>({
    name: '',
    type: 'paper',
    version: '1.21.4',
    minRam: 1024,
    maxRam: 4096,
    port: 25565,
    autoStart: false,
    autoRestart: true,
    javaPath: 'java',
  });
  const [versions, setVersions] = useState<string[]>([]);
  const [javaVersions, setJavaVersions] = useState<JavaInstallation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      api.get(`/servers/versions/${form.type}`).then(({ data }) => {
        setVersions(data.versions || []);
      }).catch(() => {});

      api.get('/servers/java').then(({ data }) => {
        setJavaVersions(data.installations || []);
        if (data.recommended && data.recommended !== 'java') {
          setForm((f) => ({ ...f, javaPath: data.recommended }));
        } else if (data.installations?.length > 0) {
          setForm((f) => ({ ...f, javaPath: data.installations[0].path }));
        }
      }).catch(() => {});
    }
  }, [isOpen, form.type]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await createServer(form);
      toast.success(`Server "${form.name}" created!`);
      await fetchServers();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create server');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const serverTypes: { value: ServerType; label: string; desc: string }[] = [
    { value: 'vanilla', label: 'Vanilla', desc: 'Official Mojang server' },
    { value: 'paper', label: 'Paper', desc: 'High performance fork' },
    { value: 'spigot', label: 'Spigot', desc: 'Bukkit-compatible' },
    { value: 'forge', label: 'Forge', desc: 'Mod support' },
    { value: 'fabric', label: 'Fabric', desc: 'Lightweight modding' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-dark-900 border border-dark-700 rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-dark-700">
          <h2 className="text-lg font-semibold text-dark-50">Create New Server</h2>
          <button onClick={onClose} className="text-dark-400 hover:text-dark-200">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {step === 0 && (
            <>
              <div>
                <label className="label">Server Name</label>
                <input
                  className="input"
                  placeholder="My Minecraft Server"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Server Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {serverTypes.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={cn(
                        'flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-center',
                        form.type === t.value
                          ? 'border-accent-500 bg-accent-500/10 text-accent-400'
                          : 'border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600'
                      )}
                      onClick={() => setForm({ ...form, type: t.value })}
                    >
                      <span className="text-xl">{getServerTypeIcon(t.value)}</span>
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="text-xs text-dark-500">{t.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Version</label>
                <select
                  className="input"
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                >
                  {versions.length > 0 ? (
                    versions.map((v) => <option key={v} value={v}>{v}</option>)
                  ) : (
                    <option value={form.version}>{form.version}</option>
                  )}
                </select>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Min RAM (MB)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.minRam}
                    onChange={(e) => setForm({ ...form, minRam: parseInt(e.target.value) || 512 })}
                    min={256}
                    step={256}
                  />
                </div>
                <div>
                  <label className="label">Max RAM (MB)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.maxRam}
                    onChange={(e) => setForm({ ...form, maxRam: parseInt(e.target.value) || 2048 })}
                    min={512}
                    step={256}
                  />
                </div>
              </div>

              <div>
                <label className="label">Port</label>
                <input
                  type="number"
                  className="input"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 25565 })}
                  min={1024}
                  max={65535}
                />
              </div>

              <div>
                <label className="label">Java Path</label>
                <select
                  className="input"
                  value={form.javaPath}
                  onChange={(e) => setForm({ ...form, javaPath: e.target.value })}
                >
                  <option value="java">System Default (java)</option>
                  {javaVersions.map((j) => (
                    <option key={j.path} value={j.path}>
                      Java {j.majorVersion} ({j.arch}) — {j.path}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-dark-600 bg-dark-800 text-accent-600 focus:ring-accent-500"
                    checked={form.autoStart}
                    onChange={(e) => setForm({ ...form, autoStart: e.target.checked })}
                  />
                  Auto-start on launch
                </label>
                <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-dark-600 bg-dark-800 text-accent-600 focus:ring-accent-500"
                    checked={form.autoRestart}
                    onChange={(e) => setForm({ ...form, autoRestart: e.target.checked })}
                  />
                  Auto-restart on crash
                </label>
              </div>
            </>
          )}

          <div className="flex justify-between pt-2">
            {step > 0 ? (
              <button type="button" className="btn-secondary" onClick={() => setStep(step - 1)}>
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 1 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStep(step + 1)}
                disabled={!form.name}
              >
                Next
              </button>
            ) : (
              <button type="submit" className="btn-primary" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-4 h-4" />
                    Create Server
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Servers() {
  const { servers, fetchServers, startServer, stopServer, restartServer, killServer, deleteServer } = useServerStore();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [updateServer, setUpdateServer] = useState<{ id: string; type: string; version: string; name: string } | null>(null);
  const [updateVersion, setUpdateVersion] = useState('');
  const [updateBackup, setUpdateBackup] = useState(true);
  const [updateVersions, setUpdateVersions] = useState<string[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const { canOperate, canManage } = useRole();

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteServer(deleteId);
      toast.success('Server deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
    setDeleteId(null);
  };

  const openUpdateDialog = async (server: { id: string; type: string; version: string; name: string }) => {
    setUpdateServer(server);
    setUpdateVersion('');
    try {
      const endpoint = server.type === 'paper' ? '/versions/paper' : '/versions/minecraft';
      const { data } = await api.get(endpoint);
      const versionList = Array.isArray(data)
        ? data.map((v: any) => typeof v === 'string' ? v : v.id)
        : [];
      setUpdateVersions(versionList);
    } catch {
      setUpdateVersions([]);
    }
  };

  const handleUpdateVersion = async () => {
    if (!updateServer || !updateVersion) return;
    setIsUpdating(true);
    try {
      await api.post(`/servers/${updateServer.id}/update-version`, {
        version: updateVersion,
        createBackup: updateBackup,
      });
      toast.success(`Server updated to ${updateVersion}`);
      fetchServers();
      setUpdateServer(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
    setIsUpdating(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Servers</h1>
          <p className="text-dark-400 text-sm mt-0.5">Manage your Minecraft server instances</p>
        </div>
        {canOperate && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            <PlusIcon className="w-4 h-4" />
            New Server
          </button>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="card text-center py-16">
          <Cog6ToothIcon className="w-16 h-16 text-dark-700 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-dark-300 mb-2">No Servers</h3>
          <p className="text-dark-500 mb-6">{canOperate ? 'Create your first Minecraft server' : 'No servers have been created yet'}</p>
          {canOperate && (
            <button className="btn-primary" onClick={() => setShowCreate(true)}>
              <PlusIcon className="w-4 h-4" />
              Create Server
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden border border-dark-700 rounded-xl">
          {/* Mobile card view */}
          <div className="sm:hidden divide-y divide-dark-800">
            {servers.map((server) => {
              const isRunning = server.status === 'running';
              const isStopped = server.status === 'stopped';
              const isCrashed = server.status === 'crashed';
              return (
                <div key={server.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{getServerTypeIcon(server.type)}</span>
                      <div>
                        <Link to={`/console/${server.id}`} className="font-medium text-dark-100 hover:text-accent-400">
                          {server.name}
                        </Link>
                        <p className="text-xs text-dark-500">{server.type} {server.version} &middot; Port {server.port}</p>
                      </div>
                    </div>
                    <span className={cn('badge', {
                      'badge-success': isRunning,
                      'badge-warning': server.status === 'starting' || server.status === 'stopping',
                      'badge-danger': isCrashed,
                      'badge-neutral': isStopped,
                    })}>{server.status}</span>
                  </div>
                  {isRunning && (
                    <p className="text-sm text-dark-400">Players: {server.playerCount ?? 0}/{server.maxPlayers}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {canOperate && (isStopped || isCrashed) && (
                      <button onClick={() => startServer(server.id)} className="btn-success btn-sm"><PlayIcon className="w-4 h-4" /> Start</button>
                    )}
                    {canOperate && isRunning && (
                      <>
                        <button onClick={() => restartServer(server.id)} className="btn-secondary btn-sm"><ArrowPathIcon className="w-4 h-4" /> Restart</button>
                        <button onClick={() => stopServer(server.id)} className="btn-danger btn-sm"><StopIcon className="w-4 h-4" /> Stop</button>
                      </>
                    )}
                    <Link to={`/console/${server.id}`} className="btn-ghost btn-sm"><CommandLineIcon className="w-4 h-4" /> Console</Link>
                    <Link to={`/files/${server.id}`} className="btn-ghost btn-sm"><FolderIcon className="w-4 h-4" /> Files</Link>
                    <Link to={`/plugins/${server.id}`} className="btn-ghost btn-sm"><PuzzlePieceIcon className="w-4 h-4" /> Plugins</Link>
                    {canManage && isStopped && (
                      <>
                        <button onClick={() => openUpdateDialog({ id: server.id, type: server.type, version: server.version, name: server.name })} className="btn-ghost btn-sm text-accent-400"><ArrowUpCircleIcon className="w-4 h-4" /> Update</button>
                        <button onClick={() => setDeleteId(server.id)} className="btn-ghost btn-sm text-danger-400"><TrashIcon className="w-4 h-4" /> Delete</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table view */}
          <table className="w-full hidden sm:table">
            <thead>
              <tr className="border-b border-dark-700 bg-dark-900/50">
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3">Server</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3 hidden sm:table-cell">Version</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3 hidden md:table-cell">Players</th>
                <th className="text-left text-xs font-medium text-dark-400 uppercase px-6 py-3">Status</th>
                <th className="text-right text-xs font-medium text-dark-400 uppercase px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-800">
              {servers.map((server) => {
                const isRunning = server.status === 'running';
                const isStopped = server.status === 'stopped';
                const isCrashed = server.status === 'crashed';

                return (
                  <tr key={server.id} className="hover:bg-dark-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{getServerTypeIcon(server.type)}</span>
                        <div>
                          <Link to={`/console/${server.id}`} className="font-medium text-dark-100 hover:text-accent-400 transition-colors">
                            {server.name}
                          </Link>
                          <p className="text-xs text-dark-500">Port {server.port}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className="text-sm text-dark-300 capitalize">{server.type} {server.version}</span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className="text-sm text-dark-300">
                        {isRunning ? `${server.playerCount ?? 0}/${server.maxPlayers}` : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn('badge', {
                        'badge-success': isRunning,
                        'badge-warning': server.status === 'starting' || server.status === 'stopping',
                        'badge-danger': isCrashed,
                        'badge-neutral': isStopped,
                      })}>
                        {server.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        {canOperate && (isStopped || isCrashed) ? (
                          <button onClick={() => startServer(server.id)} className="btn-ghost btn-sm text-success-400" title="Start">
                            <PlayIcon className="w-4 h-4" />
                          </button>
                        ) : canOperate && isRunning ? (
                          <>
                            <button onClick={() => restartServer(server.id)} className="btn-ghost btn-sm text-warning-400" title="Restart">
                              <ArrowPathIcon className="w-4 h-4" />
                            </button>
                            <button onClick={() => stopServer(server.id)} className="btn-ghost btn-sm text-danger-400" title="Stop">
                              <StopIcon className="w-4 h-4" />
                            </button>
                          </>
                        ) : null}
                        <Link to={`/console/${server.id}`} className="btn-ghost btn-sm text-dark-400" title="Console">
                          <CommandLineIcon className="w-4 h-4" />
                        </Link>
                        <Link to={`/files/${server.id}`} className="btn-ghost btn-sm text-dark-400" title="Files">
                          <FolderIcon className="w-4 h-4" />
                        </Link>
                        <Link to={`/plugins/${server.id}`} className="btn-ghost btn-sm text-dark-400" title="Plugins">
                          <PuzzlePieceIcon className="w-4 h-4" />
                        </Link>
                        {canManage && isStopped && (
                          <>
                            <button
                              onClick={() => openUpdateDialog({ id: server.id, type: server.type, version: server.version, name: server.name })}
                              className="btn-ghost btn-sm text-accent-400"
                              title="Update Version"
                            >
                              <ArrowUpCircleIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteId(server.id)}
                              className="btn-ghost btn-sm text-danger-400"
                              title="Delete"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateServerDialog isOpen={showCreate} onClose={() => setShowCreate(false)} />

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleteId(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-dark-50 mb-2">Delete Server?</h3>
            <p className="text-dark-400 text-sm mb-6">
              This will permanently delete the server and all its files. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn-danger flex-1" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Update version dialog */}
      {updateServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !isUpdating && setUpdateServer(null)} />
          <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-dark-50">Update Server Version</h3>
              <button onClick={() => !isUpdating && setUpdateServer(null)} className="text-dark-400 hover:text-dark-200">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-dark-400 text-sm mb-4">
              Update <span className="text-dark-200 font-medium">{updateServer.name}</span> from version {updateServer.version}
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-1">New Version</label>
                <select
                  className="input w-full"
                  value={updateVersion}
                  onChange={(e) => setUpdateVersion(e.target.value)}
                  disabled={isUpdating}
                >
                  <option value="">Select version...</option>
                  {updateVersions.map((v) => (
                    <option key={v} value={v}>{v} {v === updateServer.version ? '(current)' : ''}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-accent-500 focus:ring-accent-500"
                  checked={updateBackup}
                  onChange={(e) => setUpdateBackup(e.target.checked)}
                  disabled={isUpdating}
                />
                <span className="text-sm text-dark-200">Create backup before updating</span>
              </label>
              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => setUpdateServer(null)} disabled={isUpdating}>
                  Cancel
                </button>
                <button
                  className="btn-primary flex-1"
                  onClick={handleUpdateVersion}
                  disabled={!updateVersion || updateVersion === updateServer.version || isUpdating}
                >
                  {isUpdating ? 'Updating...' : 'Update'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
