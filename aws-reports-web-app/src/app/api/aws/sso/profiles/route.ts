import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
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
    return null; // No SSO configuration found
  }
}

// GET /api/aws/sso/profiles
export async function GET() {
  try {
    // Load SSO configuration
    const config = await loadSSOConfig();
    
    if (!config) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    // Get credentials manager instance
    const credentialsManager = AWSCredentialsManager.getInstance();
    
    // Configure SSO service if configuration exists
    if (config && !credentialsManager.isSSOConfigured()) {
      credentialsManager.configureSSOService(config);
    }

    // Get available SSO profiles
    const ssoProfiles = await credentialsManager.getAvailableSSOProfiles();
    
    // Get stored SSO profiles (authenticated profiles)
    const storedProfiles = await credentialsManager.getStoredSSOProfiles();

    // Enhance profiles with authentication status
    const enhancedProfiles = await Promise.all(
      ssoProfiles.map(async (profile) => {
        const isStored = storedProfiles.includes(profile.name);
        let authStatus = null;
        
        if (isStored) {
          authStatus = await credentialsManager.getSSOAuthenticationStatus(profile.name);
        }

        return {
          ...profile,
          isAuthenticated: authStatus?.isAuthenticated || false,
          expiresAt: authStatus?.expiresAt?.toISOString() || null,
          accountId: authStatus?.accountId || profile.accountId,
          userId: authStatus?.userId || null
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: enhancedProfiles
    });

  } catch (error) {
    console.error('Failed to get SSO profiles:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json({
      success: false,
      error: `Failed to get SSO profiles: ${errorMessage}`
    }, { status: 500 });
  }
}

