import { NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
import { ApiResponse } from '@/lib/types';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import yaml from 'yaml';

const SSO_CONFIG_PATH = path.join(os.homedir(), '.aws', 'sso-config.yaml');

async function loadSSOConfig() {
  try {
    const configData = await fs.readFile(SSO_CONFIG_PATH, 'utf8');
    return yaml.parse(configData);
  } catch (error) {
    return null;
  }
}

// GET /api/aws/profiles/unified
export async function GET() {
  try {
    const credentialsManager = AWSCredentialsManager.getInstance();
    
    // Load SSO configuration if it exists
    const ssoConfig = await loadSSOConfig();
    if (ssoConfig && !credentialsManager.isSSOConfigured()) {
      credentialsManager.configureSSOService(ssoConfig);
    }

    // Get CLI profiles
    const cliProfiles = await credentialsManager.getAvailableProfiles();
    
    // Get SSO profiles
    const ssoProfiles = await credentialsManager.getAvailableSSOProfiles();
    
    // Get stored SSO profiles for authentication status
    const storedSSOProfiles = await credentialsManager.getStoredSSOProfiles();

    // Format CLI profiles
    const formattedCliProfiles = cliProfiles.map(name => ({
      name,
      type: 'cli' as const,
      isAuthenticated: true, // CLI profiles are always "authenticated" if they exist
      region: null,
      accountId: null,
      roleArn: null
    }));

    // Format SSO profiles with authentication status
    const formattedSSOProfiles = await Promise.all(
      ssoProfiles.map(async (profile) => {
        const isStored = storedSSOProfiles.includes(profile.name);
        let authStatus = null;
        
        if (isStored) {
          authStatus = await credentialsManager.getSSOAuthenticationStatus(profile.name);
        }

        return {
          name: profile.name,
          type: 'sso' as const,
          isAuthenticated: authStatus?.isAuthenticated || false,
          region: profile.region,
          accountId: profile.accountId,
          roleArn: profile.roleArn,
          description: profile.description,
          expiresAt: authStatus?.expiresAt?.toISOString() || null,
          userId: authStatus?.userId || null
        };
      })
    );

    const unifiedProfiles = [
      ...formattedCliProfiles,
      ...formattedSSOProfiles
    ];

    return NextResponse.json({
      success: true,
      data: {
        cliProfiles: formattedCliProfiles,
        ssoProfiles: formattedSSOProfiles,
        unifiedProfiles,
        ssoConfigured: credentialsManager.isSSOConfigured(),
        totalProfiles: unifiedProfiles.length,
        authenticatedSSOProfiles: formattedSSOProfiles.filter(p => p.isAuthenticated).length
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