import { AwsCredentialIdentity } from '@aws-sdk/types';
import { 
  SSOProfile as NewSSOProfile,
  SSOSession as NewSSOSession,
  SSOCredentials as NewSSOCredentials,
  SecuritySettings as NewSecuritySettings,
  ProxySettings as NewProxySettings,
  ProviderConfig
} from './sso-providers';

/**
 * @deprecated Use MultiProviderSSOConfig from sso-providers.ts instead
 * Legacy SSO configuration interface for backward compatibility
 */
export interface SSOConfiguration {
  enabled: boolean;
  providerName: string;
  startUrl: string;
  authenticationType: 'SAML' | 'LDAP' | 'OAuth2';
  sessionDuration: number;
  region: string;
  samlDestination?: string;
  providerSettings?: {
    realm?: string;
    module?: string;
    gotoUrl?: string;
    metaAlias?: string;
  };
  profiles: SSOProfile[];
  proxy?: ProxyConfiguration;
  security?: SecuritySettings;
}

/**
 * @deprecated Use SSOProfile from sso-providers.ts instead
 * Legacy SSO profile interface for backward compatibility
 */
export interface SSOProfile {
  name: string;
  accountId: string;
  roleName: string;
  roleArn?: string;
  principalArn?: string;
  description?: string;
  region?: string;
  type?: 'sso';
}

/**
 * @deprecated Use ProxySettings from sso-providers.ts instead
 * Legacy proxy configuration interface
 */
export interface ProxyConfiguration {
  enabled: boolean;
  url?: string;
  excludeDomains?: string[];
}

/**
 * @deprecated Use SecuritySettings from sso-providers.ts instead
 * Legacy security settings interface
 */
export interface SecuritySettings {
  sslVerification?: boolean;
  tokenEncryption?: boolean;
  sessionBinding?: boolean;
  auditLogging?: boolean;
}

/**
 * @deprecated Use SSOSession from sso-providers.ts instead
 * Legacy SSO session interface
 */
export interface SSOSession {
  profileName: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
  roleArn: string;
  accountId: string;
  userId: string;
  region: string;
}

/**
 * @deprecated Use SSOCredentials from sso-providers.ts instead
 * Legacy SSO credentials interface
 */
export interface SSOCredentials extends AwsCredentialIdentity {
  sessionToken: string;
  expiration: Date;
  roleArn: string;
  accountId: string;
  region: string;
}

// Re-export new types for easier migration
export type { 
  SSOProfile as NewSSOProfile,
  SSOSession as NewSSOSession, 
  SSOCredentials as NewSSOCredentials,
  SecuritySettings as NewSecuritySettings,
  ProxySettings as NewProxySettings
} from './sso-providers';

export type {
  MultiProviderSSOConfig,
  ProviderConfig,
  SSOProviderType,
  AuthCredentials,
  AuthenticationResult,
  SSOProvider,
  ProviderSettings,
  SAMLProviderSettings,
  AWSManagedSSOSettings,
  OIDCProviderSettings
} from './sso-providers';

// Legacy API Response Types (for backward compatibility)
export interface SSOAuthResponse {
  success: boolean;
  data?: {
    profileName: string;
    expiration: string;
    accountId: string;
    roleArn: string;
    region: string;
  };
  error?: string;
}

export interface SSOLoginRequest {
  profileName?: string;
  providerId?: string;
  username: string;
  password: string;
  // For backward compatibility
  providerName?: string;
}

export interface SSORefreshRequest {
  profileName?: string;
  providerId?: string;
}

export interface SSOLogoutRequest {
  profileName?: string;
  providerId?: string;
}

export interface SSOConfigRequest {
  config: SSOConfiguration;
}

export interface SSOConfigResponse {
  success: boolean;
  data?: SSOConfiguration;
  error?: string;
}

export interface SSOProfilesResponse {
  success: boolean;
  data?: SSOProfile[];
  error?: string;
}

// New Multi-Provider API Response Types
export interface MultiProviderConfigRequest {
  config: ProviderConfig;
}

export interface MultiProviderConfigResponse {
  success: boolean;
  data?: ProviderConfig;
  error?: string;
}

export interface ProviderListResponse {
  success: boolean;
  data?: ProviderConfig[];
  error?: string;
}

export interface ProviderAuthResponse {
  success: boolean;
  data?: {
    providerId: string;
    roles?: NewSSOProfile[];
    samlAssertion?: string;
    sessionInfo?: {
      authenticatedAt: string;
      provider: string;
    };
  };
  error?: string;
}

export interface CredentialProvider {
  type: 'cli' | 'sso';
  getCredentials(profileName: string): Promise<AwsCredentialIdentity>;
  validateCredentials(profileName: string): Promise<boolean>;
  listProfiles(): Promise<Array<unknown>>;
  refreshCredentials?(profileName: string): Promise<void>;
}

export interface SSOValidationResult {
  isValid: boolean;
  isExpired: boolean;
  expiresAt?: Date;
  error?: string;
}

export interface SSOAuthenticationStatus {
  isAuthenticated: boolean;
  profileName?: string;
  expiresAt?: Date;
  accountId?: string;
  roleArn?: string;
  userId?: string;
}