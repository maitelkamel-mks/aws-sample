import { NextRequest, NextResponse } from 'next/server';
import { getInitializedRegistry } from '@/lib/providers/registry-initialization';
import { ConfigManager } from '@/lib/config';
import { logSecurityEvent } from '@/lib/security/audit-logger';

// GET /api/aws/sso/multi-provider/providers - List all available and configured providers
export async function GET(request: NextRequest) {
  try {
    const registry = getInitializedRegistry();
    const configManager = ConfigManager.getInstance();
    
    // Get available provider types from registry
    const availableTypes = registry.getAvailableProviderTypes();
    
    // Get configured providers from config
    const configuredProviders = await configManager.listProviders();
    
    // Get provider statuses
    const providerStatuses = registry.getAllProviderStatuses();
    
    // Get provider schemas for UI generation
    const providerSchemas: { [key: string]: any } = {};
    availableTypes.forEach(type => {
      const provider = registry.getProviderByType(type);
      if (provider) {
        providerSchemas[type] = provider.getConfigSchema();
      }
    });
    
    // Build response data
    const responseData = {
      availableTypes,
      configuredProviders: configuredProviders.map(config => ({
        ...config,
        status: providerStatuses.find(s => s.id === config.id) || {
          id: config.id,
          type: config.type,
          name: config.name,
          configured: true,
          healthy: false,
          lastChecked: new Date(),
          activeSessions: 0
        }
      })),
      providerSchemas,
      summary: {
        totalAvailableTypes: availableTypes.length,
        totalConfiguredProviders: configuredProviders.length,
        healthyProviders: providerStatuses.filter(s => s.healthy).length
      }
    };

    logSecurityEvent('providers_listed', 'info', {
      availableTypes: availableTypes.length,
      configuredProviders: configuredProviders.length
    });

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('Failed to list providers:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('providers_list_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to list providers: ${errorMessage}`
    }, { status: 500 });
  }
}

// POST /api/aws/sso/multi-provider/providers - Test provider configuration
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { providerId, testCredentials } = requestBody;
    
    if (!providerId) {
      return NextResponse.json({
        success: false,
        error: 'Provider ID is required for testing'
      }, { status: 400 });
    }

    const registry = getInitializedRegistry();
    const configManager = ConfigManager.getInstance();
    
    // Get provider configuration
    const providerConfig = await configManager.getProviderConfig(providerId);
    if (!providerConfig) {
      return NextResponse.json({
        success: false,
        error: `Provider '${providerId}' not found`
      }, { status: 404 });
    }

    // Check provider health
    const isHealthy = await registry.checkProviderHealth(providerId);
    
    const testResult: any = {
      providerId,
      providerType: providerConfig.type,
      healthy: isHealthy,
      configurationValid: true
    };

    // If test credentials provided, attempt authentication test
    if (testCredentials && testCredentials.username && testCredentials.password) {
      try {
        const authResult = await registry.authenticate(providerId, testCredentials, providerConfig);
        testResult.authenticationTest = {
          success: authResult.success,
          error: authResult.error,
          sessionId: authResult.sessionId
        };
        
        // If authentication succeeded, test role discovery
        if (authResult.success) {
          try {
            const roles = await registry.discoverRoles(providerId, authResult);
            testResult.roleDiscoveryTest = {
              success: true,
              rolesFound: roles.length,
              roles: roles.slice(0, 5) // Return first 5 roles as sample
            };
          } catch (roleError) {
            testResult.roleDiscoveryTest = {
              success: false,
              error: roleError instanceof Error ? roleError.message : 'Unknown error'
            };
          }
        }
      } catch (authError) {
        testResult.authenticationTest = {
          success: false,
          error: authError instanceof Error ? authError.message : 'Unknown error'
        };
      }
    }

    logSecurityEvent('provider_tested', 'info', {
      providerId,
      providerType: providerConfig.type,
      healthy: isHealthy,
      authenticationTested: !!testCredentials?.username
    });

    return NextResponse.json({
      success: true,
      data: testResult
    });

  } catch (error) {
    console.error('Provider test failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('provider_test_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Provider test failed: ${errorMessage}`
    }, { status: 500 });
  }
}