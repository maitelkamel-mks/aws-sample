const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // AWS Profile operations
  getAWSProfiles: () => ipcRenderer.invoke('aws:getProfiles'),
  
  // Config file operations
  readConfig: (type) => ipcRenderer.invoke('config:read', type),
  writeConfig: (type, config) => ipcRenderer.invoke('config:write', type, config),
  getConfigDir: () => ipcRenderer.invoke('config:getDir'),
  
  // Proxy operations
  getProxyConfig: () => ipcRenderer.invoke('proxy:get'),
  saveProxyConfig: (config) => ipcRenderer.invoke('proxy:save', config),
  
  // File operations
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  writeFile: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content),
  
  // Platform info
  platform: process.platform,
  
  // Environment info
  isElectron: true,
  isDevelopment: process.env.NODE_ENV === 'development',
  
  // Application control
  retryApplication: () => ipcRenderer.invoke('app:retry'),
  closeApplication: () => ipcRenderer.invoke('app:close'),
  
  // SSO operations
  sso: {
    getConfig: () => ipcRenderer.invoke('sso:getConfig'),
    saveConfig: (config) => ipcRenderer.invoke('sso:saveConfig', config),
    storeCredentials: (profileName, credentials) => 
      ipcRenderer.invoke('sso:storeCredentials', profileName, credentials),
    getCredentials: (profileName) => 
      ipcRenderer.invoke('sso:getCredentials', profileName),
    removeCredentials: (profileName) => 
      ipcRenderer.invoke('sso:removeCredentials', profileName),
    listStoredProfiles: () => ipcRenderer.invoke('sso:listProfiles')
  }
});