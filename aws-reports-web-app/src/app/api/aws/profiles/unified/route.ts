import { NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
import { ConfigManager } from '@/lib/config';
import { ApiResponse } from '@/lib/types';
import { SSOProfile } from '@/lib/types/sso-providers';

// GET /api/aws/profiles/unified
export async function GET() {
  try {
    const credentialsManager = AWSCredentialsManager.getInstance();

    // Get CLI profiles
    const cliProfiles = await credentialsManager.getAvailableProfiles();

    // Format CLI profiles
    const formattedCliProfiles = cliProfiles.map(name => ({
      name,
      type: 'cli' as const,
      isAuthenticated: true, // CLI profiles are always "authenticated" if they exist
      region: null,
      accountId: null,
      roleArn: null
    }));

    // Get SSO profiles from multi-provider system
    const configManager = ConfigManager.getInstance();
    const ssoProfiles: any[] = [];
    let ssoConfigured = false;
    const authenticatedSSOProfiles = 0;

    try {
      const multiProviderConfig = await configManager.loadMultiProviderSSOConfig();
      if (multiProviderConfig && multiProviderConfig.providers.length > 0) {
        ssoConfigured = true;
        
        // Extract SSO profiles from all configured providers
        for (const provider of multiProviderConfig.providers) {
          if (provider.settings?.profiles && Array.isArray(provider.settings.profiles)) {
            for (const profileData of provider.settings.profiles) {
              // Check if this profile also exists in CLI (dual type)
              const existsInCli = cliProfiles.includes(profileData.profileName);
              
              ssoProfiles.push({
                name: profileData.profileName,
                type: existsInCli ? 'cli+sso' : 'sso' as const,
                isAuthenticated: false, // SSO authentication is session-based
                region: profileData.region || null,
                accountId: profileData.accountId || null,
                roleArn: profileData.accountId && profileData.roleName 
                  ? `arn:aws:iam::${profileData.accountId}:role/${profileData.roleName}`
                  : null,
                description: `${provider.name} - ${profileData.accountId || 'Unknown Account'}`,
                // SSO specific fields
                ssoStartUrl: provider.settings.startUrl,
                ssoRegion: provider.settings.region,
                ssoAccountId: profileData.accountId,
                ssoRoleName: profileData.roleName,
                providerId: provider.id,
                providerType: provider.type
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to load SSO profiles from multi-provider config:', error);
      // Continue with CLI profiles only
    }

    // Update CLI profiles to show dual type if they also exist as SSO
    const updatedCliProfiles = formattedCliProfiles.map(cliProfile => {
      const hasSSO = ssoProfiles.some(ssoProfile => ssoProfile.name === cliProfile.name);
      return {
        ...cliProfile,
        type: hasSSO ? 'cli+sso' : 'cli' as const
      };
    });

    // Remove duplicate SSO profiles that are already marked as cli+sso
    const uniqueSSOProfiles = ssoProfiles.filter(ssoProfile => 
      ssoProfile.type === 'sso' // Only keep pure SSO profiles, not cli+sso ones
    );

    const unifiedProfiles = [...updatedCliProfiles, ...uniqueSSOProfiles];

    return NextResponse.json({
      success: true,
      data: {
        cliProfiles: updatedCliProfiles,
        ssoProfiles: uniqueSSOProfiles,
        unifiedProfiles,
        ssoConfigured,
        totalProfiles: unifiedProfiles.length,
        authenticatedSSOProfiles
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse<any>);

  } catch (error) {
    console.error('Get unified AWS profiles API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get unified AWS profiles',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}