// Electron API wrapper for detecting and using IPC when available

interface SaveFileOptions {
  defaultPath?: string;
  filters?: Array<{
    name: string;
    extensions: string[];
  }>;
}

interface SaveFileResult {
  filePath?: string;
  canceled: boolean;
}

interface ConfigData {
  [key: string]: unknown;
}

interface ProxyConfig {
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  no_proxy?: string[];
}

interface ProxyData {
  config: ProxyConfig | null;
  environment: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: string;
  };
}

declare global {
  interface Window {
    electronAPI?: {
      getAWSProfiles: () => Promise<string[]>;
      readConfig: (type: 'cost' | 'security') => Promise<ConfigData | null>;
      writeConfig: (type: 'cost' | 'security', config: ConfigData) => Promise<{ success: boolean }>;
      getProxyConfig: () => Promise<{ success: boolean; data: ProxyData }>;
      saveProxyConfig: (config: ProxyConfig) => Promise<{ success: boolean }>;
      saveFile: (options: SaveFileOptions) => Promise<SaveFileResult>;
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>;
      platform: string;
      isElectron: boolean;
      isDevelopment: boolean;
    };
  }
}

export const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
};

export const electronAPI = {
  // AWS Profile operations
  getAWSProfiles: async (): Promise<string[]> => {
    if (isElectron()) {
      return window.electronAPI!.getAWSProfiles();
    }
    // Fallback to HTTP API
    const response = await fetch('/api/aws/profiles');
    if (!response.ok) throw new Error('Failed to fetch profiles');
    const data = await response.json();
    return data.profiles;
  },

  // Config operations
  readConfig: async (type: 'cost' | 'security'): Promise<ConfigData | null> => {
    if (isElectron()) {
      return window.electronAPI!.readConfig(type);
    }
    // Fallback to HTTP API
    const response = await fetch(`/api/config/${type}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to read config');
    }
    const result = await response.json();
    return result.data;
  },

  writeConfig: async (type: 'cost' | 'security', config: ConfigData): Promise<void> => {
    if (isElectron()) {
      await window.electronAPI!.writeConfig(type, config);
      return;
    }
    // Fallback to HTTP API
    const response = await fetch(`/api/config/${type}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to write config');
  },

  // Proxy operations
  getProxyConfig: async (): Promise<ProxyData> => {
    if (isElectron()) {
      const result = await window.electronAPI!.getProxyConfig();
      return result.data;
    }
    // Fallback to HTTP API
    const response = await fetch('/api/config/proxy');
    if (!response.ok) throw new Error('Failed to get proxy config');
    const result = await response.json();
    return {
      config: result.data.config,
      environment: result.data.environment,
    };
  },

  saveProxyConfig: async (config: ProxyConfig): Promise<void> => {
    if (isElectron()) {
      await window.electronAPI!.saveProxyConfig(config);
      return;
    }
    // Fallback to HTTP API
    const response = await fetch('/api/config/proxy', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to save proxy config');
  },

  // File operations
  saveFile: async (content: string, filename: string, type: string): Promise<boolean> => {
    if (isElectron()) {
      const result = await window.electronAPI!.saveFile({
        defaultPath: filename,
        filters: [
          { name: type, extensions: [filename.split('.').pop() || 'txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });
      
      if (!result.canceled && result.filePath) {
        await window.electronAPI!.writeFile(result.filePath, content);
        return true;
      }
      return false;
    }
    
    // Fallback to browser download
    const blob = new Blob([content], { type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    return true;
  },
};