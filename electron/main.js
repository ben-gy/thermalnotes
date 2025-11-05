const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { SerialPort } = require('serialport');

const store = new Store();

// Store main window reference to avoid getFocusedWindow() issues
let mainWindow = null;

// Lazy-require escpos and noble only when needed
let escpos; // resolved at runtime
let noble; // resolved at runtime for Bluetooth
let lastTicket = '';
let lastAlignment = 'center';
let lastFontSize = 30;
let lastBold = false;
let lastUnderline = false;
let printerConnected = false;
let printerCheckInterval = null;
let rendererReady = false;
let retryCount = 0;
const MAX_RETRIES = 5;
let connectionType = null; // 'network', 'serial', or 'bluetooth'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 332, // Fixed width for our app
    height: 250, // Initial height (will be adjusted by content)
    minWidth: 332, // Prevent resizing narrower
    maxWidth: 332, // Prevent resizing wider
    minHeight: 160,
    resizable: false, // Prevent manual resizing
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Don't start auto-detection yet - wait for renderer-ready signal
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[PRINTER] Window finished loading, waiting for renderer ready signal...');
  });

  return mainWindow;
}

app.whenReady().then(() => {
  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          app.isPackaged
            ? // Production CSP - strict
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'"
            : // Development CSP - allows Vite dev server
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173; style-src 'self' 'unsafe-inline' http://localhost:5173; img-src 'self' data: http://localhost:5173; font-src 'self' data: http://localhost:5173; connect-src 'self' http://localhost:5173 ws://localhost:5173"
        ]
      }
    });
  });

  createWindow();

  // Clear HP printer if it was saved (10.0.0.8)
  const savedIP = store.get('printerIP', '');
  if (savedIP === '10.0.0.8') {
    console.log('[PRINTER] Clearing HP printer (10.0.0.8) from settings...');
    store.delete('printerIP');
    store.delete('printerPath');
  }

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
async function scanForNetworkPrinter() {
  console.log('[NETWORK] Starting network printer scan...');

  const possibleIPs = await scanForNetworkPrinters();
  console.log(`[NETWORK] Testing ${possibleIPs.length} IPs in parallel...`);

  // Test all IPs in parallel with larger batches for much faster scanning
  const batchSize = 50; // Scan 50 IPs at once for speed
  const batches = [];

  // Split IPs into batches
  for (let i = 0; i < possibleIPs.length; i += batchSize) {
    batches.push(possibleIPs.slice(i, i + batchSize));
  }

  // Collect ALL found printers, don't stop at first one
  const foundPrinters = [];

  // Test each batch in parallel
  let testedCount = 0;
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];

    // Test all IPs in this batch simultaneously
    const results = await Promise.allSettled(
      batch.map(async (ip) => {
        const connected = await testNetworkPrinterConnection(ip);
        return { ip, connected };
      })
    );

    testedCount += batch.length;
    // Only log progress every 10% to reduce noise
    if (batchIndex % Math.ceil(batches.length / 10) === 0 || batchIndex === batches.length - 1) {
      console.log(`[NETWORK] Scan progress: ${Math.round((testedCount / possibleIPs.length) * 100)}%`);
    }

    // Collect all successful connections
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.connected) {
        const foundIP = result.value.ip;
        console.log('[NETWORK] ✓ Found printer at IP:', foundIP);
        foundPrinters.push(foundIP);
      }
    }
  }

  if (foundPrinters.length === 0) {
    console.log('[NETWORK] No network printers found');
    return null;
  }

  // If multiple printers found, prefer higher IP (likely the TM printer vs other devices)
  // Also prioritize IPs in the 10-30 range which are more likely to be printers
  foundPrinters.sort((a, b) => {
    const aNum = parseInt(a.split('.').pop());
    const bNum = parseInt(b.split('.').pop());

    // Prefer IPs in 10-30 range (common for printers)
    const aInPrinterRange = aNum >= 10 && aNum <= 30;
    const bInPrinterRange = bNum >= 10 && bNum <= 30;

    if (aInPrinterRange && !bInPrinterRange) return -1;
    if (!aInPrinterRange && bInPrinterRange) return 1;

    // Otherwise prefer higher IP
    return bNum - aNum;
  });

  const selectedIP = foundPrinters[0];
  console.log(`[NETWORK] Found ${foundPrinters.length} printer(s):`, foundPrinters);
  console.log('[NETWORK] ✓ Selected Epson printer at IP:', selectedIP);
  store.set('printerIP', selectedIP);
  return selectedIP;
}

