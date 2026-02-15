import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  CpuChipIcon,
  ChatBubbleLeftRightIcon,
  WrenchScrewdriverIcon,
  ServerStackIcon,
  InformationCircleIcon,
  CheckIcon,
  ClipboardIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

// ─── Types ─────────────────────────────────────────────────────
interface JvmPreset {
  id: string;
  name: string;
  description: string;
  category: string;
  recommended: boolean;
  minJava: number;
  flags: string[];
}

interface FlagExplanation {
  flag: string;
  description: string;
  category: string;
}

// ─── Main Component ────────────────────────────────────────────
export default function Tools() {
  const [tab, setTab] = useState<'jvm' | 'discord' | 'sftp'>('jvm');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-dark-100">Advanced Tools</h1>
        <p className="text-dark-400 text-sm mt-1">JVM Tuning, Discord Bridge, SFTP Configuration</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-dark-800 rounded-lg p-1 w-fit border border-dark-700">
        {[
          { id: 'jvm' as const, icon: CpuChipIcon, label: 'JVM Tuner' },
          { id: 'discord' as const, icon: ChatBubbleLeftRightIcon, label: 'Discord Bridge' },
          { id: 'sftp' as const, icon: ServerStackIcon, label: 'SFTP' },
        ].map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === id ? 'bg-accent-600 text-white' : 'text-dark-400 hover:text-dark-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'jvm' && <JvmTuner />}
      {tab === 'discord' && <DiscordBridge />}
      {tab === 'sftp' && <SftpPanel />}
    </div>
  );
}

