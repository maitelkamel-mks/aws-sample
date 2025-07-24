/**
 * Provider Registry Initialization
 * 
 * Handles automatic registration of all available SSO providers
 */

import { SSOProviderRegistry } from '../services/sso-provider-registry';
import { SAMLProvider } from './SAMLProvider';
import { AWSManagedSSOProvider } from './AWSManagedSSOProvider';
import { OIDCProvider } from './OIDCProvider';

/**
 * Initialize and register all available providers
 */
export function initializeProviders(): SSOProviderRegistry {
  const registry = SSOProviderRegistry.getInstance();
  
  try {
    // Register SAML Provider
    registry.registerProvider(SAMLProvider);
    console.log('✓ Registered SAML Provider');
    
    // Register AWS Managed SSO Provider
    registry.registerProvider(AWSManagedSSOProvider);
    console.log('✓ Registered AWS Managed SSO Provider');
    
    // Register OIDC Provider
    registry.registerProvider(OIDCProvider);
    console.log('✓ Registered OIDC Provider');
    
    // Future provider registrations:
    // registry.registerProvider(LDAPProvider);
    
    console.log('SSO Provider Registry initialized successfully');
    return registry;
  } catch (error) {
    console.error('Failed to initialize SSO providers:', error);
    throw error;
  }
}

/**
 * Get registry instance with providers already registered
 */
export function getInitializedRegistry(): SSOProviderRegistry {
  const registry = SSOProviderRegistry.getInstance();
  
  // Check if providers are already registered
  const availableTypes = registry.getAvailableProviderTypes();
  if (availableTypes.length === 0) {
    return initializeProviders();
  }
  
  return registry;
}