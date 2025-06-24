import { NextResponse } from 'next/server';
import { ApiResponse } from '@/lib/types';
import { getProxyConfig } from '@/lib/aws/client-config';

export async function GET() {
  try {
    const proxyConfig = getProxyConfig();
    
    return NextResponse.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: {
          nodeEnv: process.env.NODE_ENV,
          proxyConfiguration: {
            httpProxy: proxyConfig.httpProxy ? 'configured' : 'not set',
            httpsProxy: proxyConfig.httpsProxy ? 'configured' : 'not set',
            noProxy: proxyConfig.noProxy ? 'configured' : 'not set',
          }
        },
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Health check API error:', error);
    return NextResponse.json({
      success: false,
      error: 'Service unhealthy',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}