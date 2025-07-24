import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ConfigManager } from '@/lib/config';
import { logSecurityEvent } from '@/lib/security/audit-logger';
import { MultiProviderSSOConfig, ProviderConfig, SSOProviderType } from '@/lib/types/sso-providers';

// Schema for multi-provider SSO configuration request
const MultiProviderConfigRequestSchema = z.object({
  config: z.object({
    version: z.string(),
    lastModified: z.string(),
    providers: z.array(z.object({
      id: z.string(),
      type: z.enum(['SAML', 'AWS_SSO', 'OIDC', 'LDAP']),
      name: z.string(),
      settings: z.record(z.any()),
      security: z.object({
        sslVerification: z.boolean(),
        tokenEncryption: z.boolean(),
        sessionBinding: z.boolean(),
        auditLogging: z.boolean(),
        mfaRequired: z.boolean().optional(),
        sessionTimeout: z.number().optional(),
      }).optional(),
      proxy: z.object({
        enabled: z.boolean(),
        url: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        excludeDomains: z.array(z.string()).optional(),
      }).optional()
    })),
    defaultProvider: z.string().optional(),
    globalSettings: z.object({
      security: z.object({
        sslVerification: z.boolean(),
        tokenEncryption: z.boolean(),
        sessionBinding: z.boolean(),
        auditLogging: z.boolean(),
        mfaRequired: z.boolean().optional(),
        sessionTimeout: z.number().optional(),
      }),
      proxy: z.object({
        enabled: z.boolean(),
        url: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        excludeDomains: z.array(z.string()).optional(),
      }).optional()
    }).optional()
  })
});

// GET /api/aws/sso/multi-provider/config - Load multi-provider SSO configuration
export async function GET(request: NextRequest) {
  try {
    const configManager = ConfigManager.getInstance();
    
    // Try to load existing multi-provider config
    let config = await configManager.loadMultiProviderSSOConfig();
    
    // If no multi-provider config exists, try to migrate from legacy config
    if (!config) {
      const migrated = await configManager.migrateLegacySSOConfig();
      if (migrated) {
        config = await configManager.loadMultiProviderSSOConfig();
        logSecurityEvent('sso_config_migrated', 'info', {
          message: 'Legacy SSO configuration migrated to multi-provider format'
        });
      }
    }
    
    // If still no config, return empty structure
    if (!config) {
      config = {
        version: '1.0',
        lastModified: new Date().toISOString(),
        providers: [],
        globalSettings: {
          security: {
            sslVerification: true,
            tokenEncryption: true,
            sessionBinding: true,
            auditLogging: true
          }
        }
      };
    }

    logSecurityEvent('sso_config_loaded', 'info', {
      providerCount: config.providers.length,
      hasDefaultProvider: !!config.defaultProvider
    });

    return NextResponse.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Failed to load multi-provider SSO configuration:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('sso_config_load_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to load configuration: ${errorMessage}`
    }, { status: 500 });
  }
}

// POST /api/aws/sso/multi-provider/config - Save multi-provider SSO configuration
export async function POST(request: NextRequest) {
  let requestBody: any;
  
  try {
    requestBody = await request.json();
    
    // Validate request body
    const { config } = MultiProviderConfigRequestSchema.parse(requestBody);
    
    const configManager = ConfigManager.getInstance();
    
    // Validate each provider configuration
    const validationErrors: string[] = [];
    const { getInitializedRegistry } = await import('@/lib/providers/registry-initialization');
    const registry = getInitializedRegistry();
    
    for (const providerConfig of config.providers) {
      const provider = registry.getProviderByType(providerConfig.type as SSOProviderType);
      if (provider) {
        const validation = provider.validateConfig(providerConfig as ProviderConfig);
        if (!validation.isValid) {
          const errors = validation.errors.map(e => `${providerConfig.id}: ${e.message}`);
          validationErrors.push(...errors);
        }
      }
    }
    
    if (validationErrors.length > 0) {
      logSecurityEvent('sso_config_validation_failed', 'warn', {
        validationErrors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Configuration validation failed',
        details: validationErrors
      }, { status: 400 });
    }
    
    // Save the configuration
    await configManager.saveMultiProviderSSOConfig(config as MultiProviderSSOConfig);
    
    // Initialize providers in the registry
    try {
      await registry.initializeFromConfig(config as MultiProviderSSOConfig);
    } catch (registryError) {
      console.warn('Failed to initialize some providers in registry:', registryError);
      // Continue - configuration was saved successfully
    }
    
    logSecurityEvent('sso_config_saved', 'info', {
      providerCount: config.providers.length,
      defaultProvider: config.defaultProvider,
      hasGlobalProxy: !!config.globalSettings?.proxy?.enabled
    });

    return NextResponse.json({
      success: true,
      data: config
    });

  } catch (error) {
    console.error('Failed to save multi-provider SSO configuration:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('sso_config_invalid_request', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors
      }, { status: 400 });
    }
    
    logSecurityEvent('sso_config_save_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to save configuration: ${errorMessage}`
    }, { status: 500 });
  }
}

// PUT /api/aws/sso/multi-provider/config - Update specific provider in configuration
export async function PUT(request: NextRequest) {
  try {
    const requestBody = await request.json();
    const { providerId, providerConfig } = requestBody;
    
    if (!providerId || !providerConfig) {
      return NextResponse.json({
        success: false,
        error: 'Provider ID and configuration are required'
      }, { status: 400 });
    }
    
    const configManager = ConfigManager.getInstance();
    await configManager.updateProvider(providerId, providerConfig);
    
    logSecurityEvent('sso_provider_updated', 'info', {
      providerId,
      providerType: providerConfig.type
    });
    
    return NextResponse.json({
      success: true,
      message: 'Provider configuration updated successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('sso_provider_update_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to update provider: ${errorMessage}`
    }, { status: 500 });
  }
}

// DELETE /api/aws/sso/multi-provider/config - Remove specific provider from configuration
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get('providerId');
    
    if (!providerId) {
      return NextResponse.json({
        success: false,
        error: 'Provider ID is required'
      }, { status: 400 });
    }
    
    const configManager = ConfigManager.getInstance();
    await configManager.removeProvider(providerId);
    
    logSecurityEvent('sso_provider_removed', 'info', {
      providerId
    });
    
    return NextResponse.json({
      success: true,
      message: 'Provider removed successfully'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logSecurityEvent('sso_provider_remove_error', 'error', {
      error: errorMessage
    });

    return NextResponse.json({
      success: false,
      error: `Failed to remove provider: ${errorMessage}`
    }, { status: 500 });
  }
}