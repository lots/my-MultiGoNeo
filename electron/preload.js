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
  openGame: (options) => ipcRenderer.invoke('game:open', options),
  openRecent: (filePath, options) => ipcRenderer.invoke('game:open-path', { ...options, filePath }),
  importGames: (options) => ipcRenderer.invoke('game:import', options),
  saveGame: (payload) => ipcRenderer.invoke('game:save', payload),
  chooseBoardPicture: (payload) => ipcRenderer.invoke('board:choose-picture', payload),
  saveBoardPicture: (payload) => ipcRenderer.invoke('board:save-picture', payload),
  engine: {
    start: (options) => ipcRenderer.invoke('engine:start', options),
    send: (payload) => ipcRenderer.invoke('engine:send', payload),
    stop: (engineId) => ipcRenderer.invoke('engine:stop', { engineId }),
    choosePath: () => ipcRenderer.invoke('engine:choose-path'),
    onEvent: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('engine:event', listener);
      return () => ipcRenderer.removeListener('engine:event', listener);
    },
  },
  engineConfig: {
    load: () => ipcRenderer.invoke('engines:config-load'),
    save: (engines) => ipcRenderer.invoke('engines:config-save', { engines }),
  },
  onOpenFile: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, filePath) => callback(filePath);
    ipcRenderer.on('app:open-file', listener);
    return () => ipcRenderer.removeListener('app:open-file', listener);
  },
  onCloseRequest: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('app:close-request', listener);
    return () => ipcRenderer.removeListener('app:close-request', listener);
  },
};

contextBridge.exposeInMainWorld('figdesk', Object.freeze(api));
