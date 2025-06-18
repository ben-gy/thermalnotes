const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { SerialPort } = require('serialport');

const store = new Store();

// Lazy-require escpos only when actually printing, because it needs native modules.
let escpos; // resolved at runtime
let lastTicket = '';
let printerConnected = false;
let printerCheckInterval = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 360,
    height: 420,
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

  // Start auto-detecting printer after window is ready
  win.webContents.once('did-finish-load', () => {
    startPrinterAutoDetection(win);
  });

  return win;
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Clean up printer check interval
  if (printerCheckInterval) {
    clearInterval(printerCheckInterval);
  }
  // On macOS, stay alive until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') app.quit();
});

/* ---------------------------  Printer Auto-Detection  --------------------------- */
async function findEpsonThermalPrinter() {
  console.log('[PRINTER] Starting auto-detection...');
  try {
    // First check if we have a saved IP address
    const savedIP = store.get('printerIP', '');
    console.log('[PRINTER] Saved IP from settings:', savedIP || 'none');
    
    if (savedIP) {
      console.log('[PRINTER] Testing saved IP:', savedIP);
      if (await testNetworkPrinterConnection(savedIP)) {
        console.log('[PRINTER] Saved IP is working:', savedIP);
        return savedIP;
      } else {
        console.log('[PRINTER] Saved IP failed, will scan network');
      }
    }
    
    // Scan common IP ranges for EPSON printers
    console.log('[PRINTER] Scanning network for printers...');
    const possibleIPs = await scanForNetworkPrinters();
    console.log('[PRINTER] IPs to test:', possibleIPs);
    
    for (const ip of possibleIPs) {
      if (await testNetworkPrinterConnection(ip)) {
        console.log('[PRINTER] Found EPSON printer at IP:', ip);
        store.set('printerIP', ip);
        return ip;
      }
    }
    
    console.log('[PRINTER] No printers found during network scan');
    return null;
  } catch (err) {
    console.error('[PRINTER] Error finding printer:', err);
    return null;
  }
}

async function scanForNetworkPrinters() {
  console.log('[PRINTER] Scanning for network printers...');
  // Get the local network range
  const os = require('os');
  const interfaces = os.networkInterfaces();
  const ips = [];
  
  console.log('[PRINTER] Available network interfaces:');
  
  // Find local network interfaces
  for (const interfaceName of Object.keys(interfaces)) {
    const iface = interfaces[interfaceName];
    for (const connection of iface) {
      if (connection.family === 'IPv4' && !connection.internal) {
        console.log(`[PRINTER] Interface ${interfaceName}: ${connection.address}`);
        // Get network range (assume /24 subnet)
        const networkBase = connection.address.split('.').slice(0, 3).join('.');
        
        // Common IP ranges for printers
        const commonPrinterIPs = [
          `${networkBase}.100`,
          `${networkBase}.101`,
          `${networkBase}.102`,
          `${networkBase}.200`,
          `${networkBase}.201`,
          `${networkBase}.202`,
          `${networkBase}.210`,
          `${networkBase}.50`,
          `${networkBase}.51`,
          `${networkBase}.10`,
          `${networkBase}.20`,
          `${networkBase}.181`, // Include the specific IP the user tried
        ];
        
        console.log(`[PRINTER] Adding IPs for network ${networkBase}.x:`, commonPrinterIPs);
        ips.push(...commonPrinterIPs);
      }
    }
  }
  
  const uniqueIPs = [...new Set(ips)]; // Remove duplicates
  console.log('[PRINTER] Final IP list to scan:', uniqueIPs);
  return uniqueIPs;
}

async function testNetworkPrinterConnection(ip) {
  console.log(`[PRINTER] Testing connection to ${ip}:9100`);
  try {
    if (!escpos) escpos = require('escpos');
    const networkAdapter = require('escpos-network');
    
    const device = new networkAdapter(ip, 9100); // Port 9100 is standard for EPSON
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log(`[PRINTER] Connection timeout for ${ip}:9100`);
        resolve(false);
      }, 5000); // Increased to 5 second timeout
      
      device.open((err) => {
        clearTimeout(timeout);
        if (err) {
          console.log(`[PRINTER] Connection failed to ${ip}:9100 - Error:`, err.message || err);
          resolve(false);
        } else {
          console.log(`[PRINTER] Successfully connected to ${ip}:9100`);
          device.close();
          resolve(true);
        }
      });
    });
  } catch (err) {
    console.log(`[PRINTER] Exception testing connection to ${ip}:9100 - Error:`, err.message || err);
    return false;
  }
}

