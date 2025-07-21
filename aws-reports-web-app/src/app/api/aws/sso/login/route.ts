import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSSOAuthentication, logSecurityEvent } from '@/lib/security/audit-logger';
import { SSOAuthenticationService } from '@/lib/aws/sso-service';
import { ConfigManager } from '@/lib/config';


// Schema for SSO authentication request
const SSOAuthRequestSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  providerName: z.string().min(1)
});

// POST /api/aws/sso/login - Authenticate with enterprise SSO and discover AWS roles
export async function POST(request: NextRequest) {
  let requestBody: any;
  
  try {
    requestBody = await request.json();
    
    // Validate request body for SSO authentication
    const { username, password, providerName } = SSOAuthRequestSchema.parse(requestBody);

    // Load application configuration
    const configManager = ConfigManager.getInstance();
    const config = await configManager.loadUnifiedConfig();
    
    // Check if SSO is configured and provider matches
    if (!config.sso || !config.sso.enabled) {
      throw new Error('SSO is not configured or enabled');
    }
    
    if (config.sso.providerName !== providerName) {
      throw new Error(`SSO provider '${providerName}' does not match configured provider '${config.sso.providerName}'`);
    }

    // Initialize SSO authentication service
    const ssoService = new SSOAuthenticationService(config.sso);
    
    // Find matching profile from SSO configuration
    const matchingProfile = config.sso.profiles.find(p => p.name === providerName);
    if (!matchingProfile) {
      throw new Error(`SSO profile '${providerName}' not found in configuration`);
    }

    // Authenticate with SSO provider and get AWS credentials
    const credentials = await ssoService.authenticateWithSSO(
      username,
      password,
      providerName
    );

    // Log successful authentication
    logSSOAuthentication('sso-role-discovery', true);

    // Return authentication success with credential information
    return NextResponse.json({
      success: true,
      data: {
        profile: {
          name: matchingProfile.name,
          accountId: credentials.accountId,
          roleName: matchingProfile.roleName,
          roleArn: credentials.roleArn,
          region: credentials.region
        },
        sessionInfo: {
          authenticatedAt: new Date().toISOString(),
          expiresAt: credentials.expiration.toISOString(),
          provider: providerName
        }
      }
    });

  } catch (error) {
    console.error('SSO role discovery failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failed authentication
    logSSOAuthentication('sso-discovery', false, errorMessage);
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('invalid_sso_request', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    logSecurityEvent('sso_discovery_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `SSO role discovery failed: ${errorMessage}`
    }, { status: 500 });
  }
}