async function findEpsonThermalPrinter() {
  console.log('[PRINTER] Starting auto-detection (WiFi + Bluetooth)...');
  try {
    // First check if we have saved connections
    const savedIP = store.get('printerIP', '');
    const savedBTId = store.get('bluetoothDeviceId', '');
    const savedType = store.get('connectionType', 'network');

    console.log('[PRINTER] Saved connection - Type:', savedType, 'IP:', savedIP || 'none', 'BT:', savedBTId || 'none');

    // Test saved connection first based on type
    if (savedType === 'network' && savedIP) {
      console.log('[PRINTER] Testing saved network connection:', savedIP);
      if (await testNetworkPrinterConnection(savedIP)) {
        console.log('[PRINTER] Saved network connection working:', savedIP);
        connectionType = 'network';
        return savedIP;
      } else {
        console.log('[PRINTER] Saved network connection failed');
      }
    } else if (savedType === 'bluetooth' && savedBTId) {
      console.log('[PRINTER] Testing saved Bluetooth connection');
      if (await testBluetoothConnection()) {
        console.log('[PRINTER] Saved Bluetooth connection working');
        connectionType = 'bluetooth';
        return savedBTId;
      } else {
        console.log('[PRINTER] Saved Bluetooth connection failed');
      }
    }

    // Notify UI that scanning has started
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('printer-scanning-changed', true);
    }

    console.log('[PRINTER] Starting simultaneous WiFi + Bluetooth scan...');

    // Scan WiFi and Bluetooth simultaneously
    const [networkResult, bluetoothResult] = await Promise.allSettled([
      scanForNetworkPrinter(),
      findBluetoothPrinter()
    ]);

    // Check network result
    if (networkResult.status === 'fulfilled' && networkResult.value) {
      console.log('[PRINTER] ✓ Found network printer:', networkResult.value);
      connectionType = 'network';
      store.set('connectionType', connectionType);

      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('printer-scanning-changed', false);
      }

      return networkResult.value;
    }

    // Check Bluetooth result
    if (bluetoothResult.status === 'fulfilled' && bluetoothResult.value) {
      console.log('[PRINTER] ✓ Found Bluetooth printer:', bluetoothResult.value.name);
      connectionType = 'bluetooth';
      store.set('connectionType', connectionType);

      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('printer-scanning-changed', false);
      }

      return bluetoothResult.value.id;
    }

    console.log('[PRINTER] No printers found during WiFi or Bluetooth scan');

    // Notify UI that scanning has finished
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('printer-scanning-changed', false);
    }

    return null;
  } catch (err) {
    console.error('[PRINTER] Error finding printer:', err);

    // Notify UI that scanning has finished (even on error)
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('printer-scanning-changed', false);
    }

    return null;
  }
}

