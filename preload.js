const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clockApi', {
  getInitialState: () => ipcRenderer.invoke('get-initial-state'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  getCurrentTime: () => ipcRenderer.invoke('get-current-time'),
  onNtpStatus: (callback) => ipcRenderer.on('ntp-status', (_, payload) => callback(payload)),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (_, payload) => callback(payload))
});
