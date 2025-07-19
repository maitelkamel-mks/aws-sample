import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
import { SSORefreshRequestSchema } from '@/lib/schemas/sso';

// POST /api/aws/sso/refresh
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const refreshRequest = SSORefreshRequestSchema.parse(body);
    const { profileName } = refreshRequest;

    // Get credentials manager instance
    const credentialsManager = AWSCredentialsManager.getInstance();
    
    // Check if SSO is configured
    if (!credentialsManager.isSSOConfigured()) {
      return NextResponse.json({
        success: false,
        error: 'SSO not configured'
      }, { status: 400 });
    }

    // Verify profile exists
    const profile = credentialsManager.getSSOProfile(profileName);
    if (!profile) {
      return NextResponse.json({
        success: false,
        error: `SSO profile '${profileName}' not found`
      }, { status: 404 });
    }

    try {
      // Attempt to refresh token
      const credentials = await credentialsManager.refreshSSOToken(profileName);

      return NextResponse.json({
        success: true,
        data: {
          profileName,
          expiration: credentials.expiration.toISOString(),
          accountId: credentials.accountId,
          roleArn: credentials.roleArn,
          region: credentials.region
        }
      });

    } catch (refreshError) {
      // Token refresh failed - likely requires re-authentication
      const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error';
      
      if (errorMessage.includes('re-authentication')) {
        return NextResponse.json({
          success: false,
          error: 'Token refresh requires re-authentication',
          requiresReauth: true
        }, { status: 401 });
      }

      throw refreshError;
    }

  } catch (error) {
    console.error('SSO token refresh failed:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({
      success: false,
      error: `SSO token refresh failed: ${errorMessage}`
    }, { status: 500 });
  }
}