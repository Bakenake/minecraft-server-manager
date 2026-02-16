const { contextBridge, ipcRenderer } = require('electron');

/**
 * Preload script — exposes a safe API to the renderer process.
 * The renderer can access these via `window.electronAPI`.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ─── App Info ─────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // ─── Auto-Updater ────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),
  getUpdateStatus: () => ipcRenderer.invoke('app:getUpdateStatus'),
  downloadUpdate: () => ipcRenderer.invoke('app:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('app:installUpdate'),

  // ─── Update Events ───────────────────────────────────
  onUpdateChecking: (callback) => {
    ipcRenderer.on('update:checking', callback);
    return () => ipcRenderer.removeListener('update:checking', callback);
  },
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update:available', (_e, data) => callback(data));
    return () => ipcRenderer.removeListener('update:available', callback);
  },
  onUpdateNotAvailable: (callback) => {
    ipcRenderer.on('update:not-available', (_e, data) => callback(data));
    return () => ipcRenderer.removeListener('update:not-available', callback);
  },
  onUpdateProgress: (callback) => {
    ipcRenderer.on('update:progress', (_e, data) => callback(data));
    return () => ipcRenderer.removeListener('update:progress', callback);
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update:downloaded', (_e, data) => callback(data));
    return () => ipcRenderer.removeListener('update:downloaded', callback);
  },
  onUpdateError: (callback) => {
    ipcRenderer.on('update:error', (_e, data) => callback(data));
    return () => ipcRenderer.removeListener('update:error', callback);
  },
});
