import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { z } from 'zod';
import { CostConfig } from '../types/cost';
import { SecurityConfig } from '../types/security';

const CostConfigSchema = z.object({
  report_name: z.string(),
  profiles: z.array(z.string()),
  services: z.array(z.string()),
  start_date: z.string(),
  end_date: z.string(),
  period: z.enum(['daily', 'monthly']),
  exclude_taxes: z.boolean(),
  exclude_support: z.boolean(),
});

const SecurityConfigSchema = z.object({
  report_name: z.string(),
  profiles: z.array(z.string()),
  home_region: z.string(),
});

export class ConfigManager {
  private static instance: ConfigManager;
  private configDir: string;

  private constructor() {
    this.configDir = process.cwd();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  public async loadCostConfig(): Promise<CostConfig> {
    const configPath = path.join(this.configDir, 'finops-cost-report', 'config.yaml');
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const rawConfig = yaml.parse(fileContent);
      return CostConfigSchema.parse(rawConfig);
    } catch (error) {
      throw new Error(`Failed to load cost config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async saveCostConfig(config: CostConfig): Promise<void> {
    const configDir = path.join(this.configDir, 'finops-cost-report');
    const configPath = path.join(configDir, 'config.yaml');
    try {
      const validatedConfig = CostConfigSchema.parse(config);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const yamlContent = yaml.stringify(validatedConfig);
      fs.writeFileSync(configPath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save cost config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async loadSecurityConfig(): Promise<SecurityConfig> {
    const configPath = path.join(this.configDir, 'securityhub', 'config.yaml');
    try {
      const fileContent = fs.readFileSync(configPath, 'utf8');
      const rawConfig = yaml.parse(fileContent);
      return SecurityConfigSchema.parse(rawConfig);
    } catch (error) {
      throw new Error(`Failed to load security config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async saveSecurityConfig(config: SecurityConfig): Promise<void> {
    const configDir = path.join(this.configDir, 'securityhub');
    const configPath = path.join(configDir, 'config.yaml');
    try {
      const validatedConfig = SecurityConfigSchema.parse(config);
      
      // Create directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      const yamlContent = yaml.stringify(validatedConfig);
      fs.writeFileSync(configPath, yamlContent, 'utf8');
    } catch (error) {
      throw new Error(`Failed to save security config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public configExists(type: 'cost' | 'security'): boolean {
    const configPath = type === 'cost' 
      ? path.join(this.configDir, 'finops-cost-report', 'config.yaml')
      : path.join(this.configDir, 'securityhub', 'config.yaml');
    return fs.existsSync(configPath);
  }
}