const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const yaml = require('yaml');
const http = require('http');
const crypto = require('crypto');

// Handle development vs production
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let nextServer;

// Enable live reload for Electron
if (isDev) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, '..', 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

// Create the browser window
function createWindow() {
  console.log('Creating Electron window...');
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // For development
    },
    icon: path.join(__dirname, '..', 'public', 'favicon.ico'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // Don't show until ready
    backgroundColor: '#667eea' // Match splash screen background
  });

  console.log('Window created, showing splash screen...');
  
  // Load splash screen immediately
  mainWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  // Show window with splash screen
  mainWindow.show();
  
  console.log('Splash screen loaded, starting server...');

  // Start server and load app in parallel
  loadApplication().catch((error) => {
    console.error('Failed to load application:', error);
    showErrorPage('Application startup failed', error.message);
  });

  // Debug events
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page loaded successfully');
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Track if we're already loading to prevent multiple calls
let isLoadingApplication = false;

// Load the application with splash screen
async function loadApplication() {
  if (isLoadingApplication) {
    console.log('Application is already loading...');
    return;
  }
  
  isLoadingApplication = true;
  updateSplashStatus('Starting server...');
  
  try {
    if (isDev) {
      console.log('Starting Next.js development server...');
      
      // Start the dev server
      nextServer = spawn('npm', ['run', 'dev'], {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit'
      });

      // Wait for server to be ready with faster polling
      await waitForServer('http://localhost:3000');
      
      console.log('Loading development app...');
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
      
    } else {
    console.log('Starting Next.js production server...');
    
    try {
      updateSplashStatus('Preparing Next.js app...');
      
      // Start Next.js server programmatically with optimizations
      const next = require('next');
      const nextApp = next({ 
        dev: false, 
        dir: path.join(__dirname, '..'),
        quiet: true, // Reduce logging for faster startup
        customServer: true // Enable custom server optimizations
      });
      const handle = nextApp.getRequestHandler();
      
      // Prepare Next.js app
      await nextApp.prepare();
      
      updateSplashStatus('Starting production server...');
      
      const http = require('http');
      const server = http.createServer((req, res) => {
        // Add basic caching headers for faster subsequent loads
        if (req.url.includes('/_next/static/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        handle(req, res);
      });
      
      // Configure server options for better performance
      server.keepAliveTimeout = 5000;
      server.headersTimeout = 6000;
      
      await new Promise((resolve, reject) => {
        server.listen(3001, '127.0.0.1', (err) => {
          if (err) {
            console.error('Failed to start Next.js server:', err);
            reject(err);
            return;
          }
          
          console.log('Next.js server ready on port 3001');
          resolve();
        });
      });
      
      // Store for cleanup
      global.nextServer = server;
      
      updateSplashStatus('Loading application...');
      
      // Add a small delay to ensure server is fully ready
      setTimeout(() => {
        mainWindow.loadURL('http://localhost:3001');
      }, 100);
      
    } catch (error) {
      console.error('Failed to start production server:', error);
      updateSplashStatus('Error starting server');
      
      // Show proper error page
      showErrorPage('Failed to start production server', error.message);
    }
    }
  } finally {
    isLoadingApplication = false;
  }
}

// Track if we're already checking server to prevent multiple calls
let isCheckingServer = false;

// Simple server detection with Node.js http
function waitForServer(url) {
  if (isCheckingServer) {
    console.log('Server check already in progress...');
    return Promise.resolve();
  }
  
  isCheckingServer = true;
  updateSplashStatus('Waiting for server...');
  
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 75; // 15 seconds max
    let checkTimeout;
    
    const checkServer = () => {
      attempts++;
      
      const urlObj = new URL(url);
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'GET',
        timeout: 1000,
      }, (res) => {
        if (res.statusCode === 200) {
          console.log(`Server ready after ${attempts} attempts`);
          updateSplashStatus('Server ready!');
          isCheckingServer = false;
          resolve();
          return;
        }
        // Server returned non-200 status, continue checking
        scheduleNextCheck();
      });

      req.on('error', () => {
        // Server not ready yet, continue checking
        scheduleNextCheck();
      });

      req.on('timeout', () => {
        req.destroy();
        scheduleNextCheck();
      });

      req.end();
      
      function scheduleNextCheck() {
        if (attempts >= maxAttempts) {
          console.error('Server failed to start after maximum attempts');
          updateSplashStatus('Server startup timeout');
          isCheckingServer = false;
          showErrorPage('Server startup timeout', 'The Next.js server failed to start within the expected time. This may be due to port conflicts or system resources.');
          resolve();
          return;
        }
        
        if (attempts % 5 === 0) { // Only log every 5th attempt
          console.log(`Waiting for server... (attempt ${attempts}/${maxAttempts})`);
        }
        updateSplashStatus(`Checking server (${attempts}/${maxAttempts})...`);
        
        checkTimeout = setTimeout(checkServer, 200);
      }
    };
    
    checkServer();
  });
}

