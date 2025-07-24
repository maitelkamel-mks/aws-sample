import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';
import { CostConfig } from '../types/cost';
import { SecurityConfig } from '../types/security';
import { ProxyConfig } from '../types/proxy';
import { 
  MultiProviderSSOConfig, 
  ProviderConfig, 
  SSOProviderType,
  SecuritySettings,
  ProxySettings
} from '../types/sso-providers';

// Multi-Provider SSO Configuration Schemas
const SecuritySettingsSchema = z.object({
  sslVerification: z.boolean(),
  tokenEncryption: z.boolean(),
  sessionBinding: z.boolean(),
  auditLogging: z.boolean(),
  mfaRequired: z.boolean().optional(),
  sessionTimeout: z.number().optional(),
});

const ProxySettingsSchema = z.object({
  enabled: z.boolean(),
  url: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  excludeDomains: z.array(z.string()).optional(),
});

const ProviderSettingsSchema = z.record(z.any());

const ProviderConfigSchema = z.object({
  id: z.string(),
  type: z.enum(['SAML', 'AWS_SSO', 'OIDC', 'LDAP']),
  name: z.string(),
  settings: ProviderSettingsSchema,
  security: SecuritySettingsSchema.optional(),
  proxy: ProxySettingsSchema.optional(),
});

const MultiProviderSSOConfigSchema = z.object({
  version: z.string(),
  lastModified: z.string(),
  providers: z.array(ProviderConfigSchema),
  defaultProvider: z.string().optional(),
  globalSettings: z.object({
    security: SecuritySettingsSchema,
    proxy: ProxySettingsSchema.optional(),
  }).optional(),
});

// Unified Configuration Schema
const UnifiedConfigSchema = z.object({
  version: z.string().default('1.0'),
  lastModified: z.string().optional(),
  
  // Cost Configuration
  cost: z.object({
    profiles: z.array(z.string()),
    services: z.array(z.string()),
    start_date: z.string(),
    end_date: z.string(),
    period: z.enum(['daily', 'monthly']),
    exclude_taxes: z.boolean(),
    exclude_support: z.boolean(),
  }).optional(),
  
  // Security Configuration  
  security: z.object({
    profiles: z.array(z.string()),
    home_region: z.string(),
  }).optional(),
  
  // Proxy Configuration (Legacy - for backward compatibility)
  proxy: z.object({
    enabled: z.boolean(),
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    no_proxy: z.array(z.string()).optional(),
  }).optional(),
  
  // Multi-Provider SSO Configuration
  multiProviderSSO: MultiProviderSSOConfigSchema.optional(),
});

// Extract schemas for individual sections
const CostConfigSchema = UnifiedConfigSchema.shape.cost.unwrap();
const SecurityConfigSchema = UnifiedConfigSchema.shape.security.unwrap();
const ProxyConfigSchema = UnifiedConfigSchema.shape.proxy.unwrap();

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

// Export the schemas for use in other modules
export { 
  MultiProviderSSOConfigSchema,
  ProviderConfigSchema,
  SecuritySettingsSchema,
  ProxySettingsSchema 
};

export class ConfigManager {
  private static instance: ConfigManager;
  private configDir: string;

