'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Minimal, explicitly enumerated bridge. The renderer never receives Node.js
// or the ipcRenderer object itself.
const api = {
  isElectron: true,
  platform: process.platform,
  versions: Object.freeze({
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  }),
  quit: () => ipcRenderer.invoke('app:quit'),
  isFullScreen: () => ipcRenderer.invoke('window:is-fullscreen'),
  setFullScreen: (value) => ipcRenderer.invoke('window:set-fullscreen', Boolean(value)),
  openGame: () => ipcRenderer.invoke('game:open'),
  openRecent: (filePath) => ipcRenderer.invoke('game:open-path', { filePath }),
  importGames: () => ipcRenderer.invoke('game:import'),
  saveGame: (payload) => ipcRenderer.invoke('game:save', payload),
  chooseBoardPicture: (payload) => ipcRenderer.invoke('board:choose-picture', payload),
  saveBoardPicture: (payload) => ipcRenderer.invoke('board:save-picture', payload),
};

contextBridge.exposeInMainWorld('figdesk', Object.freeze(api));
