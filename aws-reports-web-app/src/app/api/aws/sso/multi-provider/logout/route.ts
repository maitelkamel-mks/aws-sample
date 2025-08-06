import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSecurityEvent } from '@/lib/security/audit-logger';
import { getInitializedRegistry } from '@/lib/providers/registry-initialization';
import { ApiResponse } from '@/lib/types';

// Schema for logout request
const LogoutRequestSchema = z.object({
  providerId: z.string().min(1).optional(),
  logoutAll: z.boolean().optional().default(false)
});

// POST /api/aws/sso/multi-provider/logout - Logout from SSO provider(s)
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    // Validate request body
    const { providerId, logoutAll } = LogoutRequestSchema.parse(requestBody);
    
    const registry = getInitializedRegistry();
    
    if (logoutAll) {
      console.log('Logging out from all SSO providers');
      
      // Logout from all providers
      const success = await registry.logoutAll();
      
      if (success) {
        // Log security event
        logSecurityEvent('sso_logout', 'info', {
          action: 'logout_all',
          providerId: 'all',
          success: true,
          timestamp: new Date()
        });

        return NextResponse.json({
          success: true,
          data: {
            action: 'logout_all',
            message: 'Successfully logged out from all providers'
          },
          message: 'Successfully logged out from all SSO providers',
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      } else {
        throw new Error('Failed to logout from all providers');
      }
    } else if (providerId) {
      console.log(`Logging out from SSO provider: ${providerId}`);
      
      // Logout from specific provider
      const success = await registry.logout(providerId);
      
      if (success) {
        // Get provider info for logging
        const provider = registry.getProvider(providerId);
        
        // Log security event
        logSecurityEvent('sso_logout', 'info', {
          action: 'logout_provider',
          providerId: providerId,
          providerType: provider?.type || 'unknown',
          success: true,
          timestamp: new Date()
        });

        return NextResponse.json({
          success: true,
          data: {
            action: 'logout_provider',
            providerId: providerId,
            providerType: provider?.type,
            message: `Successfully logged out from ${providerId}`
          },
          message: `Successfully logged out from ${providerId}`,
          timestamp: new Date().toISOString(),
        } as ApiResponse);
      } else {
        throw new Error(`Failed to logout from provider ${providerId}`);
      }
    } else {
      throw new Error('Either providerId or logoutAll must be specified');
    }

  } catch (error) {
    console.error('SSO logout failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('sso_logout_invalid_request', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    // Log logout failure
    logSecurityEvent('sso_logout', 'error', {
      error: errorMessage,
      success: false,
      timestamp: new Date()
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}