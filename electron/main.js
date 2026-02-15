const { app, BrowserWindow, Tray, Menu, dialog, shell, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const { spawn } = require('child_process');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

let mainWindow = null;
let tray = null;
let backendProcess = null;
let isQuitting = false;

const BACKEND_PORT = process.env.PORT || 3001;
const isDev = !app.isPackaged;

// ─── Auto-Updater Setup ──────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`Update available: v${info.version}`);
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `CraftOS v${info.version} is available`,
      detail: `Current version: v${app.getVersion()}\nNew version: v${info.version}\n\nWould you like to download it now?`,
      buttons: ['Download & Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: v${info.version}`);
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
    }
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `CraftOS v${info.version} has been downloaded`,
      detail: 'The update will be installed when you restart the application.',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        isQuitting = true;
        autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err);
  });
}

// ─── Backend Process ─────────────────────────────────────
function startBackend() {
  return new Promise((resolve, reject) => {
    const backendPath = isDev
      ? path.join(__dirname, 'backend', 'dist', 'index.js')
      : path.join(process.resourcesPath, 'backend', 'dist', 'index.js');

    // Set environment variables for the backend
    const env = {
      ...process.env,
      PORT: String(BACKEND_PORT),
      NODE_ENV: isDev ? 'development' : 'production',
      DB_PATH: path.join(app.getPath('userData'), 'data', 'craftos.db'),
      SERVERS_DIR: path.join(app.getPath('userData'), 'servers'),
      BACKUPS_DIR: path.join(app.getPath('userData'), 'backups'),
      LOGS_DIR: path.join(app.getPath('userData'), 'logs'),
    };

    log.info(`Starting backend from: ${backendPath}`);

    backendProcess = spawn(process.execPath.includes('electron') && isDev ? 'node' : process.execPath, [backendPath], {
      env,
      cwd: isDev ? __dirname : process.resourcesPath,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    backendProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      log.info(`[backend] ${output.trim()}`);
      if (output.includes('Server listening') || output.includes('listening on')) {
        resolve(true);
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      log.error(`[backend] ${data.toString().trim()}`);
    });

    backendProcess.on('error', (err) => {
      log.error('Failed to start backend:', err);
      reject(err);
    });

    backendProcess.on('exit', (code) => {
      log.info(`Backend exited with code ${code}`);
      if (!isQuitting) {
        // Restart backend if it crashes
        setTimeout(() => startBackend(), 3000);
      }
    });

    // Timeout: if backend doesn't signal ready in 30s, resolve anyway
    setTimeout(() => resolve(true), 30000);
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
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

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open CraftOS',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdates();
      },
    },
    { type: 'separator' },
    {
      label: `Version ${app.getVersion()}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
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

    // Check for updates (in production only)
    if (!isDev) {
      setupAutoUpdater();
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch(() => {});
      }, 5000);
    }
  });

  app.on('window-all-closed', () => {
    // Keep running in tray on Windows/Linux
    if (process.platform === 'darwin') {
      // On macOS, keep in dock
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopBackend();
  });
}
