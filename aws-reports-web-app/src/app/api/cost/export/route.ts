import { NextRequest, NextResponse } from 'next/server';
import { CostExplorerService } from '@/lib/aws';
import { CostData, CostSummary } from '@/lib/types/cost';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';

// Generate all periods within the date range based on granularity
function generateAllPeriods(startDate: string, endDate: string, granularity: string): string[] {
  const periods: string[] = [];
  let current = dayjs(startDate);
  const end = dayjs(endDate);
  
  while (current.isBefore(end) || current.isSame(end)) {
    switch (granularity) {
      case 'HOURLY':
        periods.push(current.format('YYYY-MM-DD[T]HH:mm:ss[Z]'));
        current = current.add(1, 'hour');
        break;
      case 'DAILY':
        periods.push(current.format('YYYY-MM-DD'));
        current = current.add(1, 'day');
        break;
      case 'MONTHLY':
        periods.push(current.format('YYYY-MM-DD'));
        current = current.add(1, 'month');
        break;
      case 'ANNUAL':
        periods.push(current.format('YYYY'));
        current = current.add(1, 'year');
        break;
      default:
        periods.push(current.format('YYYY-MM-DD'));
        current = current.add(1, 'month');
    }
  }
  
  return periods;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'csv';
    const granularity = searchParams.get('granularity') as 'HOURLY' | 'DAILY' | 'MONTHLY' || 'MONTHLY';
    const excludeTaxes = searchParams.get('excludeTaxes') === 'true';
    const excludeSupport = searchParams.get('excludeSupport') === 'true';
    const services = searchParams.get('services')?.split(',');

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

    // Apply display-level filtering based on UI preferences
    let filteredData = result.data;
    
    // Apply service filtering - only show selected services
    if (services && services.length > 0) {
      filteredData = filteredData.filter(item => 
        services.includes(item.service)
      );
    }
    
    // Apply tax and support filtering
    if (excludeTaxes || excludeSupport) {
      filteredData = filteredData.filter(item => {
        // Filter out taxes if requested
        if (excludeTaxes && item.service === 'Tax') {
          return false;
        }
        
        // Filter out support services if requested
        if (excludeSupport && (
          item.service.startsWith('AWS Support') ||
          item.service === 'Support'
        )) {
          return false;
        }
        
        return true;
      });
    }

    const finalResult = {
      data: filteredData,
      summaries: result.summaries
    };

    if (format === 'csv') {
      const csvContent = convertToCSV(finalResult.data);
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.csv"`,
        },
      });
    } else if (format === 'json') {
      return new NextResponse(JSON.stringify(finalResult, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.json"`,
        },
      });
    } else if (format === 'pdf') {
      const pdfBuffer = await generatePDF(finalResult, startDate, endDate, profiles, granularity);
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.pdf"`,
        },
      });
    } else if (format === 'xlsx') {
      const xlsxBuffer = generateExcel(finalResult, startDate, endDate, profiles, granularity);
      return new NextResponse(xlsxBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.xlsx"`,
        },
      });
    } else if (format === 'html') {
      const htmlContent = generateHTML(finalResult, startDate, endDate, profiles, granularity);
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="cost-report-${startDate}-${endDate}.html"`,
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

async function generatePDF(
  result: { data: CostData[]; summaries: CostSummary[] },
  startDate: string,
  endDate: string,
  profiles: string[],
  granularity: string
): Promise<Buffer> {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Process data similar to dashboard
  // Generate all periods within the date range, not just periods with data
  const periods = generateAllPeriods(startDate, endDate, granularity);
  const profileList = [...new Set(result.data.map(d => d.profile))].sort();
  const services = [...new Set(result.data.map(d => d.service))].sort();
  
  // Create structured data
  const { accountTotalData, serviceTotalData, profileServiceData } = processDataForCharts(result, periods, profileList, services);
  
  const totalCost = result.summaries.reduce((sum, summary) => sum + summary.total_cost, 0);
  
  // Page 1: Cover page with title and summary
  createCoverPage(doc, startDate, endDate, profiles, granularity, totalCost);
  
  // Page 2: Account Totals overview
  doc.addPage();
  createAccountTotalsPage(doc, accountTotalData, periods);
  
  // Page 3: Service Totals overview
  doc.addPage();
  createServiceTotalsPage(doc, serviceTotalData, periods);
  
  // Pages 4+: Individual profile pages
  for (const profile of profileList) {
    doc.addPage();
    createProfilePage(doc, profile, profileServiceData[profile], periods);
  }
  
  // Convert to buffer
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

function processDataForCharts(
  result: { data: CostData[]; summaries: CostSummary[] },
  periods: string[],
  profileList: string[],
  services: string[]
) {
  // Create service data for each profile
  const profileServiceData: Record<string, Array<Record<string, string | number>>> = {};
  profileList.forEach(profile => {
    const profileData = result.data.filter(d => d.profile === profile);
    const serviceMap: Record<string, Record<string, string | number>> = {};
    
    services.forEach(service => {
      const serviceData = profileData.filter(d => d.service === service);
      const row: Record<string, string | number> = { service, total: 0 };
      let total = 0;
      
      periods.forEach(period => {
        const periodData = serviceData.find(d => d.period === period);
        const amount = periodData?.amount || 0;
        row[period] = amount;
        total += amount;
      });
      
      row.total = total;
      if (total > 0) serviceMap[service] = row;
    });
    
    profileServiceData[profile] = Object.values(serviceMap);
  });
  
  // Create account total data
  const accountTotalData: Array<Record<string, string | number>> = [];
  profileList.forEach(profile => {
    const profileData = result.data.filter(d => d.profile === profile);
    const row: Record<string, string | number> = { account: profile, total: 0 };
    let total = 0;
    
    periods.forEach(period => {
      const periodData = profileData.filter(d => d.period === period);
      const amount = periodData.reduce((sum, d) => sum + d.amount, 0);
      row[period] = amount;
      total += amount;
    });
    
    row.total = total;
    accountTotalData.push(row);
  });
  
  // Create service total data
  const serviceTotalData: Array<Record<string, string | number>> = [];
  services.forEach(service => {
    const serviceData = result.data.filter(d => d.service === service);
    const row: Record<string, string | number> = { service, total: 0 };
    let total = 0;
    
    periods.forEach(period => {
      const periodData = serviceData.filter(d => d.period === period);
      const amount = periodData.reduce((sum, d) => sum + d.amount, 0);
      row[period] = amount;
      total += amount;
    });
    
    row.total = total;
    if (total > 0) serviceTotalData.push(row);
  });
  
  return { accountTotalData, serviceTotalData, profileServiceData };
}

function createCoverPage(
  doc: jsPDF,
  startDate: string,
  endDate: string,
  profiles: string[],
  granularity: string,
  totalCost: number
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(28);
  doc.setTextColor(24, 144, 255); // Ant Design blue
  doc.text('AWS Cost Report', pageWidth / 2, 40, { align: 'center' });
  
  // Subtitle
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Comprehensive Cost Analysis Dashboard', pageWidth / 2, 55, { align: 'center' });
  
  // Total cost highlight
  doc.setFontSize(36);
  doc.setTextColor(24, 144, 255);
  doc.text(`$${totalCost.toFixed(2)}`, pageWidth / 2, 90, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text('Total Cost', pageWidth / 2, 105, { align: 'center' });
  
  // Metadata box
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  const metadataY = 130;
  const lineHeight = 8;
  
  // Background for metadata
  doc.setFillColor(248, 249, 250);
  doc.rect(20, metadataY - 5, pageWidth - 40, 60, 'F');
  
  doc.text(`Date Range: ${startDate} to ${endDate}`, 25, metadataY + 5);
  doc.text(`AWS Profiles: ${profiles.join(', ')}`, 25, metadataY + 5 + lineHeight);
  doc.text(`Granularity: ${granularity}`, 25, metadataY + 5 + lineHeight * 2);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 25, metadataY + 5 + lineHeight * 3);
  doc.text(`Number of Profiles: ${profiles.length}`, 25, metadataY + 5 + lineHeight * 4);
  
  // Footer
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text('Generated with AWS Cost Explorer Data', pageWidth / 2, 270, { align: 'center' });
}

function createAccountTotalsPage(
  doc: jsPDF,
  accountTotalData: Array<Record<string, string | number>>,
  periods: string[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(24, 144, 255);
  doc.text('Account Totals Overview', 20, 25);
  
  // Summary statistics
  const totalAccounts = accountTotalData.length;
  const grandTotal = accountTotalData.reduce((sum, account) => sum + Number(account.total), 0);
  const avgCostPerAccount = grandTotal / totalAccounts;
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Total Accounts: ${totalAccounts}`, 20, 40);
  doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, 20, 48);
  doc.text(`Average per Account: $${avgCostPerAccount.toFixed(2)}`, 20, 56);
  
  // Top accounts summary
  const sortedAccounts = [...accountTotalData].sort((a, b) => Number(b.total) - Number(a.total));
  const topAccounts = sortedAccounts.slice(0, 5);
  
  doc.setFontSize(14);
  doc.setTextColor(24, 144, 255);
  doc.text('Top 5 Accounts by Total Cost', 20, 75);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  let yPos = 85;
  topAccounts.forEach((account, index) => {
    const percentage = ((Number(account.total) / grandTotal) * 100).toFixed(1);
    doc.text(`${index + 1}. ${account.account}: $${Number(account.total).toFixed(2)} (${percentage}%)`, 25, yPos);
    yPos += 6;
  });
  
  // Full table
  const tableData = accountTotalData.map(row => [
    row.account as string,
    ...periods.map(period => `$${(Number(row[period]) || 0).toFixed(2)}`),
    `$${Number(row.total).toFixed(2)}`
  ]);
  
  autoTable(doc, {
    startY: 120,
    head: [['Account', ...periods, 'Total']],
    body: tableData,
    headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      [periods.length + 1]: { fontStyle: 'bold' } // Total column
    }
  });
}

