'use client';

import { Form, Input, Select, Switch, Button, DatePicker, Spin, App, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CostConfig } from '@/lib/types/cost';
import dayjs from 'dayjs';

export default function CostConfigForm() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data: config, isLoading } = useQuery({
    queryKey: ['cost-config'],
    queryFn: async () => {
      const response = await fetch('/api/config/cost');
      if (!response.ok) {
        if (response.status === 404) {
          return null; // Config doesn't exist yet
        }
        throw new Error('Failed to load cost configuration');
      }
      const result = await response.json();
      return result.data as CostConfig;
    },
  });

  const { data: profiles } = useQuery({
    queryKey: ['aws-profiles'],
    queryFn: async () => {
      const response = await fetch('/api/aws/profiles');
      if (!response.ok) throw new Error('Failed to fetch profiles');
      const result = await response.json();
      return result.data as string[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CostConfig) => {
      const response = await fetch('/api/config/cost', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      return response.json();
    },
    onSuccess: () => {
      message.success('Cost configuration saved successfully');
      queryClient.invalidateQueries({ queryKey: ['cost-config'] });
    },
    onError: (error) => {
      message.error(`Failed to save configuration: ${error.message}`);
    },
  });

  const onFinish = (values: Record<string, unknown>) => {
    const costConfig: CostConfig = {
      ...values,
      start_date: (values.start_date as dayjs.Dayjs).format('YYYY-MM-DD'),
      end_date: (values.end_date as dayjs.Dayjs).format('YYYY-MM-DD'),
      exclude_taxes: !values.include_taxes,
      exclude_support: !values.include_support,
    } as CostConfig;
    
    // Remove the include_* fields as they're not part of the config schema
    delete (costConfig as unknown as Record<string, unknown>).include_taxes;
    delete (costConfig as unknown as Record<string, unknown>).include_support;
    
    saveMutation.mutate(costConfig);
  };

  const initialValues = config ? {
    ...config,
    start_date: dayjs(config.start_date),
    end_date: dayjs(config.end_date),
    include_taxes: !config.exclude_taxes,
    include_support: !config.exclude_support,
  } : {
    report_name: 'AWS Cost Report',
    profiles: [],
    services: [],
    start_date: dayjs().subtract(1, 'month'),
    end_date: dayjs(),
    period: 'monthly',
    include_taxes: true,
    include_support: true,
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading cost configuration...</p>
      </div>
    );
  }

  return (
    <div>
      <Typography.Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        Configure default settings for cost report generation. These settings will be used as defaults when generating new cost reports.
      </Typography.Text>
      
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initialValues}
      >
      <Form.Item
        label="Report Name"
        name="report_name"
        rules={[{ required: true, message: 'Please enter a report name' }]}
      >
        <Input placeholder="Enter report name" />
      </Form.Item>


      <Form.Item
        label="AWS Profiles"
        name="profiles"
        rules={[{ required: true, message: 'Please select at least one profile' }]}
      >
        <Select
          mode="multiple"
          placeholder="Select AWS profiles"
          options={profiles?.map(profile => ({ label: profile, value: profile }))}
        />
      </Form.Item>

      <Form.Item
        label="AWS Services (leave empty for all services)"
        name="services"
      >
        <Select
          mode="tags"
          placeholder="Enter service names or leave empty for all"
        />
      </Form.Item>

      <Form.Item
        label="Start Date"
        name="start_date"
        rules={[{ required: true, message: 'Please select a start date' }]}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item
        label="End Date"
        name="end_date"
        rules={[{ required: true, message: 'Please select an end date' }]}
      >
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>

      <Form.Item
        label="Period"
        name="period"
        rules={[{ required: true, message: 'Please select a period' }]}
      >
        <Select
          options={[
            { label: 'Daily', value: 'daily' },
            { label: 'Monthly', value: 'monthly' },
          ]}
        />
      </Form.Item>

      <Form.Item
        label="Include Taxes"
        name="include_taxes"
        valuePropName="checked"
      >
        <Switch
          checkedChildren="Included"
          unCheckedChildren="Excluded"
        />
      </Form.Item>

      <Form.Item
        label="Include Support"
        name="include_support"
        valuePropName="checked"
      >
        <Switch
          checkedChildren="Included"
          unCheckedChildren="Excluded"
        />
      </Form.Item>

      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          icon={<SaveOutlined />}
          loading={saveMutation.isPending}
        >
          Save Configuration
        </Button>
      </Form.Item>
    </Form>
    </div>
  );
}