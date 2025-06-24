import { NextRequest, NextResponse } from 'next/server';
import { CostExplorerService } from '@/lib/aws';
import { CostData } from '@/lib/types/cost';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'csv';
    const granularity = searchParams.get('granularity') as 'DAILY' | 'MONTHLY' || 'MONTHLY';

    if (!startDate || !endDate || profiles.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: profiles, startDate, endDate',
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    const costService = new CostExplorerService();
    const result = await costService.getMultiProfileCostData(
      profiles,
      startDate,
      endDate,
      granularity
    );

    if (format === 'csv') {
      const csvContent = convertToCSV(result.data);
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.csv"`,
        },
      });
    } else if (format === 'json') {
      return new NextResponse(JSON.stringify(result, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.json"`,
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Unsupported export format',
      timestamp: new Date().toISOString(),
    }, { status: 400 });

  } catch (error) {
    console.error('Cost export API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export cost data',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

function convertToCSV(data: CostData[]): string {
  if (data.length === 0) return '';

  const headers = ['Profile', 'Service', 'Period', 'Amount', 'Currency', 'Usage Quantity', 'Usage Unit'];
  const rows = data.map(item => [
    item.profile,
    item.service,
    item.period,
    item.amount.toString(),
    item.currency,
    item.dimensions?.usage_quantity || '',
    item.dimensions?.usage_unit || '',
  ]);

  return [headers, ...rows].map(row => row.map(field => `"${field}"`).join(',')).join('\n');
}