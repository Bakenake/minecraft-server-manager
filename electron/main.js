const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage, ipcMain, Notification } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { fork } = require('child_process');
const log = require('electron-log');

// ─── Logging ──────────────────────────────────────────────
log.transports.file.level = 'info';
log.transports.file.maxSize = 10 * 1024 * 1024; // 10 MB
autoUpdater.logger = log;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;
let updateAvailable = false;
let updateDownloaded = false;
let downloadProgress = 0;

const BACKEND_PORT = process.env.PORT || 3001;
const isDev = !app.isPackaged;

// Check for updates every 30 minutes
const UPDATE_CHECK_INTERVAL = 30 * 60 * 1000;

// ─── IPC Handlers (renderer ↔ main) ───────────────────────
function setupIPC() {
  ipcMain.handle('app:getVersion', () => app.getVersion());

  ipcMain.handle('app:checkForUpdates', () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  ipcMain.handle('app:getUpdateStatus', () => ({
    updateAvailable,
    updateDownloaded,
    downloadProgress,
    currentVersion: app.getVersion(),
  }));

  ipcMain.handle('app:installUpdate', () => {
    if (updateDownloaded) {
      isQuitting = true;
      autoUpdater.quitAndInstall(false, true);
    }
  });

  ipcMain.handle('app:downloadUpdate', () => {
    if (updateAvailable && !updateDownloaded) {
      autoUpdater.downloadUpdate();
    }
  });
}

function sendToRenderer(channel, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// ─── Auto-Updater Setup ──────────────────────────────────
function setupAutoUpdater() {
  // Auto-download in background for seamless updates
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendToRenderer('update:checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: v${info.version}`);
    updateAvailable = true;
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });

    // System notification
    if (Notification.isSupported()) {
      new Notification({
        title: 'CraftOS Update Available',
        body: `Version ${info.version} is downloading in the background.`,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      }).show();
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('App is up to date');
    updateAvailable = false;
    sendToRenderer('update:not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    downloadProgress = Math.round(progress.percent);
    log.info(`Download progress: ${downloadProgress}%`);
    if (mainWindow) mainWindow.setProgressBar(progress.percent / 100);
    sendToRenderer('update:progress', {
      percent: downloadProgress,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: v${info.version}`);
    updateDownloaded = true;
    downloadProgress = 100;
    if (mainWindow) mainWindow.setProgressBar(-1);

    sendToRenderer('update:downloaded', {
      version: info.version,
      releaseNotes: info.releaseNotes,
    });

    // Refresh tray menu to show "Restart to Update"
    if (tray) tray.setContextMenu(buildTrayMenu());

    // System notification
    if (Notification.isSupported()) {
      const n = new Notification({
        title: 'CraftOS Update Ready',
        body: `Version ${info.version} downloaded. Restart to apply.`,
        icon: path.join(__dirname, 'assets', 'icon.png'),
      });
      n.on('click', () => showUpdateReadyDialog(info.version));
      n.show();
    }

    showUpdateReadyDialog(info.version);
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
    sendToRenderer('update:error', { message: err?.message || 'Unknown error' });
  });
}

function showUpdateReadyDialog(version) {
  if (!mainWindow) return;
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `CraftOS v${version} is ready to install`,
      detail:
        'The update has been downloaded. Restart to apply.\n\n' +
        'Your servers will be gracefully stopped and restarted after the update.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    })
    .then(({ response }) => {
      if (response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall(false, true);
      }
    });
}

function startPeriodicUpdateChecks() {
  // First check 10s after startup
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => log.warn('Initial update check failed:', e.message));
  }, 10000);

  // Then every 30 minutes
  setInterval(() => {
    if (!updateDownloaded) {
      autoUpdater.checkForUpdates().catch((e) => log.warn('Periodic update check failed:', e.message));
    }
  }, UPDATE_CHECK_INTERVAL);
}

// ─── Backend Process ─────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = isDev
      ? path.join(__dirname, '..', 'backend', 'dist', 'index.js')
      : path.join(process.resourcesPath, 'backend', 'dist', 'index.js');

    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
      DB_PATH: path.join(app.getPath('userData'), 'data', 'craftos.db'),
      SERVERS_DIR: path.join(app.getPath('userData'), 'servers'),
      BACKUPS_DIR: path.join(app.getPath('userData'), 'backups'),
      LOGS_DIR: path.join(app.getPath('userData'), 'logs'),
      APP_URL: `http://localhost:${BACKEND_PORT}`,
      // In production, tell Electron binary to act as Node.js
      ...(isDev ? {} : { ELECTRON_RUN_AS_NODE: '1' }),
    };

    log.info(`Starting backend from: ${backendPath}`);

    backendProcess = fork(backendPath, [], {
      env,
      cwd: isDev ? path.join(__dirname, '..') : process.resourcesPath,
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      ...(isDev ? {} : { execPath: process.execPath }),
    });

    let resolved = false;

    backendProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      log.info(`[backend] ${output.trim()}`);
      if (!resolved && (output.includes('Server running at') || output.includes('Server listening') || output.includes('listening on'))) {
        resolved = true;
        resolve(true);
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      log.error(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err) => {
      log.error('Failed to start backend:', err);
      if (!resolved) { resolved = true; reject(err); }
    });

    backendProcess.on('exit', (code) => {
      log.info(`Backend exited with code ${code}`);
      if (!isQuitting && resolved) {
        log.info('Restarting backend in 3 seconds...');
        setTimeout(() => startBackend().catch(() => {}), 3000);
      }
    });

    setTimeout(() => { if (!resolved) { resolved = true; resolve(true); } }, 30000);
  });
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) { resolve(); return; }
    const proc = backendProcess;
    backendProcess = null;
    const killTimer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 5000);
    proc.on('exit', () => { clearTimeout(killTimer); resolve(); });
    try { proc.kill('SIGTERM'); } catch { clearTimeout(killTimer); resolve(); }
  });
}

// ─── Main Window ──────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'CraftOS Server Manager',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0a0a0f',
    show: false,
    titleBarStyle: 'default',
  });

  // Load the frontend
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(`http://localhost:${BACKEND_PORT}`);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ─── System Tray ──────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Open CraftOS',
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: 'separator' },
    {
      label: updateDownloaded ? '⟳ Restart to Update' : 'Check for Updates',
      click: () => {
        if (updateDownloaded) {
          isQuitting = true;
          autoUpdater.quitAndInstall(false, true);
        } else {
          autoUpdater.checkForUpdates().catch(() => {});
        }
      },
    },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => { isQuitting = true; app.quit(); },
    },
  ]);
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('CraftOS Server Manager');
  tray.setContextMenu(buildTrayMenu());

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.focus();
      else mainWindow.show();
    } else {
      createWindow();
    }
  });
}

// ─── App Lifecycle ────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    log.info(`CraftOS v${app.getVersion()} starting...`);

    setupIPC();

    // Start the backend server
    try {
      await startBackend();
      log.info('Backend started successfully');
    } catch (err) {
      log.error('Failed to start backend:', err);
      dialog.showErrorBox(
        'CraftOS Startup Error',
        `Failed to start the backend server.\n\n${err.message}\n\nThe application will exit.`
      );
      app.quit();
      return;
    }

    createWindow();
    createTray();

    // Auto-updater (production only)
    if (!isDev) {
      setupAutoUpdater();
      startPeriodicUpdateChecks();
    }
  });

  app.on('window-all-closed', () => {
    // Stay in tray
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', async () => {
    isQuitting = true;
    await stopBackend();
  });
}
