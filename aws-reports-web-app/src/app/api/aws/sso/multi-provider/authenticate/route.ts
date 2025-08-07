import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSSOAuthentication, logSecurityEvent } from '@/lib/security/audit-logger';
import { getInitializedRegistry } from '@/lib/providers/registry-initialization';
import { ConfigManager } from '@/lib/config';
import { AuthCredentials, SSOProfile } from '@/lib/types/sso-providers';

// Schema for multi-provider authentication request
const MultiProviderAuthRequestSchema = z.object({
  providerId: z.string().min(1),
  credentials: z.object({
    username: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    mfaCode: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional()
  }),
  discoverRoles: z.boolean().optional().default(true)
});

// POST /api/aws/sso/multi-provider/authenticate - Authenticate with specific provider and discover roles
export async function POST(request: NextRequest) {
  let requestBody: any;
  
  try {
    requestBody = await request.json();
    console.log('🔐 Authentication API Debug: Request received');
    console.log('🔐 Request body (credentials hidden):', {
      ...requestBody,
      credentials: {
        username: requestBody.credentials?.username ? `[${requestBody.credentials.username.length} chars]` : 'undefined',
        password: requestBody.credentials?.password ? `[${requestBody.credentials.password.length} chars]` : 'undefined',
        mfaCode: requestBody.credentials?.mfaCode ? `[${requestBody.credentials.mfaCode.length} chars]` : 'undefined'
      }
    });
    
    // Validate request body
    const { providerId, credentials, discoverRoles } = MultiProviderAuthRequestSchema.parse(requestBody);
    console.log('🔐 Authentication API Debug: Request validation passed');
    console.log('🔐 Provider ID:', providerId);
    console.log('🔐 Discover roles:', discoverRoles);

    // Load configuration and get provider config
    const configManager = ConfigManager.getInstance();
    console.log('🔐 Authentication API Debug: Loading provider config for:', providerId);
    const providerConfig = await configManager.getProviderConfig(providerId);
    
    if (!providerConfig) {
      console.error('❌ Authentication API Debug: Provider config not found:', providerId);
      throw new Error(`Provider '${providerId}' not found in configuration`);
    }
    
    console.log('🔐 Authentication API Debug: Provider config loaded:', {
      id: providerConfig.id,
      type: providerConfig.type,
      name: providerConfig.name,
      hasSettings: !!providerConfig.settings,
      settingsKeys: providerConfig.settings ? Object.keys(providerConfig.settings) : []
    });

    // Get provider from registry and authenticate
    const registry = getInitializedRegistry();
    console.log('🔐 Authentication API Debug: Starting authentication with provider registry');
    const authResult = await registry.authenticate(providerId, credentials as AuthCredentials, providerConfig);
    
    console.log('🔐 Authentication API Debug: Authentication result:', {
      success: authResult.success,
      sessionId: authResult.sessionId ? `[${authResult.sessionId.length} chars]` : 'undefined',
      hasSamlAssertion: !!authResult.samlAssertion,
      samlAssertionLength: authResult.samlAssertion ? authResult.samlAssertion.length : 0,
      hasAccessToken: !!authResult.accessToken,
      requiresDeviceFlow: authResult.requiresDeviceFlow,
      expiresAt: authResult.expiresAt,
      hasMetadata: !!authResult.metadata,
      error: authResult.error
    });
    
    if (!authResult.success) {
      console.error('❌ Authentication API Debug: Authentication failed:', authResult.error);
      throw new Error(authResult.error || 'Authentication failed');
    }
    
    console.log('✅ Authentication API Debug: Authentication successful');

    // Discover roles if requested (skip for device flow responses)
    let roles: SSOProfile[] = [];
    if (discoverRoles && authResult.success && !authResult.requiresDeviceFlow && 
        (authResult.accessToken || authResult.samlAssertion)) {
      try {
        console.log('🔍 Authentication API Debug: Starting role discovery for', providerId);
        roles = await registry.discoverRoles(providerId, authResult);
        console.log('✅ Authentication API Debug: Role discovery completed, found', roles.length, 'roles');
      } catch (roleDiscoveryError) {
        console.warn('❌ Authentication API Debug: Role discovery failed, but authentication succeeded:', roleDiscoveryError);
        // Continue without roles - authentication was successful
      }
    } else {
      console.log('🔍 Authentication API Debug: Skipping role discovery:', {
        discoverRoles,
        success: authResult.success,
        requiresDeviceFlow: authResult.requiresDeviceFlow,
        hasAccessToken: !!authResult.accessToken,
        hasSamlAssertion: !!authResult.samlAssertion
      });
    }

    // Log successful authentication
    logSecurityEvent('multi_provider_authentication', 'info', {
      success: true,
      providerId,
      providerType: providerConfig.type,
      rolesDiscovered: roles.length
    });

    // Handle device flow responses differently
    if (authResult.requiresDeviceFlow) {
      // For device flow, return the provider's response directly
      return NextResponse.json({
        success: true,
        data: authResult,
        timestamp: new Date().toISOString(),
      });
    }

    // Return standard authentication success with discovered roles
    return NextResponse.json({
      success: true,
      data: {
        providerId,
        providerType: providerConfig.type,
        sessionId: authResult.sessionId,
        roles,
        samlAssertion: authResult.samlAssertion,
        accessToken: authResult.accessToken,
        expiresAt: authResult.expiresAt,
        sessionInfo: {
          authenticatedAt: authResult.metadata?.authenticatedAt || new Date().toISOString(),
          provider: providerConfig.name,
          type: providerConfig.type
        }
      }
    });

  } catch (error) {
    console.error('❌ Multi-provider SSO authentication failed:', error);
    console.error('❌ Error type:', error?.constructor?.name);
    console.error('❌ Error message:', error instanceof Error ? error.message : 'Unknown error');
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Log axios-specific error details if available
    if ((error as any)?.response) {
      console.error('❌ HTTP Response Error Details:', {
        status: (error as any).response.status,
        statusText: (error as any).response.statusText,
        data: (error as any).response.data,
        headers: (error as any).response.headers
      });
    }
    
    if ((error as any)?.request) {
      console.error('❌ HTTP Request Error Details:', {
        url: (error as any).request.url,
        method: (error as any).request.method,
        headers: (error as any).request.headers
      });
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failed authentication
    logSecurityEvent('multi_provider_authentication', 'error', {
      success: false,
      providerId: requestBody?.providerId,
      error: errorMessage,
      errorType: error?.constructor?.name
    });
    
    if (error instanceof z.ZodError) {
      console.error('❌ Validation Error Details:', error.errors);
      logSecurityEvent('invalid_multi_provider_auth_request', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    logSecurityEvent('multi_provider_auth_error', 'error', {
      error: errorMessage,
      providerId: requestBody?.providerId,
      errorType: error?.constructor?.name
    });

    return NextResponse.json({
      success: false,
      error: `Multi-provider authentication failed: ${errorMessage}`,
      debugInfo: {
        errorType: error?.constructor?.name,
        providerId: requestBody?.providerId,
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}

// GET /api/aws/sso/multi-provider/authenticate - Get authentication status for all providers
export async function GET(request: NextRequest) {
  try {
    const registry = getInitializedRegistry();
    const providerStatuses = registry.getAllProviderStatuses();
    const activeSessions = registry.getAllActiveSessions();
    
    const authStatus = providerStatuses.map(status => ({
      providerId: status.id,
      providerName: status.name,
      providerType: status.type,
      configured: status.configured,
      healthy: status.healthy,
      lastChecked: status.lastChecked,
      activeSessions: status.activeSessions,
      hasActiveSessions: activeSessions.has(status.id) && activeSessions.get(status.id)!.length > 0,
      error: status.error
    }));

    return NextResponse.json({
      success: true,
      data: {
        providers: authStatus,
        totalProviders: authStatus.length,
        healthyProviders: authStatus.filter(p => p.healthy).length,
        totalActiveSessions: Array.from(activeSessions.values()).reduce((sum, sessions) => sum + sessions.length, 0)
      }
    });

  } catch (error) {
    console.error('Failed to get authentication status:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('auth_status_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to get authentication status: ${errorMessage}`
    }, { status: 500 });
  }
}