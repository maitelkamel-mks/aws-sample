'use client';

import { List, Typography, Tag, Spin, Alert, Button, Space, Tabs, Card, Progress } from 'antd';
import { 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  LoadingOutlined, 
  ApiOutlined,
  LoginOutlined,
  LogoutOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
  CloudOutlined
} from '@ant-design/icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import SSOAuthForm from '../auth/SSOAuthForm';

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

  const { data: profilesData, isLoading, error, refetch } = useQuery({
    queryKey: ['aws-profiles-unified'],
    queryFn: async () => {
      const response = await fetch('/api/aws/profiles/unified');
      if (!response.ok) throw new Error('Failed to fetch profiles');
      const result = await response.json();
      return result.data;
    },
  });

  const { data: ssoProfiles, refetch: refetchSSOProfiles } = useQuery({
    queryKey: ['sso-profiles'],
    queryFn: async () => {
      const response = await fetch('/api/aws/sso/profiles');
      if (!response.ok) throw new Error('Failed to fetch SSO profiles');
      const result = await response.json();
      return result.data || [];
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
    if (profilesData?.cliProfiles) {
      const cliProfileNames = profilesData.cliProfiles.map((p: any) => p.name);
      testConnectivityMutation.mutate(cliProfileNames);
    }
  };

  const handleSSORefresh = async () => {
    await refetchSSOProfiles();
    await refetch();
  };

  const getConnectivityStatus = (profile: string) => {
    return connectivityResults.find(result => result.profile === profile);
  };

  const getTimeUntilExpiration = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const diffMs = expiration.getTime() - now.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes <= 0) return 'Expired';
    if (diffMinutes < 60) return `${diffMinutes}m`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours}h ${remainingMinutes}m`;
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

  const cliProfiles = profilesData?.cliProfiles || [];
  const ssoProfilesData = profilesData?.ssoProfiles || [];
  const totalProfiles = cliProfiles.length + ssoProfilesData.length;

  if (totalProfiles === 0) {
    return (
      <Alert
        message="No AWS Profiles Found"
        description="No AWS profiles were found. Please configure your AWS credentials using the AWS CLI or set up SSO authentication."
        type="warning"
        showIcon
        action={
          <Text type="secondary">
            Run <code>aws configure</code> to set up CLI profiles or configure SSO in the SSO Configuration tab.
          </Text>
        }
      />
    );
  }

  const tabItems = [
    {
      key: 'cli',
      label: (
        <Space>
          <CloudOutlined />
          CLI Profiles ({cliProfiles.length})
        </Space>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              AWS profiles from your local AWS configuration files
            </Text>
            <Button
              type="primary"
              icon={<ApiOutlined />}
              loading={testConnectivityMutation.isPending}
              onClick={handleTestConnectivity}
              disabled={cliProfiles.length === 0}
            >
              Test All Connectivity
            </Button>
          </div>

          {cliProfiles.length === 0 ? (
            <Alert
              message="No CLI Profiles Found"
              description="No AWS CLI profiles were found. Configure using 'aws configure' command."
              type="info"
              showIcon
            />
          ) : (
            <List
              dataSource={cliProfiles}
              renderItem={(profile: any) => {
                const connectivityStatus = getConnectivityStatus(profile.name);

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
                          <CloudOutlined style={{ color: '#d9d9d9' }} />
                        )
                      }
                      title={
                        <Space>
                          {profile.name}
                          <Tag color="blue">CLI</Tag>
                          {connectivityStatus?.connected && connectivityStatus.account && (
                            <Tag color="green">Account: {connectivityStatus.account}</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <div>
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
                            <Text type="secondary">Click "Test All Connectivity" to verify access</Text>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          )}

          <Alert
            message="CLI Profile Configuration"
            description={
              <div>
                <p>CLI profiles are loaded from your AWS configuration files:</p>
                <ul>
                  <li><code>~/.aws/credentials</code> - AWS access keys</li>
                  <li><code>~/.aws/config</code> - Profile configurations</li>
                </ul>
                <p>To add more profiles, use <code>aws configure --profile profile-name</code></p>
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </div>
      )
    },
    {
      key: 'sso',
      label: (
        <Space>
          <LoginOutlined />
          SSO Profiles ({ssoProfilesData.length})
          {ssoProfilesData.filter((p: any) => p.isAuthenticated).length > 0 && (
            <Tag color="green">
              {ssoProfilesData.filter((p: any) => p.isAuthenticated).length} authenticated
            </Tag>
          )}
        </Space>
      ),
      children: (
        <div>
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              SSO profiles configured for enterprise authentication
            </Text>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleSSORefresh}
            >
              Refresh Status
            </Button>
          </div>

          {ssoProfilesData.length === 0 ? (
            <Alert
              message="No SSO Profiles Configured"
              description="Configure SSO profiles in the SSO Configuration tab to enable enterprise authentication."
              type="info"
              showIcon
            />
          ) : (
            <>
              <List
                dataSource={ssoProfilesData}
                renderItem={(profile: any) => {
                  const isExpired = profile.isExpired || !profile.isAuthenticated;
                  const timeLeft = profile.expiresAt ? getTimeUntilExpiration(profile.expiresAt) : '';

                  return (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          isExpired ? (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                          ) : profile.isAuthenticated ? (
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          ) : (
                            <LoginOutlined style={{ color: '#d9d9d9' }} />
                          )
                        }
                        title={
                          <Space>
                            {profile.name}
                            <Tag color="orange">SSO</Tag>
                            {profile.isAuthenticated && !isExpired && (
                              <Tag color="green">Authenticated</Tag>
                            )}
                            {isExpired && (
                              <Tag color="red">Expired</Tag>
                            )}
                          </Space>
                        }
                        description={
                          <div>
                            <Space direction="vertical" size="small" style={{ width: '100%' }}>
                              <div>
                                <Text strong>Account:</Text> {profile.accountId}
                                <br />
                                <Text strong>Role:</Text> {profile.roleArn.split('/').pop()}
                                <br />
                                {profile.description && (
                                  <>
                                    <Text strong>Description:</Text> {profile.description}
                                    <br />
                                  </>
                                )}
                                <Text strong>Status:</Text>
                                <Text type={isExpired ? 'danger' : profile.isAuthenticated ? 'success' : 'secondary'}>
                                  {isExpired ? ' Expired' : profile.isAuthenticated ? ' Authenticated' : ' Not authenticated'}
                                </Text>
                              </div>
                              
                              {profile.isAuthenticated && !isExpired && profile.expiresAt && (
                                <div>
                                  <Text type="secondary">Expires in: {timeLeft}</Text>
                                </div>
                              )}
                            </Space>
                          </div>
                        }
                      />
                    </List.Item>
                  );
                }}
              />

              <Card style={{ marginTop: 16 }}>
                <SSOAuthForm 
                  profiles={ssoProfiles || []}
                  onAuthenticate={handleSSORefresh}
                  onLogout={handleSSORefresh}
                  onRefresh={handleSSORefresh}
                />
              </Card>
            </>
          )}

          <Alert
            message="SSO Profile Information"
            description={
              <div>
                <p>SSO profiles enable enterprise authentication through your organization's Single Sign-On system.</p>
                <ul>
                  <li>Configure SSO settings in the <strong>SSO Configuration</strong> tab</li>
                  <li>Authenticate using your corporate credentials</li>
                  <li>Sessions are automatically managed and refreshed</li>
                  <li>Credentials are securely stored and encrypted</li>
                </ul>
              </div>
            }
            type="info"
            showIcon
            style={{ marginTop: 16 }}
          />
        </div>
      )
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          Total profiles: {totalProfiles} ({cliProfiles.length} CLI, {ssoProfilesData.length} SSO)
          {profilesData?.ssoConfigured && (
            <Tag color="green" style={{ marginLeft: 8 }}>SSO Configured</Tag>
          )}
        </Text>
      </div>

      <Tabs 
        defaultActiveKey="cli" 
        items={tabItems}
        onChange={() => {
          // Reset connectivity results when switching tabs
          setConnectivityResults([]);
        }}
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