async function scanForNetworkPrinters(fullScan = false) {
  console.log('[PRINTER] Scanning for network printers...', fullScan ? '(FULL SCAN)' : '(QUICK SCAN)');
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
        
        if (fullScan) {
          // Full subnet scan (2-254, excluding network and broadcast)
          console.log(`[PRINTER] Full scan enabled for network ${networkBase}.x`);
          for (let i = 2; i <= 254; i++) {
            ips.push(`${networkBase}.${i}`);
          }
        } else {
          // Comprehensive IP ranges - scan lower range (1-99) thoroughly
          const commonPrinterIPs = [];

          // 1-50 range (DHCP often assigns here, includes most home/office devices)
          for (let i = 1; i <= 50; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // 50-100 range (common for static assignments)
          for (let i = 51; i <= 100; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // 101-120 range (very common for printers)
          for (let i = 101; i <= 120; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // Spot check 150-170 range
          for (let i = 150; i <= 170; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // 180-200 range (common for network devices)
          for (let i = 180; i <= 200; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // 220-240 range (common printer range)
          for (let i = 220; i <= 240; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          // High range (often for static assignments)
          for (let i = 250; i <= 254; i++) {
            commonPrinterIPs.push(`${networkBase}.${i}`);
          }

          console.log(`[PRINTER] Adding IPs for network ${networkBase}.x:`, commonPrinterIPs.length, 'addresses');
          ips.push(...commonPrinterIPs);
        }
      }
    }
  }
  
  const uniqueIPs = [...new Set(ips)]; // Remove duplicates
  console.log('[PRINTER] Total unique IPs to scan:', uniqueIPs.length);
  return uniqueIPs;
}

async function testNetworkPrinterConnection(ip) {
  try {
    if (!escpos) escpos = require('escpos');
    const networkAdapter = require('escpos-network');

    const device = new networkAdapter(ip, 9100); // Port 9100 is standard for EPSON

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(false);
      }, 1000); // Increased timeout for status query

      device.open((err) => {
        clearTimeout(timeout);
        if (err) {
          // Only log actual errors, not timeouts/unreachable hosts to reduce noise
          if (err.code !== 'EHOSTDOWN' && err.code !== 'EHOSTUNREACH' && err.code !== 'ETIMEDOUT') {
            console.log(`[PRINTER] Failed to connect to ${ip}:9100 -`, err.code || err.message);
          }
          resolve(false);
        } else {
          // Connected to port 9100 - now verify it's an Epson printer
          console.log(`[PRINTER] Connected to ${ip}:9100, checking printer model...`);

          const printer = new escpos.Printer(device, { encoding: 'GB18030' });

          // Request printer status to verify it's an Epson
          // ESC/POS command: DLE EOT n (0x10 0x04 0x01) requests printer status
          device.write(Buffer.from([0x10, 0x04, 0x01]), (writeErr) => {
            if (writeErr) {
              console.log(`[PRINTER] ${ip} - Failed to query printer model`);
              device.close();
              resolve(false);
              return;
            }

            // Try to read response
            const readTimeout = setTimeout(() => {
              console.log(`[PRINTER] ${ip} - No response from printer (likely not an Epson)`);
              device.close();
              resolve(false);
            }, 500);

            device.read((readErr, data) => {
              clearTimeout(readTimeout);
              device.close();

              if (readErr || !data) {
                // If no data or error, assume it's Epson (some printers don't respond to status)
                // This is a fallback - port 9100 is primarily used by Epson/ESC/POS printers
                console.log(`[PRINTER] ${ip} - Assuming Epson printer (port 9100 open)`);
                resolve(true);
              } else {
                // Got a response - if it responds to ESC/POS commands, it's likely compatible
                console.log(`[PRINTER] ${ip} - Printer responded to ESC/POS query, accepting as compatible`);
                resolve(true);
              }
            });
          });
        }
      });
    });
  } catch (err) {
    console.log(`[PRINTER] Exception testing ${ip}:`, err.message || err);
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
        if (mainWindow && mainWindow.webContents) {
          console.log('[PRINTER] Notifying renderer of connection');
          mainWindow.webContents.send('printer-status-changed', { connected: true, type: connectionType });
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
      if (mainWindow && mainWindow.webContents) {
        console.log('[PRINTER] Notifying renderer of new connection');
        mainWindow.webContents.send('printer-status-changed', { connected: true, type: connectionType });
      }
    }
  } else {
    // No printer found at all
    console.log('[PRINTER] No printer found during rescan');
    const wasConnected = printerConnected;
    printerConnected = false;

    if (wasConnected !== false) {
      if (mainWindow && mainWindow.webContents) {
        console.log('[PRINTER] Notifying renderer of disconnection');
        mainWindow.webContents.send('printer-status-changed', { connected: false, type: null });
      }
    }
  }
}

