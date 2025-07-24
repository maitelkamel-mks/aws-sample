/**
 * AWS Managed SSO Provider Implementation
 * 
 * Implements the SSOProvider interface for AWS Identity Center (AWS SSO)
 * Handles OAuth2-based authentication with AWS managed endpoints
 */

import { SSOClient, GetRoleCredentialsCommand, ListAccountRolesCommand } from '@aws-sdk/client-sso';
import { SSOOIDCClient, RegisterClientCommand, StartDeviceAuthorizationCommand, CreateTokenCommand } from '@aws-sdk/client-sso-oidc';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import {
  SSOProvider,
  SSOProviderType,
  ProviderConfig,
  AuthCredentials,
  AuthenticationResult,
  SSOProfile,
  ValidationResult,
  ProviderConfigSchema,
  ProviderFeature,
  AWSManagedSSOSettings
} from '../types/sso-providers';

interface DeviceAuthorizationResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

interface TokenResult {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  refreshToken?: string;
}

export class AWSManagedSSOProvider implements SSOProvider {
  readonly id = 'aws-managed-sso';
  readonly type: SSOProviderType = 'AWS_SSO';
  readonly name = 'AWS Identity Center (AWS SSO)';
  readonly version = '1.0.0';

  private ssoClient?: SSOClient;
  private ssoOidcClient?: SSOOIDCClient;
  private httpClient?: AxiosInstance;
  private config?: ProviderConfig;
  private clientInfo?: { clientId: string; clientSecret: string; registrationExpiresAt: Date };

  constructor() {
    // Provider is stateless until configured
  }

