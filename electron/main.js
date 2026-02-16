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
let backendRestarting = false;
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

  ipcMain.handle('app:getBackendStatus', () => ({
    running: !!backendProcess,
    port: BACKEND_PORT,
    dataPath: app.getPath('userData'),
  }));

  ipcMain.handle('app:restartBackend', async () => {
    log.info('Manual backend restart requested');
    await stopBackend();
    isQuitting = false; // Reset quit flag since this is a manual restart
    try {
      await startBackend();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
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

    // Generate a stable JWT secret per installation (stored in userData)
    const jwtSecretPath = path.join(app.getPath('userData'), 'data', '.jwt-secret');
    let jwtSecret;
    try {
      const dataDir = path.join(app.getPath('userData'), 'data');
      const fs = require('fs');
      fs.mkdirSync(dataDir, { recursive: true });
      if (fs.existsSync(jwtSecretPath)) {
        jwtSecret = fs.readFileSync(jwtSecretPath, 'utf-8').trim();
      }
      if (!jwtSecret || jwtSecret.length < 32) {
        const crypto = require('crypto');
        jwtSecret = crypto.randomBytes(48).toString('hex');
        fs.writeFileSync(jwtSecretPath, jwtSecret, { mode: 0o600 });
        log.info('Generated new JWT secret for this installation');
      }
    } catch (err) {
      log.warn('Could not persist JWT secret, using ephemeral:', err.message);
      jwtSecret = require('crypto').randomBytes(48).toString('hex');
    }

    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
      JWT_SECRET: jwtSecret,
      DB_PATH: path.join(app.getPath('userData'), 'data', 'craftos.db'),
      SERVERS_DIR: path.join(app.getPath('userData'), 'servers'),
      BACKUPS_DIR: path.join(app.getPath('userData'), 'backups'),
      LOGS_DIR: path.join(app.getPath('userData'), 'logs'),
      APP_URL: `http://localhost:${BACKEND_PORT}`,
      LICENSE_SERVER_URL: [104,116,116,112,115,58,47,47,114,101,110,101,103,97,100,101,115,109,112,46,99,111,109,47,108,105,99,101,110,115,101,47,118,49,47,108,105,99,101,110,115,101].map(c => String.fromCharCode(c)).join(''),
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
    let backendErrors = [];

    backendProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      log.info(`[backend] ${output.trim()}`);
      if (!resolved && (output.includes('Server running at') || output.includes('Server listening') || output.includes('listening on'))) {
        resolved = true;
        resolve(true);
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      const errText = data.toString().trim();
      log.error(`[backend] ${errText}`);
      backendErrors.push(errText);
    });

    backendProcess.on('error', (err) => {
      log.error('Failed to start backend:', err);
      if (!resolved) { resolved = true; reject(new Error(`Backend process error: ${err.message}`)); }
    });

    backendProcess.on('exit', (code) => {
      log.info(`Backend exited with code ${code}`);
      backendProcess = null;
      if (!resolved) {
        resolved = true;
        const errorDetail = backendErrors.length > 0
          ? backendErrors.slice(-5).join('\n')
          : `Process exited with code ${code}`;
        reject(new Error(`Backend failed to start:\n${errorDetail}`));
        return;
      }
      if (!isQuitting && !backendRestarting && resolved) {
        backendRestarting = true;
        log.info('Restarting backend in 3 seconds...');
        setTimeout(() => {
          backendRestarting = false;
          if (!isQuitting) {
            startBackend().catch((err) => {
              log.error('Backend restart failed:', err);
            });
          }
        }, 3000);
      }
    });

    setTimeout(() => { if (!resolved) { resolved = true; resolve(true); } }, 30000);
  });
}

function stopBackend() {
  return new Promise((resolve) => {
    if (!backendProcess) { resolve(); return; }
    isQuitting = true; // Prevent restart loop
    const proc = backendProcess;
    backendProcess = null;
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, 5000);
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

  // Load the frontend with self-healing retry + health check
  const appUrl = isDev ? 'http://localhost:3000' : `http://localhost:${BACKEND_PORT}`;
  const healthUrl = `http://localhost:${BACKEND_PORT}/api/health`;

  async function waitForBackendHealth(maxWaitMs = 30000) {
    const http = require('http');
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get(healthUrl, { timeout: 2000 }, (res) => {
            let body = '';
            res.on('data', (d) => body += d);
            res.on('end', () => {
              if (res.statusCode === 200) resolve(true);
              else reject(new Error(`Health check returned ${res.statusCode}`));
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        });
        return true;
      } catch {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    return false;
  }

  async function loadWithRetry(url, retries = 15, delayMs = 2000) {
    // Wait for backend health first
    log.info('Waiting for backend health check...');
    const healthy = await waitForBackendHealth();
    if (healthy) log.info('Backend is healthy');
    else log.warn('Backend health check timed out, attempting to load anyway');

    for (let attempt = 1; attempt <= retries; attempt++) {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        await mainWindow.loadURL(url);
        log.info(`Frontend loaded on attempt ${attempt}`);
        return;
      } catch (err) {
        log.warn(`Frontend load attempt ${attempt}/${retries} failed: ${err.message}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs));
        } else {
          // Final fallback — show a styled error page with retry
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><title>CraftOS</title></head>
<body style="background:#0a0a0f;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center;max-width:500px;padding:40px">
<h1 style="font-size:32px;margin-bottom:8px">CraftOS</h1>
<p style="color:#94a3b8;margin-bottom:24px">The server panel is having trouble starting.</p>
<p style="color:#64748b;font-size:13px;margin-bottom:32px">${err.message.replace(/["'<>]/g, '')}</p>
<button onclick="location.href='${url}'" style="padding:12px 32px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:500">Retry</button>
<p style="color:#475569;font-size:12px;margin-top:16px">If this keeps happening, try restarting the application.</p>
</div></body></html>`)}`);
          }
        }
      }
    }
  }

  loadWithRetry(appUrl);
  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      isQuitting = true;
      // Destroy tray to prevent lingering
      if (tray) {
        tray.destroy();
        tray = null;
      }
      app.quit();
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
    {
      label: 'Minimize to Tray',
      click: () => {
        if (mainWindow) mainWindow.hide();
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
      // Don't quit — still show the window so the frontend error screen can be seen
      // and the user can retry or see what went wrong
      log.warn('Continuing to show window despite backend failure...');
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
    // Quit the app when all windows are closed
    isQuitting = true;
    app.quit();
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', async (event) => {
    if (!isQuitting) {
      isQuitting = true;
    }
    // Stop backend process and clean up tray
    await stopBackend();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
