import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import {
  MagnifyingGlassIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  BugAntIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

interface Server {
  id: string;
  name: string;
}

interface LogFile {
  name: string;
  size: number;
  modified: string;
}

interface SearchResult {
  line: number;
  text: string;
}

interface CrashReport {
  timestamp: string;
  description: string;
  javaVersion: string;
  minecraftVersion: string;
  serverType: string;
  stackTrace: string[];
  suspectedMods: string[];
  suspectedPlugins: string[];
  suggestions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export default function LogSearch() {
  const token = useAuthStore((s) => s.token);
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [tab, setTab] = useState<'search' | 'crashes'>('search');

  // Search state
  const [logFiles, setLogFiles] = useState<LogFile[]>([]);
  const [selectedFile, setSelectedFile] = useState('latest.log');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Crash state
  const [crashFiles, setCrashFiles] = useState<string[]>([]);
  const [selectedCrash, setSelectedCrash] = useState<CrashReport | null>(null);
  const [loadingCrash, setLoadingCrash] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteContent, setPasteContent] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch('/api/servers', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.servers || [];
        setServers(list);
        if (list.length > 0 && !selectedServer) setSelectedServer(list[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedServer) return;
    // Load log files and crash reports
    Promise.all([
      fetch(`/api/servers/${selectedServer}/logs/files`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : []),
      fetch(`/api/servers/${selectedServer}/crashes`, { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.ok ? r.json() : { reports: [] }),
    ]).then(([logs, crashes]) => {
      setLogFiles(logs || []);
      setCrashFiles(crashes?.reports || []);
    }).catch(console.error);
  }, [selectedServer]);

  const searchLogs = async () => {
    if (!selectedServer || !query) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ query, file: selectedFile, limit: '500' });
      const res = await fetch(
        `/api/servers/${selectedServer}/logs/search?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || []);
      }
    } catch (e) {
      console.error(e);
    }
    setSearching(false);
  };

  const analyzeCrash = async (filename: string) => {
    setLoadingCrash(true);
    try {
      const res = await fetch(`/api/servers/${selectedServer}/crashes/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSelectedCrash(await res.json());
    } catch (e) {
      console.error(e);
    }
    setLoadingCrash(false);
  };

  const analyzePaste = async () => {
    if (!pasteContent) return;
    setLoadingCrash(true);
    try {
      const res = await fetch('/api/crashes/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({ content: pasteContent }),
      });
      if (res.ok) setSelectedCrash(await res.json());
    } catch (e) {
      console.error(e);
    }
    setLoadingCrash(false);
  };

  const severityColor = (s: string) => {
    switch (s) {
      case 'critical': return 'text-red-400 bg-red-400/10';
      case 'high': return 'text-orange-400 bg-orange-400/10';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10';
      default: return 'text-blue-400 bg-blue-400/10';
    }
  };

  const formatSize = (b: number) => {
    if (b > 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
    if (b > 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-100">Logs & Diagnostics</h1>
          <p className="text-dark-400 text-sm mt-1">Search logs and analyze crash reports</p>
        </div>
        <select
          value={selectedServer}
          onChange={(e) => setSelectedServer(e.target.value)}
          className="bg-dark-800 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm"
        >
          {servers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-dark-800 rounded-lg p-1 w-fit border border-dark-700">
        <button
          onClick={() => setTab('search')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'search' ? 'bg-accent-600 text-white' : 'text-dark-400 hover:text-dark-200'}`}
        >
          <MagnifyingGlassIcon className="w-4 h-4 inline mr-1.5" />
          Log Search
        </button>
        <button
          onClick={() => setTab('crashes')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'crashes' ? 'bg-accent-600 text-white' : 'text-dark-400 hover:text-dark-200'}`}
        >
          <BugAntIcon className="w-4 h-4 inline mr-1.5" />
          Crash Analyzer
        </button>
      </div>

      {/* Log Search Tab */}
      {tab === 'search' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="bg-dark-800 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm sm:w-48"
            >
              <option value="latest.log">latest.log</option>
              {logFiles.filter(f => f.name !== 'latest.log').map((f) => (
                <option key={f.name} value={f.name}>{f.name} ({formatSize(f.size)})</option>
              ))}
            </select>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchLogs()}
                placeholder="Search logs... (use /regex/ for regex)"
                className="flex-1 bg-dark-800 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm placeholder:text-dark-500"
              />
              <button
                onClick={searchLogs}
                disabled={searching || !query}
                className="flex items-center gap-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {searching ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <MagnifyingGlassIcon className="w-4 h-4" />}
                Search
              </button>
            </div>
          </div>

          {results.length > 0 && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 overflow-hidden">
              <div className="px-4 py-3 border-b border-dark-700 flex items-center justify-between">
                <span className="text-dark-300 text-sm font-medium">{results.length} results</span>
              </div>
              <div className="max-h-[500px] overflow-y-auto font-mono text-xs">
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="flex border-b border-dark-700/50 hover:bg-dark-750 transition-colors"
                  >
                    <span className="text-dark-500 px-3 py-1.5 w-16 text-right flex-shrink-0 border-r border-dark-700/50">
                      {r.line}
                    </span>
                    <span className={`px-3 py-1.5 whitespace-pre-wrap break-all ${
                      r.text.includes('ERROR') ? 'text-red-400' :
                      r.text.includes('WARN') ? 'text-yellow-400' :
                      'text-dark-300'
                    }`}>
                      {r.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Log files list */}
          <div className="bg-dark-800 rounded-xl border border-dark-700">
            <div className="px-4 py-3 border-b border-dark-700">
              <h3 className="text-dark-200 text-sm font-medium">Available Log Files</h3>
            </div>
            <div className="divide-y divide-dark-700/50">
              {logFiles.length === 0 ? (
                <p className="px-4 py-6 text-dark-500 text-sm text-center">No log files found</p>
              ) : logFiles.map((f) => (
                <div key={f.name} className="flex items-center justify-between px-4 py-2.5 hover:bg-dark-750 transition-colors">
                  <div className="flex items-center gap-2">
                    <DocumentTextIcon className="w-4 h-4 text-dark-500" />
                    <span className="text-dark-300 text-sm">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-dark-500">
                    <span>{formatSize(f.size)}</span>
                    <span>{new Date(f.modified).toLocaleString()}</span>
                    <button
                      onClick={() => { setSelectedFile(f.name); setTab('search'); }}
                      className="text-accent-400 hover:text-accent-300"
                    >
                      Search
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Crash Analyzer Tab */}
      {tab === 'crashes' && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <button
              onClick={() => setPasteMode(!pasteMode)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                pasteMode ? 'bg-accent-600/10 border-accent-500/30 text-accent-400' : 'border-dark-600 text-dark-400 hover:text-dark-200'
              }`}
            >
              Paste Crash Report
            </button>
          </div>

          {pasteMode && (
            <div className="bg-dark-800 rounded-xl border border-dark-700 p-4">
              <textarea
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder="Paste your crash report or error log here..."
                className="w-full bg-dark-900 border border-dark-600 text-dark-200 rounded-lg px-3 py-2 text-sm font-mono h-40"
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={analyzePaste}
                  disabled={loadingCrash || !pasteContent}
                  className="bg-accent-600 hover:bg-accent-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Analyze
                </button>
              </div>
            </div>
          )}

          {/* Crash report files */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-dark-800 rounded-xl border border-dark-700">
              <div className="px-4 py-3 border-b border-dark-700">
                <h3 className="text-dark-200 text-sm font-medium">Crash Reports ({crashFiles.length})</h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto divide-y divide-dark-700/50">
                {crashFiles.length === 0 ? (
                  <p className="px-4 py-6 text-dark-500 text-sm text-center">No crash reports found</p>
                ) : crashFiles.map((f) => (
                  <button
                    key={f}
                    onClick={() => analyzeCrash(f)}
                    className="w-full text-left px-4 py-2.5 hover:bg-dark-750 transition-colors"
                  >
                    <p className="text-dark-300 text-xs font-mono truncate">{f}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Analysis Results */}
            <div className="lg:col-span-2">
              {loadingCrash ? (
                <div className="flex items-center justify-center h-64 bg-dark-800 rounded-xl border border-dark-700">
                  <div className="w-8 h-8 border-4 border-accent-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : selectedCrash ? (
                <div className="bg-dark-800 rounded-xl border border-dark-700 p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-dark-100 font-semibold">{selectedCrash.description}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${severityColor(selectedCrash.severity)}`}>
                      {selectedCrash.severity.toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-dark-900 rounded-lg p-3">
                      <span className="text-dark-500">Java</span>
                      <p className="text-dark-300 mt-1 truncate">{selectedCrash.javaVersion}</p>
                    </div>
                    <div className="bg-dark-900 rounded-lg p-3">
                      <span className="text-dark-500">MC Version</span>
                      <p className="text-dark-300 mt-1 truncate">{selectedCrash.minecraftVersion}</p>
                    </div>
                    <div className="bg-dark-900 rounded-lg p-3">
                      <span className="text-dark-500">Server</span>
                      <p className="text-dark-300 mt-1 truncate">{selectedCrash.serverType}</p>
                    </div>
                  </div>

                  {/* Suggestions */}
                  <div>
                    <h4 className="text-dark-200 text-sm font-medium mb-2 flex items-center gap-2">
                      <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
                      Suggestions
                    </h4>
                    <div className="space-y-2">
                      {selectedCrash.suggestions.map((s, i) => (
                        <div key={i} className="bg-yellow-400/5 border border-yellow-400/10 rounded-lg p-3 text-sm text-dark-300">
                          {s}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suspected Plugins/Mods */}
                  {(selectedCrash.suspectedPlugins.length > 0 || selectedCrash.suspectedMods.length > 0) && (
                    <div>
                      <h4 className="text-dark-200 text-sm font-medium mb-2">Suspected Causes</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedCrash.suspectedPlugins.map((p) => (
                          <span key={p} className="bg-red-400/10 text-red-400 px-2 py-1 rounded text-xs">Plugin: {p}</span>
                        ))}
                        {selectedCrash.suspectedMods.map((m) => (
                          <span key={m} className="bg-orange-400/10 text-orange-400 px-2 py-1 rounded text-xs">Mod: {m}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Stack Trace */}
                  {selectedCrash.stackTrace.length > 0 && (
                    <StackTraceView trace={selectedCrash.stackTrace} />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 bg-dark-800 rounded-xl border border-dark-700">
                  <div className="text-center">
                    <BugAntIcon className="w-10 h-10 text-dark-600 mx-auto mb-3" />
                    <p className="text-dark-500 text-sm">Select a crash report to analyze</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StackTraceView({ trace }: { trace: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleLines = expanded ? trace : trace.slice(0, 10);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-dark-400 text-sm font-medium mb-2 hover:text-dark-200"
      >
        {expanded ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
        Stack Trace ({trace.length} lines)
      </button>
      <div className="bg-dark-900 rounded-lg p-3 font-mono text-xs text-dark-400 max-h-60 overflow-y-auto">
        {visibleLines.map((line, i) => (
          <div key={i} className={line.startsWith('Caused by') ? 'text-red-400 mt-2' : ''}>
            {line}
          </div>
        ))}
        {!expanded && trace.length > 10 && (
          <button onClick={() => setExpanded(true)} className="text-accent-400 hover:text-accent-300 mt-2">
            ... {trace.length - 10} more lines
          </button>
        )}
      </div>
    </div>
  );
}
