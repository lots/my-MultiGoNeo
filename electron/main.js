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

async function pictureDefaultDirectory(sourcePath) {
  const candidates = [];
  if (sourcePath && path.isAbsolute(sourcePath)) candidates.push(path.dirname(sourcePath));
  try { candidates.push(app.getPath('pictures')); } catch {}
  try { candidates.push(path.join(app.getPath('home'), 'Pictures')); } catch {}
  try { candidates.push(path.join(app.getPath('home'), 'Images')); } catch {}
  for (const candidate of candidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) return candidate;
    } catch {}
  }
  return lastDialogDirectory || app.getPath('documents');
}

function sgfPathFromArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument || argument.startsWith('--') || argument.startsWith('-')) continue;
    if (!/\.sgf$/i.test(argument)) continue;
    return path.resolve(argument);
  }
  return null;
}

let pendingOpenFile = sgfPathFromArgs(process.argv);

function createWindow(initialFile = null) {
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

  const pathArgument = process.argv.find((argument) => argument.startsWith('--path='));
  const query = {};
  if (pathArgument) query.path = pathArgument.slice('--path='.length);
  if (initialFile) query.file = initialFile;
  const loadOptions = Object.keys(query).length ? { query } : undefined;
  win.loadFile(path.join(__dirname, '..', 'src', 'index.html'), loadOptions).catch((error) => {
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

  ipcMain.handle('window:is-fullscreen', (event) => {
    const win = windowFrom(event);
    return Boolean(win && win.isFullScreen());
  });

  ipcMain.handle('window:set-fullscreen', (event, value) => {
    const win = windowFrom(event);
    if (!win) return false;
    win.setFullScreen(Boolean(value));
    return win.isFullScreen();
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

  ipcMain.handle('game:import', async (event) => {
    const options = {
      title: 'Import SGF Files as Branches',
      defaultPath: dialogDefaultPath(),
      properties: ['openFile', 'multiSelections'],
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
    const files = [];
    for (const filePath of result.filePaths) {
      const stats = await fs.stat(filePath);
      if (!stats.isFile() || stats.size > 5_000_000) continue;
      files.push({ filePath, content: await fs.readFile(filePath, 'utf8') });
    }
    if (files.length) rememberDialogDirectory(files[files.length - 1].filePath);
    return { canceled: false, files };
  });

  ipcMain.handle('board:choose-picture', async (event, payload) => {
    const format = payload && payload.format === 'jpg' ? 'jpg' : 'png';
    const suggested = payload && typeof payload.suggestedName === 'string' && payload.suggestedName.trim()
      ? path.basename(payload.suggestedName)
      : `board.${format}`;
    const filename = suggested.toLowerCase().endsWith(`.${format}`) ? suggested : `${suggested}.${format}`;
    const directory = await pictureDefaultDirectory(payload && payload.sourcePath);
    const options = {
      title: 'Save Board as Picture',
      defaultPath: path.join(directory, filename),
      filters: format === 'jpg'
        ? [{ name: 'JPEG Images', extensions: ['jpg', 'jpeg'] }]
        : [{ name: 'PNG Images', extensions: ['png'] }],
    };
    const win = windowFrom(event);
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { canceled: true };
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('board:save-picture', async (event, payload) => {
    const base64 = payload && typeof payload.base64 === 'string' ? payload.base64 : '';
    if (!base64 || base64.length > 30_000_000) throw new Error('Invalid board picture payload.');
    const format = payload && payload.format === 'jpg' ? 'jpg' : 'png';
    const suggested = payload && typeof payload.suggestedName === 'string' && payload.suggestedName.trim()
      ? path.basename(payload.suggestedName)
      : `board.${format}`;
    let filename = suggested.toLowerCase().endsWith(`.${format}`) ? suggested : `${suggested}.${format}`;
    if (format === 'jpg' && !/\.(jpe?g)$/i.test(filename)) filename = `${filename}.jpg`;
    let filePath = payload && typeof payload.filePath === 'string' && payload.filePath.trim()
      ? payload.filePath
      : null;
    if (!filePath) {
      const directory = await pictureDefaultDirectory(payload && payload.sourcePath);
      const options = {
        title: 'Save Board as Picture',
        defaultPath: path.join(directory, filename),
        filters: format === 'jpg'
          ? [{ name: 'JPEG Images', extensions: ['jpg', 'jpeg'] }]
          : [{ name: 'PNG Images', extensions: ['png'] }],
      };
      const win = windowFrom(event);
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { canceled: true };
      filePath = result.filePath;
    }
    await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
    rememberDialogDirectory(filePath);
    return { canceled: false, filePath };
  });

  ipcMain.handle('game:open-path', async (_event, payload) => {
    const filePath = payload && typeof payload.filePath === 'string' ? payload.filePath : '';
    if (!filePath) throw new Error('No file path was provided.');
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error('That recent entry is not a file.');
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
  app.on('second-instance', (_event, argv) => {
    const filePath = sgfPathFromArgs(argv);
    const [win] = BrowserWindow.getAllWindows();
    if (!win) {
      createWindow(filePath);
      return;
    }
    if (win.isMinimized()) win.restore();
    win.focus();
    if (!filePath) return;
    const deliver = () => {
      if (!win.isDestroyed()) win.webContents.send('app:open-file', filePath);
    };
    if (win.webContents.isLoadingMainFrame()) win.webContents.once('did-finish-load', deliver);
    else deliver();
  });

  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (!/\.sgf$/i.test(filePath || '')) return;
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send('app:open-file', path.resolve(filePath));
    } else {
      pendingOpenFile = path.resolve(filePath);
    }
  });

  app.whenReady().then(() => {
    installApplicationMenu();
    configureSessions();
    registerIpc();
    createWindow(pendingOpenFile);
    pendingOpenFile = null;

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (!isMac) app.quit();
  });
}
