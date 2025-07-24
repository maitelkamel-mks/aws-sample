# Multi-Provider SSO System

A comprehensive enterprise-grade SSO authentication system supporting multiple authentication protocols simultaneously.

## Overview

The Multi-Provider SSO system enables organizations to configure and use multiple SSO providers (SAML, AWS Identity Center, OpenID Connect) within a single application. Each provider operates independently while sharing common security and configuration management features.

## Quick Start

### 1. Access Configuration
Navigate to the configuration interface:
- **Web Application**: Go to `/config` → "Multi-Provider SSO" tab
- **Desktop Application**: Open Configuration → "Multi-Provider SSO" tab

### 2. Add Your First Provider

#### For SAML (Enterprise SSO)
```yaml
Provider ID: company-saml
Provider Type: SAML
Name: Company SSO
Settings:
  - Start URL: https://sso.company.com/saml/login
  - Realm: multiauth
  - Module: SoftID
  - Session Duration: 36000
```

#### For AWS Identity Center
```yaml
Provider ID: aws-sso
Provider Type: AWS_SSO
Name: AWS Identity Center
Settings:
  - Start URL: https://company.awsapps.com/start
  - Region: us-east-1
  - Session Duration: 3600
```

#### For Generic OIDC
```yaml
Provider ID: generic-oidc
Provider Type: OIDC
Name: Corporate OIDC
Settings:
  - Issuer: https://auth.company.com
  - Client ID: your-client-id
  - Scopes: [openid, profile, email, roles]
  - Redirect URI: https://your-app.com/auth/callback
```

### 3. Configure Global Settings
Set shared security and proxy settings that apply to all providers:

```yaml
Global Security Settings:
  - SSL Verification: ✓ Enabled
  - Token Encryption: ✓ Enabled  
  - Session Binding: ✓ Enabled
  - Audit Logging: ✓ Enabled

Global Proxy Settings:
  - Enable Proxy: Configure if behind corporate proxy
  - Proxy URL: https://proxy.company.com:8080
```

### 4. Test Authentication
1. Click "Authenticate" next to your provider
2. Enter your credentials
3. View discovered AWS roles
4. Profiles will be automatically organized by provider

## Provider Details

### SAML Provider

**Best for:** Enterprise environments with existing SAML infrastructure
**Features:**
- SAML 2.0 compliance
- JSON API authentication (modern approach)
- Automatic AWS role discovery from SAML assertions
- Enterprise proxy support

**Required Configuration:**
- `startUrl`: SAML identity provider endpoint
- `realm`: Authentication realm (if applicable)
- `module`: Authentication module type

**Optional Configuration:**
- `samlDestination`: Target service identifier
- `gotoUrl`: SAML IdP SSO initiation endpoint
- `metaAlias`: SAML metadata alias path
- `sessionDuration`: Token validity in seconds

### AWS Managed SSO Provider

**Best for:** Organizations using AWS Identity Center (AWS SSO)
**Features:**
- OAuth2 device authorization flow
- Multi-account AWS role discovery
- Automatic token refresh
- Native AWS integration

**Required Configuration:**
- `startUrl`: AWS SSO portal URL (e.g., `https://company.awsapps.com/start`)
- `region`: AWS region where SSO instance is hosted

**Authentication Flow:**
1. Device authorization starts
2. User authorizes via browser
3. Application receives access tokens
4. AWS accounts and roles are discovered

### OIDC Provider

**Best for:** Modern OAuth2/OpenID Connect identity providers
**Features:**
- OpenID Connect 1.0 compliance
- PKCE security for public clients
- Automatic discovery document loading
- Flexible role mapping from ID tokens

**Required Configuration:**
- `issuer`: OIDC provider URL
- `clientId`: OAuth2 client identifier
- `redirectUri`: Callback URL after authentication

**Optional Configuration:**
- `clientSecret`: Client secret (for confidential clients)
- `scopes`: Requested OAuth2 scopes
- `sessionDuration`: Token validity period

## Configuration File Structure

```yaml
multiProviderSSO:
  version: "1.0"
  lastModified: "2025-07-22T10:00:00Z"
  providers:
    - id: "company-saml"
      type: "SAML"
      name: "Company SAML SSO"
      enabled: true
      settings:
        startUrl: "https://sso.company.com/saml"
        realm: "multiauth"
        module: "SoftID"
        sessionDuration: 36000
      security:
        sslVerification: true
        tokenEncryption: true
        sessionBinding: true
        auditLogging: true
    - id: "aws-identity-center"
      type: "AWS_SSO"
      name: "AWS Identity Center"
      enabled: true
      settings:
        startUrl: "https://company.awsapps.com/start"
        region: "us-east-1"
        sessionDuration: 3600
  defaultProvider: "company-saml"
  globalSettings:
    security:
      sslVerification: true
      tokenEncryption: true
      sessionBinding: true
      auditLogging: true
    proxy:
      enabled: false
```

## Profile Management

### Provider-Grouped Profiles
Profiles are automatically organized by SSO provider:

```
📁 Company SAML SSO (SAML)
  └── 🔑 prod-admin (123456789012:AdminRole)
  └── 🔑 dev-readonly (123456789012:ReadOnlyRole)

📁 AWS Identity Center (AWS_SSO)  
  └── 🔑 multi-account-admin (234567890123:OrganizationAccountAccessRole)
  └── 🔑 security-auditor (345678901234:SecurityAuditRole)
```