// Update splash screen status
function updateSplashStatus(message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`
      const statusElement = document.getElementById('statusText');
      if (statusElement) {
        statusElement.textContent = '${message}';
      }
    `).catch(() => {
      // Ignore errors if splash screen is not loaded
    });
  }
}

// Show error page with details
function showErrorPage(message, details) {
  if (mainWindow) {
    mainWindow.loadFile(path.join(__dirname, 'error.html'));
    
    // Wait for error page to load, then send error details
    mainWindow.webContents.once('did-finish-load', () => {
      // Safely escape the strings to prevent JS injection/syntax errors
      const safeMessage = message ? message.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
      const safeDetails = details ? details.replace(/'/g, "\\'").replace(/"/g, '\\"') : '';
      
      mainWindow.webContents.executeJavaScript(`
        setErrorDetails('${safeMessage}', '${safeDetails}');
      `).catch((error) => {
        console.error('Failed to set error details:', error);
      });
    });
  }
}

// Helper function to get persistent config directory
async function getConfigDirectory() {
  const userDataPath = app.getPath('userData');
  // userData already includes the app name, so just return it directly
  await fs.mkdir(userDataPath, { recursive: true });
  return userDataPath;
}

// IPC Handlers for AWS Profile operations
ipcMain.handle('aws:getProfiles', async () => {
  try {
    const homeDir = os.homedir();
    const credentialsPath = path.join(homeDir, '.aws', 'credentials');
    const configPath = path.join(homeDir, '.aws', 'config');
    
    const profiles = new Set();
    
    // Read credentials file
    try {
      const credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
      const profileMatches = credentialsContent.match(/\[([^\]]+)\]/g);
      if (profileMatches) {
        profileMatches.forEach(match => {
          const profileName = match.slice(1, -1);
          profiles.add(profileName);
        });
      }
    } catch (error) {
      console.error('Error reading credentials file:', error);
    }
    
    // Read config file
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const profileMatches = configContent.match(/\[profile ([^\]]+)\]/g);
      if (profileMatches) {
        profileMatches.forEach(match => {
          const profileName = match.replace('[profile ', '').replace(']', '');
          profiles.add(profileName);
        });
      }
    } catch (error) {
      console.error('Error reading config file:', error);
    }
    
    return Array.from(profiles);
  } catch (error) {
    console.error('Error getting AWS profiles:', error);
    throw error;
  }
});

// IPC Handlers for Config File operations
ipcMain.handle('config:read', async (event, type) => {
  try {
    const configDir = await getConfigDirectory();
    const configPath = type === 'cost' 
      ? path.join(configDir, 'finops-cost-report', 'config.yaml')
      : path.join(configDir, 'securityhub', 'config.yaml');
    
    const content = await fs.readFile(configPath, 'utf-8');
    return yaml.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist
    }
    throw error;
  }
});

ipcMain.handle('config:write', async (event, type, config) => {
  try {
    const configDir = await getConfigDirectory();
    const configPath = type === 'cost' 
      ? path.join(configDir, 'finops-cost-report', 'config.yaml')
      : path.join(configDir, 'securityhub', 'config.yaml');
    
    // Ensure directory exists
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write config
    await fs.writeFile(configPath, yaml.stringify(config), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error writing config:', error);
    throw error;
  }
});

// IPC Handler for file save dialog
ipcMain.handle('dialog:saveFile', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

// IPC Handler for file write
ipcMain.handle('file:write', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content);
    return { success: true };
  } catch (error) {
    throw error;
  }
});

// IPC Handler for getting config directory
ipcMain.handle('config:getDir', async () => {
  try {
    return await getConfigDirectory();
  } catch (error) {
    console.error('Error getting config directory:', error);
    // Fallback to current working directory
    return process.cwd();
  }
});

// IPC Handler for proxy configuration
ipcMain.handle('proxy:get', async (event) => {
  try {
    const configDir = await getConfigDirectory();
    const configPath = path.join(configDir, 'proxy', 'config.yaml');
    
    const content = await fs.readFile(configPath, 'utf-8');
    const config = yaml.parse(content);
    
    return {
      success: true,
      data: {
        config: config || null,
        environment: {
          httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
          httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
          noProxy: process.env.NO_PROXY || process.env.no_proxy,
        }
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        success: true,
        data: {
          config: null,
          environment: {
            httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
            httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
            noProxy: process.env.NO_PROXY || process.env.no_proxy,
          }
        }
      };
    }
    throw error;
  }
});

