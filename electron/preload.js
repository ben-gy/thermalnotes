const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  print: (text, alignment, fontSize, isBold, isUnderline) => ipcRenderer.invoke('print-ticket', text, alignment, fontSize, isBold, isUnderline),
  reprint: () => ipcRenderer.invoke('reprint-last'),
  listPorts: () => ipcRenderer.invoke('list-serial-ports'),
  savePrinterPath: (path) => ipcRenderer.invoke('save-printer-path', path),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (data) => ipcRenderer.invoke('save-settings', data),
  resizeWindow: (h, w) => ipcRenderer.invoke('resize-window', h, w),
  getPrinterStatus: () => ipcRenderer.invoke('get-printer-status'),
  refreshPrinterStatus: () => ipcRenderer.invoke('refresh-printer-status'),
  scanNetworkPrinters: () => ipcRenderer.invoke('scan-network-printers'),
  setPrinterIP: (ip) => ipcRenderer.invoke('set-printer-ip', ip),
  onPrinterStatusChanged: (callback) => ipcRenderer.on('printer-status-changed', callback),
  offPrinterStatusChanged: (callback) => ipcRenderer.removeListener('printer-status-changed', callback),
  onPrinterScanningChanged: (callback) => ipcRenderer.on('printer-scanning-changed', callback),
  offPrinterScanningChanged: (callback) => ipcRenderer.removeListener('printer-scanning-changed', callback),
}); 