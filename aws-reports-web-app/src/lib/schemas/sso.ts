import { z } from 'zod';

export const ProxyConfigurationSchema = z.object({
  enabled: z.boolean(),
  url: z.string().url().optional(),
  excludeDomains: z.array(z.string()).optional()
});

export const SecuritySettingsSchema = z.object({
  sslVerification: z.boolean().optional(),
  tokenEncryption: z.boolean().optional(),
  sessionBinding: z.boolean().optional(),
  auditLogging: z.boolean().optional()
});

export const ProviderSettingsSchema = z.object({
  realm: z.string().optional(),
  module: z.string().optional(),
  gotoUrl: z.string().url().optional(),
  metaAlias: z.string().optional()
});

export const SSOProfileSchema = z.object({
  name: z.string().min(1, 'Profile name is required'),
  accountId: z.string().regex(/^\d{12}$/, 'Account ID must be 12 digits'),
  roleName: z.string().min(1, 'Role name is required')
});

export const SSOConfigurationSchema = z.object({
  enabled: z.boolean(),
  providerName: z.string().min(1, 'Provider name is required'),
  startUrl: z.string().url('Invalid start URL'),
  authenticationType: z.enum(['SAML', 'LDAP', 'OAuth2']),
  sessionDuration: z.number().min(900).max(43200), // 15 minutes to 12 hours
  region: z.string().min(1, 'Region is required'),
  samlDestination: z.string().optional(),
  providerSettings: ProviderSettingsSchema.optional(),
  profiles: z.array(SSOProfileSchema).min(1, 'At least one profile is required'),
  proxy: ProxyConfigurationSchema.optional(),
  security: SecuritySettingsSchema.optional()
});

export const SSOLoginRequestSchema = z.object({
  profileName: z.string().min(1, 'Profile name is required'),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required')
});

export const SSORefreshRequestSchema = z.object({
  profileName: z.string().min(1, 'Profile name is required')
});

export const SSOLogoutRequestSchema = z.object({
  profileName: z.string().min(1, 'Profile name is required')
});

export const SSOConfigRequestSchema = z.object({
  config: SSOConfigurationSchema
});

export const SSOSessionSchema = z.object({
  profileName: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  sessionToken: z.string(),
  expiration: z.date(),
  roleArn: z.string(),
  accountId: z.string(),
  userId: z.string(),
  region: z.string()
});

export type SSOConfiguration = z.infer<typeof SSOConfigurationSchema>;
export type SSOProfile = z.infer<typeof SSOProfileSchema>;
export type ProxyConfiguration = z.infer<typeof ProxyConfigurationSchema>;
export type SecuritySettings = z.infer<typeof SecuritySettingsSchema>;
export type ProviderSettings = z.infer<typeof ProviderSettingsSchema>;
export type SSOLoginRequest = z.infer<typeof SSOLoginRequestSchema>;
export type SSORefreshRequest = z.infer<typeof SSORefreshRequestSchema>;
export type SSOLogoutRequest = z.infer<typeof SSOLogoutRequestSchema>;
export type SSOConfigRequest = z.infer<typeof SSOConfigRequestSchema>;
export type SSOSession = z.infer<typeof SSOSessionSchema>;