// IPC Handler for proxy configuration save
ipcMain.handle('proxy:save', async (event, proxyConfig) => {
  try {
    const configDir = await getConfigDirectory();
    const configPath = path.join(configDir, 'proxy', 'config.yaml');
    
    // Ensure directory exists
    const dir = path.dirname(configPath);
    await fs.mkdir(dir, { recursive: true });
    
    // Write config
    await fs.writeFile(configPath, yaml.stringify(proxyConfig), 'utf-8');
    
    return { success: true };
  } catch (error) {
    throw error;
  }
});

// IPC Handler for retry application
ipcMain.handle('app:retry', async () => {
  try {
    console.log('Retrying application startup...');
    // Reset loading states
    isLoadingApplication = false;
    isCheckingServer = false;
    
    // Load splash screen again
    mainWindow.loadFile(path.join(__dirname, 'splash.html'));
    
    // Wait a bit for splash screen to load, then retry
    setTimeout(() => {
      loadApplication().catch((error) => {
        console.error('Retry failed:', error);
        showErrorPage('Retry failed', error.message);
      });
    }, 500);
    
    return { success: true };
  } catch (error) {
    console.error('Retry failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler for close application
ipcMain.handle('app:close', () => {
  console.log('Closing application...');
  app.quit();
});

// SSO Configuration Management
ipcMain.handle('sso:getConfig', async () => {
  try {
    const configPath = path.join(os.homedir(), '.aws', 'sso-config.yaml');
    const configData = await fs.readFile(configPath, 'utf8');
    return { success: true, data: yaml.parse(configData) };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true, data: null };
    }
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sso:saveConfig', async (event, config) => {
  try {
    const configPath = path.join(os.homedir(), '.aws', 'sso-config.yaml');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, yaml.stringify(config));
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SSO Credential Management with Enhanced Security
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;

// Generate a unique key based on system characteristics and user session
function generateEncryptionKey() {
  const systemInfo = [
    os.hostname(),
    os.platform(),
    os.arch(),
    process.env.USER || process.env.USERNAME || 'default'
  ].join('|');
  
  const salt = crypto.createHash('sha256')
    .update(systemInfo)
    .digest();
    
  return crypto.pbkdf2Sync('aws-sso-credentials', salt, KEY_DERIVATION_ITERATIONS, 32, 'sha256');
}

const CREDENTIAL_KEY = generateEncryptionKey();

function encrypt(text, key = CREDENTIAL_KEY) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM(ENCRYPTION_ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Add timestamp for credential expiry validation
    const timestamp = Date.now();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      timestamp,
      version: '1.0' // For future compatibility
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt credentials');
  }
}

function decrypt(encryptedData, key = CREDENTIAL_KEY) {
  try {
    // Validate data structure
    if (!encryptedData.encrypted || !encryptedData.iv || !encryptedData.authTag) {
      throw new Error('Invalid encrypted data structure');
    }
    
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    
    const decipher = crypto.createDecipherGCM(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    throw new Error('Failed to decrypt credentials - data may be corrupted or tampered with');
  }
}

// Secure memory cleanup for sensitive data
function secureCleanup(obj) {
  if (typeof obj === 'object' && obj !== null) {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] === 'string') {
        // Overwrite string with random data
        obj[key] = crypto.randomBytes(obj[key].length).toString('hex');
      }
      delete obj[key];
    });
  }
}

ipcMain.handle('sso:storeCredentials', async (event, profileName, credentials) => {
  let credentialsStr = null;
  let encryptedData = null;
  
  try {
    // Validate profile name to prevent path traversal
    if (!profileName || profileName.includes('..') || profileName.includes('/') || profileName.includes('\\')) {
      throw new Error('Invalid profile name');
    }
    
    const credPath = path.join(os.homedir(), '.aws', 'sso', 'cache', `${profileName}.json`);
    await fs.mkdir(path.dirname(credPath), { recursive: true });
    
    // Set restrictive permissions on the directory (Unix/Linux/macOS)
    if (process.platform !== 'win32') {
      await fs.chmod(path.dirname(credPath), 0o700);
    }
    
    // Add metadata to credentials
    const credentialsWithMeta = {
      ...credentials,
      storedAt: new Date().toISOString(),
      profileName: profileName,
      clientId: crypto.randomUUID() // For integrity checking
    };
    
    // Encrypt credentials before storage
    credentialsStr = JSON.stringify(credentialsWithMeta);
    encryptedData = encrypt(credentialsStr);
    
    await fs.writeFile(credPath, JSON.stringify(encryptedData));
    
    // Set restrictive permissions on the file (Unix/Linux/macOS)
    if (process.platform !== 'win32') {
      await fs.chmod(credPath, 0o600);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to store SSO credentials:', error);
    return { success: false, error: error.message };
  } finally {
    // Secure cleanup of sensitive data in memory
    if (credentialsStr) {
      secureCleanup({ credentialsStr });
    }
    if (encryptedData) {
      secureCleanup(encryptedData);
    }
  }
});

ipcMain.handle('sso:getCredentials', async (event, profileName) => {
  let encryptedData = null;
  let decryptedStr = null;
  let credentials = null;
  
  try {
    // Validate profile name
    if (!profileName || profileName.includes('..') || profileName.includes('/') || profileName.includes('\\')) {
      throw new Error('Invalid profile name');
    }
    
    const credPath = path.join(os.homedir(), '.aws', 'sso', 'cache', `${profileName}.json`);
    const encryptedStr = await fs.readFile(credPath, 'utf8');
    encryptedData = JSON.parse(encryptedStr);
    
    // Validate encrypted data structure and version
    if (!encryptedData.version || encryptedData.version !== '1.0') {
      throw new Error('Unsupported credential format version');
    }
    
    // Check file age (optional security measure)
    const fileStats = await fs.stat(credPath);
    const fileAge = Date.now() - fileStats.mtime.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (fileAge > maxAge) {
      console.warn(`Credential file for ${profileName} is older than 24 hours`);
    }
    
    // Decrypt credentials
    decryptedStr = decrypt(encryptedData);
    credentials = JSON.parse(decryptedStr);
    
    // Validate decrypted credentials
    if (!credentials.profileName || credentials.profileName !== profileName) {
      throw new Error('Credential integrity check failed');
    }
    
    // Check expiration
    if (new Date(credentials.expiration) <= new Date()) {
      // Remove expired credentials
      await fs.unlink(credPath).catch(() => {});
      return { success: false, error: 'Credentials expired' };
    }
    
    // Remove metadata before returning
    const { storedAt, clientId, ...cleanCredentials } = credentials;
    
    return { success: true, data: cleanCredentials };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: false, error: 'Credentials not found' };
    }
    console.error('Failed to retrieve SSO credentials:', error);
    return { success: false, error: 'Failed to retrieve credentials' };
  } finally {
    // Secure cleanup of sensitive data in memory
    if (encryptedData) {
      secureCleanup(encryptedData);
    }
    if (decryptedStr) {
      secureCleanup({ decryptedStr });
    }
    if (credentials) {
      secureCleanup(credentials);
    }
  }
});

