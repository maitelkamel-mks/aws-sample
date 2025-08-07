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
  description?: string; // Profile type: SSO, Access Keys, Assumed Role
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
      const createdCredentials = await this.createOnDemandSession(profileName);
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
   * Create an on-demand session for a profile when first accessed
   * Handles both AWS SSO and SAML provider types
   */
  private async createOnDemandSession(profileName: string): Promise<AwsCredentialIdentity | null> {
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

    console.log(`🔍 Credential Debug: Found profile ${profileName} in ${targetProvider.type} provider ${targetProvider.id}`);

    // Handle different provider types
    if (targetProvider.type === 'AWS_SSO') {
      return await this.createAWSSOCredentials(profileName, targetProvider, targetProfile);
    } else if (targetProvider.type === 'SAML') {
      return await this.createSAMLCredentials(profileName, targetProvider, targetProfile);
    } else {
      console.log(`Unsupported provider type: ${targetProvider.type}`);
      return null;
    }
  }

  /**
   * Create AWS SSO credentials using master token
   */
  private async createAWSSOCredentials(profileName: string, targetProvider: any, targetProfile: any): Promise<AwsCredentialIdentity | null> {
    try {
      console.log(`🔍 AWS SSO Credential Debug: Creating on-demand SSO session for profile: ${profileName}`);

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
        console.log(`✅ AWS SSO Credential Debug: Created on-demand SSO session for profile: ${profileName}`);

        return {
          accessKeyId: session.accessKeyId,
          secretAccessKey: session.secretAccessKey,
          sessionToken: session.sessionToken,
          expiration: session.expiresAt
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ AWS SSO Credential Debug: Failed to create on-demand SSO session for profile ${profileName}:`, error);
      return null;
    }
  }

  /**
   * Create SAML credentials using STS AssumeRoleWithSAML
   */
  private async createSAMLCredentials(profileName: string, targetProvider: any, targetProfile: any): Promise<AwsCredentialIdentity | null> {
    try {
      console.log(`🔍 SAML Credential Debug: Creating credentials for SAML profile: ${profileName}`);

      // Get the SAML session with the assertion
      const registry = SSOProviderRegistry.getInstance();
      const providerSessions = registry.getActiveSessions(targetProvider.id);
      
      // Look for a session that has a SAML assertion
      const samlSession = providerSessions.find(session => 
        session.metadata?.samlAssertion && 
        session.expiresAt && new Date() < session.expiresAt
      );

      if (!samlSession?.metadata?.samlAssertion) {
        console.log(`🚨 SAML Credential Debug: No valid SAML assertion available for provider ${targetProvider.id}. Re-authentication required.`);
        return null;
      }

      console.log(`🔍 SAML Credential Debug: Found SAML assertion, assuming role for ${targetProfile.accountId}/${targetProfile.roleName}`);

      // Use STS AssumeRoleWithSAML to get AWS credentials
      const { STSClient, AssumeRoleWithSAMLCommand } = await import('@aws-sdk/client-sts');
      const stsClient = new STSClient({
        region: targetProfile.region || targetProvider.settings?.region || 'us-east-1'
      });

      // Use the role ARN and principal ARN from the discovered role metadata if available
      let roleArn: string;
      let principalArn: string;
      
      // First, try to find the matching discovered role with metadata
      const discoveredRole = await this.findDiscoveredRoleMetadata(targetProvider.id, targetProfile.accountId, targetProfile.roleName);
      
      if (discoveredRole?.metadata?.roleArn && discoveredRole?.metadata?.principalArn) {
        roleArn = discoveredRole.metadata.roleArn;
        principalArn = discoveredRole.metadata.principalArn;
        console.log(`✅ SAML Credential Debug: Using discovered role metadata - Role: ${roleArn}, Principal: ${principalArn}`);
      } else {
        // Try to extract principal ARN from SAML assertion in session metadata
        const extractedPrincipalArn = await this.extractPrincipalArnFromSAMLAssertion(samlSession.metadata.samlAssertion, targetProfile.accountId);
        
        roleArn = `arn:aws:iam::${targetProfile.accountId}:role/${targetProfile.roleName}`;
        if (extractedPrincipalArn) {
          principalArn = extractedPrincipalArn;
          console.log(`✅ SAML Credential Debug: Using extracted principal ARN from SAML assertion - Role: ${roleArn}, Principal: ${principalArn}`);
        } else {
          // Final fallback to constructing ARNs - try common SAML provider names
          const commonProviderNames = ['Gardian_WebSSO', 'WebSSO', 'SAML-Provider', 'IDPSAMLProvider'];
          let fallbackPrincipalArn = `arn:aws:iam::${targetProfile.accountId}:saml-provider/WebSSO`;
          
          for (const providerName of commonProviderNames) {
            const testPrincipalArn = `arn:aws:iam::${targetProfile.accountId}:saml-provider/${providerName}`;
            console.log(`⚠️ SAML Credential Debug: Trying fallback principal ARN: ${testPrincipalArn}`);
            fallbackPrincipalArn = testPrincipalArn;
            break; // Use the first one for now
          }
          
          principalArn = fallbackPrincipalArn;
          console.log(`⚠️ SAML Credential Debug: Using fallback ARNs - Role: ${roleArn}, Principal: ${principalArn}`);
        }
      }

      const assumeRoleCommand = new AssumeRoleWithSAMLCommand({
        RoleArn: roleArn,
        PrincipalArn: principalArn,
        SAMLAssertion: samlSession.metadata.samlAssertion,
        DurationSeconds: targetProvider.settings?.sessionDuration || 3600
      });

      console.log(`🔍 SAML Credential Debug: Calling AssumeRoleWithSAML for role: ${roleArn}`);
      const assumeRoleResponse = await stsClient.send(assumeRoleCommand);

      if (assumeRoleResponse.Credentials) {
        const credentials = assumeRoleResponse.Credentials;
        const expiresAt = credentials.Expiration || new Date(Date.now() + 3600000);
        
        console.log(`✅ SAML Credential Debug: Successfully created AWS credentials for profile: ${profileName}`);

        // Update the existing session with the AWS credentials
        const existingSessionIndex = providerSessions.findIndex(s => s.sessionId === samlSession.sessionId);
        if (existingSessionIndex >= 0) {
          providerSessions[existingSessionIndex] = {
            ...samlSession,
            accessKeyId: credentials.AccessKeyId!,
            secretAccessKey: credentials.SecretAccessKey!,
            sessionToken: credentials.SessionToken!,
            expiresAt,
            lastRefreshed: new Date(),
            metadata: {
              ...samlSession.metadata,
              accountId: targetProfile.accountId,
              roleName: targetProfile.roleName,
              region: targetProfile.region,
              awsCredentialsCreated: true
            }
          };
        }

        return {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken!,
          expiration: expiresAt
        };
      }

      console.log(`❌ SAML Credential Debug: No credentials returned from AssumeRoleWithSAML`);
      return null;
    } catch (error) {
      console.error(`❌ SAML Credential Debug: Failed to create SAML credentials for profile ${profileName}:`, error);
      return null;
    }
  }

  /**
   * Extract principal ARN from SAML assertion by parsing the role attributes
   * Finds the principal ARN that matches the target account
   */
  private async extractPrincipalArnFromSAMLAssertion(samlAssertion: string, targetAccountId?: string): Promise<string | null> {
    try {
      console.log(`🔍 SAML Principal Debug: Extracting principal ARN from SAML assertion for account: ${targetAccountId || 'any'}`);
      
      // Decode SAML assertion
      const decodedSAML = Buffer.from(samlAssertion, 'base64').toString('utf-8');
      
      // Parse SAML XML using cheerio
      const cheerio = await import('cheerio');
      const $ = cheerio.load(decodedSAML, { xmlMode: true });
      
      // Find role attributes in SAML assertion
      const roleAttributes = $('saml\\:Attribute[Name*=\"Role\"], Attribute[Name*=\"Role\"]');
      
      let principalArn: string | null = null;
      const allPrincipals: { roleArn: string; principalArn: string; accountId: string }[] = [];
      
      roleAttributes.each((_, element) => {
        const attributeValues = $(element).find('saml\\:AttributeValue, AttributeValue');
        
        attributeValues.each((_, valueElement) => {
          const roleValue = $(valueElement).text().trim();
          
          // Parse role ARN format: arn:aws:iam::ACCOUNT:role/ROLE,arn:aws:iam::ACCOUNT:saml-provider/PROVIDER
          const parts = roleValue.split(',');
          if (parts.length === 2) {
            const part1 = parts[0].trim();
            const part2 = parts[1].trim();
            
            let roleArn: string | null = null;
            let currentPrincipalArn: string | null = null;
            
            // Determine which part is the role and which is the principal
            if (part1.includes(':role/')) {
              roleArn = part1;
              currentPrincipalArn = part2;
            } else if (part2.includes(':role/')) {
              roleArn = part2;
              currentPrincipalArn = part1;
            }
            
            if (roleArn && currentPrincipalArn && currentPrincipalArn.includes('saml-provider')) {
              // Extract account ID from the role ARN
              const roleAccountMatch = roleArn.match(/arn:aws:iam::(\\d+):role/);
              const principalAccountMatch = currentPrincipalArn.match(/arn:aws:iam::(\\d+):saml-provider/);
              
              if (roleAccountMatch && principalAccountMatch) {
                const roleAccount = roleAccountMatch[1];
                const principalAccount = principalAccountMatch[1];
                
                allPrincipals.push({
                  roleArn,
                  principalArn: currentPrincipalArn,
                  accountId: roleAccount
                });
                
                console.log(`🔍 SAML Principal Debug: Found role/principal pair - Role: ${roleArn} (${roleAccount}), Principal: ${currentPrincipalArn} (${principalAccount})`);
                
                // If we have a target account, look for matching principals
                if (targetAccountId) {
                  if (roleAccount === targetAccountId) {
                    // Prefer the principal ARN from the same account as the role
                    if (principalAccount === targetAccountId) {
                      principalArn = currentPrincipalArn;
                      console.log(`✅ SAML Principal Debug: Found matching principal ARN for target account ${targetAccountId}: ${principalArn}`);
                      return false; // break the loop
                    } else if (!principalArn) {
                      // Use this as a fallback even if accounts don't match
                      principalArn = currentPrincipalArn;
                      console.log(`⚠️ SAML Principal Debug: Using cross-account principal ARN as fallback: ${principalArn}`);
                    }
                  }
                } else if (!principalArn) {
                  // No target account specified, use the first one found
                  principalArn = currentPrincipalArn;
                  console.log(`✅ SAML Principal Debug: Found principal ARN in assertion: ${principalArn}`);
                }
              }
            }
          }
        });
      });
      
      if (!principalArn) {
        console.log(`🔍 SAML Principal Debug: No principal ARN found in SAML assertion for account ${targetAccountId || 'any'}`);
        console.log(`🔍 SAML Principal Debug: Available principals:`, allPrincipals);
      }
      
      return principalArn;
    } catch (error) {
      console.error('Error extracting principal ARN from SAML assertion:', error);
      return null;
    }
  }

  /**
   * Find discovered role metadata for SAML principal ARN resolution
   */
  private async findDiscoveredRoleMetadata(providerId: string, accountId: string, roleName: string): Promise<any> {
    try {
      console.log(`🔍 SAML Credential Debug: Looking for role metadata for ${accountId}/${roleName} in provider ${providerId}`);
      
      // Load multi-provider SSO configuration to find the stored role metadata
      const { ConfigManager } = await import('../config');
      const configManager = ConfigManager.getInstance();
      const ssoConfig = await configManager.loadMultiProviderSSOConfig();
      
      if (!ssoConfig?.providers) {
        console.log(`🔍 SAML Credential Debug: No SSO providers in configuration`);
        return null;
      }

      // Find the provider in configuration
      const provider = ssoConfig.providers.find(p => p.id === providerId);
      if (!provider?.settings?.profiles) {
        console.log(`🔍 SAML Credential Debug: Provider ${providerId} not found or has no profiles`);
        return null;
      }

      // Find the matching profile in the provider's stored profiles
      const profile = provider.settings.profiles.find((p: any) => 
        p.accountId === accountId && p.roleName === roleName
      );
      
      if (profile?.metadata) {
        console.log(`✅ SAML Credential Debug: Found role metadata for ${accountId}/${roleName}:`, {
          hasRoleArn: !!profile.metadata.roleArn,
          hasPrincipalArn: !!profile.metadata.principalArn,
          roleArn: profile.metadata.roleArn,
          principalArn: profile.metadata.principalArn
        });
        return profile;
      }

      console.log(`🔍 SAML Credential Debug: No metadata found for ${accountId}/${roleName} in provider ${providerId}`);
      return null;
    } catch (error) {
      console.error('Error finding discovered role metadata:', error);
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