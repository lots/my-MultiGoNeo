'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isMac = process.platform === 'darwin';
const APP_ID = 'com.illegear.multigoneo';
const ALLOWED_PERMISSIONS = new Set(['clipboard-read', 'clipboard-sanitized-write']);

app.setName('MultiGo Neo');
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

let mainWindow = null;
// my-Sabaki's dialog-folder memory: Open/Save start where you last were.
let lastDialogDirectory = null;

function rememberDialogDirectory(filePath) {
  if (!filePath) return;
  lastDialogDirectory = path.dirname(filePath);
}

function dialogDefaultPath(filename = null) {
  const directory = lastDialogDirectory || app.getPath('documents');
  return filename ? path.join(directory, filename) : directory;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 1024,
    useContentSize: true,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#ffffff',
    title: 'MultiGo Neo',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'src', 'index.html')).catch((error) => {
    dialog.showErrorBox('MultiGo Neo failed to start', error.message);
    app.quit();
  });

  win.once('ready-to-show', () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  mainWindow = win;
  return win;
}

function installApplicationMenu() {
  if (!isMac) {
    // The page renders its own File / Edit / Help menu bar.
    Menu.setApplicationMenu(null);
    return;
  }
  // macOS always needs an application menu for Cmd+Q, Services, and window roles.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' },
  ]));
}

function windowFrom(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerIpc() {
  ipcMain.handle('app:quit', () => {
    app.quit();
  });

  ipcMain.handle('app:new-window', () => {
    createWindow();
  });

  ipcMain.handle('game:save', async (event, payload) => {
    const content = payload && payload.content;
    const saveAs = Boolean(payload && payload.saveAs);
    let filePath = payload && typeof payload.filePath === 'string' ? payload.filePath : null;

    if (typeof content !== 'string' || content.length > 5_000_000) {
      throw new Error('Invalid SGF payload.');
    }

    if (!filePath || saveAs) {
      const suggested = payload && typeof payload.suggestedName === 'string' && payload.suggestedName.trim()
        ? path.basename(payload.suggestedName)
        : 'game.sgf';
      const filename = suggested.toLowerCase().endsWith('.sgf') ? suggested : `${suggested}.sgf`;
      const options = {
        title: 'Save SGF',
        defaultPath: filePath || dialogDefaultPath(filename),
        filters: [
          { name: 'SGF Files', extensions: ['sgf'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      };
      const win = windowFrom(event);
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }

    await fs.writeFile(filePath, content, 'utf8');
    rememberDialogDirectory(filePath);
    return { canceled: false, filePath };
  });

  ipcMain.handle('game:open', async (event) => {
    const options = {
      title: 'Open SGF',
      defaultPath: dialogDefaultPath(),
      properties: ['openFile'],
      filters: [
        { name: 'SGF Files', extensions: ['sgf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    };
    const win = windowFrom(event);
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) return { canceled: true };

    const filePath = result.filePaths[0];
    const stats = await fs.stat(filePath);
    if (stats.size > 5_000_000) throw new Error('That SGF file is too large to open.');

    const content = await fs.readFile(filePath, 'utf8');
    rememberDialogDirectory(filePath);
    return { canceled: false, filePath, content };
  });
}

function configureSessions() {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    installApplicationMenu();
    configureSessions();
    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
