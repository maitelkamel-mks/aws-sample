import { NextRequest, NextResponse } from 'next/server';
import { CostExplorerService } from '@/lib/aws';
import { ApiResponse } from '@/lib/types';
import { CostData, CostSummary } from '@/lib/types/cost';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const granularity = searchParams.get('granularity') as 'HOURLY' | 'DAILY' | 'MONTHLY' || 'MONTHLY';
    const services = searchParams.get('services')?.split(',');
    const excludeTaxes = searchParams.get('excludeTaxes') === 'true';
    const excludeSupport = searchParams.get('excludeSupport') === 'true';

    if (!startDate || !endDate || profiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: profiles, startDate, endDate',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    const costService = new CostExplorerService();
    const result = await costService.getMultiProfileCostData(
      profiles,
      startDate,
      endDate,
      granularity,
      services,
      excludeTaxes,
      excludeSupport
    );

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    } as ApiResponse<{ data: CostData[]; summaries: CostSummary[] }>);

  } catch (error) {
    console.error('Cost data API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch cost data',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}