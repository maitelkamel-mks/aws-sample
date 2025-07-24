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