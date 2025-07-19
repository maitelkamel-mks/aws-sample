import { NextRequest, NextResponse } from 'next/server';
import { SecurityHubService } from '@/lib/aws';
import { SecurityFinding, SecuritySummary, SecurityOverview } from '@/lib/types/security';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const profiles = searchParams.get('profiles')?.split(',') || [];
    const regions = searchParams.get('regions')?.split(',') || [];
    const format = searchParams.get('format') || 'csv';
    const severities = searchParams.get('severities')?.split(',');
    const workflowState = searchParams.get('workflowState')?.split(',');
    const complianceStatus = searchParams.get('complianceStatus')?.split(',');
    const productName = searchParams.get('productName')?.split(',');

    if (profiles.length === 0 || regions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters: profiles, regions',
        timestamp: new Date().toISOString(),
      }, { status: 400 });
    }

    const securityService = new SecurityHubService();
    const result = await securityService.getMultiProfileSecurityData(profiles, regions);

    // Apply client-side filtering
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

    const exportData = {
      findings: filteredFindings,
      summaries: result.summaries,
      overview: result.overview
    };

    if (format === 'pdf') {
      const pdfBuffer = await generateSecurityPDF(exportData, profiles, regions);
      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="security-report-${new Date().toISOString().split('T')[0]}.pdf"`,
        },
      });
    } else if (format === 'xlsx') {
      const xlsxBuffer = generateSecurityExcel(exportData, profiles, regions);
      return new NextResponse(xlsxBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="security-report-${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      });
    } else if (format === 'html') {
      const htmlContent = generateSecurityHTML(exportData, profiles, regions);
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename="security-report-${new Date().toISOString().split('T')[0]}.html"`,
        },
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Unsupported export format',
      timestamp: new Date().toISOString(),
    }, { status: 400 });

  } catch (error) {
    console.error('Security export API error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export security data',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

async function generateSecurityPDF(
  data: { findings: SecurityFinding[]; summaries: SecuritySummary[]; overview: SecurityOverview },
  profiles: string[],
  regions: string[]
): Promise<Buffer> {
  const doc = new jsPDF('p', 'mm', 'a4');
  
  // Cover page
  createSecurityCoverPage(doc, data.overview, profiles, regions);
  
  // Overview page
  doc.addPage();
  createSecurityOverviewPage(doc, data.overview, data.summaries);
  
  // Findings summary by severity
  doc.addPage();
  createSeverityAnalysisPage(doc, data.findings);
  
  // Findings by account/region
  doc.addPage();
  createAccountRegionAnalysisPage(doc, data.findings);
  
  // Detailed findings
  if (data.findings.length > 0) {
    doc.addPage();
    createDetailedFindingsPage(doc, data.findings);
  }
  
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

function createSecurityCoverPage(
  doc: jsPDF,
  overview: SecurityOverview,
  profiles: string[],
  regions: string[]
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(28);
  doc.setTextColor(220, 53, 69); // Security red
  doc.text('AWS Security Hub Report', pageWidth / 2, 40, { align: 'center' });
  
  // Subtitle
  doc.setFontSize(16);
  doc.setTextColor(100, 100, 100);
  doc.text('Security Findings and Compliance Overview', pageWidth / 2, 55, { align: 'center' });
  
  // Total findings highlight
  doc.setFontSize(36);
  doc.setTextColor(220, 53, 69);
  doc.text(overview.total_findings.toString(), pageWidth / 2, 90, { align: 'center' });
  
  doc.setFontSize(14);
  doc.setTextColor(100, 100, 100);
  doc.text('Total Security Findings', pageWidth / 2, 105, { align: 'center' });
  
  // Critical findings highlight
  const criticalCount = overview.by_severity['CRITICAL'] || 0;
  doc.setFontSize(24);
  doc.setTextColor(220, 53, 69);
  doc.text(criticalCount.toString(), pageWidth / 2, 130, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text('Critical Findings', pageWidth / 2, 142, { align: 'center' });
  
  // Metadata box
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  const metadataY = 160;
  const lineHeight = 8;
  
  // Background for metadata
  doc.setFillColor(248, 249, 250);
  doc.rect(20, metadataY - 5, pageWidth - 40, 50, 'F');
  
  doc.text(`AWS Profiles: ${profiles.join(', ')}`, 25, metadataY + 5);
  doc.text(`Regions: ${regions.join(', ')}`, 25, metadataY + 5 + lineHeight);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 25, metadataY + 5 + lineHeight * 2);
  doc.text(`Scan Coverage: ${profiles.length} profiles, ${regions.length} regions`, 25, metadataY + 5 + lineHeight * 3);
  
  // Footer
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text('Generated with AWS Security Hub Data', pageWidth / 2, 270, { align: 'center' });
}

function createSecurityOverviewPage(
  doc: jsPDF,
  overview: SecurityOverview,
  summaries: SecuritySummary[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(220, 53, 69);
  doc.text('Security Overview', 20, 25);
  
  // Severity breakdown
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Findings by Severity', 20, 45);
  
  const severityData = [
    ['CRITICAL', overview.by_severity['CRITICAL'] || 0, '#dc3545'],
    ['HIGH', overview.by_severity['HIGH'] || 0, '#fd7e14'],
    ['MEDIUM', overview.by_severity['MEDIUM'] || 0, '#ffc107'],
    ['LOW', overview.by_severity['LOW'] || 0, '#28a745']
  ];
  
  severityData.forEach((severity, index) => {
    const yPos = 55 + (index * 8);
    doc.setFontSize(10);
    doc.text(`${severity[0]}: ${severity[1]} findings`, 25, yPos);
  });
  
  // Compliance overview
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Compliance Status Distribution', 20, 95);
  
  const complianceEntries = Object.entries(overview.compliance_overview);
  complianceEntries.forEach((entry, index) => {
    const yPos = 105 + (index * 6);
    doc.setFontSize(10);
    doc.text(`${entry[0]}: ${entry[1]} findings`, 25, yPos);
  });
  
  // Account summary table
  const accountData = summaries.map(summary => [
    summary.account,
    summary.region,
    summary.critical_count.toString(),
    summary.high_count.toString(),
    summary.medium_count.toString(),
    summary.low_count.toString(),
    summary.total_count.toString()
  ]);
  
  autoTable(doc, {
    startY: 140,
    head: [['Account', 'Region', 'Critical', 'High', 'Medium', 'Low', 'Total']],
    body: accountData,
    headStyles: { fillColor: [220, 53, 69], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { fontSize: 8, cellPadding: 2 }
  });
}

function createSeverityAnalysisPage(
  doc: jsPDF,
  findings: SecurityFinding[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(220, 53, 69);
  doc.text('Severity Analysis', 20, 25);
  
  // Group findings by severity
  const severityGroups = findings.reduce((acc, finding) => {
    if (!acc[finding.severity]) acc[finding.severity] = [];
    acc[finding.severity].push(finding);
    return acc;
  }, {} as Record<string, SecurityFinding[]>);
  
  let yPos = 40;
  
  ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].forEach(severity => {
    const severityFindings = severityGroups[severity] || [];
    if (severityFindings.length === 0) return;
    
    doc.setFontSize(14);
    doc.setTextColor(220, 53, 69);
    doc.text(`${severity} Severity (${severityFindings.length} findings)`, 20, yPos);
    yPos += 10;
    
    // Top finding types for this severity
    const findingTypes = severityFindings.reduce((acc, finding) => {
      acc[finding.product_name] = (acc[finding.product_name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topTypes = Object.entries(findingTypes)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    topTypes.forEach(([type, count], index) => {
      doc.text(`• ${type}: ${count} findings`, 25, yPos + (index * 5));
    });
    
    yPos += (topTypes.length * 5) + 10;
    
    if (yPos > 240) {
      doc.addPage();
      yPos = 25;
    }
  });
}

function createAccountRegionAnalysisPage(
  doc: jsPDF,
  findings: SecurityFinding[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(220, 53, 69);
  doc.text('Account & Region Analysis', 20, 25);
  
  // Account analysis
  const accountFindings = findings.reduce((acc, finding) => {
    const key = finding.profile_name || finding.account;
    if (!acc[key]) acc[key] = { total: 0, critical: 0, high: 0 };
    acc[key].total++;
    if (finding.severity === 'CRITICAL') acc[key].critical++;
    if (finding.severity === 'HIGH') acc[key].high++;
    return acc;
  }, {} as Record<string, { total: number; critical: number; high: number }>);
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Top Accounts by Critical/High Findings', 20, 45);
  
  const sortedAccounts = Object.entries(accountFindings)
    .sort(([,a], [,b]) => (b.critical + b.high) - (a.critical + a.high))
    .slice(0, 10);
  
  doc.setFontSize(10);
  let yPos = 55;
  sortedAccounts.forEach(([account, data], index) => {
    doc.text(`${index + 1}. ${account}: ${data.critical} Critical, ${data.high} High (${data.total} total)`, 25, yPos);
    yPos += 6;
  });
  
  // Region analysis
  const regionFindings = findings.reduce((acc, finding) => {
    if (!acc[finding.region]) acc[finding.region] = 0;
    acc[finding.region]++;
    return acc;
  }, {} as Record<string, number>);
  
  doc.setFontSize(14);
  doc.setTextColor(0, 0, 0);
  doc.text('Findings by Region', 20, yPos + 15);
  yPos += 25;
  
  const sortedRegions = Object.entries(regionFindings)
    .sort(([,a], [,b]) => b - a);
  
  doc.setFontSize(10);
  sortedRegions.forEach(([region, count], index) => {
    doc.text(`${region}: ${count} findings`, 25, yPos + (index * 5));
  });
}

function createDetailedFindingsPage(
  doc: jsPDF,
  findings: SecurityFinding[]
) {
  // Page title
  doc.setFontSize(20);
  doc.setTextColor(220, 53, 69);
  doc.text('Detailed Security Findings', 20, 25);
  
  // Sort findings by severity (Critical first)
  const severityOrder = { 'CRITICAL': 4, 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
  const sortedFindings = [...findings]
    .sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity])
    .slice(0, 50); // Limit to first 50 findings for PDF
  
  const findingsData = sortedFindings.map(finding => [
    finding.severity,
    finding.profile_name || finding.account,
    finding.region,
    finding.title.length > 50 ? finding.title.substring(0, 47) + '...' : finding.title,
    finding.workflow_state,
    finding.compliance_status
  ]);
  
  autoTable(doc, {
    startY: 35,
    head: [['Severity', 'Account', 'Region', 'Title', 'Status', 'Compliance']],
    body: findingsData,
    headStyles: { fillColor: [220, 53, 69], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 25 },
      2: { cellWidth: 20 },
      3: { cellWidth: 60 },
      4: { cellWidth: 20 },
      5: { cellWidth: 25 }
    }
  });
  
  if (findings.length > 50) {
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
     
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Note: Showing first 50 of ${findings.length} total findings`, 20, finalY);
  }
}

function generateSecurityExcel(
  data: { findings: SecurityFinding[]; summaries: SecuritySummary[]; overview: SecurityOverview },
  profiles: string[],
  regions: string[]
): Buffer {
  const wb = XLSX.utils.book_new();
  
  // Summary sheet
  const summaryData = [
    ['AWS Security Hub Report'],
    [],
    ['Profiles:', profiles.join(', ')],
    ['Regions:', regions.join(', ')],
    ['Generated:', new Date().toISOString()],
    [],
    ['Overview'],
    ['Total Findings', data.overview.total_findings],
    [],
    ['By Severity'],
    ['Critical', data.overview.by_severity['CRITICAL'] || 0],
    ['High', data.overview.by_severity['HIGH'] || 0],
    ['Medium', data.overview.by_severity['MEDIUM'] || 0],
    ['Low', data.overview.by_severity['LOW'] || 0],
    [],
    ['Compliance Status'],
    ...Object.entries(data.overview.compliance_overview).map(([status, count]) => [status, count])
  ];
  
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
  
  // Findings sheet
  const findingsHeaders = [
    'ID', 'Account', 'Profile', 'Region', 'Title', 'Severity', 'Workflow State', 
    'Compliance Status', 'Product Name', 'Resource ID', 'Resource Name', 
    'Created At', 'Updated At', 'Description'
  ];
  
  const findingsData = data.findings.map(finding => [
    finding.id,
    finding.account,
    finding.profile_name || '',
    finding.region,
    finding.title,
    finding.severity,
    finding.workflow_state,
    finding.compliance_status,
    finding.product_name,
    finding.resource_id || '',
    finding.resource_name || '',
    finding.created_at,
    finding.updated_at,
    finding.description || ''
  ]);
  
  const findingsSheet = XLSX.utils.aoa_to_sheet([findingsHeaders, ...findingsData]);
  XLSX.utils.book_append_sheet(wb, findingsSheet, 'Findings');
  
  // Account summaries sheet
  const summariesHeaders = [
    'Account', 'Region', 'Critical', 'High', 'Medium', 'Low', 'Total'
  ];
  
  const summariesData = data.summaries.map(summary => [
    summary.account,
    summary.region,
    summary.critical_count,
    summary.high_count,
    summary.medium_count,
    summary.low_count,
    summary.total_count
  ]);
  
  const summariesSheet = XLSX.utils.aoa_to_sheet([summariesHeaders, ...summariesData]);
  XLSX.utils.book_append_sheet(wb, summariesSheet, 'Account Summaries');
  
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return excelBuffer;
}

function generateSecurityHTML(
  data: { findings: SecurityFinding[]; summaries: SecuritySummary[]; overview: SecurityOverview },
  profiles: string[],
  regions: string[]
): string {
  // Process data for charts and tabs
  const profilesSet = [...new Set(data.findings.map(f => f.profile_name || f.account).filter(Boolean))].sort();
  const regionsSet = [...new Set(data.findings.map(f => f.region))].sort();
  
  // Create global summary data
  const globalSummaryData: Array<{account: string, critical: number, high: number, medium: number, low: number, total: number}> = [];
  profilesSet.forEach(profile => {
    const profileFindings = data.findings.filter(f => (f.profile_name || f.account) === profile);
    const row = {
      account: profile,
      critical: profileFindings.filter(f => f.severity === 'CRITICAL').length,
      high: profileFindings.filter(f => f.severity === 'HIGH').length,
      medium: profileFindings.filter(f => f.severity === 'MEDIUM').length,
      low: profileFindings.filter(f => f.severity === 'LOW').length,
      total: profileFindings.length
    };
    if (row.total > 0) globalSummaryData.push(row);
  });
  
  // Create profile-specific data
  const profileData: Record<string, Array<{region: string, critical: number, high: number, medium: number, low: number, total: number}>> = {};
  profilesSet.forEach(profile => {
    const profileFindings = data.findings.filter(f => (f.profile_name || f.account) === profile);
    const regionData: Array<{region: string, critical: number, high: number, medium: number, low: number, total: number}> = [];
    
    regionsSet.forEach(region => {
      const regionFindings = profileFindings.filter(f => f.region === region);
      if (regionFindings.length > 0) {
        regionData.push({
          region,
          critical: regionFindings.filter(f => f.severity === 'CRITICAL').length,
          high: regionFindings.filter(f => f.severity === 'HIGH').length,
          medium: regionFindings.filter(f => f.severity === 'MEDIUM').length,
          low: regionFindings.filter(f => f.severity === 'LOW').length,
          total: regionFindings.length
        });
      }
    });
    
    if (regionData.length > 0) {
      profileData[profile] = regionData;
    }
  });
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Security Hub Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
            line-height: 1.6;
            margin: 0;
            padding: 20px;
            background-color: #f0f2f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .header {
            margin-bottom: 24px;
        }
        .header h1 {
            color: #000000d9;
            margin: 0 0 8px 0;
            font-size: 28px;
            font-weight: 500;
        }
        .header p {
            color: #00000073;
            margin: 0;
            font-size: 14px;
        }
        .overview-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .metric-card {
            background-color: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
            border: 1px solid #f0f0f0;
        }
        .metric-icon {
            display: inline-block;
            width: 14px;
            height: 14px;
            margin-right: 8px;
            vertical-align: middle;
        }
        .metric-icon.total {
            color: #1890ff;
        }
        .metric-icon.critical {
            color: #DC3545;
        }
        .metric-icon.high {
            color: #FD7E14;
        }
        .metric-icon.medium {
            color: #FFC107;
        }
        .metric-icon.low {
            color: #20C997;
        }
        .metric-content {
            display: flex;
            flex-direction: column;
        }
        .metric-label {
            color: #00000073;
            font-size: 14px;
            margin-bottom: 4px;
        }
        .metric-value {
            font-size: 30px;
            font-weight: 500;
            line-height: 1.2;
            color: #000000d9;
        }
        .metric-value.critical {
            color: #DC3545;
        }
        .metric-value.high {
            color: #FD7E14;
        }
        .metric-value.medium {
            color: #FFC107;
        }
        .metric-value.low {
            color: #20C997;
        }
        .severity-badge {
            display: inline-block;
            font-size: 14px;
            font-weight: 500;
        }
        .severity-badge.critical { color: #dc3545; }
        .severity-badge.high { color: #fd7e14; }
        .severity-badge.medium { color: #ffc107; }
        .severity-badge.low { color: #28a745; }
        .section-card {
            background-color: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
            border: 1px solid #f0f0f0;
            margin-bottom: 24px;
        }
        .section-title {
            font-size: 16px;
            font-weight: 500;
            color: #000000d9;
            margin: 0 0 16px 0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #f0f0f0;
        }
        th {
            background-color: #fafafa;
            color: #000000d9;
            font-weight: 500;
            font-size: 14px;
        }
        tr:hover {
            background-color: #fafafa;
        }
        td {
            font-size: 14px;
            color: #000000d9;
        }
        .tabs-container {
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
            border: 1px solid #f0f0f0;
            margin-top: 24px;
        }
        .tabs-header {
            display: flex;
            border-bottom: 1px solid #f0f0f0;
            padding: 0 24px;
            overflow-x: auto;
        }
        .tab-button {
            background: none;
            border: none;
            padding: 16px 24px;
            font-size: 14px;
            color: #00000073;
            cursor: pointer;
            position: relative;
            white-space: nowrap;
            transition: color 0.3s;
        }
        .tab-button:hover {
            color: #000000d9;
        }
        .tab-button.active {
            color: #1890ff;
        }
        .tab-button.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 2px;
            background-color: #1890ff;
        }
        .tab-content {
            display: none;
            padding: 24px;
        }
        .tab-content.active {
            display: block;
        }
        .chart-container {
            position: relative;
            height: 400px;
            margin-bottom: 24px;
        }
        .chart-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
        }
        .chart-card {
            background-color: white;
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.03), 0 1px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px 0 rgba(0, 0, 0, 0.02);
            border: 1px solid #f0f0f0;
        }
        .chart-title {
            font-size: 16px;
            font-weight: 500;
            color: #000000d9;
            margin: 0 0 16px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Security Hub Dashboard</h1>
            <p>Profiles: ${profiles.join(', ')} | Regions: ${regions.join(', ')} | Generated: ${new Date().toLocaleString()}</p>
        </div>

        <div class="overview-grid">
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-label">
                        <svg class="metric-icon total" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
                        </svg>
                        Total Findings
                    </div>
                    <div class="metric-value">${data.overview.total_findings}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-label">
                        <svg class="metric-icon critical" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                        </svg>
                        Critical
                    </div>
                    <div class="metric-value critical">${data.overview.by_severity['CRITICAL'] || 0}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-label">
                        <svg class="metric-icon high" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M7.938 2.016A.13.13 0 0 1 8.002 2a.13.13 0 0 1 .063.016.146.146 0 0 1 .054.057l6.857 11.667c.036.06.035.124.002.183a.163.163 0 0 1-.054.06.116.116 0 0 1-.066.017H1.146a.115.115 0 0 1-.066-.017.163.163 0 0 1-.054-.06.176.176 0 0 1 .002-.183L7.884 2.073a.147.147 0 0 1 .054-.057zm1.044-.45a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566z"/>
                            <path d="M7.002 12a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 5.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995z"/>
                        </svg>
                        High
                    </div>
                    <div class="metric-value high">${data.overview.by_severity['HIGH'] || 0}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-label">
                        <svg class="metric-icon medium" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                        </svg>
                        Medium
                    </div>
                    <div class="metric-value medium">${data.overview.by_severity['MEDIUM'] || 0}</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-content">
                    <div class="metric-label">
                        <svg class="metric-icon low" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                            <path d="M10.97 4.97a.235.235 0 0 0-.02.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05z"/>
                        </svg>
                        Low
                    </div>
                    <div class="metric-value low">${data.overview.by_severity['LOW'] || 0}</div>
                </div>
            </div>
        </div>

        <div class="tabs-container">
            <div class="tabs-header">
                <button class="tab-button active" onclick="showTab(event, 'global-summary')">Global Summary</button>
                ${profilesSet.map(profile => `
                    <button class="tab-button" onclick="showTab(event, '${profile.replace(/[^a-zA-Z0-9]/g, '-')}')">${profile} (${data.findings.filter(f => (f.profile_name || f.account) === profile).length})</button>
                `).join('')}
            </div>
            
            <!-- Global Summary Tab -->
            <div id="global-summary" class="tab-content active">
                <div class="chart-grid">
                    <div class="chart-card">
                        <h3 class="chart-title">Global Findings by Severity and Account</h3>
                        <div class="chart-container">
                            <canvas id="global-bar-chart"></canvas>
                        </div>
                    </div>
                    <div class="chart-card">
                        <h3 class="chart-title">Total Findings Distribution by Account</h3>
                        <div class="chart-container">
                            <canvas id="global-pie-chart"></canvas>
                        </div>
                    </div>
                </div>
                
                <div class="section-card">
                    <h2 class="section-title">Global Security Hub Summary</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Account</th>
                                <th>Critical</th>
                                <th>High</th>
                                <th>Medium</th>
                                <th>Low</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${globalSummaryData.map(row => `
                            <tr>
                                <td>${row.account}</td>
                                <td><span class="severity-badge critical">${row.critical}</span></td>
                                <td><span class="severity-badge high">${row.high}</span></td>
                                <td><span class="severity-badge medium">${row.medium}</span></td>
                                <td><span class="severity-badge low">${row.low}</span></td>
                                <td><strong>${row.total}</strong></td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <!-- Profile-specific Tabs -->
            ${profilesSet.map(profile => {
                const profileFindings = data.findings.filter(f => (f.profile_name || f.account) === profile);
                const regionData = profileData[profile] || [];
                return `
                <div id="${profile.replace(/[^a-zA-Z0-9]/g, '-')}" class="tab-content">
                    <div class="chart-grid">
                        <div class="chart-card">
                            <h3 class="chart-title">Security Findings by Region - ${profile}</h3>
                            <div class="chart-container">
                                <canvas id="${profile.replace(/[^a-zA-Z0-9]/g, '-')}-bar-chart"></canvas>
                            </div>
                        </div>
                        <div class="chart-card">
                            <h3 class="chart-title">Findings by Severity - ${profile}</h3>
                            <div class="chart-container">
                                <canvas id="${profile.replace(/[^a-zA-Z0-9]/g, '-')}-pie-chart"></canvas>
                            </div>
                        </div>
                    </div>
                    
                    <div class="section-card">
                        <h2 class="section-title">Security Hub Findings for Profile - ${profile}</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Region</th>
                                    <th>Critical</th>
                                    <th>High</th>
                                    <th>Medium</th>
                                    <th>Low</th>
                                    <th>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${regionData.map(row => `
                                <tr>
                                    <td>${row.region}</td>
                                    <td><span class="severity-badge critical">${row.critical}</span></td>
                                    <td><span class="severity-badge high">${row.high}</span></td>
                                    <td><span class="severity-badge medium">${row.medium}</span></td>
                                    <td><span class="severity-badge low">${row.low}</span></td>
                                    <td><strong>${row.total}</strong></td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="section-card">
                        <h2 class="section-title">Security Findings (${profileFindings.length})</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Title</th>
                                    <th>Region</th>
                                    <th>Severity</th>
                                    <th>Status</th>
                                    <th>Compliance</th>
                                    <th>Created</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${profileFindings.slice(0, 50).map(finding => `
                                <tr>
                                    <td>${finding.title}</td>
                                    <td>${finding.region}</td>
                                    <td><span class="severity-badge ${finding.severity.toLowerCase()}">${finding.severity}</span></td>
                                    <td>${finding.workflow_state}</td>
                                    <td>${finding.compliance_status}</td>
                                    <td>${new Date(finding.created_at).toLocaleDateString()}</td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${profileFindings.length > 50 ? `<p style="margin: 16px 0 0 0; color: #00000073; font-size: 14px;"><em>Showing first 50 of ${profileFindings.length} findings</em></p>` : ''}
                    </div>
                </div>
                `;
            }).join('')}
        </div>
    </div>
    
    <script>
        // Tab functionality
        function showTab(event, tabId) {
            // Hide all tab contents
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Remove active class from all buttons
            const tabButtons = document.querySelectorAll('.tab-button');
            tabButtons.forEach(button => button.classList.remove('active'));
            
            // Show selected tab content
            const selectedTab = document.getElementById(tabId);
            if (selectedTab) {
                selectedTab.classList.add('active');
            }
            
            // Add active class to clicked button
            if (event && event.target) {
                event.target.classList.add('active');
            }
        }
        
        // Chart colors
        const severityColors = {
            CRITICAL: '#DC3545',
            HIGH: '#FD7E14',
            MEDIUM: '#FFC107',
            LOW: '#20C997'
        };
        
        const profileColors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'
        ];
        
        // Initialize charts after DOM is loaded
        window.onload = function() {
            // Global Summary Charts
            const globalBarCtx = document.getElementById('global-bar-chart').getContext('2d');
            const globalData = ${JSON.stringify(globalSummaryData)};
            
            new Chart(globalBarCtx, {
                type: 'bar',
                data: {
                    labels: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
                    datasets: globalData.map((row, index) => ({
                        label: row.account,
                        data: [row.critical, row.high, row.medium, row.low],
                        backgroundColor: profileColors[index % profileColors.length],
                        borderColor: profileColors[index % profileColors.length],
                        borderWidth: 1
                    }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        title: {
                            display: false
                        }
                    },
                    scales: {
                        x: {
                            stacked: true,
                        },
                        y: {
                            stacked: true
                        }
                    }
                }
            });
            
            // Global Pie Chart
            const globalPieCtx = document.getElementById('global-pie-chart').getContext('2d');
            new Chart(globalPieCtx, {
                type: 'pie',
                data: {
                    labels: globalData.map(row => row.account),
                    datasets: [{
                        data: globalData.map(row => row.total),
                        backgroundColor: globalData.map((_, index) => profileColors[index % profileColors.length]),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const percentage = ((context.raw / total) * 100).toFixed(1);
                                    return context.label + ': ' + context.raw + ' (' + percentage + '%)';
                                }
                            }
                        }
                    }
                }
            });
            
            // Profile-specific charts
            ${profilesSet.map(profile => {
                const safeId = profile.replace(/[^a-zA-Z0-9]/g, '-');
                const regionData = profileData[profile] || [];
                const profileFindings = data.findings.filter(f => (f.profile_name || f.account) === profile);
                
                // Calculate severity totals for pie chart
                const severityTotals = {
                    CRITICAL: profileFindings.filter(f => f.severity === 'CRITICAL').length,
                    HIGH: profileFindings.filter(f => f.severity === 'HIGH').length,
                    MEDIUM: profileFindings.filter(f => f.severity === 'MEDIUM').length,
                    LOW: profileFindings.filter(f => f.severity === 'LOW').length
                };
                
                // Need to escape the template literal syntax for proper JavaScript generation
                const barChartId = `${safeId}-bar-chart`;
                const pieChartId = `${safeId}-pie-chart`;
                
                return `
                    // ${profile} Bar Chart
                    (function() {
                        const barCtx = document.getElementById('${barChartId}');
                        if (barCtx) {
                            const regionData = ${JSON.stringify(regionData)};
                            new Chart(barCtx.getContext('2d'), {
                            type: 'bar',
                            data: {
                                labels: regionData.map(row => row.region),
                                datasets: [
                                    {
                                        label: 'CRITICAL',
                                        data: regionData.map(row => row.critical),
                                        backgroundColor: severityColors.CRITICAL,
                                        borderColor: severityColors.CRITICAL,
                                        borderWidth: 1
                                    },
                                    {
                                        label: 'HIGH',
                                        data: regionData.map(row => row.high),
                                        backgroundColor: severityColors.HIGH,
                                        borderColor: severityColors.HIGH,
                                        borderWidth: 1
                                    },
                                    {
                                        label: 'MEDIUM',
                                        data: regionData.map(row => row.medium),
                                        backgroundColor: severityColors.MEDIUM,
                                        borderColor: severityColors.MEDIUM,
                                        borderWidth: 1
                                    },
                                    {
                                        label: 'LOW',
                                        data: regionData.map(row => row.low),
                                        backgroundColor: severityColors.LOW,
                                        borderColor: severityColors.LOW,
                                        borderWidth: 1
                                    }
                                ]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'top',
                                    }
                                },
                                scales: {
                                    x: {
                                        stacked: true,
                                    },
                                    y: {
                                        stacked: true
                                    }
                                }
                            }
                        });
                        }
                    })();
                    
                    // ${profile} Pie Chart
                    (function() {
                        const pieCtx = document.getElementById('${pieChartId}');
                        if (pieCtx) {
                            const severityTotals = ${JSON.stringify(severityTotals)};
                            const labels = [];
                            const data = [];
                            const colors = [];
                            
                            Object.entries(severityTotals).forEach(([severity, count]) => {
                                if (count > 0) {
                                    labels.push(severity);
                                    data.push(count);
                                    colors.push(severityColors[severity]);
                                }
                            });
                            
                            new Chart(pieCtx.getContext('2d'), {
                            type: 'pie',
                            data: {
                                labels: labels,
                                datasets: [{
                                    data: data,
                                    backgroundColor: colors,
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        position: 'right',
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                                return context.label + ': ' + context.raw + ' (' + percentage + '%)';
                                            }
                                        }
                                    }
                                }
                            }
                        });
                        }
                    })();
                `;
            }).join('')}
        };
    </script>
</body>
</html>`;

  return html;
}