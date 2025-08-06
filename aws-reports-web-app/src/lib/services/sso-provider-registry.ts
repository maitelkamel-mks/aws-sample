/**
 * SSO Provider Registry
 * 
 * Central registry for managing multiple SSO providers
 */

import { EventEmitter } from 'events';
import {
  SSOProvider,
  SSOProviderType,
  ProviderConfig,
  ProviderStatus,
  ProviderRegistryEvent,
  AuthCredentials,
  AuthenticationResult,
  SSOProfile,
  SSOSession,
  ValidationResult,
  MultiProviderSSOConfig
} from '../types/sso-providers';

export class SSOProviderRegistry extends EventEmitter {
  private static instance: SSOProviderRegistry;
  private providers = new Map<string, SSOProvider>();
  private providerInstances = new Map<string, SSOProvider>();
  private providerStatuses = new Map<string, ProviderStatus>();
  private activeSessions = new Map<string, SSOSession[]>();

  private constructor() {
    super();
  }

  public static getInstance(): SSOProviderRegistry {
    if (!SSOProviderRegistry.instance) {
      SSOProviderRegistry.instance = new SSOProviderRegistry();
    }
    return SSOProviderRegistry.instance;
  }

  /**
   * Register a provider class
   */
  public registerProvider(providerClass: new () => SSOProvider): void {
    const provider = new providerClass();
    const key = `${provider.type}_${provider.id}`;
    
    if (this.providers.has(key)) {
      throw new Error(`Provider ${key} is already registered`);
    }

    this.providers.set(key, provider);
    
    // Initialize status
    this.providerStatuses.set(provider.id, {
      id: provider.id,
      type: provider.type,
      name: provider.name,
      configured: false,
      healthy: false,
      lastChecked: new Date(),
      activeSessions: 0
    });

    // Emit event
    this.emit('provider_registered', {
      type: 'provider_registered',
      providerId: provider.id,
      providerType: provider.type,
      timestamp: new Date()
    } as ProviderRegistryEvent);

    console.log(`Registered provider: ${provider.name} (${provider.type})`);
  }

  /**
   * Unregister a provider
   */
  public unregisterProvider(providerId: string): void {
    const provider = this.findProviderByKey(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }

    // Clean up instances and sessions
    this.providerInstances.delete(providerId);
    this.activeSessions.delete(providerId);
    this.providerStatuses.delete(providerId);

    // Remove from registry
    const key = `${provider.type}_${provider.id}`;
    this.providers.delete(key);

    // Emit event
    this.emit('provider_unregistered', {
      type: 'provider_unregistered',
      providerId: provider.id,
      providerType: provider.type,
      timestamp: new Date()
    } as ProviderRegistryEvent);

    console.log(`Unregistered provider: ${provider.name} (${provider.type})`);
  }

  /**
   * Get provider instance by ID
   */
  public getProvider(providerId: string): SSOProvider | undefined {
    return this.providerInstances.get(providerId);
  }

  /**
   * Get provider by type (returns first available)
   */
  public getProviderByType(type: SSOProviderType): SSOProvider | undefined {
    for (const [key, provider] of this.providers.entries()) {
      if (provider.type === type) {
        return provider;
      }
    }
    return undefined;
  }

  /**
   * List all registered provider types
   */
  public getAvailableProviderTypes(): SSOProviderType[] {
    const types = new Set<SSOProviderType>();
    for (const provider of this.providers.values()) {
      types.add(provider.type);
    }
    return Array.from(types);
  }

  /**
   * List all configured providers
   */
  public getConfiguredProviders(): SSOProvider[] {
    return Array.from(this.providerInstances.values());
  }

  /**
   * Get provider status
   */
  public getProviderStatus(providerId: string): ProviderStatus | undefined {
    return this.providerStatuses.get(providerId);
  }

  /**
   * Get all provider statuses
   */
  public getAllProviderStatuses(): ProviderStatus[] {
    return Array.from(this.providerStatuses.values());
  }

