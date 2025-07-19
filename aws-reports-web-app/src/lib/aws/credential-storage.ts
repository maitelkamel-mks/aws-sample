import { SSOCredentials, SSOSession } from '../types/sso';
import CryptoJS from 'crypto-js';

export interface CredentialStorage {
  store(profileName: string, credentials: SSOCredentials): Promise<void>;
  retrieve(profileName: string): Promise<SSOCredentials | null>;
  remove(profileName: string): Promise<void>;
  list(): Promise<string[]>;
  isExpired(profileName: string): Promise<boolean>;
  clear(): Promise<void>;
}

export class WebCredentialStorage implements CredentialStorage {
  private encryptionKey: string;
  private readonly storagePrefix = 'aws_sso_';

  constructor(encryptionKey?: string) {
    this.encryptionKey = encryptionKey || this.generateEncryptionKey();
  }

  private generateEncryptionKey(): string {
    // Check if we're on the server side
    if (typeof window === 'undefined') {
      // Server-side: use a static key (this storage won't be used on server anyway)
      return CryptoJS.SHA256('server-side-fallback-key').toString();
    }
    
    // Generate a key based on session and browser fingerprint
    const sessionId = sessionStorage.getItem('session_id') || Math.random().toString(36);
    const browserFingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset()
    ].join('|');
    
    return CryptoJS.SHA256(sessionId + browserFingerprint).toString();
  }

  private encrypt(data: string): string {
    return CryptoJS.AES.encrypt(data, this.encryptionKey).toString();
  }

  private decrypt(encryptedData: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedData, this.encryptionKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  }

  public async store(profileName: string, credentials: SSOCredentials): Promise<void> {
    // Server-side: This method shouldn't be called on server, but provide a safe fallback
    if (typeof window === 'undefined') {
      throw new Error('Cannot store credentials on server side');
    }
    
    try {
      const session: SSOSession = {
        profileName,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
        expiration: credentials.expiration,
        roleArn: credentials.roleArn,
        accountId: credentials.accountId,
        userId: profileName,
        region: credentials.region
      };

      const serializedData = JSON.stringify(session);
      const encryptedData = this.encrypt(serializedData);
      
      sessionStorage.setItem(`${this.storagePrefix}${profileName}`, encryptedData);
      
      // Store metadata for quick access
      const metadata = {
        profileName,
        accountId: credentials.accountId,
        roleArn: credentials.roleArn,
        expiration: credentials.expiration.toISOString(),
        region: credentials.region
      };
      
      sessionStorage.setItem(`${this.storagePrefix}meta_${profileName}`, JSON.stringify(metadata));
    } catch (error) {
      throw new Error(`Failed to store credentials: ${error}`);
    }
  }

  public async retrieve(profileName: string): Promise<SSOCredentials | null> {
    // Server-side: Return null since no credentials can be stored on server
    if (typeof window === 'undefined') {
      return null;
    }
    
    try {
      const encryptedData = sessionStorage.getItem(`${this.storagePrefix}${profileName}`);
      if (!encryptedData) {
        return null;
      }

      const decryptedData = this.decrypt(encryptedData);
      const session: SSOSession = JSON.parse(decryptedData);
      
      // Convert expiration string back to Date
      session.expiration = new Date(session.expiration);

      return {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
        expiration: session.expiration,
        roleArn: session.roleArn,
        accountId: session.accountId,
        region: session.region
      };
    } catch (error) {
      // Remove corrupted data
      await this.remove(profileName);
      return null;
    }
  }

  public async remove(profileName: string): Promise<void> {
    // Server-side: Do nothing since no credentials are stored on server
    if (typeof window === 'undefined') {
      return;
    }
    
    sessionStorage.removeItem(`${this.storagePrefix}${profileName}`);
    sessionStorage.removeItem(`${this.storagePrefix}meta_${profileName}`);
  }

  public async list(): Promise<string[]> {
    // Server-side: Return empty array since no credentials are stored on server
    if (typeof window === 'undefined') {
      return [];
    }
    
    const profiles: string[] = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(this.storagePrefix) && !key.includes('meta_')) {
        const profileName = key.replace(this.storagePrefix, '');
        profiles.push(profileName);
      }
    }
    
    return profiles;
  }

  public async isExpired(profileName: string): Promise<boolean> {
    // Server-side: Return true since no credentials are stored on server
    if (typeof window === 'undefined') {
      return true;
    }
    
    try {
      const metadataStr = sessionStorage.getItem(`${this.storagePrefix}meta_${profileName}`);
      if (!metadataStr) {
        return true;
      }

      const metadata = JSON.parse(metadataStr);
      const expiration = new Date(metadata.expiration);
      return expiration <= new Date();
    } catch (error) {
      return true;
    }
  }

  public async clear(): Promise<void> {
    const profiles = await this.list();
    for (const profileName of profiles) {
      await this.remove(profileName);
    }
  }
}