### Session Status Indicators
- 🟢 **Active Session**: Currently authenticated and valid
- 🟡 **Session Expired**: Needs re-authentication  
- ⚪ **Not Authenticated**: No active session

### Profile Actions
- **Use Profile**: Apply this profile for AWS operations
- **Authenticate**: Login to discover/refresh roles
- **Logout**: Terminate active sessions

## Security Features

### Token Security
- **AES-256 Encryption**: All tokens encrypted at rest
- **Session Binding**: Tokens bound to client IP and user agent
- **Secure Storage**: Platform-specific secure storage (Keychain, Credential Manager)
- **Automatic Rotation**: Tokens refreshed automatically before expiration

### Network Security
- **Proxy Support**: HTTP/HTTPS proxy with authentication
- **SSL Verification**: Configurable certificate validation
- **Domain Exclusion**: Proxy bypass for specific domains
- **TLS Enforcement**: TLS 1.2+ required for all connections

### Audit and Monitoring
- **Authentication Logging**: All authentication attempts logged
- **Configuration Changes**: Configuration modifications tracked
- **Session Management**: Session creation, expiration, and cleanup logged
- **Health Monitoring**: Provider availability continuously monitored

## API Integration

### REST Endpoints

```bash
# Configuration Management
GET    /api/aws/sso/multi-provider/config
POST   /api/aws/sso/multi-provider/config  
PUT    /api/aws/sso/multi-provider/config
DELETE /api/aws/sso/multi-provider/config?providerId=id

# Provider Information
GET    /api/aws/sso/multi-provider/providers
POST   /api/aws/sso/multi-provider/providers  # Test provider

# Authentication
POST   /api/aws/sso/multi-provider/authenticate
GET    /api/aws/sso/multi-provider/authenticate  # Status
```

### Example API Usage

```bash
# Authenticate with SAML provider
curl -X POST /api/aws/sso/multi-provider/authenticate \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "company-saml",
    "credentials": {
      "username": "user@company.com",
      "password": "password"
    },
    "discoverRoles": true
  }'
```

## Troubleshooting

### Common Issues

#### Provider Configuration Errors
```
Error: Invalid configuration: SAML start URL is required
Solution: Ensure all required fields are filled in provider settings
```

#### Authentication Failures  
```
Error: SSO authentication failed: Invalid credentials
Solution: Verify username/password and check provider connectivity
```

#### Role Discovery Issues
```
Error: No roles found in SAML assertion
Solution: Check SAML configuration and AWS role trust relationships
```

#### Session Expiration
```
Error: Session expired, please re-authenticate
Solution: Click "Authenticate" to refresh session
```

### Debug Mode
Enable detailed logging for troubleshooting:

1. Open browser developer tools
2. Check console for detailed SSO debug messages
3. Network tab shows API request/response details
4. Check application logs for server-side errors

### Getting Help

**Configuration Issues:**
- Review the provider-specific documentation
- Validate configuration using the test function
- Check network connectivity and proxy settings

**Authentication Problems:**
- Verify credentials with your IT administrator
- Check if accounts have proper AWS role access
- Review audit logs for detailed error messages

**Role Discovery Issues:**
- Verify SAML assertion contains AWS role information
- Check AWS IAM role trust relationships
- Ensure proper SAML attribute mapping

## Migration from Legacy SSO

The system automatically migrates single-provider configurations:

### Automatic Migration
1. System detects legacy configuration on startup
2. Converts to multi-provider format
3. Preserves all settings and profiles
4. Creates backup of original configuration

### Manual Migration Steps
1. **Backup**: Export current configuration
2. **Access**: Go to Multi-Provider SSO configuration  
3. **Migrate**: System prompts for migration if legacy config detected
4. **Verify**: Test authentication after migration
5. **Update**: Configure additional providers as needed

## Advanced Configuration

### Multiple SAML Providers
Configure multiple SAML providers for different departments:

```yaml
providers:
  - id: "hr-saml"
    type: "SAML"
    name: "HR Department SAML"
    settings:
      startUrl: "https://hr-sso.company.com/saml"
  - id: "finance-saml"  
    type: "SAML"
    name: "Finance Department SAML"
    settings:
      startUrl: "https://finance-sso.company.com/saml"
```

### Mixed Provider Environment
Combine different authentication types:

```yaml
providers:
  - id: "legacy-saml"
    type: "SAML"
    name: "Legacy Corporate SAML"
  - id: "modern-aws-sso"
    type: "AWS_SSO"
    name: "AWS Identity Center"  
  - id: "partner-oidc"
    type: "OIDC"
    name: "Partner OpenID Connect"
```

### Per-Provider Security Settings
Override global security settings per provider:

```yaml
providers:
  - id: "high-security-saml"
    type: "SAML"
    name: "High Security SAML"
    security:
      mfaRequired: true
      sessionTimeout: 1800  # 30 minutes
      tokenEncryption: true
```

This multi-provider SSO system provides the flexibility and security needed for modern enterprise environments while maintaining ease of use and comprehensive management capabilities.