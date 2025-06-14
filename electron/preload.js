const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  print: (text) => ipcRenderer.invoke('print-ticket', text),
  reprint: () => ipcRenderer.invoke('reprint-last'),
  listPorts: () => ipcRenderer.invoke('list-serial-ports'),
  savePrinterPath: (path) => ipcRenderer.invoke('save-printer-path', path),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  resizeWindow: (h) => ipcRenderer.invoke('resize-window', h),
}); 