import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws/credentials';

// GET /api/aws/sso/status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileName = searchParams.get('profile');

    const credentialsManager = AWSCredentialsManager.getInstance();

    if (profileName) {
      // Get status for specific profile
      if (!credentialsManager.isSSOProfile(profileName)) {
        return NextResponse.json({
          success: false,
          error: `Profile '${profileName}' is not an SSO profile`
        }, { status: 404 });
      }

      const authStatus = await credentialsManager.getSSOAuthenticationStatus(profileName);
      const validationResult = await credentialsManager.validateSSOProfile(profileName);

      return NextResponse.json({
        success: true,
        data: {
          profileName,
          isAuthenticated: authStatus.isAuthenticated,
          isValid: validationResult.isValid,
          isExpired: validationResult.isExpired,
          expiresAt: authStatus.expiresAt?.toISOString() || null,
          accountId: authStatus.accountId,
          roleArn: authStatus.roleArn,
          userId: authStatus.userId,
          error: validationResult.error
        }
      });
    } else {
      // Get overall SSO status
      const isConfigured = credentialsManager.isSSOConfigured();
      const config = credentialsManager.getSSOConfiguration();
      const storedProfiles = await credentialsManager.getStoredSSOProfiles();

      // Get status for all stored profiles
      const profileStatuses = await Promise.all(
        storedProfiles.map(async (profile) => {
          const authStatus = await credentialsManager.getSSOAuthenticationStatus(profile);
          const validationResult = await credentialsManager.validateSSOProfile(profile);

          return {
            profileName: profile,
            isAuthenticated: authStatus.isAuthenticated,
            isValid: validationResult.isValid,
            isExpired: validationResult.isExpired,
            expiresAt: authStatus.expiresAt?.toISOString() || null,
            accountId: authStatus.accountId,
            roleArn: authStatus.roleArn
          };
        })
      );

      return NextResponse.json({
        success: true,
        data: {
          isConfigured,
          providerName: config?.providerName,
          totalProfiles: config?.profiles?.length || 0,
          authenticatedProfiles: profileStatuses.filter(p => p.isAuthenticated).length,
          expiredProfiles: profileStatuses.filter(p => p.isExpired).length,
          profiles: profileStatuses
        }
      });
    }

  } catch (error) {
    console.error('Failed to get SSO status:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({
      success: false,
      error: `Failed to get SSO status: ${errorMessage}`
    }, { status: 500 });
  }
}