// ─── JVM Tuner ─────────────────────────────────────────────────
function JvmTuner() {
  const token = useAuthStore((s) => s.token);
  const [presets, setPresets] = useState<JvmPreset[]>([]);
  const [flags, setFlags] = useState<FlagExplanation[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string>('aikars');
  const [minRam, setMinRam] = useState(1024);
  const [maxRam, setMaxRam] = useState(4096);
  const [customFlags, setCustomFlags] = useState('');
  const [output, setOutput] = useState<{ args: string[]; memory: any; command: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch('/api/jvm/presets', { headers }).then((r) => r.json()),
      fetch('/api/jvm/flags', { headers }).then((r) => r.json()),
    ]).then(([p, f]) => {
      setPresets(p);
      setFlags(f);
    }).catch(console.error);
  }, []);

  const buildArgs = async () => {
    try {
      const res = await fetch('/api/jvm/build', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          minRam,
          maxRam,
          presetId: selectedPreset,
          customFlags: customFlags ? customFlags.split('\n').filter(Boolean) : [],
        }),
      });
      if (res.ok) setOutput(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const copyArgs = () => {
    if (output) {
      navigator.clipboard.writeText(output.command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activePreset = presets.find((p) => p.id === selectedPreset);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Preset Selection */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <h2 className="text-lg font-semibold text-dark-100 mb-4">JVM Presets</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {presets.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPreset(p.id)}
                className={`text-left p-4 rounded-lg border transition-all ${
                  selectedPreset === p.id
                    ? 'border-accent-500 bg-accent-600/10'
                    : 'border-dark-600 hover:border-dark-500 bg-dark-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-medium text-dark-200">{p.name}</h3>
                  {p.recommended && (
                    <span className="text-xs bg-accent-600/20 text-accent-400 px-2 py-0.5 rounded">Recommended</span>
                  )}
                </div>
                <p className="text-xs text-dark-500 line-clamp-2">{p.description}</p>
                <p className="text-xs text-dark-600 mt-2">Java {p.minJava}+ • {p.flags.length} flags</p>
              </button>
            ))}
          </div>
        </div>

        {/* RAM Config & Output */}
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <h2 className="text-lg font-semibold text-dark-100 mb-4">Configuration</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">Min RAM (MB)</label>
              <input
                type="number"
                value={minRam}
                onChange={(e) => setMinRam(Number(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-dark-400 mb-1">Max RAM (MB)</label>
              <input
                type="number"
                value={maxRam}
                onChange={(e) => setMaxRam(Number(e.target.value))}
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm text-dark-400 mb-1">Custom Flags (one per line)</label>
            <textarea
              value={customFlags}
              onChange={(e) => setCustomFlags(e.target.value)}
              placeholder="-XX:+UseCompressedOops&#10;-Dmy.custom.flag=true"
              className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm font-mono h-20"
            />
          </div>
          <button
            onClick={buildArgs}
            className="bg-accent-600 hover:bg-accent-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Generate Arguments
          </button>

          {output && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-dark-200">Generated JVM Arguments</h3>
                <button
                  onClick={copyArgs}
                  className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300"
                >
                  {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardIcon className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-dark-900 rounded-lg p-3 font-mono text-xs text-dark-300 break-all">
                {output.command}
              </div>
              <div className="flex gap-4 mt-3 text-xs text-dark-500">
                <span>Heap: {output.memory.heap}MB</span>
                <span>Estimated Total: {output.memory.estimated}MB</span>
                <span>Overhead: ~{output.memory.overhead}MB</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Flag Reference */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 h-fit">
        <h2 className="text-lg font-semibold text-dark-100 mb-4">Flag Reference</h2>

        {activePreset && (
          <div className="mb-4 p-3 bg-accent-600/5 border border-accent-500/20 rounded-lg">
            <h3 className="text-sm font-medium text-accent-400 mb-1">{activePreset.name}</h3>
            <p className="text-xs text-dark-400">{activePreset.description}</p>
          </div>
        )}

        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {flags.map((f) => (
            <div key={f.flag} className="border-b border-dark-700/50 pb-2 last:border-0">
              <code className="text-xs text-accent-400 font-mono">{f.flag}</code>
              <p className="text-xs text-dark-400 mt-0.5">{f.description}</p>
              <span className="text-xs text-dark-600">{f.category}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Discord Bridge ────────────────────────────────────────────
function DiscordBridge() {
  const token = useAuthStore((s) => s.token);
  const [servers, setServers] = useState<Array<{ id: string; name: string }>>([]);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [bridgeSettings, setBridgeSettings] = useState<Record<string, { chat: boolean; events: boolean }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/servers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setServers(Array.isArray(data) ? data : data.servers || []))
      .catch(console.error);

    // Load current webhook URL from settings
    fetch('/api/system/settings', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const settings = Array.isArray(data) ? data : [];
        const wh = settings.find((s: any) => s.key === 'discord_webhook_url');
        if (wh) setWebhookUrl(wh.value);

        const bridge = settings.find((s: any) => s.key === 'discord_bridge_servers');
        if (bridge) {
          try { setBridgeSettings(JSON.parse(bridge.value)); } catch {}
        }
      })
      .catch(console.error);
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      await Promise.all([
        fetch('/api/system/settings', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ key: 'discord_webhook_url', value: webhookUrl }),
        }),
        fetch('/api/system/settings', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ key: 'discord_bridge_servers', value: JSON.stringify(bridgeSettings) }),
        }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const toggleServer = (serverId: string, field: 'chat' | 'events') => {
    setBridgeSettings((prev) => {
      const current = prev[serverId] || { chat: false, events: false };
      return {
        ...prev,
        [serverId]: { ...current, [field]: !current[field] },
      };
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
        <h2 className="text-lg font-semibold text-dark-100 mb-4 flex items-center gap-2">
          <ChatBubbleLeftRightIcon className="w-5 h-5 text-[#5865F2]" />
          Discord Integration
        </h2>

        <div className="mb-6">
          <label className="block text-sm text-dark-400 mb-1">Webhook URL</label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="flex-1 bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
            />
            <a
              href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-accent-400 hover:text-accent-300 text-sm px-3"
            >
              <LinkIcon className="w-4 h-4" />
              Guide
            </a>
          </div>
          <p className="text-xs text-dark-500 mt-1">
            Create a webhook in your Discord channel settings to relay server events and chat.
          </p>
        </div>

        <div className="mb-4">
          <h3 className="text-dark-200 text-sm font-medium mb-3">Server Bridge Settings</h3>
          <div className="space-y-2">
            {servers.map((s) => {
              const settings = bridgeSettings[s.id] || { chat: false, events: false };
              return (
                <div key={s.id} className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
                  <span className="text-dark-300 text-sm">{s.name}</span>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.chat}
                        onChange={() => toggleServer(s.id, 'chat')}
                        className="rounded border-dark-600 bg-dark-800 text-accent-600 focus:ring-accent-500"
                      />
                      <span className="text-xs text-dark-400">Chat</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.events}
                        onChange={() => toggleServer(s.id, 'events')}
                        className="rounded border-dark-600 bg-dark-800 text-accent-600 focus:ring-accent-500"
                      />
                      <span className="text-xs text-dark-400">Events</span>
                    </label>
                  </div>
                </div>
              );
            })}
            {servers.length === 0 && (
              <p className="text-dark-500 text-sm text-center py-4">No servers found</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-dark-700">
          <p className="text-xs text-dark-500">
            Chat: Relay in-game messages to Discord. Events: Join/leave, deaths, advancements.
          </p>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {saved ? <CheckIcon className="w-4 h-4" /> : null}
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Feature Overview */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
        <h3 className="text-dark-200 text-sm font-medium mb-3">What Gets Relayed</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {[
            { label: 'Player Chat', desc: 'In-game messages show in Discord with player avatars', icon: '💬' },
            { label: 'Join/Leave', desc: 'Player connection events with colored embeds', icon: '🔔' },
            { label: 'Deaths', desc: 'Player death messages forwarded to Discord', icon: '💀' },
            { label: 'Advancements', desc: 'Achievement unlocks announced in Discord', icon: '🏆' },
            { label: 'Server Status', desc: 'Start/stop/crash notifications via embeds', icon: '🟢' },
            { label: 'Backups', desc: 'Backup success/failure notifications', icon: '📦' },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2 bg-dark-900 rounded-lg p-3">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-dark-300 font-medium">{item.label}</p>
                <p className="text-dark-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SFTP Panel ────────────────────────────────────────────────
function SftpPanel() {
  return (
    <div className="space-y-6">
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
        <h2 className="text-lg font-semibold text-dark-100 mb-4 flex items-center gap-2">
          <ServerStackIcon className="w-5 h-5 text-accent-400" />
          Built-in SFTP Server
        </h2>

        <div className="bg-accent-600/5 border border-accent-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <InformationCircleIcon className="w-5 h-5 text-accent-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-dark-200 text-sm font-medium">SFTP is active on port 2022</p>
              <p className="text-dark-400 text-xs mt-1">
                Connect with any SFTP client (FileZilla, WinSCP, Cyberduck) using your CraftOS credentials.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-dark-200 text-sm font-medium">Connection Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InfoField label="Host" value={window.location.hostname} />
            <InfoField label="Port" value="2022" />
            <InfoField label="Username" value="Your CraftOS username" />
            <InfoField label="Password" value="Your CraftOS password" />
            <InfoField label="Protocol" value="SFTP (SSH File Transfer)" />
            <InfoField label="Auth Method" value="Password" />
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-dark-700">
          <h3 className="text-dark-200 text-sm font-medium mb-3">Virtual File System</h3>
          <div className="text-xs text-dark-400 space-y-2">
            <p><code className="text-accent-400">/</code> — Lists all your servers</p>
            <p><code className="text-accent-400">/ServerName/</code> — Server root directory</p>
            <p><code className="text-accent-400">/ServerName/plugins/</code> — Server plugins folder</p>
            <p><code className="text-accent-400">/ServerName/world/</code> — Server world data</p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-dark-700">
          <h3 className="text-dark-200 text-sm font-medium mb-3">Permissions</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
              <span className="text-dark-300">Admin</span>
              <span className="text-success-400">Full read/write access</span>
            </div>
            <div className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
              <span className="text-dark-300">Moderator</span>
              <span className="text-success-400">Full read/write access</span>
            </div>
            <div className="flex items-center justify-between bg-dark-900 rounded-lg p-3">
              <span className="text-dark-300">Viewer</span>
              <span className="text-yellow-400">Read-only access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Setup Guide */}
      <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
        <h3 className="text-dark-200 text-sm font-medium mb-3">Quick Setup (FileZilla)</h3>
        <ol className="space-y-2 text-xs text-dark-400">
          <li className="flex gap-2">
            <span className="text-accent-400 font-bold">1.</span>
            <span>Open FileZilla → File → Site Manager → New Site</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-400 font-bold">2.</span>
            <span>Protocol: SFTP - SSH File Transfer Protocol</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-400 font-bold">3.</span>
            <span>Host: <code className="text-dark-300">{window.location.hostname}</code> — Port: <code className="text-dark-300">2022</code></span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-400 font-bold">4.</span>
            <span>Logon Type: Normal — Enter your CraftOS username and password</span>
          </li>
          <li className="flex gap-2">
            <span className="text-accent-400 font-bold">5.</span>
            <span>Click Connect. Accept the host key when prompted.</span>
          </li>
        </ol>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copyable = !value.includes('Your');

  return (
    <div className="bg-dark-900 rounded-lg p-3 flex items-center justify-between">
      <div>
        <span className="text-dark-500 text-xs block">{label}</span>
        <span className="text-dark-300 text-sm font-mono">{value}</span>
      </div>
      {copyable && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-dark-500 hover:text-dark-300"
        >
          {copied ? <CheckIcon className="w-4 h-4 text-success-400" /> : <ClipboardIcon className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}