async function startPrinterAutoDetection() {
  console.log('[PRINTER] Starting auto-detection...');

  // Try saved connection first - don't clear on startup
  const savedIP = store.get('printerIP', '');
  const savedType = store.get('connectionType', 'network');
  connectionType = savedType;

  if (savedIP) {
    console.log('[PRINTER] Will test saved IP first:', savedIP);
  } else {
    console.log('[PRINTER] No saved IP found, will scan network and Bluetooth');
  }

  // Initial check with retry logic
  await checkPrinterStatusWithRetry();

  // Check every 30 seconds (less frequent since we're remembering IPs)
  printerCheckInterval = setInterval(checkPrinterStatus, 30000);
}

async function checkPrinterStatusWithRetry() {
  retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    console.log(`[PRINTER] Check attempt ${retryCount + 1}/${MAX_RETRIES}`);

    await checkPrinterStatus();

    if (printerConnected) {
      console.log('[PRINTER] Printer connected successfully, stopping retries');
      retryCount = 0;
      return;
    }

    retryCount++;

    if (retryCount < MAX_RETRIES) {
      // Exponential backoff: 2s, 4s, 8s, 16s
      const delay = Math.min(2000 * Math.pow(2, retryCount - 1), 16000);
      console.log(`[PRINTER] Retry ${retryCount} failed, waiting ${delay}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  console.log('[PRINTER] Max retries reached, no printer found');
  retryCount = 0;
}

/* ---------------------------  Bluetooth Discovery  --------------------------- */
async function findBluetoothPrinter() {
  console.log('[BLUETOOTH] Starting Bluetooth printer discovery...');

  try {
    if (!noble) {
      noble = require('@abandonware/noble');
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.log('[BLUETOOTH] Scan timeout reached');
        if (noble.state === 'poweredOn') {
          noble.stopScanning();
        }
        resolve(null);
      }, 10000); // 10 second scan timeout

      const foundDevices = [];

      noble.on('stateChange', async (state) => {
        console.log('[BLUETOOTH] State changed to:', state);
        if (state === 'poweredOn') {
          console.log('[BLUETOOTH] Starting scan...');
          // Scan for all devices - we'll filter by name
          noble.startScanning([], false);
        } else {
          console.log('[BLUETOOTH] Bluetooth not powered on, stopping scan');
          clearTimeout(timeout);
          resolve(null);
        }
      });

      noble.on('discover', async (peripheral) => {
        const deviceName = peripheral.advertisement.localName || 'Unknown';

        // Look for Epson printers - common naming patterns
        if (deviceName.toLowerCase().includes('epson') ||
            deviceName.toLowerCase().includes('tm-m30') ||
            deviceName.toLowerCase().includes('tm-') ||
            deviceName.toLowerCase().includes('tm30')) {

          console.log('[BLUETOOTH] Found potential Epson printer:', deviceName, 'ID:', peripheral.id);

          // Stop scanning once we find a printer
          noble.stopScanning();
          clearTimeout(timeout);

          // Try to connect and verify it's a printer
          try {
            console.log('[BLUETOOTH] Attempting to connect to:', deviceName);
            await connectBluetoothPrinter(peripheral);

            // Save Bluetooth device info
            store.set('bluetoothDeviceId', peripheral.id);
            store.set('bluetoothDeviceName', deviceName);
            connectionType = 'bluetooth';
            store.set('connectionType', connectionType);

            console.log('[BLUETOOTH] Successfully connected to:', deviceName);
            resolve({ id: peripheral.id, name: deviceName, peripheral });
          } catch (err) {
            console.error('[BLUETOOTH] Failed to connect to:', deviceName, err);
            resolve(null);
          }
        }
      });

      // If noble is already powered on, start scanning immediately
      if (noble.state === 'poweredOn') {
        console.log('[BLUETOOTH] Bluetooth already powered on, starting scan...');
        noble.startScanning([], false);
      }
    });
  } catch (err) {
    console.error('[BLUETOOTH] Error during Bluetooth discovery:', err);
    return null;
  }
}

async function connectBluetoothPrinter(peripheral) {
  return new Promise((resolve, reject) => {
    peripheral.connect((err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('[BLUETOOTH] Connected to peripheral:', peripheral.advertisement.localName);

      // For now, just verify connection and disconnect
      // In the actual print function, we'll connect when needed
      peripheral.disconnect((disconnectErr) => {
        if (disconnectErr) {
          console.error('[BLUETOOTH] Error disconnecting:', disconnectErr);
        }
        resolve();
      });
    });
  });
}

async function testBluetoothConnection() {
  const savedDeviceId = store.get('bluetoothDeviceId', '');
  const savedDeviceName = store.get('bluetoothDeviceName', '');

  if (!savedDeviceId) {
    return false;
  }

  console.log('[BLUETOOTH] Testing saved Bluetooth connection:', savedDeviceName);

  try {
    if (!noble) {
      noble = require('@abandonware/noble');
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (noble.state === 'poweredOn') {
          noble.stopScanning();
        }
        resolve(false);
      }, 5000); // 5 second timeout

      noble.on('stateChange', (state) => {
        if (state === 'poweredOn') {
          noble.startScanning([], false);
        } else {
          clearTimeout(timeout);
          resolve(false);
        }
      });

      noble.on('discover', async (peripheral) => {
        if (peripheral.id === savedDeviceId) {
          console.log('[BLUETOOTH] Found saved device:', savedDeviceName);
          noble.stopScanning();
          clearTimeout(timeout);

          try {
            await connectBluetoothPrinter(peripheral);
            connectionType = 'bluetooth';
            resolve(true);
          } catch (err) {
            console.error('[BLUETOOTH] Failed to connect to saved device:', err);
            resolve(false);
          }
        }
      });

      if (noble.state === 'poweredOn') {
        noble.startScanning([], false);
      }
    });
  } catch (err) {
    console.error('[BLUETOOTH] Error testing Bluetooth connection:', err);
    return false;
  }
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

ipcMain.handle('print-ticket', async (_event, text, alignment = 'center', fontSize = 30, isBold = false, isUnderline = false) => {
  console.log('[PRINTER] Print request received:', text.length, 'characters, align:', alignment, 'fontSize:', fontSize, 'bold:', isBold, 'underline:', isUnderline);
  lastTicket = text;
  lastAlignment = alignment; // Store for reprint
  lastFontSize = fontSize; // Store for reprint
  lastBold = isBold; // Store for reprint
  lastUnderline = isUnderline; // Store for reprint

  try {
    console.log('[PRINTER] Connecting to printer...');
    const { printer, device } = await connectPrinter();
    console.log('[PRINTER] Printer connected, preparing text...');
    
    const padded = text + '\n\n\n'; // Remove indent, just add bottom margin

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
          // Convert alignment to escpos format
          let alignCode = 'CT'; // center by default
          if (alignment === 'left') alignCode = 'LT';
          else if (alignment === 'right') alignCode = 'RT';
          
          // Convert font size to escpos size multiplier
          let sizeMultiplier = 1; // default
          if (fontSize >= 40) sizeMultiplier = 3;      // Large (40pt)
          else if (fontSize >= 28) sizeMultiplier = 2; // Medium (28pt)
          else sizeMultiplier = 1;                      // Small (20pt)
          
          console.log('[PRINTER] Using size multiplier:', sizeMultiplier, 'for fontSize:', fontSize);
          
          // Apply styles
          printer.align(alignCode);
          
          // Apply bold if needed
          if (isBold) {
            printer.style('B');
          } else {
            printer.style('NORMAL');
          }
          
          // Apply underline if needed
          if (isUnderline) {
            printer.underline(true);
          }
          
          printer
            .size(sizeMultiplier, sizeMultiplier)
            .text(padded);
            
          // Reset underline after text
          if (isUnderline) {
            printer.underline(false);
          }
            
          printer
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
    const padded = lastTicket + '\n\n\n'; // Remove indent, just add bottom margin
    
    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          console.error('[PRINTER] Failed to open device for reprint:', err);
          reject(err);
          return;
        }
        
        console.log('[PRINTER] Device opened for reprint, sending...');
        try {
          // Convert alignment to escpos format
          let alignCode = 'CT'; // center by default
          if (lastAlignment === 'left') alignCode = 'LT';
          else if (lastAlignment === 'right') alignCode = 'RT';
          
          // Convert font size to escpos size multiplier
          let sizeMultiplier = 1; // default
          if (lastFontSize >= 40) sizeMultiplier = 3;      // Large (40pt)
          else if (lastFontSize >= 28) sizeMultiplier = 2; // Medium (28pt)
          else sizeMultiplier = 1;                          // Small (20pt)
          
          console.log('[PRINTER] Reprint using size multiplier:', sizeMultiplier, 'for fontSize:', lastFontSize);
          
          // Apply styles
          printer.align(alignCode);
          
          // Apply bold if needed
          if (lastBold) {
            printer.style('B');
          } else {
            printer.style('NORMAL');
          }
          
          // Apply underline if needed
          if (lastUnderline) {
            printer.underline(true);
          }
          
          printer
            .size(sizeMultiplier, sizeMultiplier)
            .text(padded);
            
          // Reset underline after text
          if (lastUnderline) {
            printer.underline(false);
          }
            
          printer
            .cut()
            .close(() => {
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
ipcMain.handle('resize-window', (_event, height, width) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    // Use provided width if given, otherwise use window width of 332px
    const newWidth = width || 332;
    win.setContentSize(newWidth, Math.max(160, Math.min(height, 800)));
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

// Clear stored printer and force rescan
ipcMain.handle('clear-printer-and-rescan', async () => {
  console.log('[PRINTER] Clearing stored printer and forcing rescan...');
  store.delete('printerIP');
  store.delete('printerPath');
  printerConnected = false;
  currentConnection = null;

  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('printer-status-changed', { connected: false, type: null });
  }

  await checkPrinterStatusWithRetry();
  return { connected: printerConnected, type: connectionType };
});

ipcMain.handle('scan-network-printers', async (_event, fullScan = false) => {
  try {
    // When user manually scans, clear saved connections to force fresh detection
    console.log('[PRINTER] Manual scan requested - clearing saved connections');
    store.delete('printerIP');
    store.delete('printerPath');
    
    const possibleIPs = await scanForNetworkPrinters(fullScan);
    const foundPrinters = [];
    
    // Use the same batching approach as findEpsonThermalPrinter
    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < possibleIPs.length; i += batchSize) {
      batches.push(possibleIPs.slice(i, i + batchSize));
    }
    
    let testedCount = 0;
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      
      const results = await Promise.allSettled(
        batch.map(async (ip) => {
          const connected = await testNetworkPrinterConnection(ip);
          return { ip, connected };
        })
      );
      
      testedCount += batch.length;
      // Only log progress updates to reduce noise
      if (batchIndex % Math.ceil(batches.length / 5) === 0 || batchIndex === batches.length - 1) {
        console.log(`[PRINTER] Manual scan progress: ${Math.round((testedCount / possibleIPs.length) * 100)}%`);
      }
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.connected) {
          foundPrinters.push(result.value.ip);
        }
      }
    }
    
    console.log(`[PRINTER] Manual scan complete. Found ${foundPrinters.length} printer(s)`);
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

ipcMain.handle('test-printer-ip', async (_event, ip) => {
  console.log('[PRINTER] Testing specific IP:', ip);
  try {
    const connected = await testNetworkPrinterConnection(ip);
    if (connected) {
      console.log('[PRINTER] Successfully connected to printer at:', ip);
      store.set('printerIP', ip);
      store.delete('printerPath');
      connectionType = 'network';
      store.set('connectionType', connectionType);
      // Update printer status
      printerConnected = true;
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('printer-status-changed', { connected: true, type: connectionType });
      }
    }
    return connected;
  } catch (err) {
    console.error('[PRINTER] Error testing IP:', ip, err);
    return false;
  }
});

// Renderer ready signal - start auto-detection when renderer is fully loaded
ipcMain.handle('renderer-ready', async () => {
  console.log('[PRINTER] Renderer ready signal received, starting auto-detection...');
  rendererReady = true;

  // Start auto-detection now that renderer is ready to receive events
  await startPrinterAutoDetection();

  return { connected: printerConnected, type: connectionType };
});

// Print image handler - for advanced mode pixel-based printing
ipcMain.handle('print-image', async (_event, imageDataUrl, width, height) => {
  console.log('[PRINTER] Image print request received:', width, 'x', height);

  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Create temp file path
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `thermal-print-${Date.now()}.png`);

  try {
    const { printer, device } = await connectPrinter();
    console.log('[PRINTER] Printer connected, preparing image...');

    // Convert data URL to buffer
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Save to temporary file
    console.log('[PRINTER] Saving image to temp file:', tempFilePath);
    fs.writeFileSync(tempFilePath, imageBuffer);

    console.log('[PRINTER] Opening device connection...');

    return new Promise((resolve, reject) => {
      device.open((err) => {
        if (err) {
          console.error('[PRINTER] Failed to open device:', err);
          // Clean up temp file
          try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
          reject(err);
          return;
        }

        console.log('[PRINTER] Device opened, loading image...');
        console.log('[PRINTER] Temp file path:', tempFilePath);
        console.log('[PRINTER] Image dimensions:', width, 'x', height);

        try {
          // Use ESC/POS image printing
          const Image = require('escpos').Image;
          console.log('[PRINTER] escpos.Image class loaded:', typeof Image);

          // Load image from file path with explicit MIME type
          // Note: Image.load() uses single-parameter callback (image), not error-first (err, image)
          console.log('[PRINTER] Calling Image.load()...');
          Image.load(tempFilePath, 'image/png', (image) => {
            console.log('[PRINTER] ===== Image.load() callback invoked =====');
            console.log('[PRINTER] Callback received parameter type:', typeof image);
            console.log('[PRINTER] Parameter constructor:', image ? image.constructor.name : 'null');

            if (image && image.pixels) {
              console.log('[PRINTER] Image has pixels property');
              console.log('[PRINTER] Pixels shape:', image.pixels.shape);
              console.log('[PRINTER] Image data length:', image.data ? image.data.length : 'no data');
            } else {
              console.error('[PRINTER] WARNING: Image object missing expected properties!');
              console.log('[PRINTER] Image keys:', image ? Object.keys(image) : 'null');
            }

            console.log('[PRINTER] Attempting to print image...');

            // Print the image
            printer
              .align('CT') // Center align
              .image(image, 'd24') // d24 = double density, 24-bit (highest quality)
              .then(() => {
                console.log('[PRINTER] ===== Image print command succeeded =====');
                console.log('[PRINTER] Adding spacing and cutting...');
                printer
                  .feed(3) // Add spacing after image
                  .cut()
                  .close(() => {
                    console.log('[PRINTER] ===== Image print job completed successfully =====');
                    // Clean up temp file
                    try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
                    resolve();
                  });
              })
              .catch((printErr) => {
                console.error('[PRINTER] ===== Print command failed =====');
                console.error('[PRINTER] Error type:', typeof printErr);
                console.error('[PRINTER] Error constructor:', printErr ? printErr.constructor.name : 'null');
                console.error('[PRINTER] Error message:', printErr ? printErr.message : 'no message');
                console.error('[PRINTER] Error stack:', printErr ? printErr.stack : 'no stack');
                console.error('[PRINTER] Full error object:', JSON.stringify(printErr, null, 2));
                device.close();
                // Clean up temp file
                try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
                reject(printErr);
              });
          });
        } catch (printErr) {
          console.error('[PRINTER] ===== Image loading failed (synchronous error) =====');
          console.error('[PRINTER] Error:', printErr);
          console.error('[PRINTER] Stack:', printErr.stack);
          device.close();
          // Clean up temp file
          try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
          reject(printErr);
        }
      });
    });
  } catch (err) {
    console.error('[PRINTER] Image print failed:', err.message || err);
    console.error('[PRINTER] Full error details:', err);
    // Clean up temp file
    try { fs.unlinkSync(tempFilePath); } catch (e) { /* ignore */ }
    throw err;
  }
});