import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ConfigManager } from '@/lib/config';
import { SSOConfiguration } from '@/lib/types/sso';
import { 
  logConfigurationChange, 
  logSecurityEvent 
} from '@/lib/security/audit-logger';

const configManager = ConfigManager.getInstance();

// GET /api/aws/sso/config
export async function GET() {
  try {
    const config = await configManager.loadSSOConfig();
    
    return NextResponse.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Failed to read SSO configuration:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to read SSO configuration'
    }, { status: 500 });
  }
}

// POST /api/aws/sso/config
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config = body.config as SSOConfiguration;

    // Save configuration using unified config manager
    await configManager.saveSSOConfig(config);

    // Log configuration change
    logConfigurationChange('sso_configuration', true, {
      providerName: config.providerName,
      profileCount: config.profiles.length,
      enabled: config.enabled
    });

    return NextResponse.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Failed to save SSO configuration:', error);
    
    // Log configuration change failure
    logConfigurationChange('sso_configuration', false, {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('invalid_config_data', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid configuration data',
        details: error.errors
      }, { status: 400 });
    }

    return NextResponse.json({
      success: false,
      error: 'Failed to save SSO configuration'
    }, { status: 500 });
  }
}

// PUT /api/aws/sso/config
export async function PUT(request: NextRequest) {
  return POST(request); // Same logic as POST for full replacement
}

// DELETE /api/aws/sso/config
export async function DELETE() {
  try {
    // Clear SSO config from unified configuration
    const unifiedConfig = await configManager.loadUnifiedConfig();
    delete unifiedConfig.sso;
    await configManager.saveUnifiedConfig(unifiedConfig);
    
    return NextResponse.json({
      success: true
    });
  } catch (error) {
    console.error('Failed to delete SSO configuration:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete SSO configuration'
    }, { status: 500 });
  }
}