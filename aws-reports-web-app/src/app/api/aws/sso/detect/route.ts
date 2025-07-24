import { NextResponse } from 'next/server';
import { 
  detectSSOProfiles, 
  validateSSOProfile, 
  generateProviderConfig, 
  groupSSOProfilesByProvider,
  generateProviderConfigFromGroup 
} from '@/lib/aws/sso-detection';
import { ApiResponse } from '@/lib/types';

export async function GET() {
  try {
    const profiles = await detectSSOProfiles();
    
    // Separate SSO and regular profiles
    const ssoProfiles = profiles.filter(p => p.isSSO);
    const regularProfiles = profiles.filter(p => !p.isSSO);
    
    // Group SSO profiles by provider (start URL)
    const ssoProviderGroups = groupSSOProfilesByProvider(ssoProfiles);
    
    return NextResponse.json({
      success: true,
      data: {
        ssoProviderGroups,
        regularProfiles,
        totalProfiles: profiles.length,
        ssoProfileCount: ssoProfiles.length,
        ssoProviderCount: ssoProviderGroups.length,
        validSSOProviders: ssoProviderGroups.filter(group => group.isValid).length,
        profilesByProvider: ssoProviderGroups.reduce((acc, group) => acc + group.profiles.length, 0)
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('SSO profile detection error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect SSO profiles',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}

// POST route to create provider from detected SSO provider group
export async function POST(request: Request) {
  try {
    const { ssoStartUrl, organizationName } = await request.json();
    
    if (!ssoStartUrl) {
      return NextResponse.json({
        success: false,
        error: 'SSO start URL is required',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }
    
    // Detect profiles and group them by provider
    const profiles = await detectSSOProfiles();
    const ssoProfiles = profiles.filter(p => p.isSSO);
    const ssoProviderGroups = groupSSOProfilesByProvider(ssoProfiles);
    
    // Find the provider group with the matching start URL
    const providerGroup = ssoProviderGroups.find(group => group.ssoStartUrl === ssoStartUrl);
    
    if (!providerGroup) {
      return NextResponse.json({
        success: false,
        error: `SSO provider with start URL '${ssoStartUrl}' not found`,
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 404 });
    }
    
    // Validate the provider group
    if (!providerGroup.isValid) {
      return NextResponse.json({
        success: false,
        error: `Invalid SSO provider: ${providerGroup.errors.join(', ')}`,
        data: { 
          validation: {
            isValid: providerGroup.isValid,
            errors: providerGroup.errors,
            warnings: providerGroup.warnings
          }
        },
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }
    
    // Generate provider configuration from the group
    const providerConfig = generateProviderConfigFromGroup(providerGroup);
    
    // Load existing configuration or create a new one
    let existingConfig: any;
    try {
      const getConfigResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/aws/sso/multi-provider/config`);
      if (getConfigResponse.ok) {
        const getConfigResult = await getConfigResponse.json();
        existingConfig = getConfigResult.data;
      }
    } catch (error) {
      console.log('No existing configuration found, creating new one');
    }
    
    // Create or update the configuration
    const fullConfig = existingConfig || {
      version: '1.0',
      lastModified: new Date().toISOString(),
      providers: [],
      defaultProvider: null,
      globalSettings: {
        security: {
          sslVerification: true,
          tokenEncryption: true,
          sessionBinding: true,
          auditLogging: true
        },
        proxy: {
          enabled: false
        }
      }
    };
    
    // Check if provider with this ID already exists
    const existingProviderIndex = fullConfig.providers.findIndex((p: any) => p.id === providerConfig.id);
    
    if (existingProviderIndex >= 0) {
      // Update existing provider
      fullConfig.providers[existingProviderIndex] = providerConfig;
    } else {
      // Add new provider
      fullConfig.providers.push(providerConfig);
    }
    
    // Update timestamp
    fullConfig.lastModified = new Date().toISOString();
    
    // Save the complete configuration
    const configResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/aws/sso/multi-provider/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: fullConfig })
    });
    
    if (!configResponse.ok) {
      const errorData = await configResponse.json();
      throw new Error(errorData.error || 'Failed to create provider configuration');
    }
    
    const configResult = await configResponse.json();
    
    return NextResponse.json({
      success: true,
      data: {
        provider: providerConfig,
        providerGroup,
        configResult,
        profilesImported: providerGroup.profiles.length
      },
      message: `Successfully created SSO provider '${providerGroup.organizationName}' with ${providerGroup.profiles.length} profile(s)`,
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('SSO provider creation error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create SSO provider',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}