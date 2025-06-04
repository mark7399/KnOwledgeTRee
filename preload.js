const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getServerPort: () => ipcRenderer.invoke('get-server-port'),
  onNewTree: (callback) => ipcRenderer.on('new-tree', callback),
  onSaveTree: (callback) => ipcRenderer.on('save-tree', callback),
  onLoadTree: (callback) => ipcRenderer.on('load-tree', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
}); 