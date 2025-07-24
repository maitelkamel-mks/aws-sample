/**
 * SSO Providers Registry
 * 
 * Central export point for all SSO provider implementations
 */

export { SAMLProvider } from './SAMLProvider';
export { AWSManagedSSOProvider } from './AWSManagedSSOProvider';
export { OIDCProvider } from './OIDCProvider';

// Future providers will be exported here:
// export { LDAPProvider } from './LDAPProvider';