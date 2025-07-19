import { fromIni } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { SSOAuthenticationService } from './sso-service';
import { CredentialStorageManager } from './credential-storage';
import { 
  SSOConfiguration, 
  SSOProfile, 
  SSOCredentials, 
  CredentialProvider,
  SSOValidationResult,
  SSOAuthenticationStatus
} from '../types/sso';

export interface AWSProfile {
  name: string;
  region?: string;
  roleArn?: string;
  sourceProfile?: string;
  type?: 'cli' | 'sso';
}

export interface ConnectivityResult {
  success: boolean;
  accountId?: string;
  userId?: string;
  arn?: string;
  error?: string;
}

export class AWSCredentialsManager {
  private static instance: AWSCredentialsManager;
  private profiles: Map<string, AWSProfile> = new Map();
  private ssoProfiles: Map<string, SSOProfile> = new Map();
  private ssoService: SSOAuthenticationService | null = null;
  private credentialStorage: CredentialStorageManager;
  private providers: Map<string, CredentialProvider> = new Map();

  private constructor() {
    this.credentialStorage = new CredentialStorageManager();
  }

  public static getInstance(): AWSCredentialsManager {
    if (!AWSCredentialsManager.instance) {
      AWSCredentialsManager.instance = new AWSCredentialsManager();
    }
    return AWSCredentialsManager.instance;
  }

