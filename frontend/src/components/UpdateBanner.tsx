import { useEffect, useState } from 'react';
import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '../lib/utils';

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface UpdateProgress {
  percent: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

/**
 * Shows an in-app update notification banner at the top of the app.
 * Communicates with Electron's main process via window.electronAPI.
 */
export default function UpdateBanner() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'ready'>('idle');
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateProgress | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return; // Not running in Electron

    const cleanups: (() => void)[] = [];

    cleanups.push(api.onUpdateChecking(() => setStatus('checking')));

    cleanups.push(
      api.onUpdateAvailable((data: UpdateInfo) => {
        setStatus('available');
        setInfo(data);
        setDismissed(false);
      }),
    );

    cleanups.push(api.onUpdateNotAvailable(() => setStatus('idle')));

    cleanups.push(
      api.onUpdateProgress((data: UpdateProgress) => {
        setStatus('downloading');
        setProgress(data);
      }),
    );

    cleanups.push(
      api.onUpdateDownloaded((data: UpdateInfo) => {
        setStatus('ready');
        setInfo(data);
        setDismissed(false);
      }),
    );

    cleanups.push(api.onUpdateError(() => setStatus('idle')));

    return () => cleanups.forEach((fn) => fn());
  }, []);

  if (dismissed || status === 'idle' || status === 'checking') return null;

  const handleInstall = () => {
    const api = (window as any).electronAPI;
    if (api) api.installUpdate();
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2 text-sm border-b',
        status === 'ready'
          ? 'bg-success-500/10 border-success-500/30 text-success-300'
          : 'bg-accent-500/10 border-accent-500/30 text-accent-300',
      )}
    >
      <ArrowPathIcon className={cn('w-4 h-4 flex-shrink-0', status === 'downloading' && 'animate-spin')} />

      {status === 'available' && (
        <span>Update v{info?.version} is downloading in the background...</span>
      )}

      {status === 'downloading' && (
        <div className="flex items-center gap-3 flex-1">
          <span>Downloading update... {progress?.percent ?? 0}%</span>
          <div className="flex-1 max-w-48 h-1.5 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-500 rounded-full transition-all duration-300"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {status === 'ready' && (
        <>
          <span className="flex-1">
            CraftOS v{info?.version} is ready to install.
          </span>
          <button
            onClick={handleInstall}
            className="px-3 py-1 text-xs font-semibold bg-success-500 text-white rounded-lg hover:bg-success-600 transition-colors"
          >
            Restart & Update
          </button>
        </>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 text-dark-400 hover:text-dark-200 flex-shrink-0"
      >
        <XMarkIcon className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
