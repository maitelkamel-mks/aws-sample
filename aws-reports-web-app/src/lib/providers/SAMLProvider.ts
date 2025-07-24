/**
 * SAML Provider Implementation
 * 
 * Implements the SSOProvider interface for SAML authentication
 * Based on the current Gardian WebSSO logic
 */

import { STSClient, AssumeRoleWithSAMLCommand } from '@aws-sdk/client-sts';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';
import {
  SSOProvider,
  SSOProviderType,
  ProviderConfig,
  AuthCredentials,
  AuthenticationResult,
  SSOProfile,
  SSOSession,
  ValidationResult,
  ProviderConfigSchema,
  ProviderFeature,
  SAMLProviderSettings,
  SSOCredentials
} from '../types/sso-providers';

export class SAMLProvider implements SSOProvider {
  readonly id = 'saml-provider';
  readonly type: SSOProviderType = 'SAML';
  readonly name = 'SAML Authentication Provider';
  readonly version = '1.0.0';

  private httpClient?: AxiosInstance;
  private config?: ProviderConfig;

  constructor() {
    // Provider is stateless until configured
  }

  /**
   * Authenticate with SAML provider using credentials
   */
  public async authenticate(credentials: AuthCredentials, config: ProviderConfig): Promise<AuthenticationResult> {
    try {
      this.config = config;
      this.httpClient = this.createHttpClient(config);
      
      if (!credentials.username || !credentials.password) {
        throw new Error('Username and password are required for SAML authentication');
      }

      // Step 1: Initiate SSO session
      const sessionData = await this.initiateSSOSession();

      // Step 2: Submit credentials and get SAML response
      const samlAssertion = await this.performAuthentication(
        sessionData,
        credentials.username,
        credentials.password
      );

      const sessionId = this.generateSessionId();
      const expiresAt = new Date(Date.now() + (config.settings.sessionDuration || 36000) * 1000);

      return {
        success: true,
        sessionId,
        samlAssertion,
        expiresAt,
        metadata: {
          provider: config.id,
          authenticatedAt: new Date().toISOString(),
          sessionData: sessionData.baseUrl
        }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        sessionId: '',
        expiresAt: new Date(),
        error: `SAML authentication failed: ${errorMessage}`
      };
    }
  }

