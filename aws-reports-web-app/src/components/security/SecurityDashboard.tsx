'use client';

import { useState, useEffect } from 'react';
import { Card, Row, Col, Select, Button, Table, Typography, Space, Tag, Statistic, Input, Spin, App, Alert, Tabs } from 'antd';
import { ReloadOutlined, SearchOutlined, ExclamationCircleOutlined, WarningOutlined, InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { SecurityFinding, SecuritySummary, SecurityOverview, SecurityConfig } from '@/lib/types/security';
import AWSErrorAlert from '@/components/common/AWSErrorAlert';
import { Bar, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ChartTitle,
  Tooltip,
  Legend,
  ArcElement
);

const { Title } = Typography;
const { Search } = Input;

// Component for account findings table with local filters
function AccountFindingsTable({ accountFindings, findingsColumns }: { 
  accountFindings: SecurityFinding[], 
  findingsColumns: ColumnsType<SecurityFinding> 
}) {
  const [localSearchTerm, setLocalSearchTerm] = useState('');
  const [localSeverityFilter, setLocalSeverityFilter] = useState<string[]>([]);
  const [localWorkflowFilter, setLocalWorkflowFilter] = useState<string[]>([]);
  const [localComplianceFilter, setLocalComplianceFilter] = useState<string[]>([]);
  const [localPageSize, setLocalPageSize] = useState(20);

  // Filter findings based on local filters
  const localFilteredFindings = accountFindings.filter(finding => {
    const matchesSearch = !localSearchTerm || 
      finding.title.toLowerCase().includes(localSearchTerm.toLowerCase()) ||
      finding.description?.toLowerCase().includes(localSearchTerm.toLowerCase());
    
    const matchesSeverity = localSeverityFilter.length === 0 || 
      localSeverityFilter.includes(finding.severity);
    
    const matchesWorkflow = localWorkflowFilter.length === 0 || 
      localWorkflowFilter.includes(finding.workflow_state);
    
    const matchesCompliance = localComplianceFilter.length === 0 || 
      localComplianceFilter.includes(finding.compliance_status);

    return matchesSearch && matchesSeverity && matchesWorkflow && matchesCompliance;
  });

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={6}>
            <Search
              placeholder="Search findings..."
              value={localSearchTerm}
              onChange={(e) => setLocalSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              mode="multiple"
              placeholder="Filter by severity"
              value={localSeverityFilter}
              onChange={setLocalSeverityFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'Critical', value: 'CRITICAL' },
                { label: 'High', value: 'HIGH' },
                { label: 'Medium', value: 'MEDIUM' },
                { label: 'Low', value: 'LOW' },
              ]}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              mode="multiple"
              placeholder="Filter by status"
              value={localWorkflowFilter}
              onChange={setLocalWorkflowFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'New', value: 'NEW' },
                { label: 'Notified', value: 'NOTIFIED' },
                { label: 'Resolved', value: 'RESOLVED' },
                { label: 'Suppressed', value: 'SUPPRESSED' },
              ]}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Select
              mode="multiple"
              placeholder="Filter by compliance"
              value={localComplianceFilter}
              onChange={setLocalComplianceFilter}
              style={{ width: '100%' }}
              options={[
                { label: 'Passed', value: 'PASSED' },
                { label: 'Warning', value: 'WARNING' },
                { label: 'Failed', value: 'FAILED' },
                { label: 'N/A', value: 'NOT_AVAILABLE' },
              ]}
            />
          </Col>
        </Row>
      </Card>
      
      <Card title={`Security Findings (${localFilteredFindings.length})`} style={{ marginTop: 16 }}>
        <Table
          dataSource={localFilteredFindings}
          columns={findingsColumns}
          pagination={{ 
            pageSize: localPageSize, 
            showSizeChanger: true, 
            showQuickJumper: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} findings`,
            onShowSizeChange: (_, size) => setLocalPageSize(size)
          }}
          rowKey="id"
          scroll={{ x: 1200 }}
          expandable={{
            expandedRowRender: (record) => (
              <div>
                {record.description && (
                  <p><strong>Description:</strong> {record.description}</p>
                )}
                {record.remediation && (
                  <p><strong>Remediation:</strong> {record.remediation}</p>
                )}
              </div>
            ),
          }}
        />
      </Card>
    </>
  );
}

interface SecurityResponse {
  findings: SecurityFinding[];
  summaries: SecuritySummary[];
  overview: SecurityOverview;
  warnings?: string[];
}

interface SecurityTableRow {
  region?: string;
  account?: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}


const severityIcons = {
  CRITICAL: <ExclamationCircleOutlined />,
  HIGH: <WarningOutlined />,
  MEDIUM: <InfoCircleOutlined />,
  LOW: <CheckCircleOutlined />,
};

const workflowStateColors = {
  NEW: '#ff4d4f',
  NOTIFIED: '#fa8c16',
  RESOLVED: '#52c41a',
  SUPPRESSED: '#d9d9d9',
};

const complianceColors = {
  PASSED: '#52c41a',
  WARNING: '#faad14',
  FAILED: '#ff4d4f',
  NOT_AVAILABLE: '#d9d9d9',
};

export default function SecurityDashboard() {
  const { message } = App.useApp();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(['us-east-1']);
  const [severityFilter] = useState<string[]>([]);
  const [workflowFilter] = useState<string[]>([]);
  const [complianceFilter] = useState<string[]>([]);
  const [searchTerm] = useState('');
  const [useConfigDefaults, setUseConfigDefaults] = useState(true);
  const [globalSummaryPageSize, setGlobalSummaryPageSize] = useState(20);
  const [profileSummaryPageSizes, setProfileSummaryPageSizes] = useState<Record<string, number>>({});

  // Helper functions for profile page sizes
  const getProfilePageSize = (profile: string) => profileSummaryPageSizes[profile] || 20;
  const setProfilePageSize = (profile: string, size: number) => {
    setProfileSummaryPageSizes(prev => ({ ...prev, [profile]: size }));
  };

  // Chart colors for severities (matching Python script)
  const severityColors = {
    CRITICAL: '#DC3545',
    HIGH: '#FD7E14', 
    MEDIUM: '#FFC107',
    LOW: '#20C997',
  };

  // Additional colors for profiles
  const profileColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  ];

  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['aws-profiles'],
    queryFn: async () => {
      const response = await fetch('/api/aws/profiles');
      if (!response.ok) throw new Error('Failed to fetch profiles');
      const result = await response.json();
      return result.data as string[];
    },
  });

  const { data: securityConfig } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const response = await fetch('/api/config/security');
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch security configuration');
      }
      const result = await response.json();
      return result.data as SecurityConfig;
    },
  });

  // Load configuration defaults when config is available
  useEffect(() => {
    if (securityConfig && useConfigDefaults) {
      setSelectedProfiles(securityConfig.profiles || []);
      if (securityConfig.home_region) {
        setSelectedRegions([securityConfig.home_region]);
      }
      setUseConfigDefaults(false); // Only load once
    }
  }, [securityConfig, useConfigDefaults]);

  const { data: securityData, isLoading: securityLoading, error: securityError, refetch } = useQuery({
    queryKey: ['security-data', selectedProfiles, selectedRegions, severityFilter, workflowFilter, complianceFilter],
    queryFn: async () => {
      if (selectedProfiles.length === 0 || selectedRegions.length === 0) return null;
      
      const params = new URLSearchParams({
        profiles: selectedProfiles.join(','),
        regions: selectedRegions.join(','),
      });

      if (severityFilter.length > 0) {
        params.append('severities', severityFilter.join(','));
      }
      if (workflowFilter.length > 0) {
        params.append('workflowState', workflowFilter.join(','));
      }
      if (complianceFilter.length > 0) {
        params.append('complianceStatus', complianceFilter.join(','));
      }

      const response = await fetch(`/api/security/findings?${params}`);
      if (!response.ok) throw new Error('Failed to fetch security data');
      const result = await response.json();
      return result.data as SecurityResponse;
    },
    enabled: false,
  });

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
  ];

  const filteredFindings = securityData?.findings.filter(finding => {
    if (searchTerm) {
      return finding.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
             finding.description?.toLowerCase().includes(searchTerm.toLowerCase());
    }
    return true;
  }) || [];

  const findingsColumns: ColumnsType<SecurityFinding> = [
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      width: 300,
      ellipsis: true,
    },
    {
      title: 'Profile',
      dataIndex: 'profile_name',
      key: 'profile_name',
      width: 120,
      ellipsis: true,
    },
    {
      title: 'Resource',
      dataIndex: 'resource_name',
      key: 'resource_name',
      width: 200,
      ellipsis: true,
      render: (resourceName: string, record: SecurityFinding) => {
        if (resourceName) {
          return (
            <span title={record.resource_id || resourceName}>
              {resourceName}
            </span>
          );
        }
        return record.resource_id || '-';
      },
    },
    {
      title: 'Region',
      dataIndex: 'region',
      key: 'region',
      width: 100,
    },
    {
      title: 'Severity',
      dataIndex: 'severity',
      key: 'severity',
      width: 100,
      render: (severity: string) => (
        <Tag color={severityColors[severity as keyof typeof severityColors]} icon={severityIcons[severity as keyof typeof severityIcons]}>
          {severity}
        </Tag>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'workflow_state',
      key: 'workflow_state',
      width: 100,
      render: (state: string) => (
        <Tag color={workflowStateColors[state as keyof typeof workflowStateColors]}>
          {state.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: 'Compliance',
      dataIndex: 'compliance_status',
      key: 'compliance_status',
      width: 120,
      render: (status: string) => (
        <Tag color={complianceColors[status as keyof typeof complianceColors]}>
          {status.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: 'Product',
      dataIndex: 'product_name',
      key: 'product_name',
      width: 150,
      ellipsis: true,
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 120,
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
  ];

  // Generate charts for individual profile
  const generateProfileCharts = (profile: string, data: SecurityTableRow[], regions: string[]) => {
    if (!data || data.length === 0) return null;
    
    const nonTotalData = data.filter(row => row.region !== 'Total');
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    
    // Stacked bar chart data
    const barData = {
      labels: regions.filter(region => nonTotalData.some(row => row.region === region)),
      datasets: severities.map(severity => ({
        label: severity,
        data: regions.filter(region => nonTotalData.some(row => row.region === region))
                     .map(region => {
                       const row = nonTotalData.find(r => r.region === region);
                       return row ? (Number(row[severity as keyof SecurityTableRow]) || 0) : 0;
                     }),
        backgroundColor: severityColors[severity as keyof typeof severityColors],
        borderColor: severityColors[severity as keyof typeof severityColors],
        borderWidth: 1,
      })).filter(dataset => dataset.data.some(value => value > 0)),
    };

    // Pie chart data
    const pieLabels: string[] = [];
    const pieData: number[] = [];
    const pieColors: string[] = [];
    
    severities.forEach(severity => {
      const total = nonTotalData.reduce((sum, row) => sum + (Number(row[severity as keyof SecurityTableRow]) || 0), 0);
      if (total > 0) {
        pieLabels.push(severity);
        pieData.push(total);
        pieColors.push(severityColors[severity as keyof typeof severityColors]);
      }
    });

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function(context: any) {
              return `${context.dataset.label}: ${context.raw}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          ticks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: function(value: any) {
              return value;
            },
          },
        },
      },
    };

    const pieOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
        },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function(context: any) {
              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const percentage = ((context.raw / total) * 100).toFixed(1);
              return `${context.label}: ${context.raw} (${percentage}%)`;
            },
          },
        },
      },
    };

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title={`Security Findings by Region - ${profile}`}>
            <div style={{ height: 400 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title={`Findings by Severity - ${profile}`}>
            <div style={{ height: 400 }}>
              <Pie data={{ labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 1 }] }} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  // Generate charts for global summary
  const generateGlobalCharts = (data: SecurityTableRow[]) => {
    if (!data || data.length === 0) return null;
    
    const nonTotalData = data.filter(row => row.account !== 'Total');
    const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const profiles = nonTotalData.map(row => row.account);
    
    // Stacked bar chart data
    const barData = {
      labels: severities,
      datasets: profiles.map((profile, index) => ({
        label: profile,
        data: severities.map(severity => {
          const row = nonTotalData.find(r => r.account === profile);
          return row ? (Number(row[severity as keyof SecurityTableRow]) || 0) : 0;
        }),
        backgroundColor: profileColors[index % profileColors.length],
        borderColor: profileColors[index % profileColors.length],
        borderWidth: 1,
      })),
    };

    // Pie chart data
    const pieLabels: string[] = [];
    const pieData: number[] = [];
    const pieColors: string[] = [];
    
    nonTotalData.forEach((row, index) => {
      if (row.total > 0) {
        pieLabels.push(row.account || 'Unknown');
        pieData.push(row.total);
        pieColors.push(profileColors[index % profileColors.length]);
      }
    });

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top' as const,
        },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function(context: any) {
              return `${context.dataset.label}: ${context.raw}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
        },
        y: {
          stacked: true,
          ticks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: function(value: any) {
              return value;
            },
          },
        },
      },
    };

    const pieOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right' as const,
        },
        tooltip: {
          callbacks: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            label: function(context: any) {
              const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
              const percentage = ((context.raw / total) * 100).toFixed(1);
              return `${context.label}: ${context.raw} (${percentage}%)`;
            },
          },
        },
      },
    };

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Global Findings by Severity and Account">
            <div style={{ height: 400 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Total Findings Distribution by Account">
            <div style={{ height: 400 }}>
              <Pie data={{ labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 1 }] }} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    );
  };


  const loadFromConfig = () => {
    if (securityConfig) {
      setSelectedProfiles(securityConfig.profiles || []);
      if (securityConfig.home_region) {
        setSelectedRegions([securityConfig.home_region]);
      }
      message.success('Loaded settings from configuration file');
    } else {
      message.warning('No configuration file found. Please configure settings first.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>Security Hub Dashboard</Title>
        {securityConfig && (
          <Space>
            <Button 
              type="dashed" 
              onClick={loadFromConfig}
              size="small"
            >
              Load from Config: {securityConfig.report_name}
            </Button>
          </Space>
        )}
      </div>
      
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <label>AWS Profiles:</label>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select profiles"
              loading={profilesLoading}
              value={selectedProfiles}
              onChange={setSelectedProfiles}
              options={profilesData?.map(profile => ({ label: profile, value: profile }))}
            />
          </Col>
          <Col xs={24} sm={8}>
            <label>Regions:</label>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="Select regions"
              value={selectedRegions}
              onChange={setSelectedRegions}
              options={awsRegions.map(region => ({ label: region, value: region }))}
            />
          </Col>
          <Col xs={24} sm={8}>
            <Space style={{ marginTop: 20 }}>
              <Button 
                type="primary" 
                icon={<ReloadOutlined />}
                loading={securityLoading}
                onClick={() => refetch()}
                disabled={selectedProfiles.length === 0 || selectedRegions.length === 0}
              >
                Refresh Findings
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {securityData?.warnings && securityData.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Some regions are not available"
          description={
            <div>
              <p>Security Hub data could not be retrieved from some profile/region combinations:</p>
              <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                {securityData.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
              <p style={{ marginTop: 8, marginBottom: 0 }}>
                <strong>Note:</strong> Data is shown for available regions only.
              </p>
            </div>
          }
          closable
        />
      )}

      {securityData?.overview && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Total Findings"
                value={securityData.overview.total_findings}
                prefix={<SearchOutlined />}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Critical"
                value={securityData.overview.by_severity.CRITICAL || 0}
                valueStyle={{ color: severityColors.CRITICAL }}
                prefix={severityIcons.CRITICAL}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="High"
                value={securityData.overview.by_severity.HIGH || 0}
                valueStyle={{ color: severityColors.HIGH }}
                prefix={severityIcons.HIGH}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card>
              <Statistic
                title="Medium"
                value={securityData.overview.by_severity.MEDIUM || 0}
                valueStyle={{ color: severityColors.MEDIUM }}
                prefix={severityIcons.MEDIUM}
              />
            </Card>
          </Col>
        </Row>
      )}


      {securityError && (
        <AWSErrorAlert
          error={securityError}
          service="security"
          onRetry={() => refetch()}
          loading={securityLoading}
        />
      )}

      {securityLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>Loading security findings...</p>
          </div>
        </Card>
      )}

      {securityData && (() => {
        // Process data to match Python script structure
        // Get unique profiles and regions from findings data
        const profiles = [...new Set(filteredFindings.map(f => f.profile_name).filter((p): p is string => Boolean(p)))].sort();
        const regions = [...new Set(filteredFindings.map(f => f.region))].sort();
        const severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        
        // Create profile summary data (like Python script's account tables)
        const profileSummaryData: Record<string, SecurityTableRow[]> = {};
        profiles.forEach(profile => {
          const profileFindings = filteredFindings.filter(f => f.profile_name === profile);
          const rows: SecurityTableRow[] = [];
          
          regions.forEach(region => {
            const regionFindings = profileFindings.filter(f => f.region === region);
            if (regionFindings.length > 0) {
              const row: SecurityTableRow = { region, critical: 0, high: 0, medium: 0, low: 0, total: 0 };
              let totalCount = 0;
              
              severities.forEach(severity => {
                const count = regionFindings.filter(f => f.severity === severity).length;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (row as any)[severity] = count;
                totalCount += count;
              });
              
              row.total = totalCount;
              rows.push(row);
            }
          });
          
          // Add total row for this profile
          if (rows.length > 0) {
            const totalRow: SecurityTableRow = { region: 'Total', critical: 0, high: 0, medium: 0, low: 0, total: 0 };
            let grandTotal = 0;
            
            severities.forEach(severity => {
              const severityTotal = rows.reduce((sum, row) => sum + (Number(row[severity as keyof SecurityTableRow]) || 0), 0);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (totalRow as any)[severity] = severityTotal;
              grandTotal += severityTotal;
            });
            
            totalRow.total = grandTotal;
            rows.push(totalRow);
            profileSummaryData[profile] = rows;
          }
        });
        
        // Create global summary data
        const globalSummaryData: SecurityTableRow[] = [];
        profiles.forEach(profile => {
          const profileFindings = filteredFindings.filter(f => f.profile_name === profile);
          const row: SecurityTableRow = { account: profile, critical: 0, high: 0, medium: 0, low: 0, total: 0 };
          let totalCount = 0;
          
          severities.forEach(severity => {
            const count = profileFindings.filter(f => f.severity === severity).length;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (row as any)[severity] = count;
            totalCount += count;
          });
          
          row.total = totalCount;
          if (totalCount > 0) globalSummaryData.push(row);
        });
        
        // Add global total row
        if (globalSummaryData.length > 0) {
          const globalTotalRow: SecurityTableRow = { account: 'Total', critical: 0, high: 0, medium: 0, low: 0, total: 0 };
          let grandTotal = 0;
          
          severities.forEach(severity => {
            const severityTotal = globalSummaryData.reduce((sum, row) => sum + (Number(row[severity as keyof SecurityTableRow]) || 0), 0);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalTotalRow as any)[severity] = severityTotal;
            grandTotal += severityTotal;
          });
          
          globalTotalRow.total = grandTotal;
          globalSummaryData.push(globalTotalRow);
        }
        
        // Generate columns for summary tables
        const generateSummaryColumns = (firstColumnTitle: string) => {
          const columns: ColumnsType<SecurityTableRow> = [
            {
              title: firstColumnTitle,
              dataIndex: firstColumnTitle.toLowerCase(),
              key: firstColumnTitle.toLowerCase(),
              fixed: 'left',
              width: 150,
              sorter: (a, b) => {
                const aValue = a.account || a.region || '';
                const bValue = b.account || b.region || '';
                return aValue.localeCompare(bValue);
              },
            }
          ];
          
          severities.forEach(severity => {
            columns.push({
              title: severity,
              dataIndex: severity,
              key: severity,
              render: (count: number) => count || 0,
              align: 'center',
              sorter: (a, b) => (Number(a[severity as keyof SecurityTableRow]) || 0) - (Number(b[severity as keyof SecurityTableRow]) || 0),
            });
          });
          
          columns.push({
            title: 'Total',
            dataIndex: 'total',
            key: 'total',
            render: (count: number) => count || 0,
            align: 'center',
            fixed: 'right',
            width: 100,
            sorter: (a, b) => a.total - b.total,
            defaultSortOrder: 'descend',
          });
          
          return columns;
        };
        
        // Create tab items matching Python script structure
        const tabItems = [
          // Global Summary tab (first)
          {
            key: 'global-summary',
            label: 'Global Summary',
            children: (
              <div>
                {generateGlobalCharts(globalSummaryData)}
                <Card title="Global Security Hub Summary">
                  <Table
                    dataSource={globalSummaryData.filter(row => row.account !== 'Total')}
                    columns={generateSummaryColumns('Account')}
                    pagination={{ 
                      pageSize: globalSummaryPageSize, 
                      showSizeChanger: true, 
                      showQuickJumper: true,
                      pageSizeOptions: ['10', '20', '50', '100'],
                      showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} accounts`,
                      onShowSizeChange: (_, size) => setGlobalSummaryPageSize(size)
                    }}
                    rowKey="account"
                    scroll={{ x: 'max-content' }}
                    sortDirections={['descend', 'ascend']}
                    summary={() => {
                      const totalRow = globalSummaryData.find(row => row.account === 'Total');
                      if (!totalRow) return null;
                      return (
                        <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                          <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                          {['critical', 'high', 'medium', 'low'].map((severity, index) => (
                            <Table.Summary.Cell key={severity} index={index + 1} align="center">
                              {Number(totalRow[severity as keyof SecurityTableRow]) || 0}
                            </Table.Summary.Cell>
                          ))}
                          <Table.Summary.Cell index={5} align="center">
                            {totalRow.total}
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              </div>
            ),
          },
          // Individual profile summary tabs
          ...profiles.map(profile => {
            const profileFindings = filteredFindings.filter(f => f.profile_name === profile);
            return {
              key: `profile-${profile}`,
              label: `${profile} (${profileFindings.length})`,
              children: (
                <div>
                  {generateProfileCharts(profile, profileSummaryData[profile] || [], regions)}
                  <Card title={`Security Hub Findings for Profile - ${profile}`}>
                    <Table
                      dataSource={(profileSummaryData[profile] || []).filter(row => row.region !== 'Total')}
                      columns={generateSummaryColumns('Region')}
                      pagination={{ 
                        pageSize: getProfilePageSize(profile), 
                        showSizeChanger: true, 
                        showQuickJumper: true,
                        pageSizeOptions: ['10', '20', '50', '100'],
                        showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} regions`,
                        onShowSizeChange: (_, size) => setProfilePageSize(profile, size)
                      }}
                      rowKey="region"
                      scroll={{ x: 'max-content' }}
                      sortDirections={['descend', 'ascend']}
                      summary={() => {
                        const totalRow = (profileSummaryData[profile] || []).find(row => row.region === 'Total');
                        if (!totalRow) return null;
                        return (
                          <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                            <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                            {['critical', 'high', 'medium', 'low'].map((severity, index) => (
                              <Table.Summary.Cell key={severity} index={index + 1} align="center">
                                {Number(totalRow[severity as keyof SecurityTableRow]) || 0}
                              </Table.Summary.Cell>
                            ))}
                            <Table.Summary.Cell index={5} align="center">
                              {totalRow.total}
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        );
                      }}
                    />
                  </Card>
                  <AccountFindingsTable 
                    accountFindings={profileFindings}
                    findingsColumns={findingsColumns}
                  />
                </div>
              ),
            };
          }),
        ];
        
        return (
          <Tabs
            defaultActiveKey="global-summary"
            items={tabItems}
            style={{ marginTop: 16 }}
          />
        );
      })()}

      {(selectedProfiles.length === 0 || selectedRegions.length === 0) && (
        <Card>
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <p>Please select AWS profiles and regions to view security findings</p>
          </div>
        </Card>
      )}
    </div>
  );
}