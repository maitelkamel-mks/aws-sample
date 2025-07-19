import { AWSCredentialsManager } from './credentials';

export interface TokenRefreshOptions {
  refreshThresholdMinutes?: number; // Minutes before expiration to trigger refresh
  checkIntervalMs?: number; // How often to check for tokens needing refresh
  retryAttempts?: number; // Number of retry attempts for failed refreshes
  retryDelayMs?: number; // Delay between retry attempts
}

export interface RefreshResult {
  profileName: string;
  success: boolean;
  error?: string;
  nextCheck?: Date;
}

export class TokenRefreshService {
  private credentialsManager: AWSCredentialsManager;
  private intervalId: NodeJS.Timeout | null = null;
  private options: Required<TokenRefreshOptions>;
  private isRunning = false;
  private refreshCallbacks: Map<string, (result: RefreshResult) => void> = new Map();

  constructor(options: TokenRefreshOptions = {}) {
    this.credentialsManager = AWSCredentialsManager.getInstance();
    this.options = {
      refreshThresholdMinutes: options.refreshThresholdMinutes || 15,
      checkIntervalMs: options.checkIntervalMs || 5 * 60 * 1000, // 5 minutes
      retryAttempts: options.retryAttempts || 3,
      retryDelayMs: options.retryDelayMs || 30 * 1000 // 30 seconds
    };
  }

