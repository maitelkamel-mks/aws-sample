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
 * Create SSO sessions for newly added profiles using existing access token
 */
async function createSessionsForNewProfiles(providerId: string, newProfiles: any[], providerConfig: any) {
  console.log(`Creating sessions for ${newProfiles.length} newly added profiles`);
  
  // Get the registry to access any existing active session for this provider
  const registry = getInitializedRegistry();
  const existingSessions = registry.getActiveSessions(providerId);
  
  // Find an existing session to get the access token
  let accessToken: string | undefined;
  for (const session of existingSessions) {
    // Check if we can extract an access token from session metadata or the session itself
    if (session.metadata?.accessToken) {
      accessToken = session.metadata.accessToken;
      break;
    }
  }
  
  // If no access token in sessions, we can't create new sessions
  // This would happen if the user imported roles without an active SSO session
  if (!accessToken) {
    console.warn('No access token available to create sessions for new profiles. Please re-authenticate.');
    return;
  }
  
  // Import SSO client for getting role credentials
  const { SSOClient, GetRoleCredentialsCommand } = await import('@aws-sdk/client-sso');
  const ssoClient = new SSOClient({ region: providerConfig.settings.region || 'us-east-1' });
  
  for (const profileConfig of newProfiles) {
    try {
      console.log(`Creating SSO session for new profile: ${profileConfig.profileName}`);
      
      // Get AWS credentials using SSO access token
      const getRoleCredentialsCommand = new GetRoleCredentialsCommand({
        accessToken: accessToken,
        accountId: profileConfig.accountId,
        roleName: profileConfig.roleName,
      });
      
      const credentialsResponse = await ssoClient.send(getRoleCredentialsCommand);
      
      if (credentialsResponse.roleCredentials) {
        const expiresAt = new Date(credentialsResponse.roleCredentials.expiration || Date.now() + 3600000);
        
        const session = {
          sessionId: `session-${Date.now()}-${profileConfig.profileName}`,
          profileName: profileConfig.profileName, // Use the configured profile name
          providerId,
          providerType: providerConfig.type,
          accessKeyId: credentialsResponse.roleCredentials.accessKeyId!,
          secretAccessKey: credentialsResponse.roleCredentials.secretAccessKey!,
          sessionToken: credentialsResponse.roleCredentials.sessionToken!,
          expiresAt,
          createdAt: new Date(),
          lastRefreshed: new Date(),
          metadata: {
            accountId: profileConfig.accountId,
            roleName: profileConfig.roleName,
            region: profileConfig.region,
            accessToken: accessToken // Store access token for future use
          }
        };
        
        registry.addSession(providerId, session);
        console.log(`Created SSO session for new profile: ${profileConfig.profileName}`);
      }
    } catch (credError) {
      console.error(`Failed to get credentials for new profile ${profileConfig.profileName}:`, credError);
    }
  }
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

    // Create SSO sessions for newly added profiles
    if (newProfiles.length > 0) {
      try {
        await createSessionsForNewProfiles(providerId, newProfiles, providerConfig);
      } catch (sessionError) {
        console.warn(`Failed to create sessions for new profiles: ${sessionError}`);
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