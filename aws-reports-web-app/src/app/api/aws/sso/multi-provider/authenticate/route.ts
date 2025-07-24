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
    
    // Validate request body
    const { providerId, credentials, discoverRoles } = MultiProviderAuthRequestSchema.parse(requestBody);

    // Load configuration and get provider config
    const configManager = ConfigManager.getInstance();
    const providerConfig = await configManager.getProviderConfig(providerId);
    
    if (!providerConfig) {
      throw new Error(`Provider '${providerId}' not found in configuration`);
    }
    

    // Get provider from registry and authenticate
    const registry = getInitializedRegistry();
    const authResult = await registry.authenticate(providerId, credentials as AuthCredentials, providerConfig);
    
    if (!authResult.success) {
      throw new Error(authResult.error || 'Authentication failed');
    }

    // Discover roles if requested (skip for device flow responses)
    let roles: SSOProfile[] = [];
    if (discoverRoles && authResult.success && !authResult.requiresDeviceFlow && authResult.accessToken) {
      try {
        roles = await registry.discoverRoles(providerId, authResult);
      } catch (roleDiscoveryError) {
        console.warn('Role discovery failed, but authentication succeeded:', roleDiscoveryError);
        // Continue without roles - authentication was successful
      }
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
    console.error('Multi-provider SSO authentication failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log failed authentication
    logSecurityEvent('multi_provider_authentication', 'error', {
      success: false,
      providerId: requestBody?.providerId,
      error: errorMessage
    });
    
    if (error instanceof z.ZodError) {
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
      providerId: requestBody?.providerId
    });

    return NextResponse.json({
      success: false,
      error: `Multi-provider authentication failed: ${errorMessage}`
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