  public start(): void {
    if (this.isRunning) {
      console.log('Token refresh service is already running');
      return;
    }

    console.log('Starting token refresh service...');
    this.isRunning = true;
    
    // Perform initial check
    this.checkAndRefreshTokens();
    
    // Set up interval for regular checks
    this.intervalId = setInterval(() => {
      this.checkAndRefreshTokens();
    }, this.options.checkIntervalMs);
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('Stopping token refresh service...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public onRefresh(profileName: string, callback: (result: RefreshResult) => void): void {
    this.refreshCallbacks.set(profileName, callback);
  }

  public offRefresh(profileName: string): void {
    this.refreshCallbacks.delete(profileName);
  }

  public async manualRefresh(profileName: string): Promise<RefreshResult> {
    if (!this.credentialsManager.isSSOConfigured()) {
      return {
        profileName,
        success: false,
        error: 'SSO not configured'
      };
    }

    try {
      await this.credentialsManager.refreshSSOToken(profileName);
      
      const result: RefreshResult = {
        profileName,
        success: true,
        nextCheck: new Date(Date.now() + this.options.checkIntervalMs)
      };

      // Notify callback if registered
      const callback = this.refreshCallbacks.get(profileName);
      if (callback) {
        callback(result);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: RefreshResult = {
        profileName,
        success: false,
        error: errorMessage
      };

      // Notify callback if registered
      const callback = this.refreshCallbacks.get(profileName);
      if (callback) {
        callback(result);
      }

      return result;
    }
  }

  private async checkAndRefreshTokens(): Promise<void> {
    if (!this.credentialsManager.isSSOConfigured()) {
      return;
    }

    try {
      // Get list of stored SSO profiles
      const storedProfiles = await this.credentialsManager.getStoredSSOProfiles();
      
      if (storedProfiles.length === 0) {
        return;
      }

      console.log(`Checking ${storedProfiles.length} SSO profiles for token refresh...`);

      // Check each profile
      const refreshPromises = storedProfiles.map(profileName => 
        this.checkAndRefreshProfile(profileName)
      );

      const results = await Promise.allSettled(refreshPromises);
      
      // Log results
      results.forEach((result, index) => {
        const profileName = storedProfiles[index];
        if (result.status === 'rejected') {
          console.error(`Failed to check profile ${profileName}:`, result.reason);
        }
      });

    } catch (error) {
      console.error('Error during token refresh check:', error);
    }
  }

  private async checkAndRefreshProfile(profileName: string): Promise<void> {
    try {
      // Get current authentication status
      const authStatus = await this.credentialsManager.getSSOAuthenticationStatus(profileName);
      
      if (!authStatus.isAuthenticated || !authStatus.expiresAt) {
        return; // Not authenticated or no expiration info
      }

      const now = new Date();
      const expiresAt = authStatus.expiresAt;
      const timeUntilExpiration = expiresAt.getTime() - now.getTime();
      const thresholdMs = this.options.refreshThresholdMinutes * 60 * 1000;

      // Check if token needs refresh
      if (timeUntilExpiration <= thresholdMs) {
        console.log(`Token for profile ${profileName} expires in ${Math.round(timeUntilExpiration / 1000 / 60)} minutes, refreshing...`);
        
        await this.refreshTokenWithRetry(profileName);
      }

    } catch (error) {
      console.error(`Error checking profile ${profileName}:`, error);
    }
  }

  private async refreshTokenWithRetry(profileName: string): Promise<void> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.options.retryAttempts; attempt++) {
      try {
        await this.credentialsManager.refreshSSOToken(profileName);
        
        console.log(`Successfully refreshed token for profile ${profileName} (attempt ${attempt})`);
        
        // Notify callback of successful refresh
        const callback = this.refreshCallbacks.get(profileName);
        if (callback) {
          callback({
            profileName,
            success: true,
            nextCheck: new Date(Date.now() + this.options.checkIntervalMs)
          });
        }
        
        return; // Success, exit retry loop
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        console.warn(`Failed to refresh token for profile ${profileName} (attempt ${attempt}/${this.options.retryAttempts}):`, lastError.message);
        
        // Wait before retry (except on last attempt)
        if (attempt < this.options.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.options.retryDelayMs));
        }
      }
    }

    // All retry attempts failed
    console.error(`Failed to refresh token for profile ${profileName} after ${this.options.retryAttempts} attempts:`, lastError?.message);
    
    // Notify callback of failed refresh
    const callback = this.refreshCallbacks.get(profileName);
    if (callback) {
      callback({
        profileName,
        success: false,
        error: lastError?.message || 'Token refresh failed after multiple attempts'
      });
    }
  }

  public getStatus(): {
    isRunning: boolean;
    checkIntervalMs: number;
    refreshThresholdMinutes: number;
    registeredCallbacks: number;
  } {
    return {
      isRunning: this.isRunning,
      checkIntervalMs: this.options.checkIntervalMs,
      refreshThresholdMinutes: this.options.refreshThresholdMinutes,
      registeredCallbacks: this.refreshCallbacks.size
    };
  }

  public async getNextRefreshTimes(): Promise<Array<{
    profileName: string;
    expiresAt: Date;
    needsRefresh: boolean;
    nextRefreshAt: Date;
  }>> {
    if (!this.credentialsManager.isSSOConfigured()) {
      return [];
    }

    try {
      const storedProfiles = await this.credentialsManager.getStoredSSOProfiles();
      const results = [];

      for (const profileName of storedProfiles) {
        try {
          const authStatus = await this.credentialsManager.getSSOAuthenticationStatus(profileName);
          
          if (authStatus.isAuthenticated && authStatus.expiresAt) {
            const expiresAt = authStatus.expiresAt;
            const thresholdMs = this.options.refreshThresholdMinutes * 60 * 1000;
            const nextRefreshAt = new Date(expiresAt.getTime() - thresholdMs);
            const needsRefresh = new Date() >= nextRefreshAt;

            results.push({
              profileName,
              expiresAt,
              needsRefresh,
              nextRefreshAt
            });
          }
        } catch (error) {
          console.error(`Error getting refresh time for profile ${profileName}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Error getting next refresh times:', error);
      return [];
    }
  }
}

// Global instance
let globalTokenRefreshService: TokenRefreshService | null = null;

export function getTokenRefreshService(options?: TokenRefreshOptions): TokenRefreshService {
  if (!globalTokenRefreshService) {
    globalTokenRefreshService = new TokenRefreshService(options);
  }
  return globalTokenRefreshService;
}

export function startGlobalTokenRefresh(options?: TokenRefreshOptions): TokenRefreshService {
  const service = getTokenRefreshService(options);
  service.start();
  return service;
}

export function stopGlobalTokenRefresh(): void {
  if (globalTokenRefreshService) {
    globalTokenRefreshService.stop();
  }
}