  /**
   * Authenticate with AWS SSO using device flow
   */
  public async authenticate(credentials: AuthCredentials, config: ProviderConfig): Promise<AuthenticationResult> {
    try {
      this.config = config;
      this.initializeClients(config);
      
      const settings = config.settings as AWSManagedSSOSettings;
      
      // Step 1: Register OIDC client if needed
      const clientInfo = await this.ensureClientRegistration(settings);
      
      // Step 2: Start device authorization flow
      const deviceAuth = await this.startDeviceAuthorization(clientInfo);
      
      // Step 3: Return device authorization info to frontend for user interaction
      // Instead of polling immediately, we'll return the device flow info
      // The frontend should handle opening the browser and then call a separate endpoint to complete auth
      
      return {
        success: true,
        requiresDeviceFlow: true,
        deviceFlow: {
          verificationUri: deviceAuth.verificationUri,
          verificationUriComplete: deviceAuth.verificationUriComplete,
          userCode: deviceAuth.userCode,
          deviceCode: deviceAuth.deviceCode,
          expiresIn: deviceAuth.expiresIn,
          interval: deviceAuth.interval
        },
        message: 'Device authorization started. Please complete authentication in your browser.',
        metadata: {
          provider: config.id,
          startUrl: settings.startUrl,
          region: settings.region,
          step: 'device_authorization'
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        sessionId: '',
        expiresAt: new Date(),
        error: `AWS SSO authentication failed: ${errorMessage}`
      };
    }
  }

  /**
   * Complete device flow authentication (polling phase)
   */
  public async completeDeviceFlow(deviceFlow: any, config: ProviderConfig): Promise<AuthenticationResult> {
    console.log('Starting device flow completion for:', config.id);
    try {
      this.config = config;
      this.initializeClients(config);
      
      const settings = config.settings as AWSManagedSSOSettings;
      
      // Get client info - should be cached from initial auth call
      const clientInfo = await this.ensureClientRegistration(settings);
      console.log('Client info obtained for device flow completion');
      
      // Poll for token using the device flow info
      console.log('Polling for token with device code:', deviceFlow.deviceCode);
      const tokenResult = await this.pollForToken(clientInfo, {
        deviceCode: deviceFlow.deviceCode,
        userCode: deviceFlow.userCode,
        verificationUri: deviceFlow.verificationUri,
        verificationUriComplete: deviceFlow.verificationUriComplete,
        expiresIn: deviceFlow.expiresIn,
        interval: deviceFlow.interval
      });
      
      console.log('Token result received:', {
        hasAccessToken: !!tokenResult.accessToken,
        hasRefreshToken: !!tokenResult.refreshToken,
        expiresIn: tokenResult.expiresIn
      });
      
      const sessionId = this.generateSessionId();
      const expiresAt = new Date(Date.now() + tokenResult.expiresIn * 1000);

      return {
        success: true,
        sessionId,
        accessToken: tokenResult.accessToken,
        refreshToken: tokenResult.refreshToken,
        expiresAt,
        metadata: {
          provider: config.id,
          authenticatedAt: new Date().toISOString(),
          startUrl: settings.startUrl,
          region: settings.region
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Device flow completion failed: ${errorMessage}`,
        metadata: {
          provider: config.id,
          error: errorMessage,
          step: 'token_polling'
        }
      };
    }
  }

  /**
   * Refresh token for existing session
   */
  public async refreshToken?(session: any): Promise<any> {
    if (!this.ssoOidcClient || !this.clientInfo || !session.refreshToken) {
      throw new Error('Cannot refresh token - missing client or refresh token');
    }

    try {
      const response = await this.ssoOidcClient.send(new CreateTokenCommand({
        clientId: this.clientInfo.clientId,
        clientSecret: this.clientInfo.clientSecret,
        grantType: 'refresh_token',
        refreshToken: session.refreshToken
      }));

      return {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
        expiresAt: new Date(Date.now() + (response.expiresIn || 3600) * 1000),
        roleArn: session.roleArn,
        accountId: session.accountId,
        region: session.region
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Discover available roles from authentication result
   */
  public async discoverRoles(authResult: AuthenticationResult): Promise<SSOProfile[]> {
    console.log('Starting role discovery with:', {
      success: authResult.success,
      hasAccessToken: !!authResult.accessToken,
      hasSsoClient: !!this.ssoClient,
      hasConfig: !!this.config
    });
    
    if (!authResult.success || !authResult.accessToken || !this.ssoClient) {
      throw new Error('Invalid authentication result or SSO client not initialized');
    }

    try {
      const profiles: SSOProfile[] = [];
      
      // Get all accounts accessible with this access token
      const accounts = await this.listAccounts(authResult.accessToken);
      
      // For each account, get available roles
      for (const account of accounts) {
        const roles = await this.listAccountRoles(authResult.accessToken, account.accountId);
        
        for (const role of roles) {
          profiles.push({
            name: `${account.accountName || account.accountId}-${role.roleName}`,
            accountId: account.accountId,
            roleName: role.roleName,
            providerId: this.config?.id || 'unknown',
            providerType: 'AWS_SSO',
            metadata: {
              accountName: account.accountName,
              emailAddress: account.emailAddress,
              roleArn: `arn:aws:iam::${account.accountId}:role/${role.roleName}`,
              source: 'aws-sso-discovery'
            }
          });
        }
      }
      
      return profiles;
    } catch (error) {
      throw new Error(`Role discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate provider configuration
   */
  public validateConfig(config: ProviderConfig): ValidationResult {
    const errors: { field: string; message: string; code: string }[] = [];
    const warnings: { field: string; message: string; code: string }[] = [];

    if (!config.settings.startUrl) {
      errors.push({
        field: 'startUrl',
        message: 'AWS SSO start URL is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (config.settings.startUrl && !this.isValidUrl(config.settings.startUrl)) {
      errors.push({
        field: 'startUrl',
        message: 'Invalid URL format for AWS SSO start URL',
        code: 'INVALID_URL'
      });
    }

    if (!config.settings.region) {
      errors.push({
        field: 'region',
        message: 'AWS region is required for AWS SSO',
        code: 'REQUIRED_FIELD'
      });
    }

    if (config.settings.sessionDuration && (config.settings.sessionDuration < 900 || config.settings.sessionDuration > 43200)) {
      warnings.push({
        field: 'sessionDuration',
        message: 'Session duration should be between 15 minutes (900s) and 12 hours (43200s)',
        code: 'INVALID_RANGE'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get provider-specific configuration schema
   */
  public getConfigSchema(): ProviderConfigSchema {
    return {
      type: 'AWS_SSO',
      version: this.version,
      fields: [
        {
          name: 'startUrl',
          type: 'url',
          label: 'AWS SSO Start URL',
          description: 'The AWS SSO portal URL provided by your organization',
          required: true,
          placeholder: 'https://your-org.awsapps.com/start'
        },
        {
          name: 'region',
          type: 'select',
          label: 'AWS Region',
          description: 'The AWS region where your SSO instance is hosted',
          required: true,
          options: [
            { value: 'us-east-1', label: 'US East (N. Virginia)' },
            { value: 'us-east-2', label: 'US East (Ohio)' },
            { value: 'us-west-1', label: 'US West (N. California)' },
            { value: 'us-west-2', label: 'US West (Oregon)' },
            { value: 'eu-west-1', label: 'Europe (Ireland)' },
            { value: 'eu-west-2', label: 'Europe (London)' },
            { value: 'eu-central-1', label: 'Europe (Frankfurt)' },
            { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
            { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
            { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)' }
          ]
        },
        {
          name: 'sessionDuration',
          type: 'number',
          label: 'Session Duration (seconds)',
          description: 'How long AWS SSO sessions should remain valid (15 min - 12 hours)',
          required: false,
          placeholder: '3600',
          validation: {
            minLength: 900,
            maxLength: 43200
          }
        }
      ],
      requiredFields: ['startUrl', 'region'],
      optionalFields: ['sessionDuration']
    };
  }

  /**
   * Check if provider supports specific features
   */
  public supportsFeature(feature: ProviderFeature): boolean {
    const supportedFeatures: ProviderFeature[] = ['TOKEN_REFRESH', 'ROLE_DISCOVERY', 'SESSION_TIMEOUT', 'MFA'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Initialize AWS SDK clients
   */
  private initializeClients(config: ProviderConfig): void {
    const settings = config.settings as AWSManagedSSOSettings;
    
    const clientConfig: any = {
      region: settings.region
    };

    // Configure proxy if enabled
    if (config.proxy?.enabled && config.proxy.url) {
      const httpsAgent = new HttpsProxyAgent(config.proxy.url);
      clientConfig.requestHandler = {
        httpsAgent
      };
    }

    this.ssoClient = new SSOClient(clientConfig);
    this.ssoOidcClient = new SSOOIDCClient(clientConfig);
    
    // Create HTTP client for direct API calls if needed
    this.httpClient = this.createHttpClient(config);
  }

  /**
   * Create HTTP client with proxy configuration
   */
  private createHttpClient(config: ProviderConfig): AxiosInstance {
    const axiosConfig: any = {
      timeout: 30000,
      headers: {
        'User-Agent': 'AWS-Reports-SSO-Client/1.0'
      }
    };

    if (config.proxy?.enabled && config.proxy.url) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(config.proxy.url);
    }

    return axios.create(axiosConfig);
  }

  /**
   * Ensure OIDC client is registered
   */
  private async ensureClientRegistration(settings: AWSManagedSSOSettings): Promise<{ clientId: string; clientSecret: string }> {
    if (!this.ssoOidcClient) {
      throw new Error('OIDC client not initialized');
    }

    // Check if we have valid client registration
    if (this.clientInfo && this.clientInfo.registrationExpiresAt > new Date()) {
      return {
        clientId: this.clientInfo.clientId,
        clientSecret: this.clientInfo.clientSecret
      };
    }

    // Register new client
    const response = await this.ssoOidcClient.send(new RegisterClientCommand({
      clientName: 'AWS Reports Web App',
      clientType: 'public'
    }));

    if (!response.clientId || !response.clientSecret) {
      throw new Error('Failed to register OIDC client');
    }

    this.clientInfo = {
      clientId: response.clientId,
      clientSecret: response.clientSecret,
      registrationExpiresAt: new Date(Date.now() + (response.clientSecretExpiresAt || 3600) * 1000)
    };

    return {
      clientId: response.clientId,
      clientSecret: response.clientSecret
    };
  }

  /**
   * Start device authorization flow
   */
  private async startDeviceAuthorization(clientInfo: { clientId: string; clientSecret: string }): Promise<DeviceAuthorizationResult> {
    if (!this.ssoOidcClient || !this.config) {
      throw new Error('OIDC client or config not initialized');
    }

    const settings = this.config.settings as AWSManagedSSOSettings;
    
    const response = await this.ssoOidcClient.send(new StartDeviceAuthorizationCommand({
      clientId: clientInfo.clientId,
      clientSecret: clientInfo.clientSecret,
      startUrl: settings.startUrl
    }));

    if (!response.deviceCode || !response.userCode || !response.verificationUri) {
      throw new Error('Invalid device authorization response');
    }

    return {
      deviceCode: response.deviceCode,
      userCode: response.userCode,
      verificationUri: response.verificationUri,
      verificationUriComplete: response.verificationUriComplete || response.verificationUri,
      expiresIn: response.expiresIn || 600,
      interval: response.interval || 5
    };
  }

  /**
   * Poll for authorization token
   */
  private async pollForToken(clientInfo: { clientId: string; clientSecret: string }, deviceAuth: DeviceAuthorizationResult): Promise<TokenResult> {
    if (!this.ssoOidcClient) {
      throw new Error('OIDC client not initialized');
    }

    const maxAttempts = Math.floor(deviceAuth.expiresIn / deviceAuth.interval);
    let attempts = 0;
    
    console.log('Starting token polling with:', {
      maxAttempts,
      interval: deviceAuth.interval,
      expiresIn: deviceAuth.expiresIn,
      deviceCodeLength: deviceAuth.deviceCode?.length
    });

    while (attempts < maxAttempts) {
      try {
        const response = await this.ssoOidcClient.send(new CreateTokenCommand({
          clientId: clientInfo.clientId,
          clientSecret: clientInfo.clientSecret,
          grantType: 'urn:ietf:params:oauth:grant-type:device_code',
          deviceCode: deviceAuth.deviceCode
        }));

        if (response.accessToken) {
          return {
            accessToken: response.accessToken,
            tokenType: response.tokenType || 'Bearer',
            expiresIn: response.expiresIn || 3600,
            refreshToken: response.refreshToken
          };
        }
      } catch (error: any) {
        console.log(`Poll attempt ${attempts + 1}/${maxAttempts} failed:`, {
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.$metadata?.httpStatusCode
        });
        
        // Handle expected errors during polling
        if (error.name === 'AuthorizationPendingException') {
          // User hasn't completed authorization yet, continue polling
          console.log('Authorization still pending, continuing to poll...');
          await this.sleep(deviceAuth.interval * 1000);
          attempts++;
          continue;
        } else if (error.name === 'SlowDownException') {
          // Slow down polling
          console.log('Slowing down polling as requested...');
          await this.sleep((deviceAuth.interval + 5) * 1000);
          attempts++;
          continue;
        } else if (error.name === 'ExpiredTokenException') {
          throw new Error('Device authorization expired. Please try again.');
        } else if (error.name === 'AccessDeniedException') {
          throw new Error('Authorization denied by user.');
        } else {
          console.error('Unexpected error during token polling:', error);
          throw error;
        }
      }
    }

    throw new Error('Device authorization timed out');
  }

  /**
   * List accounts accessible with access token
   */
  private async listAccounts(accessToken: string): Promise<any[]> {
    if (!this.ssoClient) {
      throw new Error('SSO client not initialized');
    }

    try {
      console.log('AWS SSO: Listing accounts with access token');
      
      const { ListAccountsCommand } = await import('@aws-sdk/client-sso');
      const response = await this.ssoClient.send(new ListAccountsCommand({
        accessToken
      }));
      
      console.log('AWS SSO: Found', response.accountList?.length || 0, 'accounts');
      return response.accountList || [];
    } catch (error) {
      console.error('AWS SSO: Failed to list accounts:', error);
      throw new Error(`Failed to list accounts: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List roles for a specific account
   */
  private async listAccountRoles(accessToken: string, accountId: string): Promise<any[]> {
    if (!this.ssoClient) {
      throw new Error('SSO client not initialized');
    }

    try {
      const response = await this.ssoClient.send(new ListAccountRolesCommand({
        accessToken,
        accountId
      }));

      return response.roleList || [];
    } catch (error) {
      throw new Error(`Failed to list roles for account ${accountId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Helper methods
   */
  private generateSessionId(): string {
    return `aws-sso-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}