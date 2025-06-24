import { NextRequest, NextResponse } from 'next/server';
import { ConfigManager } from '@/lib/config';
import { ApiResponse } from '@/lib/types';
import { CostConfig } from '@/lib/types/cost';

export async function GET() {
  try {
    const configManager = ConfigManager.getInstance();
    
    if (!configManager.configExists('cost')) {
      return NextResponse.json({
        success: false,
        error: 'Cost configuration file not found',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 404 });
    }

    const config = await configManager.loadCostConfig();
    
    return NextResponse.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString(),
    } as ApiResponse<CostConfig>);

  } catch (error) {
    console.error('Get cost config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load cost configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const config: CostConfig = await request.json();
    const configManager = ConfigManager.getInstance();
    
    await configManager.saveCostConfig(config);
    
    return NextResponse.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString(),
    } as ApiResponse<CostConfig>);

  } catch (error) {
    console.error('Save cost config API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save cost configuration',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}