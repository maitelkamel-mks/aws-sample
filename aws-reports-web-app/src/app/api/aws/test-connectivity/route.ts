import { NextRequest, NextResponse } from 'next/server';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { fromIni } from '@aws-sdk/credential-providers';
import { createAWSClientConfig } from '@/lib/aws/client-config';
import { ApiResponse } from '@/lib/types';

interface ConnectivityResult {
  profile: string;
  connected: boolean;
  account?: string;
  arn?: string;
  userId?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const { profiles } = await request.json();
    
    if (!profiles || !Array.isArray(profiles)) {
      return NextResponse.json({
        success: false,
        error: 'Profiles array is required',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    const results: ConnectivityResult[] = [];

    // Test connectivity for each profile
    for (const profile of profiles) {
      try {
        // Create STS client with the specific profile
        const credentials = fromIni({ profile });
        const clientConfig = await createAWSClientConfig('us-east-1', credentials); // STS is available in all regions, using us-east-1 as default
        const stsClient = new STSClient(clientConfig);

        // Try to get caller identity to test connectivity
        const command = new GetCallerIdentityCommand({});
        const response = await stsClient.send(command);

        results.push({
          profile,
          connected: true,
          account: response.Account,
          arn: response.Arn,
          userId: response.UserId,
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