export class ElectronCredentialStorage implements CredentialStorage {
  public async store(profileName: string, credentials: SSOCredentials): Promise<void> {
    if (!window.electronAPI?.sso) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sso.storeCredentials(profileName, credentials);
    if (!result.success) {
      throw new Error(result.error || 'Failed to store credentials');
    }
  }

  public async retrieve(profileName: string): Promise<SSOCredentials | null> {
    if (!window.electronAPI?.sso) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sso.getCredentials(profileName);
    if (!result.success) {
      if (result.error?.includes('expired') || result.error?.includes('not found')) {
        return null;
      }
      throw new Error(result.error || 'Failed to retrieve credentials');
    }

    const credentials = result.data;
    // Ensure expiration is a Date object
    if (typeof credentials.expiration === 'string') {
      credentials.expiration = new Date(credentials.expiration);
    }

    return credentials;
  }

  public async remove(profileName: string): Promise<void> {
    if (!window.electronAPI?.sso) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sso.removeCredentials(profileName);
    if (!result.success) {
      throw new Error(result.error || 'Failed to remove credentials');
    }
  }

  public async list(): Promise<string[]> {
    if (!window.electronAPI?.sso) {
      throw new Error('Electron API not available');
    }

    const result = await window.electronAPI.sso.listStoredProfiles();
    if (!result.success) {
      throw new Error(result.error || 'Failed to list profiles');
    }

    return result.data || [];
  }

  public async isExpired(profileName: string): Promise<boolean> {
    try {
      const credentials = await this.retrieve(profileName);
      if (!credentials) {
        return true;
      }

      return credentials.expiration <= new Date();
    } catch (error) {
      return true;
    }
  }

  public async clear(): Promise<void> {
    const profiles = await this.list();
    for (const profileName of profiles) {
      await this.remove(profileName);
    }
  }
}

// Factory function to create appropriate storage based on environment
export function createCredentialStorage(encryptionKey?: string): CredentialStorage {
  if (typeof window !== 'undefined' && window.electronAPI?.sso) {
    return new ElectronCredentialStorage();
  } else {
    return new WebCredentialStorage(encryptionKey);
  }
}

// Utility class for managing multiple credential storages
export class CredentialStorageManager {
  private storage: CredentialStorage;

  constructor(storage?: CredentialStorage) {
    this.storage = storage || createCredentialStorage();
  }

  public async storeCredentials(profileName: string, credentials: SSOCredentials): Promise<void> {
    await this.storage.store(profileName, credentials);
  }

  public async getCredentials(profileName: string): Promise<SSOCredentials | null> {
    const credentials = await this.storage.retrieve(profileName);
    
    // Check if credentials are expired
    if (credentials && await this.storage.isExpired(profileName)) {
      await this.storage.remove(profileName);
      return null;
    }
    
    return credentials;
  }

  public async removeCredentials(profileName: string): Promise<void> {
    await this.storage.remove(profileName);
  }

  public async listStoredProfiles(): Promise<string[]> {
    return await this.storage.list();
  }

  public async clearAllCredentials(): Promise<void> {
    await this.storage.clear();
  }

  public async cleanupExpiredCredentials(): Promise<void> {
    const profiles = await this.storage.list();
    
    for (const profileName of profiles) {
      if (await this.storage.isExpired(profileName)) {
        await this.storage.remove(profileName);
      }
    }
  }

  public async getCredentialStatus(profileName: string): Promise<{
    exists: boolean;
    isExpired: boolean;
    expiresAt?: Date;
  }> {
    const credentials = await this.storage.retrieve(profileName);
    
    if (!credentials) {
      return { exists: false, isExpired: false };
    }
    
    const isExpired = await this.storage.isExpired(profileName);
    
    return {
      exists: true,
      isExpired,
      expiresAt: credentials.expiration
    };
  }
}