// Keep the old function for backwards compatibility, but update it to use network
async function testPrinterConnection(devicePath) {
  // If devicePath looks like an IP address, use network connection
  if (/^\d+\.\d+\.\d+\.\d+$/.test(devicePath)) {
    return testNetworkPrinterConnection(devicePath);
  }
  
  // Otherwise try serial connection (fallback)
  try {
    if (!escpos) escpos = require('escpos');
    require('escpos-serialport');
    
    const device = new escpos.SerialPort(devicePath, { 
      baudRate: 9600,
      autoOpen: false 
    });
    
    return new Promise((resolve) => {
      device.open((err) => {
        if (err) {
          resolve(false);
        } else {
          device.close();
          resolve(true);
        }
      });
    });
  } catch (err) {
    return false;
  }
}

async function checkPrinterStatus() {
  console.log('[PRINTER] Checking printer status...');
  
  // Check both old printerPath (for serial) and new printerIP (for network)
  const savedPath = store.get('printerPath', '');
  const savedIP = store.get('printerIP', '');
  let currentConnection = savedIP || savedPath; // Prefer network over serial
  
  console.log('[PRINTER] Saved connections - IP:', savedIP || 'none', ', Path:', savedPath || 'none');
  
  // Test saved connection first if available
  if (currentConnection) {
    console.log('[PRINTER] Testing saved connection:', currentConnection);
    const connected = await testPrinterConnection(currentConnection);
    
    if (connected) {
      // Saved connection works, update status and exit
      const wasConnected = printerConnected;
      printerConnected = true;
      
      console.log('[PRINTER] Saved connection SUCCESS');
      
      if (wasConnected !== true) {
        const win = BrowserWindow.getFocusedWindow();
        if (win) {
          console.log('[PRINTER] Notifying renderer of connection');
          win.webContents.send('printer-status-changed', true);
        }
      }
      return;
    } else {
      // Saved connection failed - IP probably changed, clear it and rescan
      console.log('[PRINTER] Saved connection FAILED - clearing and rescanning...');
      if (savedIP) {
        store.delete('printerIP');
        console.log('[PRINTER] Cleared old IP:', savedIP);
      }
      if (savedPath) {
        store.delete('printerPath');
        console.log('[PRINTER] Cleared old path:', savedPath);
      }
    }
  }
  
  // No saved connection OR saved connection failed - auto-detect
  console.log('[PRINTER] Starting fresh auto-detection...');
  currentConnection = await findEpsonThermalPrinter();
  
  if (currentConnection) {
    // Save new connection
    if (/^\d+\.\d+\.\d+\.\d+$/.test(currentConnection)) {
      store.set('printerIP', currentConnection);
      console.log('[PRINTER] Found and saved new IP:', currentConnection);
    } else {
      store.set('printerPath', currentConnection);
      console.log('[PRINTER] Found and saved new path:', currentConnection);
    }
    
    // Update status to connected
    const wasConnected = printerConnected;
    printerConnected = true;
    
    if (wasConnected !== true) {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        console.log('[PRINTER] Notifying renderer of new connection');
        win.webContents.send('printer-status-changed', true);
      }
    }
  } else {
    // No printer found at all
    console.log('[PRINTER] No printer found during rescan');
    const wasConnected = printerConnected;
    printerConnected = false;
    
    if (wasConnected !== false) {
      const win = BrowserWindow.getFocusedWindow();
      if (win) {
        console.log('[PRINTER] Notifying renderer of disconnection');
        win.webContents.send('printer-status-changed', false);
      }
    }
  }
}

function startPrinterAutoDetection(win) {
  // Clear any stale connection data on startup to force fresh detection
  console.log('[PRINTER] Starting auto-detection - clearing stale connection data');
  store.delete('printerIP');
  store.delete('printerPath');
  
  // Initial check
  checkPrinterStatus();
  
  // Check every 10 seconds (reduced frequency to avoid spam)
  printerCheckInterval = setInterval(checkPrinterStatus, 10000);
}

