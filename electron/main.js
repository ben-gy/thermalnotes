const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { SerialPort } = require('serialport');

const store = new Store();

// Lazy-require escpos only when actually printing, because it needs native modules.
let escpos; // resolved at runtime
let lastTicket = '';

function createWindow() {
  const win = new BrowserWindow({
    width: 450,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS, stay alive until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------------------  Printing logic  --------------------------- */
async function connectPrinter() {
  // escpos requires a device binding; here we use serialport for BT-over-serial.
  if (!escpos) escpos = require('escpos');
  require('escpos-serialport');

  // Get saved path from settings; if none saved we throw so UI can prompt.
  const devicePath = store.get('printerPath', '');
  if (!devicePath) throw new Error('Printer not configured');

  const device = new escpos.SerialPort(devicePath, { baudRate: 9600 });
  return new escpos.Printer(device, { encoding: 'GB18030' });
}

ipcMain.handle('print-ticket', async (_event, text) => {
  lastTicket = text;

  try {
    const printer = await connectPrinter();
    const padded = text
      .split('\n')
      .map((l) => ' '.repeat(8) + l) // approx 20px at 40cpl
      .join('\n');

    printer
      .align('LT')
      .style('NORMAL')
      .size(2, 2) // 40pt approx.
      .text(padded)
      .cut()
      .close();
  } catch (err) {
    console.error('Print failed:', err);
  }
});

ipcMain.handle('reprint-last', async () => {
  if (!lastTicket) return;
  try {
    const printer = await connectPrinter();
    const padded = lastTicket
      .split('\n')
      .map((l) => ' '.repeat(8) + l)
      .join('\n');
    printer.size(2, 2).text(padded).cut().close();
  } catch (err) {
    console.error('Re-print failed:', err);
  }
});

/* -----------------------  Settings / Ports IPC  ----------------------- */
ipcMain.handle('list-serial-ports', async () => {
  try {
    const ports = await SerialPort.list();
    return ports.map(p => p.path);
  } catch (err) {
    console.error('SerialPort.list failed', err);
    return [];
  }
});

ipcMain.handle('save-printer-path', (_event, path) => {
  store.set('printerPath', path);
}); 