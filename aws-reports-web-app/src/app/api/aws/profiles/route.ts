import { NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws';
import { ApiResponse } from '@/lib/types';

export async function GET() {
  try {
    const credentialsManager = AWSCredentialsManager.getInstance();
    const profiles = await credentialsManager.getAvailableProfiles();
    
    return NextResponse.json({
      success: true,
      data: profiles,
      timestamp: new Date().toISOString(),
    } as ApiResponse<string[]>);

  } catch (error) {
    console.error('Get AWS profiles API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get AWS profiles',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}