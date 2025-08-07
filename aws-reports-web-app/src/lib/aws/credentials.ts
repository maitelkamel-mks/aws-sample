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
   * Get detailed information about CLI profiles including authentication method
   */
  public async getDetailedCLIProfiles(): Promise<AWSProfile[]> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      const credentialsPath = path.join(os.homedir(), '.aws', 'credentials');
      const configPath = path.join(os.homedir(), '.aws', 'config');
      
      const profiles = new Map<string, AWSProfile>();
      
      // Parse credentials file for profile names and access keys
      if (fs.existsSync(credentialsPath)) {
        const credentialsContent = fs.readFileSync(credentialsPath, 'utf8');
        const sections = credentialsContent.split(/\n(?=\[)/);
        
        for (const section of sections) {
          const profileMatch = section.match(/\[([^\]]+)\]/);
          if (profileMatch) {
            const profileName = profileMatch[1];
            
            // Check if this profile has access keys
            const hasAccessKeyId = section.includes('aws_access_key_id');
            const hasSecretKey = section.includes('aws_secret_access_key');
            const hasAccessKeys = hasAccessKeyId && hasSecretKey;
            
            profiles.set(profileName, {
              name: profileName,
              type: 'cli',
              description: hasAccessKeys ? 'Access Keys' : undefined
            });
          }
        }
      }
      
      // Parse config file for additional details like SSO and role assumptions
      if (fs.existsSync(configPath)) {
        const configContent = fs.readFileSync(configPath, 'utf8');
        const sections = configContent.split(/\n(?=\[)/);
        
        for (const section of sections) {
          const profileMatch = section.match(/\[profile ([^\]]+)\]/) || section.match(/\[([^\]]+)\]/);
          if (profileMatch) {
            const profileName = profileMatch[1];
            
            // Check for SSO configuration
            const hasSsoStartUrl = section.includes('sso_start_url');
            const hasSsoAccountId = section.includes('sso_account_id');
            const hasSsoRoleName = section.includes('sso_role_name');
            const isSSO = hasSsoStartUrl && hasSsoAccountId && hasSsoRoleName;
            
            // Check for role assumption
            const roleArnMatch = section.match(/role_arn\s*=\s*([^\n\r]+)/);
            const sourceProfileMatch = section.match(/source_profile\s*=\s*([^\n\r]+)/);
            const isAssumedRole = roleArnMatch && sourceProfileMatch;
            
            // Extract region if present
            const regionMatch = section.match(/region\s*=\s*([^\n\r]+)/);
            const region = regionMatch ? regionMatch[1].trim() : undefined;
            
            let description: string | undefined;
            if (isSSO) {
              description = 'SSO';
            } else if (isAssumedRole) {
              description = 'Assumed Role';
            }
            
            if (profiles.has(profileName)) {
              // Update existing profile
              const existingProfile = profiles.get(profileName)!;
              profiles.set(profileName, {
                ...existingProfile,
                region,
                roleArn: roleArnMatch ? roleArnMatch[1].trim() : undefined,
                sourceProfile: sourceProfileMatch ? sourceProfileMatch[1].trim() : undefined,
                description: description || existingProfile.description
              });
            } else {
              // Add new profile (from config file)
              profiles.set(profileName, {
                name: profileName,
                type: 'cli',
                region,
                roleArn: roleArnMatch ? roleArnMatch[1].trim() : undefined,
                sourceProfile: sourceProfileMatch ? sourceProfileMatch[1].trim() : undefined,
                description
              });
            }
          }
        }
      }
      
      // Filter out default profile if it has no connection configuration
      return Array.from(profiles.values()).filter(profile => {
        // If it's not the default profile, keep it
        if (profile.name !== 'default') {
          return true;
        }
        
        // For default profile, only keep if it has actual connection configuration
        // Region is not connection data, only authentication methods matter
        return profile.description || profile.roleArn;
      });
    } catch (error) {
      console.error('Failed to get detailed CLI profiles:', error);
      // Fallback to basic profile names
      const basicProfiles = await this.getAvailableProfiles();
      return basicProfiles.map(profile => ({
        name: profile,
        type: 'cli' as const
      }));
    }
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
   * Implements on-demand session creation for improved UX
   */
  private async getSSOCredentialsForProfile(profileName: string): Promise<AwsCredentialIdentity | null> {
    try {
      const registry = SSOProviderRegistry.getInstance();
      const allSessions = registry.getAllActiveSessions();
      
      console.log(`Checking SSO credentials for profile: ${profileName} - Found ${allSessions.size} provider(s) with sessions`);
      
      // First, look for existing active session for this profile
      for (const [providerId, sessions] of allSessions) {
        for (const session of sessions) {
          if (session.profileName === profileName) {
            // Check if session is still valid (not expired)
            if (session.expiresAt && new Date() < session.expiresAt) {
              console.log(`Using existing valid SSO session for profile: ${profileName}`);
              return {
                accessKeyId: session.accessKeyId,
                secretAccessKey: session.secretAccessKey,
                sessionToken: session.sessionToken,
                expiration: session.expiresAt
              };
            } else {
              console.log(`SSO session expired for profile: ${profileName}, expired at: ${session.expiresAt}`);
              // Remove expired session
              registry.removeSession(providerId, session.sessionId);
            }
          }
        }
      }

      // If no existing session, try to create one on-demand
      console.log(`No active session found for ${profileName}, attempting on-demand creation...`);
      const createdCredentials = await this.createOnDemandSSOSession(profileName);
      if (createdCredentials) {
        return createdCredentials;
      }

      // If on-demand creation failed, try syncing sessions with current configuration
      // This handles the case where profile names were updated in config
      if (allSessions.size > 0) {
        console.log(`On-demand creation failed, attempting to sync with configuration...`);
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
   * Create an on-demand SSO session for a profile when first accessed
   * This improves authentication UX by not creating all sessions upfront
   */
  private async createOnDemandSSOSession(profileName: string): Promise<AwsCredentialIdentity | null> {
    try {
      console.log(`Creating on-demand SSO session for profile: ${profileName}`);
      
      // Load multi-provider SSO configuration to find the profile
      const { ConfigManager } = await import('../config');
      const configManager = ConfigManager.getInstance();
      const ssoConfig = await configManager.loadMultiProviderSSOConfig();
      
      if (!ssoConfig?.providers) {
        console.log('No SSO providers configured');
        return null;
      }

      // Find which provider contains this profile
      let targetProvider: any = null;
      let targetProfile: any = null;

      for (const provider of ssoConfig.providers) {
        if (provider.settings?.profiles) {
          const profile = provider.settings.profiles.find((p: any) => p.profileName === profileName);
          if (profile) {
            targetProvider = provider;
            targetProfile = profile;
            break;
          }
        }
      }

      if (!targetProvider || !targetProfile) {
        console.log(`Profile ${profileName} not found in SSO configuration`);
        return null;
      }

      // Check if we have a master token for this provider
      const registry = SSOProviderRegistry.getInstance();
      const providerSessions = registry.getActiveSessions(targetProvider.id);
      const masterSession = providerSessions.find(session => session.metadata?.isMasterToken);

      if (!masterSession?.metadata?.accessToken) {
        console.log(`No master SSO token available for provider ${targetProvider.id}. Re-authentication required.`);
        return null;
      }

      // Create the session using the master token
      const { SSOClient, GetRoleCredentialsCommand } = await import('@aws-sdk/client-sso');
      const ssoClient = new SSOClient({ 
        region: targetProvider.settings?.region || masterSession.metadata.region || 'us-east-1' 
      });

      console.log(`Getting SSO credentials for profile: ${profileName} (${targetProfile.accountId}/${targetProfile.roleName})`);
      
      const getRoleCredentialsCommand = new GetRoleCredentialsCommand({
        accessToken: masterSession.metadata.accessToken,
        accountId: targetProfile.accountId,
        roleName: targetProfile.roleName,
      });

      const credentialsResponse = await ssoClient.send(getRoleCredentialsCommand);

      if (credentialsResponse.roleCredentials) {
        const expiresAt = new Date(credentialsResponse.roleCredentials.expiration || Date.now() + 3600000);
        
        // Create and store the session
        const session = {
          sessionId: `on-demand-${Date.now()}-${profileName}`,
          profileName: profileName,
          providerId: targetProvider.id,
          providerType: targetProvider.type,
          accessKeyId: credentialsResponse.roleCredentials.accessKeyId!,
          secretAccessKey: credentialsResponse.roleCredentials.secretAccessKey!,
          sessionToken: credentialsResponse.roleCredentials.sessionToken!,
          expiresAt,
          createdAt: new Date(),
          lastRefreshed: new Date(),
          metadata: {
            accountId: targetProfile.accountId,
            roleName: targetProfile.roleName,
            region: targetProfile.region,
            createdOnDemand: true
          }
        };
        
        registry.addSession(targetProvider.id, session);
        console.log(`Created on-demand SSO session for profile: ${profileName}`);

        return {
          accessKeyId: session.accessKeyId,
          secretAccessKey: session.secretAccessKey,
          sessionToken: session.sessionToken,
          expiration: session.expiresAt
        };
      }

      return null;
    } catch (error) {
      console.error(`Failed to create on-demand SSO session for profile ${profileName}:`, error);
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