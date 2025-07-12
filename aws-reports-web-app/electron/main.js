const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const yaml = require('yaml');

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
    show: true // Show immediately for debugging
  });

  console.log('Window created, loading URL...');

  // Load the app
  if (isDev) {
    console.log('Development mode: loading localhost:3000');
    
    // Wait for Next.js server to be ready before loading
    setTimeout(() => {
      mainWindow.loadURL('http://localhost:3000');
      mainWindow.webContents.openDevTools();
    }, 2000);
  } else {
    console.log('Production mode: starting Next.js server programmatically');
    
    try {
      // Start Next.js server programmatically using the Next.js API
      const next = require('next');
      const nextApp = next({ dev: false, dir: path.join(__dirname, '..') });
      const handle = nextApp.getRequestHandler();
      
      nextApp.prepare().then(() => {
        const http = require('http');
        const server = http.createServer((req, res) => {
          handle(req, res);
        });
        
        server.listen(3001, (err) => {
          if (err) {
            console.error('Failed to start Next.js server:', err);
            // Fallback - just show a basic page
            mainWindow.loadURL('data:text/html,<h1>Next.js server failed to start</h1><p>Error: ' + err.message + '</p>');
            return;
          }
          
          console.log('Next.js server ready on port 3001');
          mainWindow.loadURL('http://localhost:3001');
          mainWindow.webContents.openDevTools();
        });
        
        // Store for cleanup
        global.nextServer = server;
      }).catch((err) => {
        console.error('Failed to prepare Next.js app:', err);
        // Fallback - just show a basic page
        mainWindow.loadURL('data:text/html,<h1>Next.js failed to initialize</h1><p>Error: ' + err.message + '</p>');
      });
    } catch (error) {
      console.error('Failed to require Next.js:', error);
      // Fallback - just show a basic page
      mainWindow.loadURL('data:text/html,<h1>Next.js not available</h1><p>Running in standalone mode</p>');
    }
  }

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

// Start Next.js server in development
async function startNextServer() {
  if (isDev) {
    console.log('Starting Next.js development server...');
    nextServer = spawn('npm', ['run', 'dev'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });

    // Wait for server to be ready
    await new Promise(resolve => {
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max
      
      const checkServer = setInterval(async () => {
        attempts++;
        try {
          const response = await fetch('http://localhost:3000');
          if (response.ok) {
            console.log('Next.js server is ready!');
            clearInterval(checkServer);
            resolve();
          }
        } catch (error) {
          console.log(`Waiting for server... (attempt ${attempts}/${maxAttempts})`);
          if (attempts >= maxAttempts) {
            console.error('Server failed to start after 30 seconds');
            clearInterval(checkServer);
            resolve(); // Continue anyway
          }
        }
      }, 1000);
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
      ? path.join(__dirname, '..', 'finops-cost-report', 'config.yaml')
      : path.join(__dirname, '..', 'securityhub', 'config.yaml');
    
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
      ? path.join(__dirname, '..', 'finops-cost-report', 'config.yaml')
      : path.join(__dirname, '..', 'securityhub', 'config.yaml');
    
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
app.whenReady().then(async () => {
  console.log('Electron app is ready');
  await startNextServer();
  createWindow();
  createMenu();
  console.log('Initialization complete');
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