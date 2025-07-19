import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
import { SSOLogoutRequestSchema } from '@/lib/schemas/sso';

// DELETE /api/aws/sso/logout
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const logoutRequest = SSOLogoutRequestSchema.parse(body);
    const { profileName } = logoutRequest;

    // Get credentials manager instance
    const credentialsManager = AWSCredentialsManager.getInstance();
    
    // Perform logout
    await credentialsManager.logoutSSO(profileName);

    return NextResponse.json({
      success: true,
      message: `Successfully logged out from profile: ${profileName}`
    });

  } catch (error) {
    console.error('SSO logout failed:', error);
    
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
      error: `SSO logout failed: ${errorMessage}`
    }, { status: 500 });
  }
}

// POST /api/aws/sso/logout (alternative endpoint for compatibility)
export async function POST(request: NextRequest) {
  return DELETE(request);
}