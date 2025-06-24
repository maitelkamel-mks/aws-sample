import { NextRequest, NextResponse } from 'next/server';
import { ConfigManager } from '@/lib/config';
import { ApiResponse } from '@/lib/types';
import { SecurityConfig } from '@/lib/types/security';

export async function GET() {
  try {
    const configManager = ConfigManager.getInstance();
    
    if (!configManager.configExists('security')) {
      return NextResponse.json({
        success: false,
        error: 'Security configuration file not found',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 404 });
    }

    const config = await configManager.loadSecurityConfig();
    
    return NextResponse.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString(),
    } as ApiResponse<SecurityConfig>);

  } catch (error) {
    console.error('Get security config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load security configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const config: SecurityConfig = await request.json();
    const configManager = ConfigManager.getInstance();
    
    await configManager.saveSecurityConfig(config);
    
    return NextResponse.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString(),
    } as ApiResponse<SecurityConfig>);

  } catch (error) {
    console.error('Save security config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save security configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}