  /**
   * Configure and initialize a provider
   */
  public async configureProvider(config: ProviderConfig): Promise<void> {
    // Find provider class by type
    const providerClass = this.findProviderByType(config.type);
    if (!providerClass) {
      throw new Error(`No provider registered for type: ${config.type}`);
    }

    // Create instance
    const provider = new (providerClass.constructor as new () => SSOProvider)();
    
    // Validate configuration
    const validation = provider.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.map(e => e.message).join(', ')}`);
    }

    // Store configured instance
    this.providerInstances.set(config.id, provider);
    
    // Initialize sessions array
    this.activeSessions.set(config.id, []);

    // Update or create status
    let status = this.providerStatuses.get(config.id);
    if (!status) {
      // Create new status for dynamically configured provider instance
      status = {
        id: config.id,
        type: config.type,
        name: config.name,
        configured: false,
        healthy: false,
        lastChecked: new Date(),
        activeSessions: 0
      };
    }
    
    status.configured = true;
    status.lastChecked = new Date();
    this.providerStatuses.set(config.id, status);

    // Emit event
    this.emit('provider_configured', {
      type: 'provider_enabled',
      providerId: config.id,
      providerType: config.type,
      timestamp: new Date()
    } as ProviderRegistryEvent);

    console.log(`Configured provider: ${config.name} (${config.id})`);
  }

  /**
   * Authenticate with a specific provider
   */
  public async authenticate(
    providerId: string, 
    credentials: AuthCredentials, 
    config: ProviderConfig
  ): Promise<AuthenticationResult> {
    console.log(`Authenticating with provider: ${providerId} (type: ${config.type})`);
    
    let provider = this.getProvider(providerId);
    if (!provider) {
      console.log(`Provider ${providerId} not found in instances, attempting to configure...`);
      // Try to configure the provider first
      try {
        await this.configureProvider(config);
        provider = this.getProvider(providerId);
        console.log(`Successfully configured provider ${providerId}`);
      } catch (configError) {
        console.error(`Failed to configure provider ${providerId}:`, configError);
        throw new Error(`Provider ${providerId} not found or not configured: ${configError}`);
      }
      
      if (!provider) {
        throw new Error(`Provider ${providerId} not found or not configured`);
      }
    }

    const status = this.providerStatuses.get(providerId);

    try {
      const result = await provider.authenticate(credentials, config);
      
      // Update status
      if (status) {
        status.healthy = result.success;
        status.lastChecked = new Date();
        if (!result.success && result.error) {
          status.error = result.error;
        }
        this.providerStatuses.set(providerId, status);
      }

      return result;
    } catch (error) {
      // Update status on error
      if (status) {
        status.healthy = false;
        status.error = error instanceof Error ? error.message : 'Unknown error';
        status.lastChecked = new Date();
        this.providerStatuses.set(providerId, status);
      }
      throw error;
    }
  }

  /**
   * Discover roles for a provider
   */
  public async discoverRoles(providerId: string, authResult: AuthenticationResult): Promise<SSOProfile[]> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found or not configured`);
    }

    return await provider.discoverRoles(authResult);
  }

  /**
   * Check provider health
   */
  public async checkProviderHealth(providerId: string): Promise<boolean> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return false;
    }

    try {
      // Basic health check - can be extended per provider
      const status = this.providerStatuses.get(providerId);
      if (status) {
        status.lastChecked = new Date();
        // Provider-specific health checks can be added here
        status.healthy = true;
        this.providerStatuses.set(providerId, status);
      }
      return true;
    } catch (error) {
      const status = this.providerStatuses.get(providerId);
      if (status) {
        status.healthy = false;
        status.error = error instanceof Error ? error.message : 'Health check failed';
        status.lastChecked = new Date();
        this.providerStatuses.set(providerId, status);
      }
      return false;
    }
  }

  /**
   * Add session for tracking
   */
  public addSession(providerId: string, session: SSOSession): void {
    const sessions = this.activeSessions.get(providerId) || [];
    sessions.push(session);
    this.activeSessions.set(providerId, sessions);

    // Update status
    const status = this.providerStatuses.get(providerId);
    if (status) {
      status.activeSessions = sessions.length;
      this.providerStatuses.set(providerId, status);
    }
  }

  /**
   * Update session profile name when configuration changes
   */
  public updateSessionProfileName(providerId: string, oldProfileName: string, newProfileName: string): boolean {
    const sessions = this.activeSessions.get(providerId) || [];
    let updated = false;

    for (const session of sessions) {
      if (session.profileName === oldProfileName) {
        session.profileName = newProfileName;
        session.lastRefreshed = new Date();
        console.log(`Updated session profile name: ${oldProfileName} → ${newProfileName}`);
        updated = true;
      }
    }

    if (updated) {
      this.activeSessions.set(providerId, sessions);
    }

    return updated;
  }

  /**
   * Sync all sessions with current configuration profile names
   */
  public async syncSessionsWithConfig(): Promise<void> {
    try {
      const { ConfigManager } = await import('../config');
      const configManager = ConfigManager.getInstance();
      const ssoConfig = await configManager.loadMultiProviderSSOConfig();

      if (!ssoConfig?.providers) return;

      for (const provider of ssoConfig.providers) {
        if (!provider.settings?.profiles) continue;

        const sessions = this.activeSessions.get(provider.id) || [];
        const configProfileNames = provider.settings.profiles.map((p: any) => p.profileName);

        // Find sessions that might have outdated profile names
        for (const session of sessions) {
          // If session profile name is not in current config, it might be renamed
          if (!configProfileNames.includes(session.profileName)) {
            // Try to match by accountId and roleName
            const matchingProfile = provider.settings.profiles.find((p: any) => 
              p.accountId === session.metadata?.accountId && 
              p.roleName === session.metadata?.roleName
            );

            if (matchingProfile && matchingProfile.profileName !== session.profileName) {
              console.log(`Syncing session: ${session.profileName} → ${matchingProfile.profileName} (matched by account/role)`);
              session.profileName = matchingProfile.profileName;
              session.lastRefreshed = new Date();
            }
          }
        }

        this.activeSessions.set(provider.id, sessions);
      }

      console.log('Session profile names synced with configuration');
    } catch (error) {
      console.error('Failed to sync sessions with configuration:', error);
    }
  }

  /**
   * Remove session
   */
  public removeSession(providerId: string, sessionId: string): void {
    const sessions = this.activeSessions.get(providerId) || [];
    const filteredSessions = sessions.filter(s => s.sessionId !== sessionId);
    this.activeSessions.set(providerId, filteredSessions);

    // Update status
    const status = this.providerStatuses.get(providerId);
    if (status) {
      status.activeSessions = filteredSessions.length;
      this.providerStatuses.set(providerId, status);
    }
  }

  /**
   * Get active sessions for provider
   */
  public getActiveSessions(providerId: string): SSOSession[] {
    return this.activeSessions.get(providerId) || [];
  }

  /**
   * Get all active sessions across providers
   */
  public getAllActiveSessions(): Map<string, SSOSession[]> {
    return new Map(this.activeSessions);
  }

  /**
   * Clean up expired sessions
   */
  public cleanupExpiredSessions(): void {
    const now = new Date();
    
    for (const [providerId, sessions] of this.activeSessions.entries()) {
      const activeSessions = sessions.filter(session => session.expiresAt > now);
      this.activeSessions.set(providerId, activeSessions);

      // Update status
      const status = this.providerStatuses.get(providerId);
      if (status) {
        status.activeSessions = activeSessions.length;
        this.providerStatuses.set(providerId, status);
      }
    }
  }

  /**
   * Logout from a specific provider - clears all sessions for that provider
   */
  public async logout(providerId: string): Promise<boolean> {
    try {
      console.log(`Logging out from provider: ${providerId}`);
      
      // Get provider and sessions before clearing
      const provider = this.getProvider(providerId);
      const sessions = this.activeSessions.get(providerId) || [];
      const sessionCount = sessions.length;

      // Clear all sessions for this provider
      this.activeSessions.set(providerId, []);
      
      // Update provider status
      const status = this.providerStatuses.get(providerId);
      if (status) {
        status.activeSessions = 0;
        status.lastChecked = new Date();
        this.providerStatuses.set(providerId, status);
      }

      // Emit logout event
      this.emit('provider_logout', {
        type: 'provider_logout',
        providerId: providerId,
        providerType: provider?.type || 'unknown',
        sessionsCleared: sessionCount,
        timestamp: new Date()
      } as ProviderRegistryEvent);

      console.log(`Successfully logged out from ${providerId}, cleared ${sessionCount} sessions`);
      return true;
    } catch (error) {
      console.error(`Failed to logout from provider ${providerId}:`, error);
      return false;
    }
  }

  /**
   * Logout from all providers - clears all active sessions
   */
  public async logoutAll(): Promise<boolean> {
    try {
      console.log('Logging out from all providers');
      
      const totalSessionsCleared = Array.from(this.activeSessions.values())
        .reduce((sum, sessions) => sum + sessions.length, 0);
      
      // Clear all sessions
      this.activeSessions.clear();
      
      // Update all provider statuses
      for (const [providerId, status] of this.providerStatuses.entries()) {
        status.activeSessions = 0;
        status.lastChecked = new Date();
        this.providerStatuses.set(providerId, status);
      }

      // Emit global logout event
      this.emit('global_logout', {
        type: 'global_logout',
        providerId: 'all',
        providerType: 'all',
        sessionsCleared: totalSessionsCleared,
        timestamp: new Date()
      } as ProviderRegistryEvent);

      console.log(`Successfully logged out from all providers, cleared ${totalSessionsCleared} sessions`);
      return true;
    } catch (error) {
      console.error('Failed to logout from all providers:', error);
      return false;
    }
  }

  /**
   * Clear sessions for a specific profile across all providers
   */
  public clearSessionsForProfile(profileName: string): number {
    let clearedCount = 0;
    
    for (const [providerId, sessions] of this.activeSessions.entries()) {
      const originalLength = sessions.length;
      const filteredSessions = sessions.filter(s => s.profileName !== profileName);
      
      if (filteredSessions.length !== originalLength) {
        this.activeSessions.set(providerId, filteredSessions);
        clearedCount += (originalLength - filteredSessions.length);
        
        // Update status
        const status = this.providerStatuses.get(providerId);
        if (status) {
          status.activeSessions = filteredSessions.length;
          this.providerStatuses.set(providerId, status);
        }
      }
    }
    
    if (clearedCount > 0) {
      console.log(`Cleared ${clearedCount} sessions for profile: ${profileName}`);
    }
    
    return clearedCount;
  }

  /**
   * Initialize with configuration
   */
  public async initializeFromConfig(config: MultiProviderSSOConfig): Promise<void> {
    console.log(`Initializing ${config.providers.length} providers from configuration`);

    for (const providerConfig of config.providers) {
      try {
        await this.configureProvider(providerConfig);
        console.log(`✓ Initialized provider: ${providerConfig.name}`);
      } catch (error) {
        console.error(`✗ Failed to initialize provider ${providerConfig.name}:`, error);
      }
    }

    // Start cleanup interval
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // Cleanup every minute
  }

  /**
   * Helper methods
   */
  private findProviderByKey(providerId: string): SSOProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.id === providerId) {
        return provider;
      }
    }
    return undefined;
  }

  private findProviderByType(type: SSOProviderType): SSOProvider | undefined {
    for (const provider of this.providers.values()) {
      if (provider.type === type) {
        return provider;
      }
    }
    return undefined;
  }
}