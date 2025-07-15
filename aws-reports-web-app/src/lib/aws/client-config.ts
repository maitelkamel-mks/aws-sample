import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types';
import { ProxyConfig } from '../types/proxy';
import { ConfigManager } from '../config';

/**
 * Creates AWS client configuration with proxy support
 * Priority: 1) Shared proxy config file 2) Environment variables
 */
export async function createAWSClientConfig(
  region: string, 
  credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
) {
  const config: {
    region: string;
    credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
    requestHandler?: NodeHttpHandler;
  } = {
    region,
    credentials,
  };

  // Get proxy configuration with priority: shared config file > environment variables
  const proxyConfig = await getProxyConfiguration();
  
  if (proxyConfig) {
    console.log('🌐 Configuring AWS clients with proxy settings...');
    console.log(`📍 Proxy source: ${proxyConfig.source}`);
    
    const agents = createProxyAgents(proxyConfig);
    
    // Configure the request handler with proxy agents
    config.requestHandler = new NodeHttpHandler({
      httpAgent: agents.http,
      httpsAgent: agents.https,
      connectionTimeout: 30000,
      socketTimeout: 30000,
    });
  }

  return config;
}

/**
 * Get proxy configuration with priority: shared config file > environment variables
 */
async function getProxyConfiguration() {
  const configManager = ConfigManager.getInstance();
  
  // Try to get proxy config from shared config file first
  const fileProxyConfig = await configManager.loadProxyConfig();
  
  if (fileProxyConfig?.enabled && fileProxyConfig.url) {
    return {
      url: fileProxyConfig.url,
      username: fileProxyConfig.username,
      password: fileProxyConfig.password,
      noProxy: fileProxyConfig.no_proxy,
      source: 'config' as const,
    };
  }
  
  // Fall back to environment variables
  const envVars = configManager.getProxyEnvironmentVariables();
  const proxyUrl = envVars.httpsProxy || envVars.httpProxy;
  
  if (proxyUrl) {
    return {
      url: proxyUrl,
      noProxy: envVars.noProxy?.split(',').map(s => s.trim()),
      source: 'environment' as const,
    };
  }
  
  return null;
}

/**
 * Create proxy agents based on configuration
 */
function createProxyAgents(proxyConfig: {
  url: string;
  username?: string;
  password?: string;
  noProxy?: string[];
  source: 'config' | 'environment';
}) {
  const agents: {
    http?: HttpProxyAgent<string>;
    https?: HttpsProxyAgent<string>;
  } = {};
  
  // Create proxy URL with authentication if provided
  let proxyUrl = proxyConfig.url;
  if (proxyConfig.username && proxyConfig.password) {
    const urlObj = new URL(proxyConfig.url);
    urlObj.username = proxyConfig.username;
    urlObj.password = proxyConfig.password;
    proxyUrl = urlObj.toString();
    console.log(`🔐 Using authenticated proxy: ${proxyConfig.username}@${urlObj.host}`);
  } else {
    console.log(`📡 Using proxy: ${proxyConfig.url}`);
  }
  
  // Create agents for both HTTP and HTTPS
  if (proxyConfig.url.startsWith('http://')) {
    agents.http = new HttpProxyAgent(proxyUrl);
    agents.https = new HttpsProxyAgent(proxyUrl);
  } else {
    agents.https = new HttpsProxyAgent(proxyUrl);
  }
  
  // Log NO_PROXY configuration if set
  if (proxyConfig.noProxy && proxyConfig.noProxy.length > 0) {
    console.log(`🚫 NO_PROXY configured: ${proxyConfig.noProxy.join(', ')}`);
  }
  
  return agents;
}

/**
 * Get proxy configuration details for logging/debugging
 * @deprecated Use getProxyConfiguration instead
 */
export function getProxyConfig() {
  return {
    httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
    httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
    noProxy: process.env.NO_PROXY || process.env.no_proxy,
  };
}

/**
 * Get current proxy status
 */
export async function getProxyStatus() {
  const proxyConfig = await getProxyConfiguration();
  
  return {
    configured: !!proxyConfig,
    source: proxyConfig?.source || 'none',
    url: proxyConfig?.url,
    authenticated: !!(proxyConfig?.username && proxyConfig?.password),
  };
}