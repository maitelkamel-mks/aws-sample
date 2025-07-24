'use client';

import { Form, Select, Button, Spin, App, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SecurityConfig } from '@/lib/types/security';
import { electronAPI } from '@/lib/electron/api';
import AWSProfileSelector from '@/components/common/AWSProfileSelector';

export default function SecurityConfigForm() {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const { data: config, isLoading } = useQuery({
    queryKey: ['security-config'],
    queryFn: async () => {
      try {
        const data = await electronAPI.readConfig('security');
        return data ? (data as unknown as SecurityConfig) : null;
      } catch (error) {
        // If running in browser mode, it will automatically fallback
        throw error;
      }
    },
  });


  const saveMutation = useMutation({
    mutationFn: async (values: SecurityConfig) => {
      await electronAPI.writeConfig('security', values as unknown as Record<string, unknown>);
      return { success: true };
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
        <AWSProfileSelector
          mode="multiple"
          placeholder="Select AWS profiles"
          onChange={(value) => form.setFieldValue('profiles', value)}
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