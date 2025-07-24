import { NextRequest, NextResponse } from 'next/server';
import { AWSCredentialsManager } from '@/lib/aws/credentials';
import { ApiResponse } from '@/lib/types';

interface ConnectivityResult {
  profile: string;
  connected: boolean;
  account?: string;
  arn?: string;
  userId?: string;
  error?: string;
  type?: 'cli' | 'sso';
}

interface TestConnectivityRequest {
  profiles: string[];
  profileTypes?: Record<string, 'cli' | 'sso'>; // Optional type hints for profiles
}

export async function POST(request: NextRequest) {
  try {
    const { profiles, profileTypes }: TestConnectivityRequest = await request.json();
    
    if (!profiles || !Array.isArray(profiles)) {
      return NextResponse.json({
        success: false,
        error: 'Profiles array is required',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    const credentialsManager = AWSCredentialsManager.getInstance();
    const results: ConnectivityResult[] = [];

    // Test connectivity for each profile
    for (const profile of profiles) {
      try {
        const profileType = profileTypes?.[profile];
        
        // Use the enhanced credentials manager for validation
        const validationResult = await credentialsManager.validateAnyProfile(profile);
        
        results.push({
          profile,
          connected: validationResult.success,
          account: validationResult.accountId,
          arn: validationResult.arn,
          userId: validationResult.userId,
          error: validationResult.error,
          type: profileType || 'cli' // Only CLI profiles supported in this legacy endpoint
        });
      } catch (error) {
        console.error(`Connectivity test failed for profile ${profile}:`, error);
        
        let errorMessage = 'Unknown error';
        if (error instanceof Error) {
          errorMessage = error.message;
        }

        results.push({
          profile,
          connected: false,
          error: errorMessage,
          type: profileTypes?.[profile] || 'cli'
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('AWS connectivity test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to test AWS connectivity',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}