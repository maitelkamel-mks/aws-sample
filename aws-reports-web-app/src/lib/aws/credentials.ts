import { fromIni } from '@aws-sdk/credential-providers';
import { STSClient, GetCallerIdentityCommand, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { AwsCredentialIdentity } from '@aws-sdk/types';

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

  public async getCredentialsForAnyProfile(profileName: string): Promise<AwsCredentialIdentity> {
    try {
      return await this.getCredentialsForProfile(profileName);
    } catch (error) {
      throw new Error(`No credentials found for profile ${profileName}. Please check profile configuration.`);
    }
  }

  public async validateAnyProfile(profileName: string): Promise<ConnectivityResult> {
    try {
      const credentials = await this.getCredentialsForProfile(profileName);
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