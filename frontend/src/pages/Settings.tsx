import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useServerStore } from '../stores/serverStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { cn, describeCron } from '../lib/utils';
import type { User, ScheduledTask, SystemInfo } from '../types';
import {
  Cog6ToothIcon,
  UserGroupIcon,
  ClockIcon,
  ShieldCheckIcon,
  InformationCircleIcon,
  PlusIcon,
  TrashIcon,
  ChatBubbleBottomCenterTextIcon,
  KeyIcon,
  XMarkIcon,
  BellAlertIcon,
  PlayIcon,
  PencilIcon,
  ClipboardDocumentListIcon,
  ShieldExclamationIcon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { useRole } from '../hooks/useRole';

export default function Settings() {
  const { user, logout } = useAuthStore();
  const { servers, fetchServers } = useServerStore();
  const { canManage, canOperate } = useRole();

  const [tab, setTab] = useState<'general' | 'users' | 'tasks' | 'security' | 'alerts' | 'about'>('general');
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [appInfo, setAppInfo] = useState<SystemInfo | null>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Create user dialog
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState<'admin' | 'moderator' | 'viewer'>('viewer');

  // Feedback
  const [feedbackType, setFeedbackType] = useState<'bug' | 'feature' | 'general'>('general');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  // 2FA state
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [twoFaQrCode, setTwoFaQrCode] = useState('');
  const [twoFaSecret, setTwoFaSecret] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [show2faDisable, setShow2faDisable] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  // Create task dialog
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskServerId, setTaskServerId] = useState('');
  const [taskType, setTaskType] = useState<'restart' | 'backup' | 'command'>('restart');
  const [taskCron, setTaskCron] = useState('0 3 * * *');
  const [taskCommand, setTaskCommand] = useState('');

  // Edit task
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [editTaskCron, setEditTaskCron] = useState('');
  const [editTaskCommand, setEditTaskCommand] = useState('');

  // Task history
  const [taskHistoryItems, setTaskHistoryItems] = useState<any[]>([]);
  const [showTaskHistory, setShowTaskHistory] = useState(false);
  // Discord webhook
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');

  // Alert thresholds
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertCpuWarning, setAlertCpuWarning] = useState('80');
  const [alertCpuCritical, setAlertCpuCritical] = useState('95');
  const [alertTpsWarning, setAlertTpsWarning] = useState('15');
  const [alertTpsCritical, setAlertTpsCritical] = useState('10');
  const [alertRamWarning, setAlertRamWarning] = useState('');
  const [alertRamCritical, setAlertRamCritical] = useState('');
  const [alertCooldown, setAlertCooldown] = useState('5');

  // API Keys
  const [myApiKeys, setMyApiKeys] = useState<any[]>([]);
  const [showCreateApiKey, setShowCreateApiKey] = useState(false);
  const [apiKeyName, setApiKeyName] = useState('');
  const [apiKeyRole, setApiKeyRole] = useState<'admin' | 'moderator' | 'viewer'>('viewer');
  const [apiKeyExpiry, setApiKeyExpiry] = useState('');
  const [newlyCreatedKey, setNewlyCreatedKey] = useState('');

  // User Permissions
  const [showPermissions, setShowPermissions] = useState<string | null>(null); // userId
  const [permissionDefs, setPermissionDefs] = useState<Record<string, { label: string; permissions: { key: string; label: string }[] }>>({});
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [permServerScope, setPermServerScope] = useState<string>('all'); // 'all' or serverId
  const [savingPerms, setSavingPerms] = useState(false);

  useEffect(() => {
    loadData();
    fetchServers();
  }, []);

  const loadData = async () => {
    try {
      // Fetch tasks from all servers
      let allTasks: ScheduledTask[] = [];
      try {
        const { data: srvs } = await api.get('/servers');
        const taskPromises = (srvs as any[]).map((s: any) =>
          api.get(`/servers/${s.id}/schedule`).then(r => r.data).catch(() => [])
        );
        const taskArrays = await Promise.all(taskPromises);
        allTasks = taskArrays.flat();
      } catch {}

      const [usersRes, infoRes] = await Promise.all([
        api.get('/auth/users').catch(() => ({ data: [] })),
        api.get('/system/info').catch(() => ({ data: null })),
      ]);
      setUsers(usersRes.data);
      setTasks(allTasks);
      setAppInfo(infoRes.data);

      // Load Discord webhook URL from settings
      try {
        const { data: allSettings } = await api.get('/settings');
        const webhookSetting = (allSettings as any[])?.find((s: any) => s.key === 'discord_webhook_url');
        if (webhookSetting) setDiscordWebhookUrl(webhookSetting.value);
      } catch {}

      // Load alert thresholds
      try {
        const { data: thresholds } = await api.get('/system/alerts/thresholds');
        setAlertsEnabled(thresholds.enabled || false);
        if (thresholds.cpuWarning != null) setAlertCpuWarning(String(thresholds.cpuWarning));
        if (thresholds.cpuCritical != null) setAlertCpuCritical(String(thresholds.cpuCritical));
        if (thresholds.tpsWarning != null) setAlertTpsWarning(String(thresholds.tpsWarning));
        if (thresholds.tpsCritical != null) setAlertTpsCritical(String(thresholds.tpsCritical));
        if (thresholds.ramWarning != null) setAlertRamWarning(String(thresholds.ramWarning));
        if (thresholds.ramCritical != null) setAlertRamCritical(String(thresholds.ramCritical));
        if (thresholds.cooldownMinutes != null) setAlertCooldown(String(thresholds.cooldownMinutes));
      } catch {}

      // Load API keys
      try {
        const { data: keys } = await api.get('/auth/api-keys');
        setMyApiKeys(keys as any[]);
      } catch {}

      // Load permission definitions
      try {
        const { data: defs } = await api.get('/permissions/definitions');
        setPermissionDefs(defs);
      } catch {}
    } catch {}
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    }
  };

  const handleCreateUser = async () => {
    try {
      await api.post('/auth/users', {
        username: createUsername,
        email: createEmail,
        password: createPassword,
        role: createRole,
      });
      toast.success(`User "${createUsername}" created`);
      setShowCreateUser(false);
      setCreateUsername('');
      setCreateEmail('');
      setCreatePassword('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Delete user "${username}"?`)) return;
    try {
      await api.delete(`/auth/users/${userId}`);
      toast.success('User deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete user');
    }
  };

  // ── Permission management ─────────────────────────
  const handleOpenPermissions = async (userId: string) => {
    setShowPermissions(userId);
    setPermServerScope('all');
    try {
      const { data: perms } = await api.get(`/users/${userId}/permissions`);
      const permMap: Record<string, boolean> = {};
      for (const p of perms as any[]) {
        const key = p.serverId ? `${p.permission}:${p.serverId}` : p.permission;
        permMap[key] = p.granted;
      }
      setUserPerms(permMap);
    } catch {
      setUserPerms({});
    }
  };

  const handleTogglePerm = (permKey: string) => {
    setUserPerms((prev) => ({ ...prev, [permKey]: !prev[permKey] }));
  };

  const handleSavePermissions = async () => {
    if (!showPermissions) return;
    setSavingPerms(true);
    try {
      const permissions: Array<{ permission: string; serverId?: string | null; granted: boolean }> = [];
      for (const [key, granted] of Object.entries(userPerms)) {
        if (key.includes(':')) {
          const [permission, serverId] = key.split(':');
          permissions.push({ permission, serverId, granted });
        } else {
          permissions.push({ permission: key, serverId: null, granted });
        }
      }
      await api.put(`/users/${showPermissions}/permissions`, { permissions });
      toast.success('Permissions saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save permissions');
    }
    setSavingPerms(false);
  };

  const handleGrantAll = () => {
    const allPerms: Record<string, boolean> = {};
    for (const cat of Object.values(permissionDefs)) {
      for (const p of cat.permissions) {
        allPerms[p.key] = true;
      }
    }
    setUserPerms(allPerms);
  };

  const handleRevokeAll = () => {
    setUserPerms({});
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await api.delete(`/schedule/${taskId}`);
      toast.success('Task deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete task');
    }
  };

  const handleToggleTask = async (task: ScheduledTask) => {
    try {
      await api.patch(`/schedule/${task.id}/toggle`, { enabled: !task.enabled });
      toast.success(task.enabled ? 'Task disabled' : 'Task enabled');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to toggle task');
    }
  };

  const handleCreateTask = async () => {
    if (!taskServerId || !taskCron) return;
    try {
      const body: any = { type: taskType, cronExpression: taskCron, enabled: true };
      if (taskType === 'command' && taskCommand) body.command = taskCommand;
      await api.post(`/servers/${taskServerId}/schedule`, body);
      toast.success('Task created');
      setShowCreateTask(false);
      setTaskServerId('');
      setTaskType('restart');
      setTaskCron('0 3 * * *');
      setTaskCommand('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create task');
    }
  };

  const handleRunTask = async (taskId: string) => {
    try {
      await api.post(`/schedule/${taskId}/run`);
      toast.success('Task executed');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to run task');
    }
  };

  const handleEditTask = async () => {
    if (!editTaskId) return;
    try {
      const body: any = { cronExpression: editTaskCron };
      if (editTaskCommand) body.command = editTaskCommand;
      await api.put(`/schedule/${editTaskId}`, body);
      toast.success('Task updated');
      setEditTaskId(null);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update task');
    }
  };

  const loadTaskHistory = async () => {
    try {
      const { data } = await api.get('/schedule/history?limit=50');
      setTaskHistoryItems(data as any[]);
      setShowTaskHistory(true);
    } catch {
      toast.error('Failed to load task history');
    }
  };

  const handleCreateApiKey = async () => {
    if (!apiKeyName) return;
    try {
      const body: any = { name: apiKeyName, role: apiKeyRole };
      if (apiKeyExpiry) body.expiresInDays = parseInt(apiKeyExpiry);
      const { data } = await api.post('/auth/api-keys', body);
      setNewlyCreatedKey((data as any).key);
      toast.success('API key created');
      setShowCreateApiKey(false);
      setApiKeyName('');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create API key');
    }
  };

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await api.delete(`/auth/api-keys/${keyId}`);
      toast.success('API key deleted');
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete API key');
    }
  };

  const handleSaveWebhook = async () => {
    try {
      await api.put('/system/discord-webhook', { url: discordWebhookUrl });
      toast.success('Discord webhook URL saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save webhook');
    }
  };

  const handleSaveWebhookClear = async () => {
    try {
      await api.put('/system/discord-webhook', { url: '' });
      toast.success('Discord webhook removed');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to remove webhook');
    }
  };

  const handleTestWebhook = async () => {
    try {
      await handleSaveWebhook();
      await api.post('/system/discord-webhook/test');
      toast.success('Test notification sent to Discord');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send test');
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    try {
      await api.post('/feedback', {
        type: feedbackType,
        subject: feedbackType === 'bug' ? 'Bug Report' : feedbackType === 'feature' ? 'Feature Request' : 'General Feedback',
        message: feedbackMessage,
      });
      toast.success('Feedback submitted. Thank you!');
      setFeedbackMessage('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit feedback');
    }
  };

  const handleSaveAlerts = async () => {
    try {
      await api.put('/system/alerts/thresholds', {
        enabled: alertsEnabled,
        cpuWarning: alertCpuWarning ? Number(alertCpuWarning) : undefined,
        cpuCritical: alertCpuCritical ? Number(alertCpuCritical) : undefined,
        tpsWarning: alertTpsWarning ? Number(alertTpsWarning) : undefined,
        tpsCritical: alertTpsCritical ? Number(alertTpsCritical) : undefined,
        ramWarning: alertRamWarning ? Number(alertRamWarning) : undefined,
        ramCritical: alertRamCritical ? Number(alertRamCritical) : undefined,
        cooldownMinutes: Number(alertCooldown) || 5,
      });
      toast.success('Alert thresholds saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save alerts');
    }
  };

  const allTabs = [
    { id: 'general' as const, label: 'General', icon: Cog6ToothIcon },
    { id: 'users' as const, label: 'Users', icon: UserGroupIcon },
    { id: 'tasks' as const, label: 'Scheduled Tasks', icon: ClockIcon },
    { id: 'alerts' as const, label: 'Alerts', icon: BellAlertIcon },
    { id: 'security' as const, label: 'Security', icon: ShieldCheckIcon },
    { id: 'about' as const, label: 'About', icon: InformationCircleIcon },
  ];
  const tabs = canManage ? allTabs : allTabs.filter((t) => t.id !== 'users');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-dark-50">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-900 border border-dark-700 rounded-lg p-1 overflow-x-auto tabs-scroll">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={cn(
              'flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap',
              tab === t.id
                ? 'bg-dark-800 text-dark-100 shadow-sm'
                : 'text-dark-400 hover:text-dark-200'
            )}
            onClick={() => setTab(t.id)}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {tab === 'general' && (
        <div className="space-y-6">
          {/* Profile */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-dark-100">Profile</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">Username</label>
                <input className="input" value={user?.username || ''} disabled />
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input" value={user?.email || ''} disabled />
              </div>
            </div>
            <div>
              <label className="label">Role</label>
              <span className="badge-info capitalize">{user?.role}</span>
            </div>
          </div>

          {/* Change Password */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-dark-100">Change Password</h3>
            <div>
              <label className="label">Current Password</label>
              <input
                type="password"
                className="input"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleChangePassword}
              disabled={!currentPassword || !newPassword}
            >
              <KeyIcon className="w-4 h-4" />
              Update Password
            </button>
          </div>

          {/* Feedback */}
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-dark-100">Send Feedback</h3>
            <div className="flex flex-wrap gap-2">
              {(['bug', 'feature', 'general'] as const).map((type) => (
                <button
                  key={type}
                  className={cn(
                    'btn-sm capitalize',
                    feedbackType === type ? 'btn-primary' : 'btn-secondary'
                  )}
                  onClick={() => setFeedbackType(type)}
                >
                  {type === 'bug' ? 'Bug Report' : type === 'feature' ? 'Feature Request' : 'General'}
                </button>
              ))}
            </div>
            <textarea
              className="input min-h-[100px] resize-y"
              placeholder="Tell us what you think..."
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={handleSubmitFeedback}
              disabled={!feedbackMessage.trim()}
            >
              <ChatBubbleBottomCenterTextIcon className="w-4 h-4" />
              Submit Feedback
            </button>
          </div>

          {/* Discord Webhook (admin-only) */}
          {canManage && (
            <div className="card space-y-4">
              <h3 className="text-lg font-semibold text-dark-100">Discord Notifications</h3>
              <p className="text-dark-400 text-sm">
                Get notified in Discord when servers start/stop/crash, players join/leave, and backups complete.
              </p>
              <div>
                <label className="label">Webhook URL</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={discordWebhookUrl}
                  onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary"
                  onClick={handleSaveWebhook}
                  disabled={!discordWebhookUrl}
                >
                  Save Webhook
                </button>
                <button
                  className="btn-secondary"
                  onClick={handleTestWebhook}
                  disabled={!discordWebhookUrl}
                >
                  Send Test
                </button>
                {discordWebhookUrl && (
                  <button
                    className="btn-ghost text-danger-400"
                    onClick={() => { setDiscordWebhookUrl(''); handleSaveWebhookClear(); }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Danger Zone */}
          <div className="card border-danger-500/30 space-y-4">
            <h3 className="text-lg font-semibold text-danger-400">Danger Zone</h3>
            <button className="btn-danger" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button className="btn-primary btn-sm" onClick={() => setShowCreateUser(true)}>
              <PlusIcon className="w-4 h-4" />
              Add User
            </button>
          </div>

          <div className="space-y-3">
            {users.map((u) => (
              <div key={u.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-500/20 rounded-full flex items-center justify-center">
                    <span className="text-accent-400 font-semibold text-sm">
                      {u.username.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-dark-100">{u.username}</h3>
                      <span className={cn('badge', {
                        'badge-danger': u.role === 'admin',
                        'badge-warning': u.role === 'moderator',
                        'badge-neutral': u.role === 'viewer',
                      })}>
                        {u.role}
                      </span>
                      {u.totpEnabled && (
                        <span className="badge-success">2FA</span>
                      )}
                    </div>
                    <p className="text-xs text-dark-500">{u.email}</p>
                  </div>
                </div>
                {u.id !== user?.id && (
                  <div className="flex items-center gap-2">
                    {u.role !== 'admin' && (
                      <button
                        onClick={() => handleOpenPermissions(u.id)}
                        className="btn-ghost btn-sm text-accent-400"
                        title="Manage Permissions"
                      >
                        <ShieldExclamationIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      className="btn-ghost btn-sm text-danger-400"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Create user dialog */}
          {showCreateUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateUser(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-dark-50">Create User</h3>
                  <button onClick={() => setShowCreateUser(false)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div>
                  <label className="label">Username</label>
                  <input className="input" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input className="input" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} minLength={8} required />
                </div>
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={createRole} onChange={(e) => setCreateRole(e.target.value as any)}>
                    <option value="viewer">Viewer</option>
                    <option value="moderator">Moderator</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button className="btn-secondary flex-1" onClick={() => setShowCreateUser(false)}>Cancel</button>
                  <button className="btn-primary flex-1" onClick={handleCreateUser}>Create</button>
                </div>
              </div>
            </div>
          )}

          {/* Permissions editor modal */}
          {showPermissions && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowPermissions(null)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-dark-50">
                      Permissions — {users.find(u => u.id === showPermissions)?.username}
                    </h3>
                    <p className="text-xs text-dark-500 mt-0.5">
                      Configure what this user can access. Unchecked permissions will be denied.
                    </p>
                  </div>
                  <button onClick={() => setShowPermissions(null)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Quick actions */}
                <div className="flex items-center gap-2 mb-4">
                  <button className="btn-sm btn-secondary" onClick={handleGrantAll}>Grant All</button>
                  <button className="btn-sm btn-ghost text-danger-400" onClick={handleRevokeAll}>Revoke All</button>
                  <div className="flex-1" />
                  <span className="text-xs text-dark-500">
                    {Object.values(userPerms).filter(Boolean).length} permissions granted
                  </span>
                </div>

                {/* Permission categories */}
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {Object.entries(permissionDefs).map(([catKey, category]) => (
                    <div key={catKey} className="card">
                      <h4 className="font-medium text-dark-200 text-sm mb-3 flex items-center gap-2">
                        <ShieldCheckIcon className="w-4 h-4 text-accent-400" />
                        {category.label}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {category.permissions.map((perm) => {
                          const isGranted = userPerms[perm.key] === true;
                          return (
                            <button
                              key={perm.key}
                              onClick={() => handleTogglePerm(perm.key)}
                              className={cn(
                                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all',
                                isGranted
                                  ? 'border-success-500/30 bg-success-500/10 text-success-300'
                                  : 'border-dark-700 bg-dark-800/50 text-dark-400 hover:border-dark-600'
                              )}
                            >
                              <div className={cn(
                                'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                                isGranted
                                  ? 'bg-success-500 border-success-500'
                                  : 'border-dark-600'
                              )}>
                                {isGranted && <CheckIcon className="w-3 h-3 text-white" />}
                              </div>
                              {perm.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save button */}
                <div className="flex gap-3 pt-4 border-t border-dark-700 mt-4">
                  <button className="btn-secondary flex-1" onClick={() => setShowPermissions(null)}>Cancel</button>
                  <button
                    className="btn-primary flex-1"
                    onClick={handleSavePermissions}
                    disabled={savingPerms}
                  >
                    {savingPerms ? 'Saving...' : 'Save Permissions'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scheduled Tasks */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          {canOperate && (
            <div className="flex justify-between">
              <button className="btn-secondary btn-sm" onClick={loadTaskHistory}>
                <ClipboardDocumentListIcon className="w-4 h-4" />
                History
              </button>
              <button className="btn-primary btn-sm" onClick={() => setShowCreateTask(true)}>
                <PlusIcon className="w-4 h-4" />
                Create Task
              </button>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="card text-center py-12">
              <ClockIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
              <p className="text-dark-400">No scheduled tasks</p>
              <p className="text-dark-500 text-sm mt-1">
                {canOperate ? 'Click "Create Task" to add one' : 'No scheduled tasks configured'}
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-dark-100 capitalize">{task.type}</h3>
                    <span className="text-xs text-dark-400">
                      {servers.find((s) => s.id === task.serverId)?.name || 'Unknown Server'}
                    </span>
                    <span className={cn('badge', task.enabled ? 'badge-success' : 'badge-neutral')}>
                      {task.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dark-500 mt-1">
                    <span title={task.cronExpression}>{describeCron(task.cronExpression)}</span>
                    {task.command && <span>Command: {task.command}</span>}
                    {(task as any).nextRunAt && <span>Next: {new Date((task as any).nextRunAt).toLocaleString()}</span>}
                    {task.lastRunAt && <span>Last: {new Date(task.lastRunAt).toLocaleString()}</span>}
                  </div>
                </div>
                {canOperate && (
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => handleRunTask(task.id)}
                      className="btn-ghost btn-sm text-accent-400"
                      title="Run Now"
                    >
                      <PlayIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setEditTaskId(task.id);
                        setEditTaskCron(task.cronExpression);
                        setEditTaskCommand(task.command || '');
                      }}
                      className="btn-ghost btn-sm text-dark-300"
                      title="Edit"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleToggleTask(task)}
                      className={cn('btn-sm', task.enabled ? 'btn-secondary' : 'btn-success')}
                    >
                      {task.enabled ? 'Disable' : 'Enable'}
                    </button>
                    {canManage && (
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="btn-ghost btn-sm text-danger-400"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Edit task dialog */}
          {editTaskId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditTaskId(null)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold text-dark-50 mb-4">Edit Task</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">Cron Expression</label>
                    <input
                      className="input font-mono"
                      value={editTaskCron}
                      onChange={(e) => setEditTaskCron(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">Command (optional)</label>
                    <input
                      className="input"
                      value={editTaskCommand}
                      onChange={(e) => setEditTaskCommand(e.target.value)}
                      placeholder="Only for command-type tasks"
                    />
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" onClick={() => setEditTaskId(null)}>Cancel</button>
                    <button className="btn-primary flex-1" onClick={handleEditTask}>Save</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Task history dialog */}
          {showTaskHistory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowTaskHistory(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-dark-700">
                  <h3 className="text-lg font-semibold text-dark-50">Task Execution History</h3>
                  <button onClick={() => setShowTaskHistory(false)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                  {taskHistoryItems.length === 0 ? (
                    <p className="text-dark-400 text-center py-8">No execution history yet</p>
                  ) : (
                    <div className="space-y-2">
                      {taskHistoryItems.map((h: any) => (
                        <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-dark-800">
                          <div className="flex items-center gap-3">
                            <span className={cn(
                              'w-2 h-2 rounded-full',
                              h.status === 'success' ? 'bg-success-400' : 'bg-danger-400'
                            )} />
                            <div>
                              <span className="text-sm text-dark-200 capitalize">{h.type}</span>
                              {h.message && <p className="text-xs text-dark-500">{h.message}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-dark-400">{new Date(h.executedAt).toLocaleString()}</p>
                            {h.duration && <p className="text-xs text-dark-500">{h.duration}ms</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Create Task Dialog */}
          {showCreateTask && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateTask(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl w-full max-w-md">
                <div className="flex items-center justify-between p-6 border-b border-dark-700">
                  <h2 className="text-lg font-semibold text-dark-50">Create Scheduled Task</h2>
                  <button onClick={() => setShowCreateTask(false)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="label">Server</label>
                    <select
                      className="input"
                      value={taskServerId}
                      onChange={(e) => setTaskServerId(e.target.value)}
                    >
                      <option value="">Select a server...</option>
                      {servers.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Task Type</label>
                    <select
                      className="input"
                      value={taskType}
                      onChange={(e) => setTaskType(e.target.value as 'restart' | 'backup' | 'command')}
                    >
                      <option value="restart">Restart Server</option>
                      <option value="backup">Create Backup</option>
                      <option value="command">Run Command</option>
                    </select>
                  </div>
                  {taskType === 'command' && (
                    <div>
                      <label className="label">Command</label>
                      <input
                        className="input"
                        placeholder="say Server restart in 5 minutes..."
                        value={taskCommand}
                        onChange={(e) => setTaskCommand(e.target.value)}
                      />
                    </div>
                  )}
                  <div>
                    <label className="label">Schedule</label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {[
                        { label: 'Every 6 hours', cron: '0 */6 * * *' },
                        { label: 'Every 12 hours', cron: '0 */12 * * *' },
                        { label: 'Daily at 3 AM', cron: '0 3 * * *' },
                        { label: 'Daily at midnight', cron: '0 0 * * *' },
                        { label: 'Every Sunday', cron: '0 3 * * 0' },
                        { label: 'Every hour', cron: '0 * * * *' },
                      ].map((preset) => (
                        <button
                          key={preset.cron}
                          type="button"
                          className={cn(
                            'text-xs px-3 py-1.5 rounded border transition-colors text-left',
                            taskCron === preset.cron
                              ? 'border-accent-500 bg-accent-500/10 text-accent-400'
                              : 'border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600'
                          )}
                          onClick={() => setTaskCron(preset.cron)}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <input
                      className="input text-sm font-mono"
                      placeholder="Custom cron: 0 */6 * * *"
                      value={taskCron}
                      onChange={(e) => setTaskCron(e.target.value)}
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      Format: minute hour day month weekday (e.g. 0 3 * * * = daily at 3 AM)
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button className="btn-secondary flex-1" onClick={() => setShowCreateTask(false)}>Cancel</button>
                    <button
                      className="btn-primary flex-1"
                      onClick={handleCreateTask}
                      disabled={!taskServerId || !taskCron || (taskType === 'command' && !taskCommand)}
                    >
                      <PlusIcon className="w-4 h-4" />
                      Create Task
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Security */}
      {tab === 'security' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-dark-100">Two-Factor Authentication</h3>
            <p className="text-dark-400 text-sm">
              {user?.totpEnabled
                ? 'Two-factor authentication is enabled for your account.'
                : 'Add an extra layer of security with two-factor authentication.'}
            </p>
            {user?.totpEnabled ? (
              <button
                className="btn-danger"
                onClick={() => setShow2faDisable(true)}
              >
                Disable 2FA
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={async () => {
                  try {
                    const { data } = await api.post('/auth/2fa/enable');
                    setTwoFaQrCode(data.qrCode);
                    setTwoFaSecret(data.secret);
                    setTwoFaToken('');
                    setShow2faSetup(true);
                  } catch (err: any) {
                    toast.error(err.response?.data?.error || 'Failed');
                  }
                }}
              >
                <ShieldCheckIcon className="w-4 h-4" />
                Enable 2FA
              </button>
            )}
          </div>

          {/* 2FA Setup Dialog */}
          {show2faSetup && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShow2faSetup(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-dark-50">Set Up 2FA</h3>
                  <button onClick={() => setShow2faSetup(false)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-dark-400">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                {twoFaQrCode && (
                  <div className="flex justify-center bg-white rounded-lg p-4">
                    <img src={twoFaQrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                )}
                <div>
                  <p className="text-xs text-dark-500 mb-1">Or enter this secret manually:</p>
                  <code className="block bg-dark-800 px-3 py-2 rounded text-sm text-accent-400 font-mono break-all select-all">
                    {twoFaSecret}
                  </code>
                </div>
                <div>
                  <label className="label">Enter verification code</label>
                  <input
                    className="input text-center text-lg tracking-widest"
                    value={twoFaToken}
                    onChange={(e) => setTwoFaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                </div>
                <button
                  className="btn-primary w-full"
                  disabled={twoFaToken.length !== 6}
                  onClick={async () => {
                    try {
                      await api.post('/auth/2fa/verify', { token: twoFaToken });
                      toast.success('2FA enabled successfully!');
                      setShow2faSetup(false);
                      // Refresh user profile
                      window.location.reload();
                    } catch (err: any) {
                      toast.error(err.response?.data?.error || 'Invalid verification code');
                    }
                  }}
                >
                  <ShieldCheckIcon className="w-4 h-4" />
                  Verify & Enable
                </button>
              </div>
            </div>
          )}

          {/* 2FA Disable Dialog */}
          {show2faDisable && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShow2faDisable(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-dark-50">Disable 2FA</h3>
                  <button onClick={() => setShow2faDisable(false)} className="text-dark-400 hover:text-dark-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-dark-400">
                  Enter your password to confirm disabling two-factor authentication.
                </p>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                  />
                </div>
                <div className="flex gap-3">
                  <button className="btn-secondary flex-1" onClick={() => { setShow2faDisable(false); setDisablePassword(''); }}>
                    Cancel
                  </button>
                  <button
                    className="btn-danger flex-1"
                    disabled={!disablePassword}
                    onClick={async () => {
                      try {
                        await api.post('/auth/2fa/disable', { password: disablePassword });
                        toast.success('2FA disabled');
                        setShow2faDisable(false);
                        setDisablePassword('');
                        window.location.reload();
                      } catch (err: any) {
                        toast.error(err.response?.data?.error || 'Failed to disable 2FA');
                      }
                    }}
                  >
                    Disable 2FA
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="card space-y-4">
            <h3 className="text-lg font-semibold text-dark-100">Active Sessions</h3>
            <div className="bg-dark-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-dark-200">Current Session</p>
                  <p className="text-xs text-dark-500">
                    Logged in as {user?.username}
                  </p>
                </div>
                <span className="badge-success">Active</span>
              </div>
            </div>
          </div>

          {/* API Keys */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-dark-100">API Keys</h3>
              <button className="btn-primary btn-sm" onClick={() => setShowCreateApiKey(true)}>
                <PlusIcon className="w-4 h-4" />
                Create Key
              </button>
            </div>
            <p className="text-dark-400 text-sm">
              API keys allow programmatic access to the CraftOS API. Use the <code className="text-accent-400">X-API-Key</code> header.
            </p>

            {/* Newly created key display */}
            {newlyCreatedKey && (
              <div className="bg-success-500/10 border border-success-500/20 rounded-lg p-4">
                <p className="text-sm font-medium text-success-400 mb-1">API Key Created</p>
                <p className="text-xs text-dark-300 mb-2">Copy this key now. It won't be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-dark-100 bg-dark-800 px-3 py-1.5 rounded font-mono break-all flex-1">
                    {newlyCreatedKey}
                  </code>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => { navigator.clipboard.writeText(newlyCreatedKey); toast.success('Copied!'); }}
                  >
                    Copy
                  </button>
                </div>
                <button className="text-xs text-dark-500 mt-2 hover:text-dark-300" onClick={() => setNewlyCreatedKey('')}>
                  Dismiss
                </button>
              </div>
            )}

            {myApiKeys.length === 0 ? (
              <p className="text-dark-500 text-sm py-2">No API keys created yet</p>
            ) : (
              <div className="space-y-2">
                {myApiKeys.map((key: any) => (
                  <div key={key.id} className="bg-dark-800 rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-dark-200">{key.name}</span>
                        <span className="badge-info">{key.role}</span>
                        <code className="text-xs text-dark-500 font-mono">{key.keyPrefix}...</code>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-dark-500 mt-1">
                        <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && <span>Last used: {new Date(key.lastUsedAt).toLocaleDateString()}</span>}
                        {key.expiresAt && <span>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <button className="btn-ghost btn-sm text-danger-400" onClick={() => handleDeleteApiKey(key.id)}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Create API Key Dialog */}
          {showCreateApiKey && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateApiKey(false)} />
              <div className="relative bg-dark-900 border border-dark-700 rounded-xl p-6 w-full max-w-md">
                <h3 className="text-lg font-semibold text-dark-50 mb-4">Create API Key</h3>
                <div className="space-y-4">
                  <div>
                    <label className="label">Name</label>
                    <input className="input" placeholder="My integration" value={apiKeyName} onChange={(e) => setApiKeyName(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Role</label>
                    <select className="input" value={apiKeyRole} onChange={(e) => setApiKeyRole(e.target.value as any)}>
                      <option value="viewer">Viewer (read-only)</option>
                      <option value="moderator">Moderator</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Expires In (days, optional)</label>
                    <input className="input" type="number" placeholder="Leave empty for no expiry" value={apiKeyExpiry} onChange={(e) => setApiKeyExpiry(e.target.value)} />
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-secondary flex-1" onClick={() => setShowCreateApiKey(false)}>Cancel</button>
                    <button className="btn-primary flex-1" onClick={handleCreateApiKey} disabled={!apiKeyName}>Create</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SFTP Settings */}
          <SFTPSettingsCard />
        </div>
      )}

      {/* Alerts */}
      {tab === 'alerts' && canManage && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-dark-100">Performance Alerts</h3>
              <button
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className={cn(
                  'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
                  alertsEnabled ? 'bg-accent-600' : 'bg-dark-700'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
                  alertsEnabled ? 'translate-x-6' : 'translate-x-1'
                )} />
              </button>
            </div>
            <p className="text-sm text-dark-400">Get notified when server performance metrics exceed thresholds.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3 p-4 bg-dark-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-dark-200">CPU Usage (%)</h4>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Warning</label>
                    <input type="number" className="input text-sm py-1.5" value={alertCpuWarning} onChange={(e) => setAlertCpuWarning(e.target.value)} placeholder="80" min={0} max={100} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Critical</label>
                    <input type="number" className="input text-sm py-1.5" value={alertCpuCritical} onChange={(e) => setAlertCpuCritical(e.target.value)} placeholder="95" min={0} max={100} />
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-4 bg-dark-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-dark-200">TPS (below threshold)</h4>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Warning</label>
                    <input type="number" className="input text-sm py-1.5" value={alertTpsWarning} onChange={(e) => setAlertTpsWarning(e.target.value)} placeholder="15" step="0.5" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Critical</label>
                    <input type="number" className="input text-sm py-1.5" value={alertTpsCritical} onChange={(e) => setAlertTpsCritical(e.target.value)} placeholder="10" step="0.5" />
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-4 bg-dark-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-dark-200">RAM Usage (MB)</h4>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Warning</label>
                    <input type="number" className="input text-sm py-1.5" value={alertRamWarning} onChange={(e) => setAlertRamWarning(e.target.value)} placeholder="e.g. 3000" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-dark-500">Critical</label>
                    <input type="number" className="input text-sm py-1.5" value={alertRamCritical} onChange={(e) => setAlertRamCritical(e.target.value)} placeholder="e.g. 3800" />
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-4 bg-dark-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-dark-200">Cooldown</h4>
                <div>
                  <label className="text-xs text-dark-500">Minutes between repeat alerts</label>
                  <input type="number" className="input text-sm py-1.5" value={alertCooldown} onChange={(e) => setAlertCooldown(e.target.value)} placeholder="5" min={1} />
                </div>
              </div>
            </div>

            <button className="btn-primary" onClick={handleSaveAlerts}>
              Save Alert Settings
            </button>
          </div>
        </div>
      )}

      {/* About */}
      {tab === 'about' && (
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-accent-500/20 rounded-xl flex items-center justify-center">
                <Cog6ToothIcon className="w-7 h-7 text-accent-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-dark-50">CraftOS Server Manager</h3>
                <p className="text-dark-400 text-sm">Professional Minecraft Server Management</p>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-dark-300 mb-4">System Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {appInfo && (
                <>
                  <div>
                    <p className="text-dark-500">Version</p>
                    <p className="text-dark-200 font-medium">{appInfo.version}</p>
                  </div>
                  <div>
                    <p className="text-dark-500">Node.js</p>
                    <p className="text-dark-200 font-medium">{appInfo.nodeVersion}</p>
                  </div>
                  <div>
                    <p className="text-dark-500">Platform</p>
                    <p className="text-dark-200 font-medium capitalize">{appInfo.platform}</p>
                  </div>
                  <div>
                    <p className="text-dark-500">Architecture</p>
                    <p className="text-dark-200 font-medium">{appInfo.arch}</p>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-medium text-dark-300 mb-4">Features</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-dark-400">Two-Factor Auth</span>
                <span className={cn('badge', appInfo?.features?.twoFactor ? 'badge-success' : 'badge-neutral')}>
                  {appInfo?.features?.twoFactor ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">Telemetry</span>
                <span className={cn('badge', appInfo?.features?.telemetry ? 'badge-success' : 'badge-neutral')}>
                  {appInfo?.features?.telemetry ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-dark-400">Auto-Update</span>
                <span className={cn('badge', appInfo?.features?.autoUpdate ? 'badge-success' : 'badge-neutral')}>
                  {appInfo?.features?.autoUpdate ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-center text-dark-600 text-xs">
            CraftOS Server Manager v1.0.0-beta.1 &middot; Built with Fastify + React
          </p>
        </div>
      )}
    </div>
  );
}

// ─── SFTP Settings Card Component ─────────────────────────
function SFTPSettingsCard() {
  const [sftpEnabled, setSftpEnabled] = useState(true);
  const [sftpPort, setSftpPort] = useState('2022');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/system/sftp')
      .then(({ data }) => {
        setSftpEnabled(data.enabled);
        setSftpPort(String(data.port));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    const port = parseInt(sftpPort, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      toast.error('Port must be between 1 and 65535');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put('/system/sftp', { enabled: sftpEnabled, port });
      toast.success(data.message || 'SFTP settings saved');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save SFTP settings');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="card">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-dark-700 rounded w-1/3" />
          <div className="h-8 bg-dark-700 rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-dark-100">SFTP Server</h3>
          <p className="text-dark-400 text-sm mt-0.5">
            Access server files remotely via SFTP using any SFTP client (FileZilla, WinSCP, etc.)
          </p>
        </div>
        <button
          onClick={() => setSftpEnabled(!sftpEnabled)}
          className={cn(
            'relative inline-flex h-7 w-12 items-center rounded-full transition-colors',
            sftpEnabled ? 'bg-accent-600' : 'bg-dark-700'
          )}
        >
          <span className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white transition-transform',
            sftpEnabled ? 'translate-x-6' : 'translate-x-1'
          )} />
        </button>
      </div>

      {sftpEnabled && (
        <div className="space-y-4 pt-2">
          <div>
            <label className="label">SFTP Port</label>
            <input
              type="number"
              className="input w-32"
              value={sftpPort}
              onChange={(e) => setSftpPort(e.target.value)}
              min={1}
              max={65535}
            />
            <p className="text-xs text-dark-500 mt-1">Default: 2022. Avoid using ports already in use.</p>
          </div>

          <div className="bg-dark-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-dark-200 mb-2">Connection Details</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-dark-500">Host:</span>
                <span className="text-dark-200 ml-2">Your server IP</span>
              </div>
              <div>
                <span className="text-dark-500">Port:</span>
                <span className="text-dark-200 ml-2">{sftpPort}</span>
              </div>
              <div>
                <span className="text-dark-500">Username:</span>
                <span className="text-dark-200 ml-2">Your CraftOS username</span>
              </div>
              <div>
                <span className="text-dark-500">Password:</span>
                <span className="text-dark-200 ml-2">Your CraftOS password</span>
              </div>
            </div>
            <p className="text-xs text-dark-500 mt-3">
              SFTP uses your CraftOS login credentials. To change the password, use the password change feature above.
            </p>
          </div>

          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save SFTP Settings'}
          </button>
        </div>
      )}
    </div>
  );
}
