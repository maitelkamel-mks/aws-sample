import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types';

/**
 * Creates AWS client configuration with proxy support if HTTP_PROXY environment variable is set
 */
export function createAWSClientConfig(region: string, credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>) {
  const config: {
    region: string;
    credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
    requestHandler?: NodeHttpHandler;
  } = {
    region,
    credentials,
  };

  // Check for proxy configuration
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

  if (httpProxy || httpsProxy) {
    console.log('🌐 Configuring AWS clients with proxy settings...');
    
    // Create proxy agents
    const agents: {
      http?: HttpProxyAgent<string>;
      https?: HttpsProxyAgent<string>;
    } = {};
    
    if (httpProxy) {
      console.log(`📡 Using HTTP proxy: ${httpProxy}`);
      agents.http = new HttpProxyAgent(httpProxy);
    }
    
    if (httpsProxy) {
      console.log(`🔒 Using HTTPS proxy: ${httpsProxy}`);
      agents.https = new HttpsProxyAgent(httpsProxy);
    } else if (httpProxy) {
      // Use HTTP proxy for HTTPS if no specific HTTPS proxy is set
      console.log(`🔒 Using HTTP proxy for HTTPS traffic: ${httpProxy}`);
      agents.https = new HttpsProxyAgent(httpProxy);
    }
    
    // Log NO_PROXY configuration if set
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (noProxy) {
      console.log(`🚫 NO_PROXY configured: ${noProxy}`);
    }

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
 * Get proxy configuration details for logging/debugging
 */
export function getProxyConfig() {
  return {
    httpProxy: process.env.HTTP_PROXY || process.env.http_proxy,
    httpsProxy: process.env.HTTPS_PROXY || process.env.https_proxy,
    noProxy: process.env.NO_PROXY || process.env.no_proxy,
  };
}