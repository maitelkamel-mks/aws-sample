import { NextRequest, NextResponse } from 'next/server';
import { SecurityHubService } from '@/lib/aws';
import { ApiResponse } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const regions = searchParams.get('regions')?.split(',') || [];
    const severities = searchParams.get('severities')?.split(',');
    const workflowState = searchParams.get('workflowState')?.split(',');
    const complianceStatus = searchParams.get('complianceStatus')?.split(',');
    const productName = searchParams.get('productName')?.split(',');

    if (profiles.length === 0 || regions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: profiles, regions',
        timestamp: new Date().toISOString(),
      } as ApiResponse, { status: 400 });
    }

    const securityService = new SecurityHubService();
    const filters = {
      severities,
      workflowState,
      complianceStatus,
      productName,
    };

    // Remove undefined filters
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof typeof filters] === undefined) {
        delete filters[key as keyof typeof filters];
      }
    });

    // Capture console.warn messages for region availability warnings
    const originalWarn = console.warn;
    let warnings: string[] = [];
    console.warn = (...args) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('profile/region combinations failed')) {
        warnings = args[1] || [];
      }
      originalWarn(...args);
    };

    const result = await securityService.getMultiProfileSecurityData(profiles, regions);
    
    // Restore original console.warn
    console.warn = originalWarn;

    // Apply client-side filtering if needed
    let filteredFindings = result.findings;
    
    if (severities && severities.length > 0) {
      filteredFindings = filteredFindings.filter(f => severities.includes(f.severity));
    }
    
    if (workflowState && workflowState.length > 0) {
      filteredFindings = filteredFindings.filter(f => workflowState.includes(f.workflow_state));
    }
    
    if (complianceStatus && complianceStatus.length > 0) {
      filteredFindings = filteredFindings.filter(f => complianceStatus.includes(f.compliance_status));
    }
    
    if (productName && productName.length > 0) {
      filteredFindings = filteredFindings.filter(f => productName.includes(f.product_name));
    }

    return NextResponse.json({
      success: true,
      data: {
        findings: filteredFindings,
        summaries: result.summaries,
        overview: result.overview,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      timestamp: new Date().toISOString(),
    } as ApiResponse);

  } catch (error) {
    console.error('Security findings API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch security findings',
      timestamp: new Date().toISOString(),
    } as ApiResponse, { status: 500 });
  }
}