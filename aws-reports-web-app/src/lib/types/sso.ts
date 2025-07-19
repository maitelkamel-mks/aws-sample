import { AwsCredentialIdentity } from '@aws-sdk/types';

export interface SSOConfiguration {
  enabled: boolean;
  providerName: string;
  startUrl: string;
  authenticationType: 'SoftID' | 'LDAP' | 'OAuth2';
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

export interface SSOProfile {
  name: string;
  accountId: string;
  roleName: string;
  roleArn: string;
  principalArn: string;
  description?: string;
  region?: string;
  type: 'sso';
}

export interface ProxyConfiguration {
  enabled: boolean;
  url?: string;
  excludeDomains?: string[];
}

export interface SecuritySettings {
  sslVerification?: boolean;
  tokenEncryption?: boolean;
  sessionBinding?: boolean;
  auditLogging?: boolean;
}

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

export interface SSOCredentials extends AwsCredentialIdentity {
  sessionToken: string;
  expiration: Date;
  roleArn: string;
  accountId: string;
  region: string;
}

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
  profileName: string;
  username: string;
  password: string;
}

export interface SSORefreshRequest {
  profileName: string;
}

export interface SSOLogoutRequest {
  profileName: string;
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