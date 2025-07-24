'use client';

import { useQuery } from '@tanstack/react-query';

export interface AWSProfile {
  name: string;
  type: 'cli' | 'sso' | 'cli+sso';
  isAuthenticated: boolean;
  region?: string | null;
  accountId?: string | null;
  roleArn?: string | null;
  description?: string;
  expiresAt?: string;
  userId?: string;
  // SSO specific fields
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  providerId?: string;
  providerType?: string;
}

export interface AWSProfilesData {
  cliProfiles: AWSProfile[];
  ssoProfiles: AWSProfile[];
  unifiedProfiles: AWSProfile[];
  ssoConfigured: boolean;
  totalProfiles: number;
  authenticatedSSOProfiles: number;
}

export interface UseAWSProfilesOptions {
  /**
   * Return format for profiles
   * - 'detailed': Full profile objects with metadata
   * - 'names': Just profile names as string array
   */
  format?: 'detailed' | 'names';
  
  /**
   * Include SSO profiles or just CLI profiles
   */
  includeSso?: boolean;
  
  /**
   * Enable automatic refetching
   */
  enabled?: boolean;
}

/**
 * Custom hook for fetching AWS profiles with consistent caching and synchronization
 * 
 * @example
 * // Get detailed profile objects
 * const { profiles, isLoading, error } = useAWSProfiles();
 * 
 * @example  
 * // Get just profile names
 * const { profiles, isLoading } = useAWSProfiles({ format: 'names' });
 * 
 * @example
 * // CLI profiles only
 * const { profiles } = useAWSProfiles({ includeSso: false });
 */
export function useAWSProfiles(options: UseAWSProfilesOptions = {}) {
  const {
    format = 'detailed',
    includeSso = true,
    enabled = true
  } = options;

  // Use unified endpoint that combines CLI + SSO profiles
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-profiles-unified', { includeSso, format }],
    queryFn: async (): Promise<AWSProfilesData> => {
      try {
        const response = await fetch('/api/aws/profiles/unified');
        if (!response.ok) throw new Error('Failed to fetch profiles');
        const result = await response.json();
        return result.data;
      } catch (error) {
        console.error('Failed to fetch AWS profiles:', error);
        throw error;
      }
    },
    enabled,
    staleTime: 30000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Process data based on options
  const processedData = data ? (() => {
    let allProfiles = [...data.cliProfiles];
    
    if (includeSso) {
      allProfiles = [...allProfiles, ...data.ssoProfiles];
    }

    if (format === 'names') {
      return allProfiles.map(profile => profile.name);
    }

    return allProfiles;
  })() : (format === 'names' ? [] : []);

  return {
    // Main data
    profiles: processedData,
    rawData: data,
    
    // Individual profile types
    cliProfiles: data?.cliProfiles || [],
    ssoProfiles: data?.ssoProfiles || [],
    
    // Metadata
    totalProfiles: data?.totalProfiles || 0,
    authenticatedSSOProfiles: data?.authenticatedSSOProfiles || 0,
    ssoConfigured: data?.ssoConfigured || false,
    
    // Query state
    isLoading,
    error,
    
    // Actions
    refetch,
    
    // Utils
    isReady: !isLoading && !error && !!data,
    isEmpty: !isLoading && (!data || data.totalProfiles === 0),
  };
}

/**
 * Hook for simple profile names only (backward compatibility)
 */
export function useAWSProfileNames(includeSso = true) {
  return useAWSProfiles({ format: 'names', includeSso });
}

/**
 * Hook for CLI profiles only
 */
export function useCLIProfiles() {
  return useAWSProfiles({ includeSso: false });
}