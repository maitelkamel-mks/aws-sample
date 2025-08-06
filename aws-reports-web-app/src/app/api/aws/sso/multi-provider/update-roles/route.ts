import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logSecurityEvent } from '@/lib/security/audit-logger';
import { ConfigManager } from '@/lib/config';
import { ApiResponse } from '@/lib/types';
import { getInitializedRegistry } from '@/lib/providers/registry-initialization';

// Schema for updating provider roles
const UpdateRolesRequestSchema = z.object({
  providerId: z.string().min(1),
  selectedRoles: z.array(z.object({
    originalRole: z.object({
      name: z.string(),
      accountId: z.string(),
      roleName: z.string(),
      providerId: z.string(),
      providerType: z.string(),
      metadata: z.record(z.any()).optional()
    }),
    customName: z.string().min(1),
    selected: z.boolean()
  }))
});

/**
 * Validate that we have an active SSO session for on-demand profile creation
 * No longer creates sessions upfront - they will be created when profiles are actually used
 */
async function validateSSOSessionForNewProfiles(providerId: string, newProfiles: any[]) {
  console.log(`Validating SSO session availability for ${newProfiles.length} newly added profiles`);
  
  // Get the registry to check for active master token
  const registry = getInitializedRegistry();
  const existingSessions = registry.getActiveSessions(providerId);
  
  // Find the master token session
  const masterSession = existingSessions.find(session => session.metadata?.isMasterToken);
  
  if (!masterSession || !masterSession.metadata?.accessToken) {
    console.warn('No master SSO token available. Profiles will require re-authentication when first accessed.');
    return false;
  }
  
  console.log(`Master SSO token available for provider ${providerId}. New profiles will have sessions created on-demand.`);
  return true;
}

// POST /api/aws/sso/multi-provider/update-roles - Update provider with selected roles
export async function POST(request: NextRequest) {
  try {
    const requestBody = await request.json();
    
    // Validate request body
    const { providerId, selectedRoles } = UpdateRolesRequestSchema.parse(requestBody);
    
    console.log(`Updating roles for provider: ${providerId} with ${selectedRoles.length} selected roles`);
    
    // Load configuration and get provider config
    const configManager = ConfigManager.getInstance();
    const providerConfig = await configManager.getProviderConfig(providerId);
    
    if (!providerConfig) {
      throw new Error(`Provider '${providerId}' not found in configuration`);
    }

    // Convert selected roles to the format expected by the provider configuration
    const newProfiles = selectedRoles
      .filter(role => role.selected)
      .map(role => ({
        profileName: role.customName,
        accountId: role.originalRole.accountId,
        roleName: role.originalRole.roleName,
        region: role.originalRole.metadata?.region || providerConfig.settings.region || 'us-east-1'
      }));

    // Get existing profiles and merge with new ones (avoid duplicates)
    const existingProfiles = providerConfig.settings.profiles || [];
    const mergedProfiles = [...existingProfiles];
    
    // Add new profiles that don't already exist
    newProfiles.forEach(newProfile => {
      const exists = existingProfiles.some((existing: any) => 
        existing.accountId === newProfile.accountId && 
        existing.roleName === newProfile.roleName
      );
      if (!exists) {
        mergedProfiles.push(newProfile);
      }
    });

    // Update the provider configuration with merged profiles
    const updatedProviderConfig = {
      ...providerConfig,
      settings: {
        ...providerConfig.settings,
        profiles: mergedProfiles
      }
    };

    // Save the updated configuration
    await configManager.updateProvider(providerId, updatedProviderConfig);

    // Validate SSO session availability for newly added profiles
    // Sessions will be created on-demand when profiles are actually used
    if (newProfiles.length > 0) {
      try {
        await validateSSOSessionForNewProfiles(providerId, newProfiles);
      } catch (validationError) {
        console.warn(`Failed to validate SSO session for new profiles: ${validationError}`);
        // Continue - configuration was saved successfully
      }
    }

    // Log successful update
    logSecurityEvent('multi_provider_roles_updated', 'info', {
      success: true,
      providerId,
      providerType: providerConfig.type,
      newRolesCount: newProfiles.length,
      totalRolesCount: mergedProfiles.length,
      customNames: newProfiles.map(p => p.profileName)
    });

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        providerId,
        providerType: providerConfig.type,
        newProfiles,
        allProfiles: mergedProfiles,
        profilesCount: newProfiles.length,
        totalProfilesCount: mergedProfiles.length
      },
      message: `Successfully added ${newProfiles.length} new role(s) to ${providerConfig.name} (total: ${mergedProfiles.length})`,
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Multi-provider SSO roles update failed:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof z.ZodError) {
      logSecurityEvent('multi_provider_roles_update_invalid_request', 'warn', {
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
    
    logSecurityEvent('multi_provider_roles_update_error', 'error', {
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