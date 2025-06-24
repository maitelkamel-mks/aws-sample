import { NextRequest, NextResponse } from 'next/server';
import { SecurityHubService } from '@/lib/aws';
import { ApiResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const regions = searchParams.get('regions')?.split(',') || [];

    if (profiles.length === 0 || regions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: profiles, regions',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    const securityService = new SecurityHubService();
    const result = await securityService.getMultiProfileSecurityData(profiles, regions);

    return NextResponse.json({
      success: true,
      data: {
        summaries: result.summaries,
        overview: result.overview,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Security summary API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch security summary',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}