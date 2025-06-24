'use client';

import { useState, useEffect } from 'react';
import { Card, Row, Col, DatePicker, Select, Button, Table, Typography, Space, Spin, App, Tabs, Switch } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { CostData, CostSummary, CostConfig } from '@/lib/types/cost';
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
const { RangePicker } = DatePicker;

interface CostResponse {
  data: CostData[];
  summaries: CostSummary[];
}

interface ServiceTableRow {
  service: string;
  total: number;
  [key: string]: string | number;
}

interface AccountTableRow {
  account: string;
  total: number;
  [key: string]: string | number;
}


export default function CostDashboard() {
  const { message } = App.useApp();
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(1, 'month'),
    dayjs()
  ]);
  const [granularity, setGranularity] = useState<'DAILY' | 'MONTHLY'>('MONTHLY');
  const [useConfigDefaults, setUseConfigDefaults] = useState(true);
  const [includeTaxes, setIncludeTaxes] = useState(true);
  const [includeSupport, setIncludeSupport] = useState(true);

  // Chart colors
  const chartColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
    '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#85929E',
    '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5', '#5499C7',
    '#52BE80', '#F39C12', '#E74C3C', '#8E44AD', '#3498DB'
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

  const { data: costConfig } = useQuery({
    queryKey: ['cost-config'],
    queryFn: async () => {
      const response = await fetch('/api/config/cost');
      if (!response.ok) {
        if (response.status === 404) return null; // No config exists yet
        throw new Error('Failed to fetch cost configuration');
      }
      const result = await response.json();
      return result.data as CostConfig;
    },
  });

  // Load configuration defaults when config is available
  useEffect(() => {
    if (costConfig && useConfigDefaults) {
      setSelectedProfiles(costConfig.profiles || []);
      setDateRange([
        dayjs(costConfig.start_date),
        dayjs(costConfig.end_date)
      ]);
      setGranularity(costConfig.period === 'daily' ? 'DAILY' : 'MONTHLY');
      setIncludeTaxes(!costConfig.exclude_taxes);
      setIncludeSupport(!costConfig.exclude_support);
      setUseConfigDefaults(false); // Only load once
    }
  }, [costConfig, useConfigDefaults]);

  const { data: costData, isLoading: costLoading, error: costError, refetch } = useQuery({
    queryKey: ['cost-data', selectedProfiles, dateRange, granularity, includeTaxes, includeSupport],
    queryFn: async () => {
      if (selectedProfiles.length === 0) return null;
      
      const params = new URLSearchParams({
        profiles: selectedProfiles.join(','),
        startDate: dateRange[0].format('YYYY-MM-DD'),
        endDate: dateRange[1].format('YYYY-MM-DD'),
        granularity,
        excludeTaxes: (!includeTaxes).toString(),
        excludeSupport: (!includeSupport).toString(),
      });

      const response = await fetch(`/api/cost/data?${params}`);
      if (!response.ok) throw new Error('Failed to fetch cost data');
      const result = await response.json();
      return result.data as CostResponse;
    },
    enabled: false,
  });


  // Generate service columns for individual account tables
  const generateServiceColumns = (periods: string[]) => {
    const columns: ColumnsType<ServiceTableRow> = [
      {
        title: 'Service',
        dataIndex: 'service',
        key: 'service',
        fixed: 'left',
        width: 150,
        sorter: (a, b) => a.service.localeCompare(b.service),
      }
    ];
    
    periods.forEach(period => {
      columns.push({
        title: period,
        dataIndex: period,
        key: period,
        render: (amount: number) => amount ? `$${amount.toFixed(2)}` : '$0.00',
        align: 'right',
        sorter: (a, b) => (Number(a[period]) || 0) - (Number(b[period]) || 0),
      });
    });
    
    columns.push({
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (amount: number) => `$${amount.toFixed(2)}`,
      align: 'right',
      fixed: 'right',
      width: 120,
      sorter: (a, b) => a.total - b.total,
      defaultSortOrder: 'descend',
    });
    
    return columns;
  };

  // Generate account total columns
  const generateAccountColumns = (periods: string[]) => {
    const columns: ColumnsType<AccountTableRow> = [
      {
        title: 'Account',
        dataIndex: 'account',
        key: 'account',
        fixed: 'left',
        width: 150,
        sorter: (a, b) => a.account.localeCompare(b.account),
      }
    ];
    
    periods.forEach(period => {
      columns.push({
        title: period,
        dataIndex: period,
        key: period,
        render: (amount: number) => amount ? `$${amount.toFixed(2)}` : '$0.00',
        align: 'right',
        sorter: (a, b) => (Number(a[period]) || 0) - (Number(b[period]) || 0),
      });
    });
    
    columns.push({
      title: 'Total',
      dataIndex: 'total',
      key: 'total',
      render: (amount: number) => `$${amount.toFixed(2)}`,
      align: 'right',
      fixed: 'right',
      width: 120,
      sorter: (a, b) => a.total - b.total,
      defaultSortOrder: 'descend',
    });
    
    return columns;
  };

  // Generate charts for individual profile
  const generateProfileCharts = (profile: string, data: ServiceTableRow[], periods: string[]) => {
    const serviceData = data.filter(row => row.service !== 'Total');
    
    // Stacked bar chart data
    const barData = {
      labels: periods,
      datasets: serviceData.map((service, index) => ({
        label: service.service,
        data: periods.map(period => service[period] || 0),
        backgroundColor: chartColors[index % chartColors.length],
        borderColor: chartColors[index % chartColors.length],
        borderWidth: 1,
      })),
    };

    // Pie chart data  
    const pieData = {
      labels: serviceData.map(service => service.service),
      datasets: [{
        data: serviceData.map(service => service.total),
        backgroundColor: serviceData.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 1,
      }],
    };

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
              return `${context.dataset.label || context.label}: $${context.raw.toLocaleString()}`;
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
              return '$' + value.toLocaleString();
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
              return `${context.label}: $${context.raw.toLocaleString()} (${percentage}%)`;
            },
          },
        },
      },
    };

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title={`Cost per Service over Time - ${profile}`}>
            <div style={{ height: 400 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title={`Service Cost Distribution - ${profile}`}>
            <div style={{ height: 400 }}>
              <Pie data={pieData} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  // Generate charts for account totals
  const generateAccountCharts = (data: AccountTableRow[], periods: string[]) => {
    const accountData = data.filter(row => row.account !== 'Total');
    
    // Stacked bar chart data
    const barData = {
      labels: periods,
      datasets: accountData.map((account, index) => ({
        label: account.account,
        data: periods.map(period => account[period] || 0),
        backgroundColor: chartColors[index % chartColors.length],
        borderColor: chartColors[index % chartColors.length],
        borderWidth: 1,
      })),
    };

    // Pie chart data
    const pieData = {
      labels: accountData.map(account => account.account),
      datasets: [{
        data: accountData.map(account => account.total),
        backgroundColor: accountData.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 1,
      }],
    };

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
              return `${context.dataset.label || context.label}: $${context.raw.toLocaleString()}`;
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
              return '$' + value.toLocaleString();
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
              return `${context.label}: $${context.raw.toLocaleString()} (${percentage}%)`;
            },
          },
        },
      },
    };

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Cost per Account over Time">
            <div style={{ height: 400 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Total Cost Distribution by Account">
            <div style={{ height: 400 }}>
              <Pie data={pieData} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  // Generate charts for service totals
  const generateServiceCharts = (data: ServiceTableRow[], periods: string[]) => {
    const serviceData = data.filter(row => row.service !== 'Total');
    
    // Stacked bar chart data
    const barData = {
      labels: periods,
      datasets: serviceData.map((service, index) => ({
        label: service.service,
        data: periods.map(period => service[period] || 0),
        backgroundColor: chartColors[index % chartColors.length],
        borderColor: chartColors[index % chartColors.length],
        borderWidth: 1,
      })),
    };

    // Pie chart data
    const pieData = {
      labels: serviceData.map(service => service.service),
      datasets: [{
        data: serviceData.map(service => service.total),
        backgroundColor: serviceData.map((_, index) => chartColors[index % chartColors.length]),
        borderWidth: 1,
      }],
    };

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
              return `${context.dataset.label || context.label}: $${context.raw.toLocaleString()}`;
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
              return '$' + value.toLocaleString();
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
              return `${context.label}: $${context.raw.toLocaleString()} (${percentage}%)`;
            },
          },
        },
      },
    };

    return (
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={12}>
          <Card title="Cost per Service over Time">
            <div style={{ height: 400 }}>
              <Bar data={barData} options={chartOptions} />
            </div>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="Total Cost Distribution by Service">
            <div style={{ height: 400 }}>
              <Pie data={pieData} options={pieOptions} />
            </div>
          </Card>
        </Col>
      </Row>
    );
  };

  const loadFromConfig = () => {
    if (costConfig) {
      setSelectedProfiles(costConfig.profiles || []);
      setDateRange([
        dayjs(costConfig.start_date),
        dayjs(costConfig.end_date)
      ]);
      setGranularity(costConfig.period === 'daily' ? 'DAILY' : 'MONTHLY');
      setIncludeTaxes(!costConfig.exclude_taxes);
      setIncludeSupport(!costConfig.exclude_support);
      message.success('Loaded default settings from configuration');
    } else {
      message.warning('No configuration file found. Please configure settings first.');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>Cost Reports Dashboard</Title>
        {costConfig && (
          <Space>
            <Button 
              type="dashed" 
              onClick={loadFromConfig}
              size="small"
            >
              Load Defaults: {costConfig.report_name}
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
          <Col xs={24} sm={6}>
            <label>Date Range:</label>
            <RangePicker
              style={{ width: '100%', marginTop: 4 }}
              value={dateRange}
              onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            />
          </Col>
          <Col xs={24} sm={4}>
            <label>Granularity:</label>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={granularity}
              onChange={setGranularity}
              options={[
                { label: 'Monthly', value: 'MONTHLY' },
                { label: 'Daily', value: 'DAILY' },
              ]}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Space style={{ marginTop: 20 }}>
              <Button 
                type="primary" 
                icon={<ReloadOutlined />}
                loading={costLoading}
                onClick={() => refetch()}
                disabled={selectedProfiles.length === 0}
              >
                Generate Report
              </Button>
            </Space>
          </Col>
        </Row>
        <Row gutter={[16, 16]} align="middle" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <Col xs={24} sm={12}>
            <Space size="large">
              <Space direction="vertical" size="small">
                <label>Include Taxes:</label>
                <Switch
                  checked={includeTaxes}
                  onChange={setIncludeTaxes}
                  checkedChildren="Included"
                  unCheckedChildren="Excluded"
                />
              </Space>
              <Space direction="vertical" size="small">
                <label>Include Support:</label>
                <Switch
                  checked={includeSupport}
                  onChange={setIncludeSupport}
                  checkedChildren="Included"
                  unCheckedChildren="Excluded"
                />
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      {costError && (
        <AWSErrorAlert
          error={costError}
          service="cost"
          onRetry={() => refetch()}
          loading={costLoading}
        />
      )}

      {costLoading && (
        <Card>
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <Spin size="large" />
            <p style={{ marginTop: 16 }}>Loading cost data...</p>
          </div>
        </Card>
      )}

      {costData && (() => {
        // Process data to match Python script structure
        const periods = [...new Set(costData.data.map(d => d.period))].sort();
        const profiles = [...new Set(costData.data.map(d => d.profile))].sort();
        const services = [...new Set(costData.data.map(d => d.service))].sort();
        
        // Create service data for each profile
        const profileServiceData: Record<string, ServiceTableRow[]> = {};
        profiles.forEach(profile => {
          const profileData = costData.data.filter(d => d.profile === profile);
          const serviceMap: Record<string, ServiceTableRow> = {};
          
          services.forEach(service => {
            const serviceData = profileData.filter(d => d.service === service);
            const row: ServiceTableRow = { service, total: 0 };
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
          
          // Add total row for this profile
          const totalRow: ServiceTableRow = { service: 'Total', total: 0 };
          let grandTotal = 0;
          periods.forEach(period => {
            const periodTotal = rows.reduce((sum, row) => sum + (Number(row[period]) || 0), 0);
            totalRow[period] = periodTotal;
            grandTotal += periodTotal;
          });
          totalRow.total = grandTotal;
          rows.push(totalRow);
          
          profileServiceData[profile] = rows;
        });
        
        // Create account total data
        const accountTotalData: AccountTableRow[] = [];
        profiles.forEach(profile => {
          const profileData = costData.data.filter(d => d.profile === profile);
          const row: AccountTableRow = { account: profile, total: 0 };
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
        
        // Add total row for accounts
        const accountTotalRow: AccountTableRow = { account: 'Total', total: 0 };
        let accountGrandTotal = 0;
        periods.forEach(period => {
          const periodTotal = accountTotalData.reduce((sum, row) => sum + (Number(row[period]) || 0), 0);
          accountTotalRow[period] = periodTotal;
          accountGrandTotal += periodTotal;
        });
        accountTotalRow.total = accountGrandTotal;
        accountTotalData.push(accountTotalRow);
        
        // Create service total data
        const serviceTotalData: ServiceTableRow[] = [];
        services.forEach(service => {
          const serviceData = costData.data.filter(d => d.service === service);
          const row: ServiceTableRow = { service, total: 0 };
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
        
        // Add total row for services
        const serviceTotalRow: ServiceTableRow = { service: 'Total', total: 0 };
        let serviceGrandTotal = 0;
        periods.forEach(period => {
          const periodTotal = serviceTotalData.reduce((sum, row) => sum + (Number(row[period]) || 0), 0);
          serviceTotalRow[period] = periodTotal;
          serviceGrandTotal += periodTotal;
        });
        serviceTotalRow.total = serviceGrandTotal;
        serviceTotalData.push(serviceTotalRow);
        
        // Create tab items
        const tabItems = [
          // Account totals tab (first)
          {
            key: 'account-totals',
            label: 'Account Totals',
            children: (
              <div>
                {generateAccountCharts(accountTotalData, periods)}
                <Card title="Cost total per account">
                  <Table
                    dataSource={accountTotalData.filter(row => row.account !== 'Total')}
                    columns={generateAccountColumns(periods)}
                    pagination={false}
                    rowKey="account"
                    scroll={{ x: 'max-content' }}
                    sortDirections={['descend', 'ascend']}
                    summary={() => {
                      const totalRow = accountTotalData.find(row => row.account === 'Total');
                      if (!totalRow) return null;
                      return (
                        <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                          <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                          {periods.map((period, index) => (
                            <Table.Summary.Cell key={period} index={index + 1} align="right">
                              ${(Number(totalRow[period]) || 0).toFixed(2)}
                            </Table.Summary.Cell>
                          ))}
                          <Table.Summary.Cell index={periods.length + 1} align="right">
                            ${totalRow.total.toFixed(2)}
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              </div>
            ),
          },
          // Service totals tab (second)
          {
            key: 'service-totals',
            label: 'Service Totals',
            children: (
              <div>
                {generateServiceCharts(serviceTotalData, periods)}
                <Card title="Cost total per service">
                  <Table
                    dataSource={serviceTotalData.filter(row => row.service !== 'Total')}
                    columns={generateServiceColumns(periods)}
                    pagination={false}
                    rowKey="service"
                    scroll={{ x: 'max-content' }}
                    sortDirections={['descend', 'ascend']}
                    summary={() => {
                      const totalRow = serviceTotalData.find(row => row.service === 'Total');
                      if (!totalRow) return null;
                      return (
                        <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                          <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                          {periods.map((period, index) => (
                            <Table.Summary.Cell key={period} index={index + 1} align="right">
                              ${(Number(totalRow[period]) || 0).toFixed(2)}
                            </Table.Summary.Cell>
                          ))}
                          <Table.Summary.Cell index={periods.length + 1} align="right">
                            ${totalRow.total.toFixed(2)}
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              </div>
            ),
          },
          // Individual account tabs (after totals)
          ...profiles.map(profile => ({
            key: `account-${profile}`,
            label: `${profile}`,
            children: (
              <div>
                {generateProfileCharts(profile, profileServiceData[profile], periods)}
                <Card title={`Cost per service for account - ${profile}`}>
                  <Table
                    dataSource={profileServiceData[profile].filter(row => row.service !== 'Total')}
                    columns={generateServiceColumns(periods)}
                    pagination={false}
                    rowKey="service"
                    scroll={{ x: 'max-content' }}
                    sortDirections={['descend', 'ascend']}
                    summary={() => {
                      const totalRow = profileServiceData[profile].find(row => row.service === 'Total');
                      if (!totalRow) return null;
                      return (
                        <Table.Summary.Row style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
                          <Table.Summary.Cell index={0}>Total</Table.Summary.Cell>
                          {periods.map((period, index) => (
                            <Table.Summary.Cell key={period} index={index + 1} align="right">
                              ${(Number(totalRow[period]) || 0).toFixed(2)}
                            </Table.Summary.Cell>
                          ))}
                          <Table.Summary.Cell index={periods.length + 1} align="right">
                            ${totalRow.total.toFixed(2)}
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      );
                    }}
                  />
                </Card>
              </div>
            ),
          })),
        ];
        
        return (
          <Tabs
            defaultActiveKey="account-totals"
            items={tabItems}
            style={{ marginTop: 16 }}
          />
        );
      })()}

      {selectedProfiles.length === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '50px 0' }}>
            <p>Please select AWS profiles to generate cost reports</p>
          </div>
        </Card>
      )}
    </div>
  );
}