  public async getCredentialsForProfile(profileName: string): Promise<AwsCredentialIdentity> {
    try {
      const credentialsProvider = fromIni({ profile: profileName });
      return await credentialsProvider();
    } catch (error) {
      throw new Error(`Failed to load credentials for profile ${profileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async validateProfile(profileName: string): Promise<boolean> {
    try {
      const credentials = await this.getCredentialsForProfile(profileName);
      const stsClient = new STSClient({ 
        credentials,
        region: 'us-east-1'
      });
      
      await stsClient.send(new GetCallerIdentityCommand({}));
      return true;
    } catch (error) {
      console.error(`Profile validation failed for ${profileName}:`, error);
      return false;
    }
  }

  public async getAvailableProfiles(): Promise<string[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
      const configPath = path.join(os.homedir(), '.aws', 'config');
      
      const profiles = new Set<string>();
      
      if (fs.existsSync(credentialsPath)) {
        const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
        const credentialsProfiles = credentialsContent.match(/\[([^\]]+)\]/g);
        if (credentialsProfiles) {
          credentialsProfiles.forEach(profile => {
            const profileName = profile.replace(/\[|\]/g, '');
            profiles.add(profileName);
          });
        }
      }
      
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const configProfiles = configContent.match(/\[profile ([^\]]+)\]/g);
        if (configProfiles) {
          configProfiles.forEach(profile => {
            const profileName = profile.replace(/\[profile |\]/g, '');
            profiles.add(profileName);
          });
        }
      }
      
      return Array.from(profiles);
    } catch (error) {
      console.error('Failed to get available profiles:', error);
      return [];
    }
  }

  public async assumeRole(sourceProfile: string, roleArn: string, sessionName: string) {
    try {
      const sourceCredentials = await this.getCredentialsForProfile(sourceProfile);
      const stsClient = new STSClient({
        credentials: sourceCredentials,
        region: 'us-east-1'
      });

      const assumeRoleResponse = await stsClient.send(new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: sessionName,
      }));

      if (!assumeRoleResponse.Credentials) {
        throw new Error('Failed to assume role: No credentials returned');
      }

      return {
        accessKeyId: assumeRoleResponse.Credentials.AccessKeyId!,
        secretAccessKey: assumeRoleResponse.Credentials.SecretAccessKey!,
        sessionToken: assumeRoleResponse.Credentials.SessionToken!,
        expiration: assumeRoleResponse.Credentials.Expiration,
      };
    } catch (error) {
      throw new Error(`Failed to assume role ${roleArn}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // SSO Configuration Management
  public configureSSOService(config: SSOConfiguration): void {
    this.ssoService = new SSOAuthenticationService(config);
    this.updateSSOProfiles(config.profiles);
  }

  private updateSSOProfiles(profiles: SSOProfile[]): void {
    this.ssoProfiles.clear();
    profiles.forEach(profile => {
      this.ssoProfiles.set(profile.name, profile);
    });
  }

  // SSO Authentication Methods
  public async authenticateWithSSO(username: string, password: string, profileName: string): Promise<SSOCredentials> {
    if (!this.ssoService) {
      throw new Error('SSO service not configured');
    }

    const credentials = await this.ssoService.authenticateWithSSO(username, password, profileName);
    await this.credentialStorage.storeCredentials(profileName, credentials);
    return credentials;
  }

  public async getSSOCredentialsForProfile(profileName: string): Promise<SSOCredentials | null> {
    try {
      // First try to get from storage
      const storedCredentials = await this.credentialStorage.getCredentials(profileName);
      if (storedCredentials) {
        return storedCredentials;
      }

      // If not found or expired, return null (user needs to authenticate)
      return null;
    } catch (error) {
      console.error(`Failed to get SSO credentials for profile ${profileName}:`, error);
      return null;
    }
  }

  public async refreshSSOToken(profileName: string): Promise<SSOCredentials> {
    if (!this.ssoService) {
      throw new Error('SSO service not configured');
    }

    try {
      const credentials = await this.ssoService.refreshToken(profileName);
      await this.credentialStorage.storeCredentials(profileName, credentials);
      return credentials;
    } catch (error) {
      // If refresh fails, remove stored credentials
      await this.credentialStorage.removeCredentials(profileName);
      throw error;
    }
  }

  public async validateSSOProfile(profileName: string): Promise<SSOValidationResult> {
    if (!this.ssoService) {
      return {
        isValid: false,
        isExpired: false,
        error: 'SSO service not configured'
      };
    }

    return await this.ssoService.validateSession(profileName);
  }

  public async getSSOAuthenticationStatus(profileName: string): Promise<SSOAuthenticationStatus> {
    if (!this.ssoService) {
      return { isAuthenticated: false };
    }

    return await this.ssoService.getAuthenticationStatus(profileName);
  }

  public async logoutSSO(profileName: string): Promise<void> {
    if (this.ssoService) {
      await this.ssoService.logout(profileName);
    }
    await this.credentialStorage.removeCredentials(profileName);
  }

  // Enhanced Profile Management
  public async getAvailableSSOProfiles(): Promise<SSOProfile[]> {
    return Array.from(this.ssoProfiles.values());
  }

  public async getUnifiedProfiles(): Promise<Array<AWSProfile | SSOProfile>> {
    const cliProfiles = await this.getAvailableProfiles();
    const ssoProfiles = await this.getAvailableSSOProfiles();
    
    const unifiedProfiles: Array<AWSProfile | SSOProfile> = [
      ...cliProfiles.map(name => ({ name, type: 'cli' as const })),
      ...ssoProfiles
    ];

    return unifiedProfiles;
  }

  public async getCredentialsForAnyProfile(profileName: string, type?: 'cli' | 'sso'): Promise<AwsCredentialIdentity> {
    // If type is specified, use that specific method
    if (type === 'cli') {
      return await this.getCredentialsForProfile(profileName);
    }
    
    if (type === 'sso') {
      const credentials = await this.getSSOCredentialsForProfile(profileName);
      if (!credentials) {
        throw new Error(`No SSO credentials found for profile ${profileName}. Please authenticate first.`);
      }
      return credentials;
    }

    // Auto-detect based on available profiles
    const ssoCredentials = await this.getSSOCredentialsForProfile(profileName);
    if (ssoCredentials) {
      return ssoCredentials;
    }

    try {
      return await this.getCredentialsForProfile(profileName);
    } catch {
      throw new Error(`No credentials found for profile ${profileName}. Please check profile configuration or authenticate via SSO.`);
    }
  }

  public async validateAnyProfile(profileName: string, type?: 'cli' | 'sso'): Promise<ConnectivityResult> {
    try {
      // Determine profile type if not specified
      let profileType = type;
      if (!profileType) {
        const ssoProfile = this.ssoProfiles.get(profileName);
        profileType = ssoProfile ? 'sso' : 'cli';
      }

      let credentials: AwsCredentialIdentity;
      
      if (profileType === 'sso') {
        const ssoCredentials = await this.getSSOCredentialsForProfile(profileName);
        if (!ssoCredentials) {
          return {
            success: false,
            error: 'SSO credentials not found or expired. Please authenticate.'
          };
        }
        credentials = ssoCredentials;
      } else {
        credentials = await this.getCredentialsForProfile(profileName);
      }

      // Test credentials
      const stsClient = new STSClient({ 
        credentials,
        region: 'us-east-1'
      });
      
      const response = await stsClient.send(new GetCallerIdentityCommand({}));
      
      return {
        success: true,
        accountId: response.Account,
        userId: response.UserId,
        arn: response.Arn
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Profile validation failed: ${errorMessage}`
      };
    }
  }

  // Credential Storage Management
  public async getStoredSSOProfiles(): Promise<string[]> {
    return await this.credentialStorage.listStoredProfiles();
  }

  public async cleanupExpiredCredentials(): Promise<void> {
    await this.credentialStorage.cleanupExpiredCredentials();
  }

  public async clearAllSSOCredentials(): Promise<void> {
    await this.credentialStorage.clearAllCredentials();
  }

  public async getCredentialStatus(profileName: string): Promise<{ exists: boolean; isExpired: boolean }> {
    return await this.credentialStorage.getCredentialStatus(profileName);
  }

  // SSO Configuration Methods
  public getSSOConfiguration(): SSOConfiguration | null {
    return this.ssoService ? (this.ssoService as any).config : null;
  }

  public updateSSOConfiguration(config: SSOConfiguration): void {
    this.configureSSOService(config);
  }

  public isSSOConfigured(): boolean {
    return this.ssoService !== null;
  }

  public isSSOProfile(profileName: string): boolean {
    return this.ssoProfiles.has(profileName);
  }

  public getSSOProfile(profileName: string): SSOProfile | undefined {
    return this.ssoProfiles.get(profileName);
  }
}