import { NextResponse } from 'next/server';
import { ApiResponse } from '@/lib/types';

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      data: {
        status: 'healthy',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
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