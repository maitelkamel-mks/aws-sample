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

declare global {
  interface Window {
    electronAPI?: {
      getAWSProfiles: () => Promise<string[]>;
      readConfig: (type: 'cost' | 'security') => Promise<ConfigData | null>;
      writeConfig: (type: 'cost' | 'security', config: ConfigData) => Promise<{ success: boolean }>;
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
    if (!response.ok) throw new Error('Failed to read config');
    return response.json();
  },

  writeConfig: async (type: 'cost' | 'security', config: ConfigData): Promise<void> => {
    if (isElectron()) {
      await window.electronAPI!.writeConfig(type, config);
      return;
    }
    // Fallback to HTTP API
    const response = await fetch(`/api/config/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!response.ok) throw new Error('Failed to write config');
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