function createServiceTotalsPage(
  doc: jsPDF,
  serviceTotalData: Array<Record<string, string | number>>,
  periods: string[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(24, 144, 255);
  doc.text('Service Totals Overview', 20, 25);
  
  // Summary statistics
  const totalServices = serviceTotalData.length;
  const grandTotal = serviceTotalData.reduce((sum, service) => sum + Number(service.total), 0);
  const avgCostPerService = grandTotal / totalServices;
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Total Services: ${totalServices}`, 20, 40);
  doc.text(`Grand Total: $${grandTotal.toFixed(2)}`, 20, 48);
  doc.text(`Average per Service: $${avgCostPerService.toFixed(2)}`, 20, 56);
  
  // Top services summary
  const sortedServices = [...serviceTotalData].sort((a, b) => Number(b.total) - Number(a.total));
  const topServices = sortedServices.slice(0, 10);
  
  doc.setFontSize(14);
  doc.setTextColor(24, 144, 255);
  doc.text('Top 10 Services by Total Cost', 20, 75);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  let yPos = 85;
  topServices.forEach((service, index) => {
    const percentage = ((Number(service.total) / grandTotal) * 100).toFixed(1);
    doc.text(`${index + 1}. ${service.service}: $${Number(service.total).toFixed(2)} (${percentage}%)`, 25, yPos);
    yPos += 6;
    if (yPos > 200) return; // Prevent overflow
  });
  
  // Full table
  const tableData = serviceTotalData.map(row => [
    row.service as string,
    ...periods.map(period => `$${(Number(row[period]) || 0).toFixed(2)}`),
    `$${Number(row.total).toFixed(2)}`
  ]);
  
  autoTable(doc, {
    startY: Math.min(yPos + 10, 160),
    head: [['Service', ...periods, 'Total']],
    body: tableData,
    headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      [periods.length + 1]: { fontStyle: 'bold' } // Total column
    }
  });
}

function createProfilePage(
  doc: jsPDF,
  profile: string,
  profileData: Array<Record<string, string | number>>,
  periods: string[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(24, 144, 255);
  doc.text(`Profile: ${profile}`, 20, 25);
  
  const profileTotal = profileData.reduce((sum, row) => sum + Number(row.total), 0);
  const totalServices = profileData.length;
  const avgCostPerService = totalServices > 0 ? profileTotal / totalServices : 0;
  
  // Summary statistics
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(`Total Cost: $${profileTotal.toFixed(2)}`, 20, 40);
  doc.text(`Services Used: ${totalServices}`, 20, 48);
  doc.text(`Average per Service: $${avgCostPerService.toFixed(2)}`, 20, 56);
  
  // Top services for this profile
  const sortedServices = [...profileData].sort((a, b) => Number(b.total) - Number(a.total));
  const topServices = sortedServices.slice(0, 8);
  
  doc.setFontSize(14);
  doc.setTextColor(24, 144, 255);
  doc.text(`Top Services for ${profile}`, 20, 75);
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  let yPos = 85;
  topServices.forEach((service, index) => {
    const percentage = profileTotal > 0 ? ((Number(service.total) / profileTotal) * 100).toFixed(1) : '0.0';
    doc.text(`${index + 1}. ${service.service}: $${Number(service.total).toFixed(2)} (${percentage}%)`, 25, yPos);
    yPos += 6;
    if (yPos > 160) return; // Prevent overflow
  });
  
  // Full table
  const tableData = profileData.map(row => [
    row.service as string,
    ...periods.map(period => `$${(Number(row[period]) || 0).toFixed(2)}`),
    `$${Number(row.total).toFixed(2)}`
  ]);
  
  autoTable(doc, {
    startY: Math.min(yPos + 10, 170),
    head: [['Service', ...periods, 'Total']],
    body: tableData,
    headStyles: { fillColor: [24, 144, 255], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { fontSize: 8, cellPadding: 3 },
    columnStyles: {
      [periods.length + 1]: { fontStyle: 'bold' } // Total column
    }
  });
}

function generateExcel(
  result: { data: CostData[]; summaries: CostSummary[] },
  startDate: string,
  endDate: string,
  profiles: string[],
  granularity: string
): Buffer {
  const wb = XLSX.utils.book_new();
  
  // Summary Sheet
  const summaryData = [
    ['AWS Cost Report'],
    [],
    ['Date Range:', `${startDate} to ${endDate}`],
    ['Profiles:', profiles.join(', ')],
    ['Granularity:', granularity],
    ['Generated:', new Date().toISOString()],
    [],
    ['Profile Summary'],
    ['Profile', 'Total Cost']
  ];
  
  result.summaries.forEach(summary => {
    summaryData.push([summary.profile, summary.total_cost.toString()]);
  });
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  
  // Detailed Data Sheet
  const detailHeaders = ['Profile', 'Service', 'Period', 'Amount', 'Currency'];
  const detailData = result.data.map(item => [
    item.profile,
    item.service,
    item.period,
    item.amount,
    item.currency
  ]);
  
  const detailSheet = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailData]);
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Detailed Data');
  
  // Create sheets per profile
  const profileGroups = result.data.reduce((acc, item) => {
    if (!acc[item.profile]) acc[item.profile] = [];
    acc[item.profile].push(item);
    return acc;
  }, {} as Record<string, CostData[]>);
  
  Object.entries(profileGroups).forEach(([profile, data]) => {
    const profileHeaders = ['Service', 'Period', 'Amount', 'Currency'];
    const profileData = data.map(item => [
      item.service,
      item.period,
      item.amount,
      item.currency
    ]);
    
    const profileSheet = XLSX.utils.aoa_to_sheet([profileHeaders, ...profileData]);
    XLSX.utils.book_append_sheet(wb, profileSheet, profile.substring(0, 31)); // Excel sheet names limited to 31 chars
  });
  
  // Generate buffer
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return excelBuffer;
}

function generateHTML(
  result: { data: CostData[]; summaries: CostSummary[] },
  startDate: string,
  endDate: string,
  profiles: string[],
  granularity: string
): string {
  const totalCost = result.summaries.reduce((sum, summary) => sum + summary.total_cost, 0);
  
  // Process data similar to dashboard
  // Generate all periods within the date range, not just periods with data
  const periods = generateAllPeriods(startDate, endDate, granularity);
  const profileList = [...new Set(result.data.map(d => d.profile))].sort();
  const services = [...new Set(result.data.map(d => d.service))].sort();
  
  // Create service data for each profile (similar to dashboard logic)
  const profileServiceData: Record<string, Array<Record<string, string | number>>> = {};
  profileList.forEach(profile => {
    const profileData = result.data.filter(d => d.profile === profile);
    const serviceMap: Record<string, Record<string, string | number>> = {};
    
    services.forEach(service => {
      const serviceData = profileData.filter(d => d.service === service);
      const row: Record<string, string | number> = { service, total: 0 };
      let total = 0;
      
      periods.forEach(period => {
        const periodData = serviceData.find(d => d.period === period);
        const amount = periodData?.amount || 0;
        row[period] = amount;
        total += amount;
      });
      
      row.total = total;
      if (total > 0) serviceMap[service] = row;
    });
    
    const rows = Object.values(serviceMap);
    profileServiceData[profile] = rows;
  });
  
  // Create account total data
  const accountTotalData: Array<Record<string, string | number>> = [];
  profileList.forEach(profile => {
    const profileData = result.data.filter(d => d.profile === profile);
    const row: Record<string, string | number> = { account: profile, total: 0 };
    let total = 0;
    
    periods.forEach(period => {
      const periodData = profileData.filter(d => d.period === period);
      const amount = periodData.reduce((sum, d) => sum + d.amount, 0);
      row[period] = amount;
      total += amount;
    });
    
    row.total = total;
    accountTotalData.push(row);
  });
  
  // Create service total data
  const serviceTotalData: Array<Record<string, string | number>> = [];
  services.forEach(service => {
    const serviceData = result.data.filter(d => d.service === service);
    const row: Record<string, string | number> = { service, total: 0 };
    let total = 0;
    
    periods.forEach(period => {
      const periodData = serviceData.filter(d => d.period === period);
      const amount = periodData.reduce((sum, d) => sum + d.amount, 0);
      row[period] = amount;
      total += amount;
    });
    
    row.total = total;
    if (total > 0) serviceTotalData.push(row);
  });
  
  const chartColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE'
  ];

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Cost Report - ${startDate} to ${endDate}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #1890ff;
        }
        .header h1 {
            color: #1890ff;
            margin: 0;
            font-size: 2.5em;
        }
        .metadata {
            background-color: #f8f9fa;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 30px;
            border-left: 4px solid #1890ff;
        }
        .metadata-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .metadata-item {
            display: flex;
            flex-direction: column;
        }
        .metadata-label {
            font-weight: bold;
            color: #666;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        .metadata-value {
            color: #333;
            font-size: 1.1em;
        }
        .summary {
            margin-bottom: 30px;
        }
        .summary h2 {
            color: #333;
            border-bottom: 2px solid #1890ff;
            padding-bottom: 10px;
        }
        .total-cost {
            font-size: 2em;
            color: #1890ff;
            font-weight: bold;
            text-align: center;
            margin: 20px 0;
            padding: 20px;
            background-color: #e6f7ff;
            border-radius: 5px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 30px;
            background-color: white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #ddd;
        }
        th {
            background-color: #1890ff;
            color: white;
            font-weight: bold;
            position: sticky;
            top: 0;
        }
        tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tr:hover {
            background-color: #e6f7ff;
        }
        .profile-section {
            margin-bottom: 40px;
            border: 1px solid #ddd;
            border-radius: 5px;
            overflow: hidden;
        }
        .profile-header {
            background-color: #1890ff;
            color: white;
            padding: 15px;
            margin: 0;
            font-size: 1.3em;
        }
        .profile-content {
            padding: 20px;
        }
        .amount {
            text-align: right;
            font-weight: bold;
        }
        .positive {
            color: #52c41a;
        }
        .negative {
            color: #ff4d4f;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 0.9em;
        }
        /* Tab styles */
        .tabs {
            margin-top: 30px;
        }
        .tab-buttons {
            display: flex;
            background-color: #f5f5f5;
            border-radius: 5px 5px 0 0;
            overflow: hidden;
            border-bottom: 2px solid #1890ff;
        }
        .tab-button {
            flex: 1;
            padding: 12px 20px;
            background-color: #f5f5f5;
            border: none;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            border-bottom: 3px solid transparent;
        }
        .tab-button:hover {
            background-color: #e6f7ff;
        }
        .tab-button.active {
            background-color: white;
            border-bottom-color: #1890ff;
            font-weight: bold;
        }
        .tab-content {
            display: none;
            padding: 20px;
            background-color: white;
            border-radius: 0 0 5px 5px;
        }
        .tab-content.active {
            display: block;
        }
        .charts-row {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
        }
        .chart-container {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .chart-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
            text-align: center;
        }
        .chart-canvas {
            max-height: 400px;
        }
        @media print {
            body { background-color: white; }
            .container { box-shadow: none; }
            .tab-button { display: none; }
            .tab-content { display: block !important; page-break-before: always; }
            .tab-content:first-child { page-break-before: auto; }
        }
        @media (max-width: 768px) {
            .charts-row { grid-template-columns: 1fr; }
            .tab-button { font-size: 12px; padding: 8px 12px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>AWS Cost Report</h1>
        </div>
        
        <div class="metadata">
            <div class="metadata-grid">
                <div class="metadata-item">
                    <div class="metadata-label">Date Range</div>
                    <div class="metadata-value">${startDate} to ${endDate}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">AWS Profiles</div>
                    <div class="metadata-value">${profiles.join(', ')}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Granularity</div>
                    <div class="metadata-value">${granularity}</div>
                </div>
                <div class="metadata-item">
                    <div class="metadata-label">Generated</div>
                    <div class="metadata-value">${new Date().toLocaleString()}</div>
                </div>
            </div>
        </div>

        <div class="total-cost">
            Total Cost: $${totalCost.toFixed(2)}
        </div>

        <div class="tabs">
            <div class="tab-buttons">
                <button class="tab-button active" onclick="showTab('account-totals')">Account Totals</button>
                <button class="tab-button" onclick="showTab('service-totals')">Service Totals</button>
                ${profileList.map(profile => `
                <button class="tab-button" onclick="showTab('${profile.replace(/[^a-zA-Z0-9]/g, '-')}')">${profile}</button>
                `).join('')}
            </div>

            <!-- Account Totals Tab -->
            <div id="account-totals" class="tab-content active">
                <div class="charts-row">
                    <div class="chart-container">
                        <div class="chart-title">Cost per Account over Time</div>
                        <canvas id="accountBarChart" class="chart-canvas"></canvas>
                    </div>
                    <div class="chart-container">
                        <div class="chart-title">Total Cost Distribution by Account</div>
                        <canvas id="accountPieChart" class="chart-canvas"></canvas>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Account</th>
                            ${periods.map(period => `<th>${period}</th>`).join('')}
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${accountTotalData.map(row => `
                        <tr>
                            <td>${row.account}</td>
                            ${periods.map(period => `<td class="amount">$${(Number(row[period]) || 0).toFixed(2)}</td>`).join('')}
                            <td class="amount"><strong>$${Number(row.total).toFixed(2)}</strong></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Service Totals Tab -->
            <div id="service-totals" class="tab-content">
                <div class="charts-row">
                    <div class="chart-container">
                        <div class="chart-title">Cost per Service over Time</div>
                        <canvas id="serviceBarChart" class="chart-canvas"></canvas>
                    </div>
                    <div class="chart-container">
                        <div class="chart-title">Total Cost Distribution by Service</div>
                        <canvas id="servicePieChart" class="chart-canvas"></canvas>
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Service</th>
                            ${periods.map(period => `<th>${period}</th>`).join('')}
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${serviceTotalData.map(row => `
                        <tr>
                            <td>${row.service}</td>
                            ${periods.map(period => `<td class="amount">$${(Number(row[period]) || 0).toFixed(2)}</td>`).join('')}
                            <td class="amount"><strong>$${Number(row.total).toFixed(2)}</strong></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Individual Profile Tabs -->
            ${profileList.map(profile => {
              const profileData = profileServiceData[profile];
              const profileId = profile.replace(/[^a-zA-Z0-9]/g, '-');
              return `
              <div id="${profileId}" class="tab-content">
                  <div class="charts-row">
                      <div class="chart-container">
                          <div class="chart-title">Cost per Service over Time - ${profile}</div>
                          <canvas id="${profileId}BarChart" class="chart-canvas"></canvas>
                      </div>
                      <div class="chart-container">
                          <div class="chart-title">Service Cost Distribution - ${profile}</div>
                          <canvas id="${profileId}PieChart" class="chart-canvas"></canvas>
                      </div>
                  </div>
                  <table>
                      <thead>
                          <tr>
                              <th>Service</th>
                              ${periods.map(period => `<th>${period}</th>`).join('')}
                              <th>Total</th>
                          </tr>
                      </thead>
                      <tbody>
                          ${profileData.map(row => `
                          <tr>
                              <td>${row.service}</td>
                              ${periods.map(period => `<td class="amount">$${(Number(row[period]) || 0).toFixed(2)}</td>`).join('')}
                              <td class="amount"><strong>$${Number(row.total).toFixed(2)}</strong></td>
                          </tr>
                          `).join('')}
                      </tbody>
                  </table>
              </div>
              `;
            }).join('')}
        </div>

        <div class="footer">
            <p>AWS Cost Report generated on ${new Date().toLocaleString()}</p>
            <p>This report contains cost data from AWS Cost Explorer</p>
        </div>
    </div>

    <script>
        const chartColors = ${JSON.stringify(chartColors)};
        const periods = ${JSON.stringify(periods)};
        const accountTotalData = ${JSON.stringify(accountTotalData)};
        const serviceTotalData = ${JSON.stringify(serviceTotalData)};
        const profileServiceData = ${JSON.stringify(profileServiceData)};
        const profileList = ${JSON.stringify(profileList)};

        function showTab(tabId) {
            // Hide all tab contents
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Remove active class from all buttons
            document.querySelectorAll('.tab-button').forEach(button => {
                button.classList.remove('active');
            });
            
            // Show selected tab
            document.getElementById(tabId).classList.add('active');
            
            // Add active class to clicked button
            event.target.classList.add('active');
            
            // Initialize charts for the active tab
            setTimeout(() => initializeChartsForTab(tabId), 100);
        }

        function initializeChartsForTab(tabId) {
            if (tabId === 'account-totals') {
                createAccountCharts();
            } else if (tabId === 'service-totals') {
                createServiceCharts();
            } else {
                // Individual profile chart
                const profile = profileList.find(p => p.replace(/[^a-zA-Z0-9]/g, '-') === tabId);
                if (profile) {
                    createProfileCharts(profile, tabId);
                }
            }
        }

        function createAccountCharts() {
            // Account Bar Chart
            const barCtx = document.getElementById('accountBarChart');
            if (barCtx && !barCtx.chart) {
                barCtx.chart = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: periods,
                        datasets: accountTotalData.map((account, index) => ({
                            label: account.account,
                            data: periods.map(period => account[period] || 0),
                            backgroundColor: chartColors[index % chartColors.length],
                            borderColor: chartColors[index % chartColors.length],
                            borderWidth: 1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': $' + context.raw.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { stacked: true },
                            y: {
                                stacked: true,
                                ticks: {
                                    callback: function(value) {
                                        return '$' + value.toLocaleString();
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Account Pie Chart
            const pieCtx = document.getElementById('accountPieChart');
            if (pieCtx && !pieCtx.chart) {
                pieCtx.chart = new Chart(pieCtx, {
                    type: 'pie',
                    data: {
                        labels: accountTotalData.map(account => account.account),
                        datasets: [{
                            data: accountTotalData.map(account => account.total),
                            backgroundColor: accountTotalData.map((_, index) => chartColors[index % chartColors.length]),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = ((context.raw / total) * 100).toFixed(1);
                                        return context.label + ': $' + context.raw.toLocaleString() + ' (' + percentage + '%)';
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        function createServiceCharts() {
            // Service Bar Chart
            const barCtx = document.getElementById('serviceBarChart');
            if (barCtx && !barCtx.chart) {
                barCtx.chart = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: periods,
                        datasets: serviceTotalData.map((service, index) => ({
                            label: service.service,
                            data: periods.map(period => service[period] || 0),
                            backgroundColor: chartColors[index % chartColors.length],
                            borderColor: chartColors[index % chartColors.length],
                            borderWidth: 1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': $' + context.raw.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { stacked: true },
                            y: {
                                stacked: true,
                                ticks: {
                                    callback: function(value) {
                                        return '$' + value.toLocaleString();
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Service Pie Chart
            const pieCtx = document.getElementById('servicePieChart');
            if (pieCtx && !pieCtx.chart) {
                pieCtx.chart = new Chart(pieCtx, {
                    type: 'pie',
                    data: {
                        labels: serviceTotalData.map(service => service.service),
                        datasets: [{
                            data: serviceTotalData.map(service => service.total),
                            backgroundColor: serviceTotalData.map((_, index) => chartColors[index % chartColors.length]),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = ((context.raw / total) * 100).toFixed(1);
                                        return context.label + ': $' + context.raw.toLocaleString() + ' (' + percentage + '%)';
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        function createProfileCharts(profile, profileId) {
            const data = profileServiceData[profile];
            
            // Profile Bar Chart
            const barCtx = document.getElementById(profileId + 'BarChart');
            if (barCtx && !barCtx.chart) {
                barCtx.chart = new Chart(barCtx, {
                    type: 'bar',
                    data: {
                        labels: periods,
                        datasets: data.map((service, index) => ({
                            label: service.service,
                            data: periods.map(period => service[period] || 0),
                            backgroundColor: chartColors[index % chartColors.length],
                            borderColor: chartColors[index % chartColors.length],
                            borderWidth: 1
                        }))
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return context.dataset.label + ': $' + context.raw.toLocaleString();
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { stacked: true },
                            y: {
                                stacked: true,
                                ticks: {
                                    callback: function(value) {
                                        return '$' + value.toLocaleString();
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Profile Pie Chart
            const pieCtx = document.getElementById(profileId + 'PieChart');
            if (pieCtx && !pieCtx.chart) {
                pieCtx.chart = new Chart(pieCtx, {
                    type: 'pie',
                    data: {
                        labels: data.map(service => service.service),
                        datasets: [{
                            data: data.map(service => service.total),
                            backgroundColor: data.map((_, index) => chartColors[index % chartColors.length]),
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'right' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                        const percentage = ((context.raw / total) * 100).toFixed(1);
                                        return context.label + ': $' + context.raw.toLocaleString() + ' (' + percentage + '%)';
                                    }
                                }
                            }
                        }
                    }
                });
            }
        }

        // Initialize charts for the default active tab
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(() => createAccountCharts(), 500);
        });
    </script>
</body>
</html>`;

  return html;
}