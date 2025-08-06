import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSecurityEvent } from '@/lib/security/audit-logger';
import { ConfigManager } from '@/lib/config';
import { getInitializedRegistry } from '@/lib/providers/registry-initialization';
import { SSOProfile, SSOSession } from '@/lib/types/sso-providers';
import { ApiResponse } from '@/lib/types';

// Schema for device flow completion request
const CompleteDeviceFlowRequestSchema = z.object({
  providerId: z.string().min(1),
  deviceFlow: z.object({
    deviceCode: z.string(),
    userCode: z.string(),
    verificationUri: z.string(),
    verificationUriComplete: z.string(),
    expiresIn: z.number(),
    interval: z.number()
  }),
  discoverRoles: z.boolean().optional().default(true)
});

// POST /api/aws/sso/multi-provider/complete-device-flow - Complete AWS SSO device flow
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    // Validate request body
    const { providerId, deviceFlow, discoverRoles } = CompleteDeviceFlowRequestSchema.parse(requestBody);
    
    console.log(`Completing device flow for provider: ${providerId}`);
    
    // Load configuration and get provider config
    const configManager = ConfigManager.getInstance();
    const providerConfig = await configManager.getProviderConfig(providerId);
    
    if (!providerConfig) {
      throw new Error(`Provider '${providerId}' not found in configuration`);
    }

    // Get AWS SSO provider from registry and complete device flow
    const registry = getInitializedRegistry();
    let provider = registry.getProvider(providerId);
    
    if (!provider) {
      console.log(`Provider ${providerId} not found in registry, attempting to configure...`);
      // Try to configure the provider first
      try {
        await registry.configureProvider(providerConfig);
        provider = registry.getProvider(providerId);
        console.log(`Successfully configured provider ${providerId} for device flow completion`);
      } catch (configError) {
        console.error(`Failed to configure provider ${providerId}:`, configError);
        throw new Error(`Provider ${providerId} not found or not configured: ${configError}`);
      }
      
      if (!provider) {
        throw new Error(`Provider ${providerId} not found or not configured`);
      }
    }

    // Complete device flow - this will poll for tokens
    const authResult = await (provider as any).completeDeviceFlow(deviceFlow, providerConfig);
    console.log('Device flow completion result:', authResult);
    
    if (!authResult.success) {
      throw new Error(authResult.error || 'Device flow completion failed');
    }

    // Store the SSO access token for on-demand session creation
    // Instead of creating all sessions upfront, we'll create them only when needed
    if (authResult.accessToken && authResult.sessionId) {
      console.log('Storing SSO access token for on-demand session creation');
      
      // Create a lightweight master session to store the access token
      const masterSession = {
        sessionId: authResult.sessionId,
        profileName: `${providerId}-master-token`,
        providerId,
        providerType: providerConfig.type,
        accessKeyId: 'on-demand', // Placeholder - real credentials created on demand
        secretAccessKey: 'on-demand',
        sessionToken: authResult.accessToken, // Store access token in sessionToken field
        expiresAt: new Date(Date.now() + 3600000), // Use default expiry, will be updated with real sessions
        createdAt: new Date(),
        lastRefreshed: new Date(),
        metadata: {
          accessToken: authResult.accessToken,
          isMasterToken: true,
          region: providerConfig.settings?.region || 'us-east-1'
        }
      };
      
      registry.addSession(providerId, masterSession);
      console.log(`Stored master SSO token for provider: ${providerId}. Sessions will be created on-demand.`);
    }

    // Discover roles now that we have tokens
    let roles: SSOProfile[] = [];
    if (discoverRoles && authResult.accessToken) {
      console.log('Attempting role discovery with access token:', authResult.accessToken ? 'present' : 'missing');
      try {
        roles = await registry.discoverRoles(providerId, authResult);
        console.log('Role discovery successful, found roles:', roles.length);
      } catch (roleDiscoveryError) {
        console.error('Role discovery failed after device flow completion:', roleDiscoveryError);
        // Continue without roles - authentication was successful
      }
    } else {
      console.log('Skipping role discovery - discoverRoles:', discoverRoles, 'accessToken present:', !!authResult.accessToken);
    }

    // Log successful completion
    logSecurityEvent('multi_provider_device_flow_completed', 'info', {
      success: true,
      providerId,
      providerType: providerConfig.type,
      rolesDiscovered: roles.length
    });

    // Return completion success with discovered roles
    return NextResponse.json({
      success: true,
      data: {
        providerId,
        providerType: providerConfig.type,
        authResult,
        roles,
        rolesDiscovered: roles.length
      },
      message: `Successfully completed device flow for ${providerConfig.name}`,
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Multi-provider SSO device flow completion failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('multi_provider_device_flow_invalid_request', 'warn', {
        validationErrors: error.errors
      });
      
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    // Extract provider ID from error for logging if available
    const providerId = (error as any).providerId || 'unknown';
    
    logSecurityEvent('multi_provider_device_flow_error', 'error', {
      error: errorMessage,
      providerId
    });

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}