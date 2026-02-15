import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  DocumentDuplicateIcon,
  TrashIcon,
  RocketLaunchIcon,
  PlusIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';

interface Template {
  id: string;
  name: string;
  description: string;
  type: string;
  version: string;
  minRam: number;
  maxRam: number;
  port: number;
  createdAt: string;
  createdBy: string;
}

interface Server {
  id: string;
  name: string;
  type: string;
  version: string;
}

export default function Templates() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDeploy, setShowDeploy] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deploying, setDeploying] = useState(false);

  // Create form
  const [selectedServer, setSelectedServer] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateDesc, setTemplateDesc] = useState('');

  // Deploy form
  const [deployName, setDeployName] = useState('');
  const [deployPort, setDeployPort] = useState(25565);

  useEffect(() => { loadData(); }, []);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        fetch('/api/templates', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/servers', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (tRes.ok) setTemplates(await tRes.json());
      if (sRes.ok) {
        const data = await sRes.json();
        setServers(Array.isArray(data) ? data : data.servers || []);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const createTemplate = async () => {
    if (!selectedServer || !templateName) return;
    setCreating(true);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({ serverId: selectedServer, name: templateName, description: templateDesc }),
      });
      if (res.ok) {
        setShowCreate(false);
        setTemplateName('');
        setTemplateDesc('');
        setSelectedServer('');
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
    setCreating(false);
  };

  const deployTemplate = async (id: string) => {
    if (!deployName) return;
    setDeploying(true);
    try {
      const res = await fetch(`/api/templates/${id}/deploy`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ serverName: deployName, port: deployPort }),
      });
      if (res.ok) {
        setShowDeploy(null);
        setDeployName('');
        setDeployPort(25565);
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
    setDeploying(false);
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    try {
      await fetch(`/api/templates/${id}`, { method: 'DELETE', headers });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

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
          <h1 className="text-2xl font-bold text-dark-100">Server Templates</h1>
          <p className="text-dark-400 text-sm mt-1">Save and deploy server configurations</p>
        </div>
        {(user?.role === 'admin' || user?.role === 'moderator') && (
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            Create Template
          </button>
        )}
      </div>

      {/* Create Template Dialog */}
      {showCreate && (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-6">
          <h3 className="text-lg font-semibold text-dark-100 mb-4">Create Template from Server</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-dark-400 mb-1">Source Server</label>
              <select
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select a server...</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.type} {s.version})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-dark-400 mb-1">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Survival SMP Base"
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-dark-400 mb-1">Description</label>
              <textarea
                value={templateDesc}
                onChange={(e) => setTemplateDesc(e.target.value)}
                placeholder="What is this template for?"
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-sm text-dark-400 hover:text-dark-200"
            >
              Cancel
            </button>
            <button
              onClick={createTemplate}
              disabled={creating || !selectedServer || !templateName}
              className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {creating ? 'Creating...' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <div className="bg-dark-800 rounded-xl border border-dark-700 p-12 text-center">
          <DocumentDuplicateIcon className="w-12 h-12 text-dark-600 mx-auto mb-4" />
          <h3 className="text-dark-300 text-lg font-medium">No templates yet</h3>
          <p className="text-dark-500 text-sm mt-1">Create a template from an existing server to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.id} className="bg-dark-800 rounded-xl border border-dark-700 p-5 hover:border-dark-600 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-accent-600/20 rounded-lg flex items-center justify-center">
                    <ServerStackIcon className="w-5 h-5 text-accent-400" />
                  </div>
                  <div>
                    <h3 className="text-dark-100 font-semibold text-sm">{t.name}</h3>
                    <p className="text-dark-500 text-xs">{t.type} {t.version}</p>
                  </div>
                </div>
              </div>

              {t.description && (
                <p className="text-dark-400 text-xs mb-3 line-clamp-2">{t.description}</p>
              )}

              <div className="grid grid-cols-3 gap-2 text-xs mb-4">
                <div className="bg-dark-900 rounded px-2 py-1">
                  <span className="text-dark-500">RAM</span>
                  <p className="text-dark-300">{t.minRam}-{t.maxRam}MB</p>
                </div>
                <div className="bg-dark-900 rounded px-2 py-1">
                  <span className="text-dark-500">Port</span>
                  <p className="text-dark-300">{t.port}</p>
                </div>
                <div className="bg-dark-900 rounded px-2 py-1">
                  <span className="text-dark-500">By</span>
                  <p className="text-dark-300 truncate">{t.createdBy}</p>
                </div>
              </div>

              {/* Deploy dialog inline */}
              {showDeploy === t.id && (
                <div className="bg-dark-900 border border-dark-600 rounded-lg p-3 mb-3">
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={deployName}
                      onChange={(e) => setDeployName(e.target.value)}
                      placeholder="New server name"
                      className="w-full bg-dark-800 border border-dark-600 text-dark-200 rounded px-2 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      value={deployPort}
                      onChange={(e) => setDeployPort(Number(e.target.value))}
                      placeholder="Port"
                      className="w-full bg-dark-800 border border-dark-600 text-dark-200 rounded px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeploy(null)}
                        className="flex-1 text-xs text-dark-400 hover:text-dark-200 py-1"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => deployTemplate(t.id)}
                        disabled={deploying || !deployName}
                        className="flex-1 bg-success-600 hover:bg-success-500 disabled:opacity-50 text-white rounded px-2 py-1 text-xs font-medium"
                      >
                        {deploying ? 'Deploying...' : 'Deploy'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeploy(showDeploy === t.id ? null : t.id); setDeployName(''); }}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-accent-600/10 text-accent-400 hover:bg-accent-600/20 rounded-lg py-2 text-xs font-medium transition-colors"
                >
                  <RocketLaunchIcon className="w-3.5 h-3.5" />
                  Deploy
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => deleteTemplate(t.id)}
                    className="flex items-center justify-center gap-1.5 text-danger-400 hover:bg-danger-600/10 rounded-lg px-3 py-2 text-xs transition-colors"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
