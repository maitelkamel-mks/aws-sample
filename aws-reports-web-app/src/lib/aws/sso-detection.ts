/**
 * AWS SSO Profile Detection Utilities
 * 
 * This module provides functionality to detect and analyze AWS SSO profiles
 * from local AWS CLI configuration files.
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface SSOProfileInfo {
  profileName: string;
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
  region?: string;
  output?: string;
  isSSO: boolean;
}

export interface SSOProviderGroup {
  ssoStartUrl: string;
  ssoRegion: string;
  organizationName: string;
  profiles: SSOProfileInfo[];
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AWSConfigSection {
  [key: string]: string | undefined;
}

/**
 * Parse INI-style configuration file
 */
function parseConfigFile(content: string): { [section: string]: AWSConfigSection } {
  const sections: { [section: string]: AWSConfigSection } = {};
  let currentSection = '';
  let currentSectionData: AWSConfigSection = {};

  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }
    
    // Check for section headers
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        sections[currentSection] = currentSectionData;
      }
      
      // Start new section
      currentSection = sectionMatch[1];
      currentSectionData = {};
      continue;
    }
    
    // Parse key-value pairs
    const kvMatch = trimmed.match(/^([^=]+)=(.*)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      currentSectionData[key] = value;
    }
  }
  
  // Save the last section
  if (currentSection) {
    sections[currentSection] = currentSectionData;
  }
  
  return sections;
}

/**
 * Detect SSO profiles from AWS configuration files
 */
export async function detectSSOProfiles(): Promise<SSOProfileInfo[]> {
  const profiles: SSOProfileInfo[] = [];
  const awsDir = join(homedir(), '.aws');
  
  try {
    // Read AWS config file
    const configPath = join(awsDir, 'config');
    let configContent = '';
    
    try {
      configContent = await fs.readFile(configPath, 'utf-8');
    } catch (error) {
      console.log('No AWS config file found');
    }
    
    // Read AWS credentials file
    const credentialsPath = join(awsDir, 'credentials');
    let credentialsContent = '';
    
    try {
      credentialsContent = await fs.readFile(credentialsPath, 'utf-8');
    } catch (error) {
      console.log('No AWS credentials file found');
    }
    
    // Parse both files
    const configSections = parseConfigFile(configContent);
    const credentialsSections = parseConfigFile(credentialsContent);
    
    // Process config file sections
    for (const [sectionName, sectionData] of Object.entries(configSections)) {
      let profileName = sectionName;
      
      // Handle "profile " prefix in config file
      if (sectionName.startsWith('profile ')) {
        profileName = sectionName.substring(8);
      }
      
      const isSSO = !!(
        sectionData.sso_start_url ||
        sectionData.sso_region ||
        sectionData.sso_account_id ||
        sectionData.sso_role_name
      );
      
      profiles.push({
        profileName,
        ssoStartUrl: sectionData.sso_start_url,
        ssoRegion: sectionData.sso_region,
        ssoAccountId: sectionData.sso_account_id,
        ssoRoleName: sectionData.sso_role_name,
        region: sectionData.region,
        output: sectionData.output,
        isSSO
      });
    }
    
    // Process credentials file sections (these are typically non-SSO)
    for (const [sectionName, sectionData] of Object.entries(credentialsSections)) {
      // Skip if we already have this profile from config
      if (profiles.some(p => p.profileName === sectionName)) {
        continue;
      }
      
      profiles.push({
        profileName: sectionName,
        region: sectionData.region,
        output: sectionData.output,
        isSSO: false
      });
    }
    
  } catch (error) {
    console.error('Error detecting SSO profiles:', error);
  }
  
  return profiles;
}

/**
 * Group SSO profiles by their start URL to create provider groups
 */
export function groupSSOProfilesByProvider(ssoProfiles: SSOProfileInfo[]): SSOProviderGroup[] {
  const groupMap = new Map<string, SSOProviderGroup>();
  
  for (const profile of ssoProfiles) {
    if (!profile.isSSO || !profile.ssoStartUrl) continue;
    
    const key = profile.ssoStartUrl;
    
    if (!groupMap.has(key)) {
      // Extract organization name from start URL
      const organizationName = extractOrganizationName(profile.ssoStartUrl);
      
      groupMap.set(key, {
        ssoStartUrl: profile.ssoStartUrl,
        ssoRegion: profile.ssoRegion || 'us-east-1',
        organizationName,
        profiles: [],
        isValid: false,
        errors: [],
        warnings: []
      });
    }
    
    const group = groupMap.get(key)!;
    group.profiles.push(profile);
  }
  
  // Validate each group
  for (const group of groupMap.values()) {
    const validation = validateSSOProviderGroup(group);
    group.isValid = validation.isValid;
    group.errors = validation.errors;
    group.warnings = validation.warnings;
  }
  
  return Array.from(groupMap.values());
}

