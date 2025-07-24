/**
 * OIDC Provider Implementation
 * 
 * Implements the SSOProvider interface for OAuth2/OpenID Connect authentication
 * Provides foundation for generic OIDC-compliant identity providers
 */

import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHash, randomBytes } from 'crypto';
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
  OIDCProviderSettings,
  SSOCredentials
} from '../types/sso-providers';

interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  groups?: string[];
  roles?: string[];
  [key: string]: any;
}

export class OIDCProvider implements SSOProvider {
  readonly id = 'oidc-provider';
  readonly type: SSOProviderType = 'OIDC';
  readonly name = 'OpenID Connect Provider';
  readonly version = '1.0.0';

  private httpClient?: AxiosInstance;
  private config?: ProviderConfig;
  private discoveryDocument?: OIDCDiscoveryDocument;

  constructor() {
    // Provider is stateless until configured
  }

  /**
   * Authenticate with OIDC provider using authorization code flow
   */
  public async authenticate(credentials: AuthCredentials, config: ProviderConfig): Promise<AuthenticationResult> {
    try {
      this.config = config;
      this.httpClient = this.createHttpClient(config);
      
      const settings = config.settings as OIDCProviderSettings;
      
      // Load OIDC discovery document
      this.discoveryDocument = await this.loadDiscoveryDocument(settings.issuer);
      
      // For now, this is a simplified implementation that would typically involve:
      // 1. Redirecting user to authorization endpoint
      // 2. Handling callback with authorization code
      // 3. Exchanging code for tokens
      
      // In a real implementation, this would be split across multiple steps
      // For the foundation, we'll return a structure that indicates the flow is needed
      
      const sessionId = this.generateSessionId();
      const expiresAt = new Date(Date.now() + (settings.sessionDuration || 3600) * 1000);
      
      // Generate PKCE parameters for secure flow
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      
      // Build authorization URL
      const authUrl = this.buildAuthorizationUrl(settings, codeChallenge);

      return {
        success: true,
        sessionId,
        expiresAt,
        metadata: {
          provider: config.id,
          authorizationUrl: authUrl,
          codeVerifier,
          state: sessionId,
          flow: 'authorization_code_pkce',
          authenticatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        sessionId: '',
        expiresAt: new Date(),
        error: `OIDC authentication failed: ${errorMessage}`
      };
    }
  }

  /**
   * Exchange authorization code for tokens (would be called after user completes auth)
   */
  public async exchangeCodeForTokens(code: string, state: string, codeVerifier: string): Promise<AuthenticationResult> {
    if (!this.httpClient || !this.config || !this.discoveryDocument) {
      throw new Error('Provider not properly initialized');
    }

    const settings = this.config.settings as OIDCProviderSettings;

    try {
      const tokenResponse = await this.httpClient.post<TokenResponse>(
        this.discoveryDocument.token_endpoint,
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: settings.clientId,
          client_secret: settings.clientSecret || '',
          code,
          redirect_uri: settings.redirectUri,
          code_verifier: codeVerifier
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      const tokens = tokenResponse.data;
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

      return {
        success: true,
        sessionId: state,
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        metadata: {
          provider: this.config.id,
          tokenType: tokens.token_type,
          scope: tokens.scope,
          authenticatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Token exchange failed: ${errorMessage}`);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public async refreshToken?(session: any): Promise<any> {
    if (!this.httpClient || !this.config || !this.discoveryDocument || !session.refreshToken) {
      throw new Error('Cannot refresh token - missing client, discovery document, or refresh token');
    }

    const settings = this.config.settings as OIDCProviderSettings;

    try {
      const response = await this.httpClient.post<TokenResponse>(
        this.discoveryDocument.token_endpoint,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: settings.clientId,
          client_secret: settings.clientSecret || '',
          refresh_token: session.refreshToken
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          }
        }
      );

      const tokens = response.data;

      return {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
        expiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000),
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
   * For OIDC, roles are typically in the ID token or from userinfo endpoint
   */
  public async discoverRoles(authResult: AuthenticationResult): Promise<SSOProfile[]> {
    if (!authResult.success || !authResult.accessToken) {
      throw new Error('Invalid authentication result for role discovery');
    }

    try {
      const userInfo = await this.getUserInfo(authResult.accessToken);
      const profiles: SSOProfile[] = [];
      
      // Extract roles from user info
      const roles = userInfo.roles || userInfo.groups || [];
      
      for (const role of roles) {
        // Parse role format - this would be provider-specific
        // For example: "AWS:123456789012:role/MyRole" or just "MyRole"
        const roleMatch = role.match(/AWS:(\d+):role\/(.+)/);
        
        if (roleMatch) {
          const [, accountId, roleName] = roleMatch;
          profiles.push({
            name: `${accountId}-${roleName}`,
            accountId,
            roleName,
            providerId: this.config?.id || 'unknown',
            providerType: 'OIDC',
            metadata: {
              source: 'oidc-userinfo',
              fullRole: role,
              userInfo: {
                sub: userInfo.sub,
                name: userInfo.name,
                email: userInfo.email
              }
            }
          });
        } else {
          // Generic role without AWS-specific format
          profiles.push({
            name: `oidc-${role}`,
            accountId: 'oidc',
            roleName: role,
            providerId: this.config?.id || 'unknown',
            providerType: 'OIDC',
            metadata: {
              source: 'oidc-userinfo',
              genericRole: role,
              userInfo: {
                sub: userInfo.sub,
                name: userInfo.name,
                email: userInfo.email
              }
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

    if (!config.settings.issuer) {
      errors.push({
        field: 'issuer',
        message: 'OIDC issuer URL is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (config.settings.issuer && !this.isValidUrl(config.settings.issuer)) {
      errors.push({
        field: 'issuer',
        message: 'Invalid URL format for OIDC issuer',
        code: 'INVALID_URL'
      });
    }

    if (!config.settings.clientId) {
      errors.push({
        field: 'clientId',
        message: 'OIDC client ID is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (!config.settings.redirectUri) {
      errors.push({
        field: 'redirectUri',
        message: 'OIDC redirect URI is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (config.settings.redirectUri && !this.isValidUrl(config.settings.redirectUri)) {
      errors.push({
        field: 'redirectUri',
        message: 'Invalid URL format for redirect URI',
        code: 'INVALID_URL'
      });
    }

    if (!config.settings.scopes || config.settings.scopes.length === 0) {
      warnings.push({
        field: 'scopes',
        message: 'At least "openid" scope is recommended for OIDC',
        code: 'RECOMMENDED_FIELD'
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
      type: 'OIDC',
      version: this.version,
      fields: [
        {
          name: 'issuer',
          type: 'url',
          label: 'OIDC Issuer URL',
          description: 'The OpenID Connect provider issuer URL',
          required: true,
          placeholder: 'https://auth.example.com'
        },
        {
          name: 'clientId',
          type: 'string',
          label: 'Client ID',
          description: 'The OAuth2 client identifier',
          required: true,
          placeholder: 'your-client-id'
        },
        {
          name: 'clientSecret',
          type: 'password',
          label: 'Client Secret',
          description: 'The OAuth2 client secret (optional for public clients)',
          required: false,
          placeholder: 'your-client-secret'
        },
        {
          name: 'redirectUri',
          type: 'url',
          label: 'Redirect URI',
          description: 'The callback URL after authentication',
          required: true,
          placeholder: 'https://your-app.com/auth/callback'
        },
        {
          name: 'scopes',
          type: 'multiselect',
          label: 'OAuth2 Scopes',
          description: 'The OAuth2 scopes to request',
          required: false,
          options: [
            { value: 'openid', label: 'OpenID Connect' },
            { value: 'profile', label: 'Profile Information' },
            { value: 'email', label: 'Email Address' },
            { value: 'roles', label: 'User Roles' },
            { value: 'groups', label: 'User Groups' }
          ]
        },
        {
          name: 'sessionDuration',
          type: 'number',
          label: 'Session Duration (seconds)',
          description: 'How long OIDC sessions should remain valid',
          required: false,
          placeholder: '3600'
        }
      ],
      requiredFields: ['issuer', 'clientId', 'redirectUri'],
      optionalFields: ['clientSecret', 'scopes', 'sessionDuration']
    };
  }

  /**
   * Check if provider supports specific features
   */
  public supportsFeature(feature: ProviderFeature): boolean {
    const supportedFeatures: ProviderFeature[] = ['TOKEN_REFRESH', 'ROLE_DISCOVERY', 'SESSION_TIMEOUT'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Load OIDC discovery document
   */
  private async loadDiscoveryDocument(issuer: string): Promise<OIDCDiscoveryDocument> {
    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
      const response = await this.httpClient.get<OIDCDiscoveryDocument>(discoveryUrl);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to load OIDC discovery document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build authorization URL with PKCE
   */
  private buildAuthorizationUrl(settings: OIDCProviderSettings, codeChallenge: string): string {
    if (!this.discoveryDocument) {
      throw new Error('Discovery document not loaded');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: settings.clientId,
      redirect_uri: settings.redirectUri,
      scope: settings.scopes.join(' '),
      state: this.generateSessionId(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return `${this.discoveryDocument.authorization_endpoint}?${params.toString()}`;
  }

  /**
   * Get user info from userinfo endpoint
   */
  private async getUserInfo(accessToken: string): Promise<UserInfo> {
    if (!this.httpClient || !this.discoveryDocument?.userinfo_endpoint) {
      throw new Error('Cannot get user info - missing client or userinfo endpoint');
    }

    try {
      const response = await this.httpClient.get<UserInfo>(
        this.discoveryDocument.userinfo_endpoint,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      );

      return response.data;
    } catch (error) {
      throw new Error(`Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create HTTP client with proxy configuration
   */
  private createHttpClient(config: ProviderConfig): AxiosInstance {
    const axiosConfig: any = {
      timeout: 30000,
      headers: {
        'User-Agent': 'AWS-Reports-SSO-Client/1.0',
        'Accept': 'application/json'
      }
    };

    if (config.proxy?.enabled && config.proxy.url) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(config.proxy.url);
    }

    if (config.security?.sslVerification === false) {
      axiosConfig.httpsAgent = {
        ...axiosConfig.httpsAgent,
        rejectUnauthorized: false
      };
    }

    return axios.create(axiosConfig);
  }

  /**
   * PKCE helper methods
   */
  private generateCodeVerifier(): string {
    return randomBytes(32).toString('base64url');
  }

  private generateCodeChallenge(codeVerifier: string): string {
    return createHash('sha256').update(codeVerifier).digest('base64url');
  }

  /**
   * Helper methods
   */
  private generateSessionId(): string {
    return `oidc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}