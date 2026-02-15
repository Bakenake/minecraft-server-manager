import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useServerStore } from '../stores/serverStore';
import { useWebSocket } from '../hooks/useWebSocket';
import { cn, getStatusColor, formatUptime } from '../lib/utils';
import {
  PaperAirplaneIcon,
  PlayIcon,
  StopIcon,
  ArrowPathIcon,
  TrashIcon,
  ArrowDownTrayIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useRole } from '../hooks/useRole';

function classifyLine(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes('[error]') || lower.includes('exception') || lower.includes('crash')) {
    return 'console-line-error';
  }
  if (lower.includes('[warn]') || lower.includes('[warning]')) {
    return 'console-line-warn';
  }
  return 'console-line';
}

export default function Console() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { servers, fetchServers, startServer, stopServer, restartServer, killServer } = useServerStore();
  const { consoleLogs, subscribe, unsubscribe, sendCommand, isConnected, clearLogs } = useWebSocket();

  const [command, setCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const consoleRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const server = servers.find((s) => s.id === id);
  const selectedId = id || servers[0]?.id;

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Subscribe to server console when active server changes
  useEffect(() => {
    if (selectedId && isConnected) {
      subscribe(selectedId);
      return () => unsubscribe(selectedId);
    }
  }, [selectedId, isConnected, subscribe, unsubscribe]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleLogs, autoScroll]);

  const handleScroll = () => {
    if (!consoleRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = consoleRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 50);
  };

  const handleSendCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || !selectedId) return;

    sendCommand(selectedId, command.trim());
    setCommandHistory((prev) => [command.trim(), ...prev.slice(0, 49)]);
    setCommand('');
    setHistoryIndex(-1);
    setAutoScroll(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
      setHistoryIndex(newIndex);
      if (commandHistory[newIndex]) setCommand(commandHistory[newIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const newIndex = historyIndex - 1;
      if (newIndex < 0) {
        setHistoryIndex(-1);
        setCommand('');
      } else {
        setHistoryIndex(newIndex);
        setCommand(commandHistory[newIndex]);
      }
    }
  };

  const activeServer = servers.find((s) => s.id === selectedId);
  const isRunning = activeServer?.status === 'running';
  const isStopped = activeServer?.status === 'stopped' || activeServer?.status === 'crashed';
  const { canOperate } = useRole();

  // Download console log
  const handleDownloadLog = () => {
    const content = consoleLogs.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeServer?.name || 'console'}-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-dark-50">Console</h1>
          {servers.length > 1 && (
            <select
              className="input py-1.5 text-sm w-48"
              value={selectedId || ''}
              onChange={(e) => navigate(`/console/${e.target.value}`)}
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {activeServer && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('text-sm font-medium', getStatusColor(activeServer.status))}>
              ● {activeServer.status}
            </span>
            {isRunning && activeServer.uptime && (
              <span className="text-dark-500 text-sm">
                {formatUptime(activeServer.uptime)}
              </span>
            )}
            <div className="flex items-center gap-1">
              {canOperate && isStopped && (
                <button onClick={() => startServer(activeServer.id)} className="btn-success btn-sm" title="Start">
                  <PlayIcon className="w-4 h-4" />
                  Start
                </button>
              )}
              {canOperate && isRunning && (
                <>
                  <button onClick={() => restartServer(activeServer.id)} className="btn-secondary btn-sm" title="Restart">
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                  <button onClick={() => stopServer(activeServer.id)} className="btn-danger btn-sm" title="Stop">
                    <StopIcon className="w-4 h-4" />
                    Stop
                  </button>
                </>
              )}
              <button onClick={handleDownloadLog} className="btn-ghost btn-sm" title="Download log">
                <ArrowDownTrayIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => { clearLogs(); }}
                className="btn-ghost btn-sm"
                title="Clear console"
              >
                <XCircleIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {!activeServer ? (
        <div className="card flex-1 flex items-center justify-center">
          <p className="text-dark-500">Select a server to view its console</p>
        </div>
      ) : (
        <>
          {/* Console Output */}
          <div
            ref={consoleRef}
            className="console-output flex-1 min-h-0 border border-dark-700"
            onScroll={handleScroll}
            style={{ minHeight: 'min(300px, 50vh)' }}
          >
            {consoleLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-dark-600 text-sm">
                {isRunning ? 'Waiting for output...' : 'Server is not running. Start it to see console output.'}
              </div>
            ) : (
              <div className="py-2">
                {consoleLogs.map((line, i) => (
                  <div key={i} className={classifyLine(line)}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-scroll indicator */}
          {!autoScroll && consoleLogs.length > 0 && (
            <button
              className="mx-auto btn-ghost btn-sm text-accent-400"
              onClick={() => {
                setAutoScroll(true);
                if (consoleRef.current) {
                  consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
                }
              }}
            >
              ↓ Scroll to bottom
            </button>
          )}

          {/* Command Input */}
          <form onSubmit={handleSendCommand} className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500 text-sm font-mono">
                {'> '}
              </span>
              <input
                ref={inputRef}
                type="text"
                className="input pl-8 font-mono text-sm"
                placeholder={!canOperate ? 'View-only mode' : isRunning ? 'Type a command...' : 'Server is not running'}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isRunning || !canOperate}
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={!isRunning || !command.trim() || !canOperate}
            >
              <PaperAirplaneIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
