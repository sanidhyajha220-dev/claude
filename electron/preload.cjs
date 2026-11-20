const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', Object.freeze({
  isDesktopApp: true,
  keyStatus: () => ipcRenderer.invoke('api-key-status'),
  saveApiKey: key => ipcRenderer.invoke('api-key-set', key),
  clearApiKey: () => ipcRenderer.invoke('api-key-clear')
}));
