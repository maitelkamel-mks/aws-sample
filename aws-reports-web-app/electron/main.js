const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const yaml = require('yaml');
const http = require('http');

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
    const configPath = type === 'cost' 
      ? path.join(process.cwd(), 'finops-cost-report', 'config.yaml')
      : path.join(process.cwd(), 'securityhub', 'config.yaml');
    
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
    const configPath = type === 'cost' 
      ? path.join(process.cwd(), 'finops-cost-report', 'config.yaml')
      : path.join(process.cwd(), 'securityhub', 'config.yaml');
    
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

// IPC Handler for proxy configuration
ipcMain.handle('proxy:get', async (event) => {
  try {
    const configPath = path.join(process.cwd(), 'proxy', 'config.yaml');
    
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
    const configPath = path.join(process.cwd(), 'proxy', 'config.yaml');
    
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