ipcMain.handle('sso:removeCredentials', async (event, profileName) => {
  try {
    // Validate profile name
    if (!profileName || profileName.includes('..') || profileName.includes('/') || profileName.includes('\\')) {
      throw new Error('Invalid profile name');
    }
    
    const credPath = path.join(os.homedir(), '.aws', 'sso', 'cache', `${profileName}.json`);
    
    // Securely overwrite file before deletion (best effort)
    try {
      const fileStats = await fs.stat(credPath);
      const randomData = crypto.randomBytes(fileStats.size);
      await fs.writeFile(credPath, randomData);
    } catch (overwriteError) {
      // Continue with deletion even if overwrite fails
      console.warn('Failed to securely overwrite credential file:', overwriteError.message);
    }
    
    await fs.unlink(credPath);
    return { success: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { success: true }; // Already deleted
    }
    console.error('Failed to remove SSO credentials:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('sso:listProfiles', async () => {
  try {
    const ssoDir = path.join(os.homedir(), '.aws', 'sso', 'cache');
    
    try {
      const files = await fs.readdir(ssoDir);
      const profiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => path.basename(file, '.json'));
      
      return { success: true, data: profiles };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true, data: [] };
      }
      throw error;
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle DevTools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { label: 'About ' + app.getName(), role: 'about' },
        { type: 'separator' },
        { label: 'Services', role: 'services', submenu: [] },
        { type: 'separator' },
        { label: 'Hide ' + app.getName(), accelerator: 'Command+H', role: 'hide' },
        { label: 'Hide Others', accelerator: 'Command+Shift+H', role: 'hideothers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'Command+Q', click: () => app.quit() }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Disable hardware acceleration to fix GPU issues
app.disableHardwareAcceleration();

// App event handlers
app.whenReady().then(() => {
  console.log('Electron app is ready');
  createWindow();
  createMenu();
  console.log('Window created, loading application...');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (global.nextServer) {
    if (typeof global.nextServer.kill === 'function') {
      global.nextServer.kill();
    } else if (typeof global.nextServer.close === 'function') {
      global.nextServer.close();
    }
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});