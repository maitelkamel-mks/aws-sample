import { fromIni } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';
import { SSOProviderRegistry } from '../services/sso-provider-registry';
import { SSOSession } from '../types/sso-providers';

export interface AWSProfile {
  name: string;
  region?: string;
  roleArn?: string;
  sourceProfile?: string;
  type?: 'cli';
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

  private constructor() {}

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

  public async getUnifiedProfiles(): Promise<AWSProfile[]> {
    const cliProfiles = await this.getAvailableProfiles();
    const unifiedProfiles: AWSProfile[] = cliProfiles.map(profile => ({
      name: profile,
      type: 'cli'
    }));
    
    return unifiedProfiles;
  }

  /**
   * Get credentials for any profile with priority order:
   * 1. SSO in-memory credentials (if available and valid)
   * 2. CLI credentials from ~/.aws/ files
   */
  public async getCredentialsForAnyProfile(profileName: string): Promise<AwsCredentialIdentity> {
    // First, try to get SSO credentials from active sessions
    const ssoCredentials = await this.getSSOCredentialsForProfile(profileName);
    if (ssoCredentials) {
      console.log(`Using SSO credentials for profile: ${profileName}`);
      return ssoCredentials;
    }

    // Fallback to CLI credentials
    try {
      console.log(`Using CLI credentials for profile: ${profileName}`);
      return await this.getCredentialsForProfile(profileName);
    } catch (error) {
      throw new Error(`No credentials found for profile ${profileName}. Please check profile configuration or SSO session.`);
    }
  }

  /**
   * Check if SSO credentials are available and valid for a profile
   */
  public async hasSSOCredentials(profileName: string): Promise<boolean> {
    const ssoCredentials = await this.getSSOCredentialsForProfile(profileName);
    return ssoCredentials !== null;
  }

  /**
   * Get SSO credentials from active sessions if available and valid
   */
  private async getSSOCredentialsForProfile(profileName: string): Promise<AwsCredentialIdentity | null> {
    try {
      const registry = SSOProviderRegistry.getInstance();
      const allSessions = registry.getAllActiveSessions();
      
      console.log(`Checking SSO credentials for profile: ${profileName} - Found ${allSessions.size} provider(s) with sessions`);
      
      // Debug: Log all session profile names
      for (const [providerId, sessions] of allSessions) {
        const profileNames = sessions.map(s => s.profileName);
        console.log(`Provider ${providerId} session profiles: [${profileNames.join(', ')}]`);
      }
      
      // Look for active session for this profile
      for (const [, sessions] of allSessions) {
        for (const session of sessions) {
          if (session.profileName === profileName) {
            // Check if session is still valid (not expired)
            if (session.expiresAt && new Date() < session.expiresAt) {
              console.log(`Using valid SSO session for profile: ${profileName}`);
              return {
                accessKeyId: session.accessKeyId,
                secretAccessKey: session.secretAccessKey,
                sessionToken: session.sessionToken,
                expiration: session.expiresAt
              };
            } else {
              console.log(`SSO session expired for profile: ${profileName}, expired at: ${session.expiresAt}`);
            }
          }
        }
      }

      // If no session found, try syncing sessions with current configuration
      // This handles the case where profile names were updated in config
      if (allSessions.size > 0) {
        console.log(`No session found for ${profileName}, attempting to sync with configuration...`);
        await registry.syncSessionsWithConfig();
        
        // Try again after sync
        const syncedSessions = registry.getAllActiveSessions();
        for (const [, sessions] of syncedSessions) {
          for (const session of sessions) {
            if (session.profileName === profileName) {
              // Check if session is still valid (not expired)
              if (session.expiresAt && new Date() < session.expiresAt) {
                console.log(`Using synced SSO session for profile: ${profileName}`);
                return {
                  accessKeyId: session.accessKeyId,
                  secretAccessKey: session.secretAccessKey,
                  sessionToken: session.sessionToken,
                  expiration: session.expiresAt
                };
              }
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.warn(`Failed to check SSO credentials for profile ${profileName}:`, error);
      return null;
    }
  }

  /**
   * Validate any profile using priority-based credential resolution
   */
  public async validateAnyProfile(profileName: string): Promise<ConnectivityResult> {
    try {
      // Use the priority-based credential resolution
      const credentials = await this.getCredentialsForAnyProfile(profileName);
      const stsClient = new STSClient({
        credentials,
        region: 'us-east-1'
      });

      const identity = await stsClient.send(new GetCallerIdentityCommand({}));

      return {
        success: true,
        accountId: identity.Account,
        userId: identity.UserId,
        arn: identity.Arn
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  public async testConnectivity(profileName: string): Promise<ConnectivityResult> {
    return this.validateAnyProfile(profileName);
  }
}