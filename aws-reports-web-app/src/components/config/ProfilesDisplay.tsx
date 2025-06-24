'use client';

import { List, Typography, Tag, Spin, Alert, Button, Space } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, ApiOutlined } from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';

const { Text } = Typography;

interface ConnectivityResult {
  profile: string;
  connected: boolean;
  account?: string;
  arn?: string;
  userId?: string;
  error?: string;
}

export default function ProfilesDisplay() {
  const [connectivityResults, setConnectivityResults] = useState<ConnectivityResult[]>([]);

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ['aws-profiles'],
    queryFn: async () => {
      const response = await fetch('/api/aws/profiles');
      if (!response.ok) throw new Error('Failed to fetch profiles');
      const result = await response.json();
      return result.data as string[];
    },
  });

  const testConnectivityMutation = useMutation({
    mutationFn: async (profiles: string[]) => {
      const response = await fetch('/api/aws/test-connectivity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profiles }),
      });

      if (!response.ok) {
        throw new Error('Failed to test connectivity');
      }

      const result = await response.json();
      return result.data as ConnectivityResult[];
    },
    onSuccess: (results) => {
      setConnectivityResults(results);
    },
  });

  const handleTestConnectivity = () => {
    if (profiles) {
      testConnectivityMutation.mutate(profiles);
    }
  };

  const getConnectivityStatus = (profile: string) => {
    return connectivityResults.find(result => result.profile === profile);
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0' }}>
        <Spin size="large" />
        <p style={{ marginTop: 16 }}>Loading AWS profiles...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Error Loading Profiles"
        description="Failed to load AWS profiles. Please ensure your AWS credentials are configured properly."
        type="error"
        showIcon
      />
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <Alert
        message="No AWS Profiles Found"
        description="No AWS profiles were found. Please configure your AWS credentials using the AWS CLI or by creating ~/.aws/credentials and ~/.aws/config files."
        type="warning"
        showIcon
        action={
          <Text type="secondary">
            Run <code>aws configure</code> to set up your first profile.
          </Text>
        }
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">
          Available AWS profiles from your local AWS configuration:
        </Text>
        <Button
          type="primary"
          icon={<ApiOutlined />}
          loading={testConnectivityMutation.isPending}
          onClick={handleTestConnectivity}
          disabled={!profiles || profiles.length === 0}
        >
          Test All Connectivity
        </Button>
      </div>

      <List
        dataSource={profiles}
        renderItem={(profile) => {
          const connectivityStatus = getConnectivityStatus(profile);

          return (
            <List.Item>
              <List.Item.Meta
                avatar={
                  testConnectivityMutation.isPending ? (
                    <LoadingOutlined style={{ color: '#1890ff' }} />
                  ) : connectivityStatus ? (
                    connectivityStatus.connected ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )
                  ) : (
                    <CheckCircleOutlined style={{ color: '#d9d9d9' }} />
                  )
                }
                title={
                  <Space>
                    {profile}
                    {connectivityStatus?.connected && connectivityStatus.account && (
                      <Tag color="green">Account: {connectivityStatus.account}</Tag>
                    )}
                  </Space>
                }
                description={
                  <div>
                    <Tag color="blue">Profile</Tag>
                    {connectivityStatus ? (
                      connectivityStatus.connected ? (
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Text type="success">✓ Connected successfully</Text>
                          {connectivityStatus.arn && (
                            <Text type="secondary" style={{ fontSize: '12px' }}>
                              ARN: {connectivityStatus.arn}
                            </Text>
                          )}
                        </Space>
                      ) : (
                        <Space direction="vertical" size="small" style={{ width: '100%' }}>
                          <Text type="danger">✗ Connection failed</Text>
                          {connectivityStatus.error && (
                            <Text type="secondary" style={{ fontSize: '12px', color: '#ff4d4f' }}>
                              Error: {connectivityStatus.error}
                            </Text>
                          )}
                        </Space>
                      )
                    ) : (
                      null
                    )}
                  </div>
                }
              />
            </List.Item>
          );
        }}
      />

      <Alert
        message="Profile Configuration"
        description={
          <div>
            <p>Profiles are loaded from your AWS configuration files:</p>
            <ul>
              <li><code>~/.aws/credentials</code> - AWS access keys</li>
              <li><code>~/.aws/config</code> - Profile configurations</li>
            </ul>
            <p>To add more profiles, use <code>aws configure --profile profile-name</code></p>
            <p><strong>Connectivity Testing:</strong> Click &quot;Test All Connectivity&quot; to verify AWS access for each profile. This will check if credentials are valid and show account information.</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginTop: 16 }}
      />

      {testConnectivityMutation.isError && (
        <Alert
          message="Connectivity Test Failed"
          description={testConnectivityMutation.error?.message || 'Failed to test AWS connectivity'}
          type="error"
          showIcon
          style={{ marginTop: 16 }}
        />
      )}
    </div>
  );
}