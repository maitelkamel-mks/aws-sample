/**
 * Multi-Provider SSO Architecture Types
 * 
 * This file defines the interfaces and types for the new multi-provider SSO system
 */

// Core provider interface
export interface SSOProvider {
  readonly id: string;
  readonly type: SSOProviderType;
  readonly name: string;
  readonly version: string;
  
  /**
   * Authenticate with the provider using credentials
   */
  authenticate(credentials: AuthCredentials, config: ProviderConfig): Promise<AuthenticationResult>;
  
  /**
   * Refresh an existing session (optional - some providers don't support refresh)
   */
  refreshToken?(session: SSOSession): Promise<SSOCredentials>;
  
  /**
   * Validate provider configuration
   */
  validateConfig(config: ProviderConfig): ValidationResult;
  
  /**
   * Discover available roles from authentication result
   */
  discoverRoles(authResult: AuthenticationResult): Promise<SSOProfile[]>;
  
  /**
   * Get provider-specific configuration schema
   */
  getConfigSchema(): ProviderConfigSchema;
  
  /**
   * Check if provider supports specific features
   */
  supportsFeature(feature: ProviderFeature): boolean;
}

// Provider types
export type SSOProviderType = 'SAML' | 'AWS_SSO' | 'OIDC' | 'LDAP';

// Provider features
export type ProviderFeature = 'TOKEN_REFRESH' | 'ROLE_DISCOVERY' | 'MFA' | 'SESSION_TIMEOUT';

// Authentication credentials (provider-specific)
export interface AuthCredentials {
  username?: string;
  password?: string;
  mfaCode?: string;
  clientId?: string;
  clientSecret?: string;
  [key: string]: any; // Allow provider-specific fields
}

// Provider configuration
export interface ProviderConfig {
  id: string;
  type: SSOProviderType;
  name: string;
  settings: ProviderSettings;
  security?: SecuritySettings;
  proxy?: ProxySettings;
}

// Provider-specific settings (flexible structure)
export interface ProviderSettings {
  [key: string]: any;
}

// SAML-specific settings
export interface SAMLProviderSettings extends ProviderSettings {
  startUrl: string;
  samlDestination?: string;
  realm?: string;
  module?: string;
  gotoUrl?: string;
  metaAlias?: string;
  sessionDuration?: number;
  region?: string;
}

// AWS SSO-specific settings
export interface AWSManagedSSOSettings extends ProviderSettings {
  startUrl: string;
  region: string;
  sessionDuration?: number;
}

// OIDC-specific settings
export interface OIDCProviderSettings extends ProviderSettings {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  scopes: string[];
  redirectUri: string;
  sessionDuration?: number;
}

// Authentication result
export interface AuthenticationResult {
  success: boolean;
  sessionId?: string;
  samlAssertion?: string; // For SAML providers
  accessToken?: string;   // For OIDC providers
  idToken?: string;       // For OIDC providers
  refreshToken?: string;  // For providers that support refresh
  expiresAt?: Date;
  metadata?: { [key: string]: any };
  error?: string;
  // Device flow support
  requiresDeviceFlow?: boolean;
  deviceFlow?: {
    verificationUri: string;
    verificationUriComplete: string;
    userCode: string;
    deviceCode: string;
    expiresIn: number;
    interval: number;
  };
  message?: string;
}

// SSO Profile (simplified structure)
export interface SSOProfile {
  name: string;
  accountId: string;
  roleName: string;
  providerId: string;
  providerType: SSOProviderType;
  metadata?: { [key: string]: any };
}

// SSO Session (for tracking active sessions)
export interface SSOSession {
  sessionId: string;
  profileName: string;
  providerId: string;
  providerType: SSOProviderType;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: Date;
  createdAt: Date;
  lastRefreshed?: Date;
  metadata?: { [key: string]: any };
}

// SSO Credentials (AWS credentials)
export interface SSOCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: Date;
  roleArn: string;
  accountId: string;
  region: string;
}

// Configuration validation
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}

// Provider configuration schema
export interface ProviderConfigSchema {
  type: SSOProviderType;
  version: string;
  fields: ConfigField[];
  requiredFields: string[];
  optionalFields: string[];
}

export interface ConfigField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'url' | 'select' | 'multiselect' | 'password';
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  validation?: FieldValidation;
  options?: SelectOption[]; // For select/multiselect fields
  dependencies?: FieldDependency[];
}

export interface FieldValidation {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  custom?: (value: any) => ValidationResult;
}

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface FieldDependency {
  field: string;
  condition: 'equals' | 'not_equals' | 'contains';
  value: any;
}

// Security settings
export interface SecuritySettings {
  sslVerification: boolean;
  tokenEncryption: boolean;
  sessionBinding: boolean;
  auditLogging: boolean;
  mfaRequired?: boolean;
  sessionTimeout?: number;
}

// Proxy settings
export interface ProxySettings {
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  excludeDomains?: string[];
}

// Multi-provider configuration
export interface MultiProviderSSOConfig {
  version: string;
  lastModified: string;
  providers: ProviderConfig[];
  defaultProvider?: string;
  globalSettings?: {
    security: SecuritySettings;
    proxy?: ProxySettings;
  };
}

// Provider registry events
export interface ProviderRegistryEvent {
  type: 'provider_registered' | 'provider_unregistered' | 'provider_enabled' | 'provider_disabled';
  providerId: string;
  providerType: SSOProviderType;
  timestamp: Date;
  metadata?: { [key: string]: any };
}

// Provider status
export interface ProviderStatus {
  id: string;
  type: SSOProviderType;
  name: string;
  configured: boolean;
  healthy: boolean;
  lastChecked: Date;
  activeSessions: number;
  error?: string;
  metadata?: { [key: string]: any };
}

// Provider capabilities
export interface ProviderCapabilities {
  supportsRefresh: boolean;
  supportsRoleDiscovery: boolean;
  supportsMFA: boolean;
  supportsSessionTimeout: boolean;
  maxSessionDuration: number;
  minSessionDuration: number;
}