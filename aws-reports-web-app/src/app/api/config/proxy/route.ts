import { NextRequest, NextResponse } from 'next/server';
import { ConfigManager } from '@/lib/config';
import { ApiResponse } from '@/lib/types';
import { ProxyConfig, ProxyStatus, ProxyTestResult } from '@/lib/types/proxy';
import { HttpsProxyAgent } from 'https-proxy-agent';

export async function GET() {
  try {
    const configManager = ConfigManager.getInstance();
    const proxyConfig = await configManager.loadProxyConfig();
    const envVars = configManager.getProxyEnvironmentVariables();
    
    const status: ProxyStatus = {
      configured: !!proxyConfig?.enabled || !!envVars.httpProxy || !!envVars.httpsProxy,
      source: proxyConfig?.enabled ? 'config' : 
              (envVars.httpProxy || envVars.httpsProxy) ? 'environment' : 'none',
      url: proxyConfig?.url || envVars.httpsProxy || envVars.httpProxy,
    };
    
    return NextResponse.json({
      success: true,
      data: {
        config: proxyConfig,
        status,
        environment: envVars,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Get proxy config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load proxy configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const proxyConfig: ProxyConfig = await request.json();
    const configManager = ConfigManager.getInstance();
    
    // Validate proxy URL format if provided
    if (proxyConfig.enabled && proxyConfig.url) {
      try {
        new URL(proxyConfig.url);
      } catch {
        return NextResponse.json({
          success: false,
          error: 'Invalid proxy URL format',
          timestamp: new Date().toISOString(),
        } as ApiResponse, { status: 400 });
      }
    }
    
    await configManager.saveProxyConfig(proxyConfig);
    
    return NextResponse.json({
      success: true,
      data: proxyConfig,
      timestamp: new Date().toISOString(),
    } as ApiResponse<ProxyConfig>);

  } catch (error) {
    console.error('Save proxy config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save proxy configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  if (action === 'test') {
    try {
      const { url, username, password } = await request.json();
      
      if (!url) {
        return NextResponse.json({
          success: false,
          error: 'Proxy URL is required for testing',
          timestamp: new Date().toISOString(),
        } as ApiResponse, { status: 400 });
      }

      const result = await testProxyConnection(url, username, password);
      
      return NextResponse.json({
        success: true,
        data: result,
        timestamp: new Date().toISOString(),
      } as ApiResponse<ProxyTestResult>);

    } catch (error) {
      console.error('Test proxy API error:', error);
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test proxy connection',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 500 });
    }
  }
  
  return NextResponse.json({
    success: false,
    error: 'Invalid action parameter',
    timestamp: new Date().toISOString(),
  } as ApiResponse, { status: 400 });
}

async function testProxyConnection(url: string, username?: string, password?: string): Promise<ProxyTestResult> {
  const startTime = Date.now();
  
  try {
    // Create proxy URL with authentication if provided
    let proxyUrl = url;
    if (username && password) {
      const urlObj = new URL(url);
      urlObj.username = username;
      urlObj.password = password;
      proxyUrl = urlObj.toString();
    }

    const agent = new HttpsProxyAgent(proxyUrl);
    
    // Test connection to a reliable endpoint
    const response = await fetch('https://httpbin.org/ip', {
      // @ts-expect-error - Node.js specific agent property not in browser fetch types
      agent,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const responseTime = Date.now() - startTime;
    
    if (response.ok) {
      return {
        success: true,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    } else {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        responseTime,
        timestamp: new Date().toISOString(),
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime,
      timestamp: new Date().toISOString(),
    };
  }
}