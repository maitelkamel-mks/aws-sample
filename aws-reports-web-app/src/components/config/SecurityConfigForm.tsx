'use client';

import { Form, Select, Button, Spin, App, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SecurityConfig } from '@/lib/types/security';

export default function SecurityConfigForm() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data: config, isLoading } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      const response = await fetch('/api/config/security');
      if (!response.ok) {
        if (response.status === 404) {
          return null; // Config doesn't exist yet
        }
        throw new Error('Failed to load security configuration');
      }
      const result = await response.json();
      return result.data as SecurityConfig;
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
    mutationFn: async (values: SecurityConfig) => {
      const response = await fetch('/api/config/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error('Failed to save configuration');
      return response.json();
    },
    onSuccess: () => {
      message.success('Security configuration saved successfully');
      queryClient.invalidateQueries({ queryKey: ['security-config'] });
    },
    onError: (error) => {
      message.error(`Failed to save configuration: ${error.message}`);
    },
  });

  const onFinish = (values: SecurityConfig) => {
    saveMutation.mutate(values);
  };

  const awsRegions = [
    'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
    'eu-west-1', 'eu-west-2', 'eu-central-1', 'eu-north-1',
    'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1', 'ap-northeast-2',
    'ca-central-1', 'sa-east-1',
  ];

  const initialValues = config || {
    profiles: [],
    home_region: 'us-east-1',
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading security configuration...</p>
      </div>
    );
  }

  return (
    <div>
      <Typography.Text type="secondary" style={{ marginBottom: 16, display: 'block' }}>
        Configure default settings for security report generation. These settings will be used as defaults when generating new security reports.
      </Typography.Text>
      
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        initialValues={initialValues}
      >
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
        label="Home Region"
        name="home_region"
        rules={[{ required: true, message: 'Please select a home region' }]}
        help="The primary region where Security Hub is configured"
      >
        <Select
          placeholder="Select home region"
          options={awsRegions.map(region => ({ label: region, value: region }))}
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