  /**
   * Discover available roles from authentication result
   */
  public async discoverRoles(authResult: AuthenticationResult): Promise<SSOProfile[]> {
    if (!authResult.success || !authResult.samlAssertion) {
      throw new Error('Invalid authentication result for role discovery');
    }

    return await this.extractRolesFromSAML(authResult.samlAssertion);
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
        message: 'SAML start URL is required',
        code: 'REQUIRED_FIELD'
      });
    }

    if (config.settings.startUrl && !this.isValidUrl(config.settings.startUrl)) {
      errors.push({
        field: 'startUrl',
        message: 'Invalid URL format for start URL',
        code: 'INVALID_URL'
      });
    }

    if (!config.settings.realm) {
      warnings.push({
        field: 'realm',
        message: 'Realm is recommended for SAML authentication',
        code: 'RECOMMENDED_FIELD'
      });
    }

    if (!config.settings.module) {
      warnings.push({
        field: 'module',
        message: 'Module type is recommended for SAML authentication',
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
      type: 'SAML',
      version: this.version,
      fields: [
        {
          name: 'startUrl',
          type: 'url',
          label: 'SAML Start URL',
          description: 'The SSO provider endpoint URL',
          required: true,
          placeholder: 'https://websso-company.com/saml/login'
        },
        {
          name: 'samlDestination',
          type: 'string',
          label: 'SAML Destination',
          description: 'Target service identifier',
          required: false,
          placeholder: 'urn:amazon:webservices'
        },
        {
          name: 'realm',
          type: 'string',
          label: 'Authentication Realm',
          description: 'SAML authentication realm',
          required: false,
          placeholder: 'multiauth'
        },
        {
          name: 'module',
          type: 'string',
          label: 'Authentication Module',
          description: 'SAML authentication module type',
          required: false,
          placeholder: 'SoftID'
        },
        {
          name: 'gotoUrl',
          type: 'url',
          label: 'Goto URL',
          description: 'SAML IdP SSO initiation endpoint',
          required: false,
          placeholder: 'https://websso-company.com/saml2/jsp/idpSSOInit.jsp'
        },
        {
          name: 'metaAlias',
          type: 'string',
          label: 'Meta Alias',
          description: 'SAML metadata alias path',
          required: false,
          placeholder: '/multiauth/idp6'
        },
        {
          name: 'sessionDuration',
          type: 'number',
          label: 'Session Duration (seconds)',
          description: 'How long SAML sessions should remain valid',
          required: false,
          placeholder: '36000'
        },
        {
          name: 'region',
          type: 'string',
          label: 'Default AWS Region',
          description: 'AWS region for STS calls',
          required: false,
          placeholder: 'us-east-1'
        }
      ],
      requiredFields: ['startUrl'],
      optionalFields: ['samlDestination', 'realm', 'module', 'gotoUrl', 'metaAlias', 'sessionDuration', 'region']
    };
  }

  /**
   * Check if provider supports specific features
   */
  public supportsFeature(feature: ProviderFeature): boolean {
    const supportedFeatures: ProviderFeature[] = ['ROLE_DISCOVERY', 'SESSION_TIMEOUT'];
    return supportedFeatures.includes(feature);
  }

  /**
   * Create HTTP client with proxy and SSL configuration
   */
  private createHttpClient(config: ProviderConfig): AxiosInstance {
    const axiosConfig: any = {
      timeout: 30000,
      headers: {
        'User-Agent': 'AWS-Reports-SSO-Client/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      }
    };

    // Configure proxy if enabled
    if (config.proxy?.enabled && config.proxy.url) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(config.proxy.url);
    }

    // Configure SSL verification
    if (config.security?.sslVerification === false) {
      axiosConfig.httpsAgent = {
        ...axiosConfig.httpsAgent,
        rejectUnauthorized: false
      };
    }

    return axios.create(axiosConfig);
  }

  /**
   * Initiate SSO session with the SAML provider
   */
  private async initiateSSOSession(): Promise<any> {
    if (!this.httpClient || !this.config) {
      throw new Error('Provider not configured');
    }

    try {
      const settings = this.config.settings as SAMLProviderSettings;
      const moduleType = settings.module || 'SoftID';
      const realm = settings.realm || 'multiauth';
      const gotoUrl = settings.gotoUrl || 'https://websso-gardian.myelectricnetwork.com/gardianwebsso/saml2/jsp/idpSSOInit.jsp';
      const metaAlias = settings.metaAlias || '/multiauth/idp6-20261219';
      const samlDestination = settings.samlDestination || 'urn:amazon:webservices';

      // Build the correct initial URL using the module from providerSettings
      const baseUrl = new URL(settings.startUrl).origin;
      const encodedGotoUrl = encodeURIComponent(`${gotoUrl}?spEntityID=${samlDestination}&metaAlias=${metaAlias}&redirected=true`);
      const initialUrl = `${settings.startUrl}?realm=${realm}&module=${moduleType}&goto=${encodedGotoUrl}&gx_charset=UTF-8`;
      
      console.log('SAML Session Debug: Using initial URL:', initialUrl);
      
      // Step 1: Initial session to set cookies
      const initialResponse = await this.httpClient.get(initialUrl);
      console.log('SAML Session Debug: Initial response status:', initialResponse.status);
      
      // Step 2: Get auth structure from JSON endpoint
      const authValuesUrl = `${baseUrl}/gardianwebsso/json/authenticate?realm=${realm}&module=${moduleType}&goto=${gotoUrl}?spEntityID=${samlDestination}&metaAlias=${metaAlias}&redirected=true&gx_charset=UTF-8&authIndexType=module&authIndexValue=${moduleType}`;
      
      // Set required header for JSON API
      this.httpClient.defaults.headers['Accept-API-Version'] = 'protocol=1.0,resource=2.0';
      
      console.log('SAML Session Debug: Getting auth values from:', authValuesUrl);
      const authResponse = await this.httpClient.post(authValuesUrl);
      
      console.log('SAML Session Debug: Auth response status:', authResponse.status);
      console.log('SAML Session Debug: Auth response data:', JSON.stringify(authResponse.data, null, 2));
      
      // Build the final submit URL
      const submitUrl = `${baseUrl}/gardianwebsso/json/authenticate?realm=${realm}&module=${moduleType}&goto=${encodedGotoUrl}&gx_charset=UTF-8&authIndexType=module&authIndexValue=${moduleType}`;

      return {
        authData: authResponse.data,
        submitUrl,
        cookies: [...(initialResponse.headers['set-cookie'] || []), ...(authResponse.headers['set-cookie'] || [])],
        baseUrl
      };
    } catch (error) {
      const detailedError = {
        message: error instanceof Error ? error.message : 'Unknown error',
        status: (error as any)?.response?.status,
        statusText: (error as any)?.response?.statusText,
        data: (error as any)?.response?.data ? JSON.stringify((error as any).response.data) : 'No data',
        url: (error as any)?.config?.url || this.config.settings.startUrl
      };
      
      console.error('SAML Session Error:', detailedError);
      throw new Error(`Failed to initiate SAML session: ${JSON.stringify(detailedError)}`);
    }
  }

  /**
   * Perform authentication with username/password
   */
  private async performAuthentication(
    sessionData: any,
    username: string,
    password: string
  ): Promise<string> {
    if (!this.httpClient) {
      throw new Error('HTTP client not initialized');
    }

    try {
      console.log('SAML Authentication Debug: Starting JSON-based authentication');
      
      // Prepare login data based on the actual auth response structure
      const authData = sessionData.authData;
      console.log('SAML Authentication Debug: Original auth data structure:', JSON.stringify(authData, null, 2));
      
      // Build authentication payload
      const loginData = {
        ...authData,
        callbacks: authData.callbacks.map((callback: any) => {
          if (callback.input && callback.input.length > 0) {
            const input = callback.input[0];
            if (input.name === 'IDToken1') {
              return {
                ...callback,
                input: [{ ...input, value: username }]
              };
            } else if (input.name === 'IDToken2') {
              return {
                ...callback,
                input: [{ ...input, value: password }]
              };
            }
          }
          return callback;
        })
      };
      
      console.log('SAML Authentication Debug: Submitting credentials to:', sessionData.submitUrl);
      console.log('SAML Authentication Debug: Login payload:', JSON.stringify(loginData, null, 2));
      
      // Submit credentials
      const response = await this.httpClient.post(sessionData.submitUrl, loginData, {
        headers: {
          'Content-Type': 'application/json',
          'Accept-API-Version': 'protocol=1.0,resource=2.0'
        }
      });
      
      console.log('SAML Authentication Debug: Auth response status:', response.status);
      console.log('SAML Authentication Debug: Auth response data:', JSON.stringify(response.data, null, 2));
      
      // Check if authentication was successful
      if (response.data.successUrl) {
        console.log('SAML Authentication Debug: Authentication successful, getting SAML assertion');
        
        // Follow the success URL to get SAML assertion
        const samlResponse = await this.httpClient.get(response.data.successUrl);
        console.log('SAML Authentication Debug: SAML response status:', samlResponse.status);
        
        // Extract SAML assertion from response
        const samlAssertion = this.extractSAMLFromResponse(samlResponse.data);
        console.log('SAML Authentication Debug: Extracted SAML assertion length:', samlAssertion.length);
        
        return samlAssertion;
      } else {
        throw new Error('Authentication failed - no success URL returned');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('SAML Authentication Error:', errorMessage);
      throw new Error(`Authentication failed: ${errorMessage}`);
    }
  }

  /**
   * Extract SAML assertion from HTML response
   */
  private extractSAMLFromResponse(html: string): string {
    try {
      const $ = cheerio.load(html);
      const samlResponse = $('input[name="SAMLResponse"]').attr('value');
      
      if (!samlResponse) {
        console.error('SAML Response Debug: HTML content:', html.substring(0, 1000));
        throw new Error('SAML assertion not found in response');
      }
      
      return samlResponse;
    } catch (error) {
      throw new Error(`Failed to extract SAML assertion: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract available roles from SAML assertion
   */
  private async extractRolesFromSAML(samlAssertion: string): Promise<SSOProfile[]> {
    try {
      // Decode SAML assertion
      const decodedSAML = Buffer.from(samlAssertion, 'base64').toString('utf-8');
      console.log('SAML Roles Debug: Decoded SAML assertion length:', decodedSAML.length);
      
      // Parse SAML XML
      const $ = cheerio.load(decodedSAML, { xmlMode: true });
      
      const roles: SSOProfile[] = [];
      const roleAttributes = $('saml\\:Attribute[Name*="Role"], Attribute[Name*="Role"]');
      
      roleAttributes.each((_, element) => {
        const attributeValues = $(element).find('saml\\:AttributeValue, AttributeValue');
        
        attributeValues.each((_, valueElement) => {
          const roleValue = $(valueElement).text().trim();
          console.log('SAML Roles Debug: Found role value:', roleValue);
          
          // Parse role ARN format: arn:aws:iam::ACCOUNT:role/ROLE,arn:aws:iam::ACCOUNT:saml-provider/PROVIDER
          const parts = roleValue.split(',');
          if (parts.length === 2) {
            const roleArn = parts[0].trim();
            const principalArn = parts[1].trim();
            
            // Extract account ID and role name from ARN
            const roleMatch = roleArn.match(/arn:aws:iam::(\d+):role\/(.+)/);
            if (roleMatch) {
              const accountId = roleMatch[1];
              const roleName = roleMatch[2];
              
              roles.push({
                name: `${accountId}-${roleName}`,
                accountId,
                roleName,
                providerId: this.config?.id || 'unknown',
                providerType: 'SAML',
                metadata: {
                  roleArn,
                  principalArn,
                  source: 'saml-discovery'
                }
              });
            }
          }
        });
      });
      
      console.log('SAML Roles Debug: Extracted roles:', roles);
      return roles;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to extract roles from SAML: ${errorMessage}`);
    }
  }

  /**
   * Helper methods
   */
  private generateSessionId(): string {
    return `saml-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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