/**
 * Extract organization name from SSO start URL
 */
function extractOrganizationName(startUrl: string): string {
  try {
    const url = new URL(startUrl);
    // Extract subdomain from URLs like https://my-org.awsapps.com/start
    const hostname = url.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 2 && parts[1] === 'awsapps') {
      return parts[0];
    }
    // For custom domains, use the full hostname
    return hostname.replace(/^www\./, '');
  } catch {
    // If URL parsing fails, generate a name from the URL
    return startUrl.replace(/https?:\/\//, '').replace(/\/.*/, '').replace(/[^a-zA-Z0-9]/g, '-');
  }
}

/**
 * Validate SSO provider group
 */
function validateSSOProviderGroup(group: SSOProviderGroup): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!group.ssoStartUrl) {
    errors.push('SSO start URL is required');
  } else if (!group.ssoStartUrl.startsWith('https://')) {
    warnings.push('SSO start URL should use HTTPS');
  }
  
  if (group.profiles.length === 0) {
    errors.push('No profiles found for this SSO organization');
  }
  
  // Check if all profiles have consistent SSO region
  const regions = [...new Set(group.profiles.map(p => p.ssoRegion).filter(Boolean))];
  if (regions.length > 1) {
    warnings.push(`Multiple SSO regions found: ${regions.join(', ')}. Using: ${group.ssoRegion}`);
  }
  
  // Validate individual profiles
  const invalidProfiles = group.profiles.filter(profile => {
    const profileValidation = validateSSOProfile(profile);
    return !profileValidation.isValid;
  });
  
  if (invalidProfiles.length > 0) {
    warnings.push(`${invalidProfiles.length} profile(s) have validation issues`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Generate provider configuration from SSO provider group
 */
export function generateProviderConfigFromGroup(group: SSOProviderGroup) {
  if (!group.isValid) {
    throw new Error(`Invalid SSO provider group: ${group.errors.join(', ')}`);
  }
  
  const providerId = `sso-${group.organizationName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  
  return {
    id: providerId,
    type: 'AWS_SSO' as const,
    name: `AWS SSO - ${group.organizationName}`,
    settings: {
      startUrl: group.ssoStartUrl,
      region: group.ssoRegion,
      organizationName: group.organizationName,
      profiles: group.profiles.map(profile => ({
        profileName: profile.profileName,
        accountId: profile.ssoAccountId,
        roleName: profile.ssoRoleName,
        region: profile.region
      }))
    },
    security: {
      sslVerification: true,
      tokenEncryption: true,
      sessionBinding: true,
      auditLogging: true
    },
    proxy: {
      enabled: false
    }
  };
}

/**
 * Generate provider configuration from SSO profile info (legacy - for individual profiles)
 */
export function generateProviderConfig(ssoProfile: SSOProfileInfo) {
  if (!ssoProfile.isSSO) {
    throw new Error('Profile is not an SSO profile');
  }
  
  const providerId = `sso-${ssoProfile.profileName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  
  return {
    id: providerId,
    type: 'AWS_SSO' as const,
    name: `AWS SSO - ${ssoProfile.profileName}`,
    settings: {
      startUrl: ssoProfile.ssoStartUrl || '',
      region: ssoProfile.ssoRegion || 'us-east-1',
      profileName: ssoProfile.profileName,
      accountId: ssoProfile.ssoAccountId,
      roleName: ssoProfile.ssoRoleName
    },
    security: {
      sslVerification: true,
      tokenEncryption: true,
      sessionBinding: true,
      auditLogging: true
    },
    proxy: {
      enabled: false
    }
  };
}

/**
 * Validate SSO profile configuration
 */
export function validateSSOProfile(ssoProfile: SSOProfileInfo): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!ssoProfile.isSSO) {
    errors.push('Profile is not configured for SSO');
  }
  
  if (!ssoProfile.ssoStartUrl) {
    errors.push('SSO start URL is required');
  } else if (!ssoProfile.ssoStartUrl.startsWith('https://')) {
    warnings.push('SSO start URL should use HTTPS');
  }
  
  if (!ssoProfile.ssoRegion) {
    warnings.push('SSO region is not specified, will default to us-east-1');
  }
  
  if (!ssoProfile.ssoAccountId) {
    warnings.push('SSO account ID is not specified');
  }
  
  if (!ssoProfile.ssoRoleName) {
    warnings.push('SSO role name is not specified');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}