  private constructor() {
    // Use appropriate config directory based on environment
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      // In Electron, we'll use IPC to get the userData directory
      this.configDir = ''; // Will be set via IPC calls
    } else {
      // In browser/development mode, use current working directory
      this.configDir = process.cwd();
    }
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private async getConfigDir(): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI?.isElectron) {
      // Use Electron's userData directory via IPC
      if (window.electronAPI.getConfigDir) {
        return await window.electronAPI.getConfigDir();
      }
    }
    return this.configDir;
  }

  public async loadCostConfig(): Promise<CostConfig> {
    const unifiedConfig = await this.loadUnifiedConfig();
    if (!unifiedConfig.cost) {
      throw new Error('Cost configuration not found in unified config');
    }
    return unifiedConfig.cost;
  }

  public async saveCostConfig(config: CostConfig): Promise<void> {
    // Use unified config method
    await this.updateCostConfig(config);
  }

  public async loadSecurityConfig(): Promise<SecurityConfig> {
    const unifiedConfig = await this.loadUnifiedConfig();
    if (!unifiedConfig.security) {
      throw new Error('Security configuration not found in unified config');
    }
    return unifiedConfig.security;
  }

  public async saveSecurityConfig(config: SecurityConfig): Promise<void> {
    // Use unified config method
    await this.updateSecurityConfig(config);
  }

  public async configExists(type: 'cost' | 'security'): Promise<boolean> {
    if (!(await this.unifiedConfigExists())) {
      return false;
    }
    const unifiedConfig = await this.loadUnifiedConfig();
    return type === 'cost' ? !!unifiedConfig.cost : !!unifiedConfig.security;
  }

  public async loadProxyConfig(): Promise<ProxyConfig | null> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return unifiedConfig.proxy || null;
    } catch {
      return null;
    }
  }

  public async saveProxyConfig(proxyConfig: ProxyConfig): Promise<void> {
    // Use unified config method
    await this.updateProxyConfig(proxyConfig);
  }

  public async proxyConfigExists(): Promise<boolean> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return !!unifiedConfig.proxy;
    } catch {
      return false;
    }
  }

  public getProxyEnvironmentVariables() {
    return {
      httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
      httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
      noProxy: process.env.NO_PROXY || process.env.no_proxy,
    };
  }

  // Unified Configuration Methods
  public async loadUnifiedConfig(): Promise<UnifiedConfig> {
    const configDir = await this.getConfigDir();
    const configPath = path.join(configDir, 'config.yaml');
    
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const rawConfig = yaml.parse(fileContent);
      return UnifiedConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        // File doesn't exist, create empty config
        const emptyConfig: UnifiedConfig = {
          version: '1.0',
          lastModified: new Date().toISOString(),
        };
        await this.saveUnifiedConfig(emptyConfig);
        return emptyConfig;
      }
      throw new Error(`Failed to load unified config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async saveUnifiedConfig(config: UnifiedConfig): Promise<void> {
    const configDir = await this.getConfigDir();
    const configPath = path.join(configDir, 'config.yaml');
    
    try {
      // Add metadata
      const configWithMetadata = {
        ...config,
        version: '1.0',
        lastModified: new Date().toISOString(),
      };
      
      const validatedConfig = UnifiedConfigSchema.parse(configWithMetadata);
      
      // Ensure directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const yamlContent = yaml.stringify(validatedConfig);
      fs.writeFileSync(configPath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save unified config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async unifiedConfigExists(): Promise<boolean> {
    const configDir = await this.getConfigDir();
    const configPath = path.join(configDir, 'config.yaml');
    return fs.existsSync(configPath);
  }


  // Convenience methods for working with sections of the unified config
  public async updateCostConfig(costConfig: CostConfig): Promise<void> {
    const unifiedConfig = await this.loadUnifiedConfig();
    unifiedConfig.cost = costConfig;
    await this.saveUnifiedConfig(unifiedConfig);
  }

  public async updateSecurityConfig(securityConfig: SecurityConfig): Promise<void> {
    const unifiedConfig = await this.loadUnifiedConfig();
    unifiedConfig.security = securityConfig;
    await this.saveUnifiedConfig(unifiedConfig);
  }

  public async updateProxyConfig(proxyConfig: ProxyConfig): Promise<void> {
    const unifiedConfig = await this.loadUnifiedConfig();
    unifiedConfig.proxy = proxyConfig;
    await this.saveUnifiedConfig(unifiedConfig);
  }

  // Multi-Provider SSO Configuration Methods
  public async loadMultiProviderSSOConfig(): Promise<MultiProviderSSOConfig | null> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return unifiedConfig.multiProviderSSO || null;
    } catch {
      return null;
    }
  }

  public async saveMultiProviderSSOConfig(ssoConfig: MultiProviderSSOConfig): Promise<void> {
    await this.updateMultiProviderSSOConfig(ssoConfig);
  }

  public async updateMultiProviderSSOConfig(ssoConfig: MultiProviderSSOConfig): Promise<void> {
    const unifiedConfig = await this.loadUnifiedConfig();
    unifiedConfig.multiProviderSSO = ssoConfig;
    await this.saveUnifiedConfig(unifiedConfig);
  }

  public async multiProviderSSOConfigExists(): Promise<boolean> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return !!unifiedConfig.multiProviderSSO;
    } catch {
      return false;
    }
  }

  // Provider-specific configuration management
  public async getProviderConfig(providerId: string): Promise<ProviderConfig | null> {
    const ssoConfig = await this.loadMultiProviderSSOConfig();
    if (!ssoConfig) return null;
    
    return ssoConfig.providers.find(p => p.id === providerId) || null;
  }

  public async addProvider(providerConfig: ProviderConfig): Promise<void> {
    let ssoConfig = await this.loadMultiProviderSSOConfig();
    
    if (!ssoConfig) {
      // Create new multi-provider config
      ssoConfig = {
        version: '1.0',
        lastModified: new Date().toISOString(),
        providers: [providerConfig],
        globalSettings: {
          security: {
            sslVerification: true,
            tokenEncryption: true,
            sessionBinding: true,
            auditLogging: true
          }
        }
      };
    } else {
      // Add to existing config
      ssoConfig.providers.push(providerConfig);
      ssoConfig.lastModified = new Date().toISOString();
    }
    
    await this.saveMultiProviderSSOConfig(ssoConfig);
  }

  public async updateProvider(providerId: string, providerConfig: ProviderConfig): Promise<void> {
    const ssoConfig = await this.loadMultiProviderSSOConfig();
    if (!ssoConfig) {
      throw new Error('No SSO configuration exists');
    }
    
    const providerIndex = ssoConfig.providers.findIndex(p => p.id === providerId);
    if (providerIndex === -1) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    ssoConfig.providers[providerIndex] = providerConfig;
    ssoConfig.lastModified = new Date().toISOString();
    
    await this.saveMultiProviderSSOConfig(ssoConfig);
  }

  public async removeProvider(providerId: string): Promise<void> {
    const ssoConfig = await this.loadMultiProviderSSOConfig();
    if (!ssoConfig) {
      throw new Error('No SSO configuration exists');
    }
    
    ssoConfig.providers = ssoConfig.providers.filter(p => p.id !== providerId);
    ssoConfig.lastModified = new Date().toISOString();
    
    await this.saveMultiProviderSSOConfig(ssoConfig);
  }

  public async listProviders(): Promise<ProviderConfig[]> {
    const ssoConfig = await this.loadMultiProviderSSOConfig();
    return ssoConfig?.providers || [];
  }

  public async getEnabledProviders(): Promise<ProviderConfig[]> {
    const providers = await this.listProviders();
    return providers;
  }

  public async setDefaultProvider(providerId: string): Promise<void> {
    const ssoConfig = await this.loadMultiProviderSSOConfig();
    if (!ssoConfig) {
      throw new Error('No SSO configuration exists');
    }
    
    const provider = ssoConfig.providers.find(p => p.id === providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found`);
    }
    
    ssoConfig.defaultProvider = providerId;
    ssoConfig.lastModified = new Date().toISOString();
    
    await this.saveMultiProviderSSOConfig(ssoConfig);
  }

  // Migration from legacy single-provider SSO config
  public async migrateLegacySSOConfig(): Promise<boolean> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      
      // Check if we have legacy SSO config but no multi-provider config
      if ((unifiedConfig as any).sso && !unifiedConfig.multiProviderSSO) {
        const legacySSO = (unifiedConfig as any).sso;
        
        // Convert to new provider config
        const providerConfig: ProviderConfig = {
          id: `legacy-${legacySSO.authenticationType.toLowerCase()}`,
          type: legacySSO.authenticationType as SSOProviderType,
          name: legacySSO.providerName || `Legacy ${legacySSO.authenticationType} Provider`,
          settings: {
            startUrl: legacySSO.startUrl,
            sessionDuration: legacySSO.sessionDuration,
            region: legacySSO.region,
            samlDestination: legacySSO.samlDestination,
            ...legacySSO.providerSettings
          },
          security: legacySSO.security,
          proxy: unifiedConfig.proxy ? {
            enabled: unifiedConfig.proxy.enabled,
            url: unifiedConfig.proxy.url,
            username: unifiedConfig.proxy.username,
            password: unifiedConfig.proxy.password,
            excludeDomains: unifiedConfig.proxy.no_proxy
          } : undefined
        };

        // Create new multi-provider config
        const multiProviderConfig: MultiProviderSSOConfig = {
          version: '1.0',
          lastModified: new Date().toISOString(),
          providers: [providerConfig],
          defaultProvider: providerConfig.id,
          globalSettings: {
            security: legacySSO.security || {
              sslVerification: true,
              tokenEncryption: true,
              sessionBinding: true,
              auditLogging: true
            }
          }
        };

        // Save the new config and remove legacy
        unifiedConfig.multiProviderSSO = multiProviderConfig;
        delete (unifiedConfig as any).sso;
        
        await this.saveUnifiedConfig(unifiedConfig);
        
        console.log('Successfully migrated legacy SSO configuration to multi-provider format');
        return true;
      }
      
      return false; // No migration needed
    } catch (error) {
      console.error('Failed to migrate legacy SSO configuration:', error);
      return false;
    }
  }
}