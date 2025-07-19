import { STSClient, AssumeRoleWithSAMLCommand } from '@aws-sdk/client-sts';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as cheerio from 'cheerio';
import {
  SSOConfiguration,
  SSOProfile,
  SSOCredentials,
  SSOSession,
  SSOValidationResult,
  SSOAuthenticationStatus
} from '../types/sso';

export class SSOAuthenticationService {
  private sessionStore: Map<string, SSOSession> = new Map();
  private config: SSOConfiguration;
  private httpClient: AxiosInstance;

  constructor(config: SSOConfiguration) {
    this.config = config;
    this.httpClient = this.createHttpClient();
  }

  private createHttpClient(): AxiosInstance {
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

    if (this.config.proxy?.enabled && this.config.proxy.url) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(this.config.proxy.url);
    }

    if (this.config.security?.sslVerification === false) {
      axiosConfig.httpsAgent = {
        ...axiosConfig.httpsAgent,
        rejectUnauthorized: false
      };
    }

    return axios.create(axiosConfig);
  }

  public async authenticateWithSSO(
    username: string,
    password: string,
    profileName: string
  ): Promise<SSOCredentials> {
    try {
      const profile = this.findProfile(profileName);
      if (!profile) {
        throw new Error(`Profile ${profileName} not found`);
      }

      // Step 1: Initiate SSO session
      const sessionData = await this.initiateSSOSession();

      // Step 2: Submit credentials and get SAML response
      const samlAssertion = await this.performAuthentication(
        sessionData,
        username,
        password
      );

      // Step 3: Assume AWS role with SAML
      const credentials = await this.assumeRoleWithSAML(samlAssertion, profile);

      // Step 4: Store session
      await this.storeSession(profileName, credentials, profile);

      return credentials;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`SSO authentication failed: ${errorMessage}`);
    }
  }

  private findProfile(profileName: string): SSOProfile | undefined {
    return this.config.profiles.find(profile => profile.name === profileName);
  }

  private async initiateSSOSession(): Promise<any> {
    try {
      const response = await this.httpClient.get(this.config.startUrl);
      
      const $ = cheerio.load(response.data);
      
      // Extract necessary form data and session information
      const formData: any = {};
      
      // Find hidden form fields
      $('input[type="hidden"]').each((_: any, element: any) => {
        const name = $(element).attr('name');
        const value = $(element).attr('value');
        if (name && value) {
          formData[name] = value;
        }
      });

      // Extract action URL
      const formAction = $('form').attr('action');
      
      return {
        formData,
        formAction,
        cookies: response.headers['set-cookie'] || [],
        baseUrl: new URL(this.config.startUrl).origin
      };
    } catch (error) {
      throw new Error(`Failed to initiate SSO session: ${error}`);
    }
  }

  private async performAuthentication(
    sessionData: any,
    username: string,
    password: string
  ): Promise<string> {
    try {
      // Prepare authentication data
      const authData = {
        ...sessionData.formData,
        username,
        password,
        realm: this.config.providerSettings?.realm || 'multiauth',
        module: this.config.providerSettings?.module || this.config.authenticationType
      };

      // Determine the authentication URL
      const authUrl = sessionData.formAction || 
                     this.config.providerSettings?.gotoUrl ||
                     `${sessionData.baseUrl}/gardianwebsso/saml2/jsp/idpSSOInit.jsp`;

      // Submit authentication
      const response = await this.httpClient.post(authUrl, authData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': sessionData.cookies.join('; ')
        },
        maxRedirects: 5
      });

      // Extract SAML assertion from response
      return this.extractSAMLAssertion(response.data);
    } catch (error) {
      throw new Error(`Authentication failed: ${error}`);
    }
  }

  private extractSAMLAssertion(htmlResponse: string): string {
    const $ = cheerio.load(htmlResponse);
    
    // Look for SAML assertion in various possible locations
    let samlAssertion = '';
    
    // Check for SAMLResponse input field
    const samlResponseInput = $('input[name="SAMLResponse"]').attr('value');
    if (samlResponseInput) {
      samlAssertion = samlResponseInput;
    }
    
    // Check for RelayState if needed
    const relayState = $('input[name="RelayState"]').attr('value');
    
    if (!samlAssertion) {
      // Try to find SAML assertion in script tags or other elements
      $('script').each((_: any, element: any) => {
        const scriptContent = $(element).html() || '';
        const samlMatch = scriptContent.match(/SAMLResponse['"]\s*:\s*['"]([^'"]+)['"]/);
        if (samlMatch) {
          samlAssertion = samlMatch[1];
        }
      });
    }

    if (!samlAssertion) {
      throw new Error('SAML assertion not found in authentication response');
    }

    return samlAssertion;
  }

  private async assumeRoleWithSAML(
    samlAssertion: string,
    profile: SSOProfile
  ): Promise<SSOCredentials> {
    try {
      const stsClient = new STSClient({
        region: profile.region || this.config.region
      });

      const command = new AssumeRoleWithSAMLCommand({
        RoleArn: profile.roleArn,
        PrincipalArn: profile.principalArn,
        SAMLAssertion: samlAssertion,
        DurationSeconds: this.config.sessionDuration
      });

      const response = await stsClient.send(command);

      if (!response.Credentials) {
        throw new Error('No credentials returned from STS');
      }

      return {
        accessKeyId: response.Credentials.AccessKeyId!,
        secretAccessKey: response.Credentials.SecretAccessKey!,
        sessionToken: response.Credentials.SessionToken!,
        expiration: response.Credentials.Expiration!,
        roleArn: profile.roleArn,
        accountId: profile.accountId,
        region: profile.region || this.config.region
      };
    } catch (error) {
      throw new Error(`Failed to assume role with SAML: ${error}`);
    }
  }

  private async storeSession(
    profileName: string,
    credentials: SSOCredentials,
    profile: SSOProfile
  ): Promise<void> {
    const session: SSOSession = {
      profileName,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: credentials.expiration,
      roleArn: credentials.roleArn,
      accountId: credentials.accountId,
      userId: profileName, // In a real scenario, this would be extracted from SAML
      region: credentials.region
    };

    this.sessionStore.set(profileName, session);
  }

  public async refreshToken(profileName: string): Promise<SSOCredentials> {
    const session = this.sessionStore.get(profileName);
    if (!session) {
      throw new Error(`No session found for profile ${profileName}`);
    }

    // Check if token is close to expiration (within 15 minutes)
    const now = new Date();
    const timeUntilExpiration = session.expiration.getTime() - now.getTime();
    const fifteenMinutes = 15 * 60 * 1000;

    if (timeUntilExpiration > fifteenMinutes) {
      // Token is still valid, return current credentials
      return {
        accessKeyId: session.accessKeyId,
        secretAccessKey: session.secretAccessKey,
        sessionToken: session.sessionToken,
        expiration: session.expiration,
        roleArn: session.roleArn,
        accountId: session.accountId,
        region: session.region
      };
    }

    // Token needs refresh - this would require re-authentication in most SAML flows
    throw new Error('Token refresh requires re-authentication. Please log in again.');
  }

  public async validateSession(profileName: string): Promise<SSOValidationResult> {
    const session = this.sessionStore.get(profileName);
    
    if (!session) {
      return {
        isValid: false,
        isExpired: false,
        error: 'No session found'
      };
    }

    const now = new Date();
    const isExpired = session.expiration <= now;

    return {
      isValid: !isExpired,
      isExpired,
      expiresAt: session.expiration,
      error: isExpired ? 'Session expired' : undefined
    };
  }

  public async getAuthenticationStatus(profileName: string): Promise<SSOAuthenticationStatus> {
    const session = this.sessionStore.get(profileName);
    
    if (!session) {
      return { isAuthenticated: false };
    }

    const validation = await this.validateSession(profileName);
    
    return {
      isAuthenticated: validation.isValid,
      profileName: session.profileName,
      expiresAt: session.expiration,
      accountId: session.accountId,
      roleArn: session.roleArn,
      userId: session.userId
    };
  }

  public async logout(profileName: string): Promise<void> {
    this.sessionStore.delete(profileName);
  }

  public getAvailableProfiles(): SSOProfile[] {
    return this.config.profiles;
  }

  public updateConfiguration(config: SSOConfiguration): void {
    this.config = config;
    this.httpClient = this.createHttpClient();
  }
}