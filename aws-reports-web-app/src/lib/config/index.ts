import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';
import { CostConfig } from '../types/cost';
import { SecurityConfig } from '../types/security';
import { ProxyConfig } from '../types/proxy';
import { SSOConfiguration } from '../types/sso';

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
  
  // Proxy Configuration
  proxy: z.object({
    enabled: z.boolean(),
    url: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    no_proxy: z.array(z.string()).optional(),
  }).optional(),
  
  // SSO Configuration
  sso: z.object({
    enabled: z.boolean(),
    providerName: z.string(),
    startUrl: z.string(),
    authenticationType: z.enum(['SoftID', 'LDAP', 'OAuth2']),
    sessionDuration: z.number(),
    region: z.string(),
    samlDestination: z.string().optional(),
    providerSettings: z.object({
      realm: z.string().optional(),
      module: z.string().optional(),
      gotoUrl: z.string().optional(),
      metaAlias: z.string().optional(),
    }).optional(),
    profiles: z.array(z.object({
      name: z.string(),
      accountId: z.string(),
      roleName: z.string(),
      roleArn: z.string(),
      principalArn: z.string(),
      description: z.string().optional(),
      region: z.string().optional(),
      type: z.literal('sso'),
    })),
    security: z.object({
      sslVerification: z.boolean().optional(),
      tokenEncryption: z.boolean().optional(),
      sessionBinding: z.boolean().optional(),
      auditLogging: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

// Extract schemas for individual sections
const CostConfigSchema = UnifiedConfigSchema.shape.cost.unwrap();
const SecurityConfigSchema = UnifiedConfigSchema.shape.security.unwrap();
const ProxyConfigSchema = UnifiedConfigSchema.shape.proxy.unwrap();

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;

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

  // SSO Configuration Methods
  public async loadSSOConfig(): Promise<SSOConfiguration | null> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return unifiedConfig.sso || null;
    } catch {
      return null;
    }
  }

  public async saveSSOConfig(ssoConfig: SSOConfiguration): Promise<void> {
    await this.updateSSOConfig(ssoConfig);
  }

  public async updateSSOConfig(ssoConfig: SSOConfiguration): Promise<void> {
    const unifiedConfig = await this.loadUnifiedConfig();
    unifiedConfig.sso = ssoConfig;
    await this.saveUnifiedConfig(unifiedConfig);
  }

  public async ssoConfigExists(): Promise<boolean> {
    try {
      const unifiedConfig = await this.loadUnifiedConfig();
      return !!unifiedConfig.sso;
    } catch {
      return false;
    }
  }
}