/* ---------------------------  Printing logic  --------------------------- */
async function connectPrinter() {
  console.log('[PRINTER] Attempting to connect for printing...');
  if (!escpos) escpos = require('escpos');
  
  // Check for network connection first (preferred for WiFi printers)
  const printerIP = store.get('printerIP', '');
  if (printerIP) {
    console.log('[PRINTER] Using network connection to IP:', printerIP);
    try {
      const networkAdapter = require('escpos-network');
      const device = new networkAdapter(printerIP, 9100);
      console.log('[PRINTER] Network printer device created successfully');
      const printer = new escpos.Printer(device, { encoding: 'GB18030' });
      return { printer, device };
    } catch (err) {
      console.error('[PRINTER] Failed to create network printer device:', err);
      throw err;
    }
  }
  
  // Fallback to serial connection
  const devicePath = store.get('printerPath', '');
  if (devicePath) {
    console.log('[PRINTER] Using serial connection to path:', devicePath);
    try {
      require('escpos-serialport');
      const device = new escpos.SerialPort(devicePath, { baudRate: 9600 });
      console.log('[PRINTER] Serial printer device created successfully');
      const printer = new escpos.Printer(device, { encoding: 'GB18030' });
      return { printer, device };
    } catch (err) {
      console.error('[PRINTER] Failed to create serial printer device:', err);
      throw err;
    }
  }
  
  console.error('[PRINTER] No printer configuration found');
  throw new Error('Printer not configured');
}

ipcMain.handle('print-ticket', async (_event, text) => {
  console.log('[PRINTER] Print request received:', text.length, 'characters');
  lastTicket = text;

  try {
    console.log('[PRINTER] Connecting to printer...');
    const { printer, device } = await connectPrinter();
    console.log('[PRINTER] Printer connected, preparing text...');
    
    const padded = text
      .split('\n')
      .map((l) => ' '.repeat(2) + l) // Just 2 spaces for small left margin
      .join('\n') + '\n\n\n'; // Add bottom margin with 3 line feeds

    console.log('[PRINTER] Opening device connection...');
    
    // For network printers, we need to open the device first
    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          console.error('[PRINTER] Failed to open device:', err);
          reject(err);
          return;
        }
        
        console.log('[PRINTER] Device opened, sending print job...');
        try {
          printer
            .align('LT')
            .style('NORMAL')
            .size(2, 2) // 40pt approx.
            .text(padded)
            .cut()
            .close(() => {
              console.log('[PRINTER] Print job completed successfully');
              resolve();
            });
        } catch (printErr) {
          console.error('[PRINTER] Print command failed:', printErr);
          reject(printErr);
        }
      });
    });
  } catch (err) {
    console.error('[PRINTER] Print failed:', err.message || err);
    console.error('[PRINTER] Full error details:', err);
  }
});

ipcMain.handle('reprint-last', async () => {
  if (!lastTicket) return;
  console.log('[PRINTER] Reprint request for last ticket');
  try {
    const { printer, device } = await connectPrinter();
    const padded = lastTicket
      .split('\n')
      .map((l) => ' '.repeat(2) + l) // Just 2 spaces for small left margin
      .join('\n') + '\n\n\n'; // Add bottom margin with 3 line feeds
    
    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          console.error('[PRINTER] Failed to open device for reprint:', err);
          reject(err);
          return;
        }
        
        console.log('[PRINTER] Device opened for reprint, sending...');
        try {
          printer.size(2, 2).text(padded).cut().close(() => {
            console.log('[PRINTER] Reprint completed successfully');
            resolve();
          });
        } catch (printErr) {
          console.error('[PRINTER] Reprint command failed:', printErr);
          reject(printErr);
        }
      });
    });
  } catch (err) {
    console.error('[PRINTER] Re-print failed:', err);
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

// dynamically resize the window height
ipcMain.handle('resize-window', (_event, height) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    const bounds = win.getBounds();
    win.setContentSize(bounds.width, Math.max(160, Math.min(height, 800)));
  }
});

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('save-settings', (_event, data) => {
  store.set(data);
});

ipcMain.handle('get-printer-status', () => {
  return printerConnected;
});

ipcMain.handle('refresh-printer-status', async () => {
  await checkPrinterStatus();
  return printerConnected;
});

ipcMain.handle('scan-network-printers', async () => {
  try {
    const possibleIPs = await scanForNetworkPrinters();
    const foundPrinters = [];
    
    for (const ip of possibleIPs) {
      if (await testNetworkPrinterConnection(ip)) {
        foundPrinters.push(ip);
      }
    }
    
    return foundPrinters;
  } catch (err) {
    console.error('Network scan failed:', err);
    return [];
  }
});

ipcMain.handle('set-printer-ip', (_event, ip) => {
  store.set('printerIP', ip);
  // Clear old serial path when setting IP
  store.delete('printerPath');
});