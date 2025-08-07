'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, DatePicker, Select, Button, Table, Typography, Space, Spin, App, Tabs, Switch, Dropdown, MenuProps } from 'antd';
import { ReloadOutlined, DownloadOutlined, FileExcelOutlined, FilePdfOutlined, GlobalOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useAWSProfileNames } from '@/hooks/useAWSProfiles';
import AWSProfileSelector from '@/components/common/AWSProfileSelector';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { CostData, CostSummary, CostConfig } from '@/lib/types/cost';
import AWSErrorAlert from '@/components/common/AWSErrorAlert';
import { electronAPI } from '@/lib/electron/api';
import { AWS_SERVICE_OPTIONS } from '@/lib/constants/aws-services';
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
  const [granularity, setGranularity] = useState<'HOURLY' | 'DAILY' | 'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [useConfigDefaults, setUseConfigDefaults] = useState(true);
  const [includeTaxes, setIncludeTaxes] = useState(true);
  const [includeSupport, setIncludeSupport] = useState(true);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Captured parameters at button click time - these are used for the actual query
  const [capturedProfiles, setCapturedProfiles] = useState<string[]>([]);
  const [capturedDateRange, setCapturedDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(1, 'month'), dayjs()]);
  const [capturedGranularity, setCapturedGranularity] = useState<'HOURLY' | 'DAILY' | 'MONTHLY' | 'ANNUAL'>('MONTHLY');

  // Chart colors
  const chartColors = [
    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
    '#FF9F40', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
    '#85C1E9', '#F8C471', '#82E0AA', '#F1948A', '#85929E',
    '#5DADE2', '#58D68D', '#F4D03F', '#AF7AC5', '#5499C7',
    '#52BE80', '#F39C12', '#E74C3C', '#8E44AD', '#3498DB'
  ];

  // Use the new unified profiles hook
  const { profiles: profilesData, isLoading: profilesLoading } = useAWSProfileNames();

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
      setSelectedServices(costConfig.services || []);
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

  // Fetch raw cost data without any filtering
  const { data: rawCostData, isLoading: costLoading, error: costError } = useQuery({
    queryKey: ['cost-data-raw', refreshTrigger],
    queryFn: async () => {
      if (capturedProfiles.length === 0) return null;

      // For annual granularity, fetch monthly data and aggregate
      const apiGranularity = capturedGranularity === 'ANNUAL' ? 'MONTHLY' : capturedGranularity;

      // Format dates based on granularity - hourly requires specific format
      const startDate = capturedGranularity === 'HOURLY'
        ? capturedDateRange[0].startOf('day').format('YYYY-MM-DD[T]00:00:00[Z]')
        : capturedDateRange[0].format('YYYY-MM-DD');
      const endDate = capturedGranularity === 'HOURLY'
        ? capturedDateRange[1].endOf('day').format('YYYY-MM-DD[T]23:59:59[Z]')
        : capturedDateRange[1].format('YYYY-MM-DD');

      const params = new URLSearchParams({
        profiles: capturedProfiles.join(','),
        startDate,
        endDate,
        granularity: apiGranularity,
        excludeTaxes: 'false', // Always load all data
        excludeSupport: 'false', // Always load all data
      });
      // Never pass services parameter - always load all services

      const response = await fetch(`/api/cost/data?${params}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch cost data');
      }
      const result = await response.json();
      const data = result.data as CostResponse;

      // If annual granularity, aggregate monthly data into years
      if (capturedGranularity === 'ANNUAL' && data) {
        const aggregatedData: CostData[] = [];
        const yearMap: Record<string, Record<string, Record<string, number>>> = {};

        // Group by year, profile, and service
        data.data.forEach(item => {
          const year = dayjs(item.period).year().toString();
          if (!yearMap[year]) yearMap[year] = {};
          if (!yearMap[year][item.profile]) yearMap[year][item.profile] = {};
          if (!yearMap[year][item.profile][item.service]) yearMap[year][item.profile][item.service] = 0;
          yearMap[year][item.profile][item.service] += item.amount;
        });

        // Convert to array format
        Object.entries(yearMap).forEach(([year, profiles]) => {
          Object.entries(profiles).forEach(([profile, services]) => {
            Object.entries(services).forEach(([service, amount]) => {
              aggregatedData.push({
                period: year,
                profile,
                service,
                amount,
                currency: 'USD' // Assuming USD, can be extracted from original data if needed
              });
            });
          });
        });

        return {
          data: aggregatedData,
          summaries: data.summaries
        };
      }

      return data;
    },
    enabled: refreshTrigger > 0,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  // Apply filters dynamically to the raw data
  const costData = useMemo(() => {
    if (!rawCostData) return null;

    let filteredData = rawCostData.data;

    // Apply service filtering - only show selected services
    if (selectedServices.length > 0) {
      filteredData = filteredData.filter(item =>
        selectedServices.includes(item.service)
      );
    }

    // Apply tax and support filtering
    if (!includeTaxes || !includeSupport) {
      filteredData = filteredData.filter(item => {
        // Filter out taxes if requested
        if (!includeTaxes && item.service === 'Tax') {
          return false;
        }

        // Filter out support services if requested
        if (!includeSupport && (
          item.service.startsWith('AWS Support') ||
          item.service === 'Support'
        )) {
          return false;
        }

        return true;
      });
    }

    return {
      data: filteredData,
      summaries: rawCostData.summaries
    };
  }, [rawCostData, selectedServices, includeTaxes, includeSupport]);

  // Generate all periods within the date range based on granularity
  const generateAllPeriods = (startDate: dayjs.Dayjs, endDate: dayjs.Dayjs, granularity: string): string[] => {
    const periods: string[] = [];
    let current = startDate.clone();

    while (current.isBefore(endDate) || current.isSame(endDate)) {
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
  };

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

            label: function (context: any) {
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

            callback: function (value: any) {
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

            label: function (context: any) {
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

            label: function (context: any) {
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

            callback: function (value: any) {
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

            label: function (context: any) {
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

            label: function (context: any) {
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

            callback: function (value: any) {
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

            label: function (context: any) {
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

  const handleExport = async (format: 'pdf' | 'xlsx' | 'html') => {
    if (!costData || selectedProfiles.length === 0) {
      message.error('Please generate a report first');
      return;
    }

    setExportLoading(format);

    try {
      // For annual granularity, use the same date formatting as the main query
      const apiGranularity = capturedGranularity === 'ANNUAL' ? 'MONTHLY' : capturedGranularity;
      const startDate = capturedGranularity === 'HOURLY'
        ? capturedDateRange[0].startOf('day').format('YYYY-MM-DD[T]00:00:00[Z]')
        : capturedDateRange[0].format('YYYY-MM-DD');
      const endDate = capturedGranularity === 'HOURLY'
        ? capturedDateRange[1].endOf('day').format('YYYY-MM-DD[T]23:59:59[Z]')
        : capturedDateRange[1].format('YYYY-MM-DD');

      const params = new URLSearchParams({
        profiles: capturedProfiles.join(','),
        startDate,
        endDate,
        granularity: apiGranularity,
        excludeTaxes: (!includeTaxes).toString(),
        excludeSupport: (!includeSupport).toString(),
        format,
      });

      // Add services parameter if services are selected
      if (selectedServices.length > 0) {
        params.set('services', selectedServices.join(','));
      }

      const response = await fetch(`/api/cost/export?${params}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
      }

      // Get filename from response headers
      const contentDisposition = response.headers.get('content-disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `cost-report-${startDate}-${endDate}.${format}`;

      // Download the file
      const blob = await response.blob();
      const content = await blob.text();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      const success = await electronAPI.saveFile(content, filename, contentType);
      if (success) {
        message.success(`Report exported as ${format.toUpperCase()}`);
      } else {
        message.info('Export cancelled');
      }
    } catch (error) {
      console.error('Export error:', error);
      message.error(`Failed to export report: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setExportLoading(null);
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    {
      key: 'xlsx',
      icon: exportLoading === 'xlsx' ? <Spin size="small" /> : <FileExcelOutlined />,
      label: exportLoading === 'xlsx' ? 'Generating Excel...' : 'Export as Excel',
      onClick: () => handleExport('xlsx'),
      disabled: exportLoading !== null,
    },
    {
      key: 'pdf',
      icon: exportLoading === 'pdf' ? <Spin size="small" /> : <FilePdfOutlined />,
      label: exportLoading === 'pdf' ? 'Generating PDF...' : 'Export as PDF',
      onClick: () => handleExport('pdf'),
      disabled: exportLoading !== null,
    },
    {
      key: 'html',
      icon: exportLoading === 'html' ? <Spin size="small" /> : <GlobalOutlined />,
      label: exportLoading === 'html' ? 'Generating HTML...' : 'Export as HTML',
      onClick: () => handleExport('html'),
      disabled: exportLoading !== null,
    },
  ];

  return (
    <div>

      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={8}>
            <label>AWS Profiles:</label>
            <div style={{ marginTop: 4 }}>
              <AWSProfileSelector
                mode="multiple"
                value={selectedProfiles}
                onChange={(value) => setSelectedProfiles(value as string[])}
                placeholder="Select profiles"
                showTypeBadges
                showRefresh
              />
            </div>
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
                { label: 'Hourly', value: 'HOURLY' },
                { label: 'Daily', value: 'DAILY' },
                { label: 'Monthly', value: 'MONTHLY' },
                { label: 'Annual', value: 'ANNUAL' },
              ]}
            />
          </Col>
          <Col xs={24} sm={6}>
            <Space style={{ marginTop: 20 }}>
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={costLoading}
                onClick={() => {
                  // Capture current parameters at click time
                  setCapturedProfiles(selectedProfiles);
                  setCapturedDateRange(dateRange);
                  setCapturedGranularity(granularity);
                  // Trigger the query
                  setRefreshTrigger(Date.now());
                }}
                disabled={selectedProfiles.length === 0}
              >
                Generate Report
              </Button>
              {costData && (
                <Dropdown
                  menu={{ items: exportMenuItems }}
                  placement="bottomRight"
                  disabled={exportLoading !== null}
                >
                  <Button
                    icon={exportLoading ? <Spin size="small" /> : <DownloadOutlined />}
                    loading={exportLoading !== null}
                    disabled={exportLoading !== null}
                  >
                    {exportLoading ? `Exporting ${exportLoading.toUpperCase()}...` : 'Export'}
                  </Button>
                </Dropdown>
              )}
            </Space>
          </Col>
        </Row>
        <Row gutter={[16, 16]} align="middle" style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
          <Col xs={24} sm={4}>
            <Space size="large" style={{ marginTop: 20 }}>
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
          <Col xs={24} sm={8} style={{ paddingTop: 20 }}>

            <label>AWS Services:</label>
            <Select
              mode="multiple"
              style={{ width: '100%', marginTop: 4 }}
              placeholder="All services (leave empty for all)"
              value={selectedServices}
              onChange={setSelectedServices}
              options={AWS_SERVICE_OPTIONS}
              allowClear
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Col>
        </Row>
      </Card>

      {costError && (
        <AWSErrorAlert
          error={costError}
          service="cost"
          onRetry={() => {
            // Use the same captured parameters for retry
            setRefreshTrigger(Date.now());
          }}
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
        // Generate all periods within the date range, not just periods with data
        const allPeriods = generateAllPeriods(capturedDateRange[0], capturedDateRange[1], capturedGranularity);
        const periods = allPeriods;
        // Use captured profiles (from query) to ensure all profiles show even if they have 0 data after filtering
        const profiles = capturedProfiles.sort();
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