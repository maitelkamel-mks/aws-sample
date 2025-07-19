'use client';

import { 
  Form, 
  Input, 
  Button, 
  Select, 
  Card, 
  Typography, 
  Alert, 
  Space, 
  message,
  Progress,
  Divider
} from 'antd';
import { 
  LoginOutlined, 
  LogoutOutlined, 
  UserOutlined, 
  LockOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useState, useEffect } from 'react';
import { SSOProfile } from '@/lib/types/sso';

const { Title, Text } = Typography;
const { Option } = Select;

interface SSOAuthFormProps {
  profiles?: SSOProfile[];
  onAuthenticate?: (profileName: string, username: string, password: string) => Promise<void>;
  onLogout?: (profileName: string) => Promise<void>;
  onRefresh?: (profileName: string) => Promise<void>;
  loading?: boolean;
}

interface ProfileStatus {
  profileName: string;
  isAuthenticated: boolean;
  expiresAt: string | null;
  accountId: string;
  roleArn: string;
  isExpired: boolean;
}

export default function SSOAuthForm({ 
  profiles = [], 
  onAuthenticate, 
  onLogout, 
  onRefresh,
  loading = false 
}: SSOAuthFormProps) {
  const [form] = Form.useForm();
  const [authLoading, setAuthLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState<string | null>(null);
  const [refreshLoading, setRefreshLoading] = useState<string | null>(null);
  const [profileStatuses, setProfileStatuses] = useState<ProfileStatus[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');

  useEffect(() => {
    loadProfileStatuses();
  }, []);

  const loadProfileStatuses = async () => {
    try {
      const response = await fetch('/api/aws/sso/profiles');
      const result = await response.json();
      
      if (result.success) {
        setProfileStatuses(result.data || []);
      }
    } catch (error) {
      console.error('Failed to load profile statuses:', error);
    }
  };

  const handleAuthenticate = async (values: { profileName: string; username: string; password: string }) => {
    try {
      setAuthLoading(true);
      
      const response = await fetch('/api/aws/sso/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();
      
      if (result.success) {
        message.success(`Successfully authenticated with profile: ${values.profileName}`);
        form.resetFields(['username', 'password']);
        await loadProfileStatuses();
        
        if (onAuthenticate) {
          await onAuthenticate(values.profileName, values.username, values.password);
        }
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      message.error(`Authentication failed: ${error}`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async (profileName: string) => {
    try {
      setLogoutLoading(profileName);
      
      const response = await fetch('/api/aws/sso/logout', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileName }),
      });

      const result = await response.json();
      
      if (result.success) {
        message.success(`Successfully logged out from profile: ${profileName}`);
        await loadProfileStatuses();
        
        if (onLogout) {
          await onLogout(profileName);
        }
      } else {
        throw new Error(result.error || 'Logout failed');
      }
    } catch (error) {
      message.error(`Logout failed: ${error}`);
    } finally {
      setLogoutLoading(null);
    }
  };

  const handleRefresh = async (profileName: string) => {
    try {
      setRefreshLoading(profileName);
      
      const response = await fetch('/api/aws/sso/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profileName }),
      });

      const result = await response.json();
      
      if (result.success) {
        message.success(`Successfully refreshed credentials for profile: ${profileName}`);
        await loadProfileStatuses();
        
        if (onRefresh) {
          await onRefresh(profileName);
        }
      } else {
        if (result.requiresReauth) {
          message.warning('Token refresh requires re-authentication. Please log in again.');
        } else {
          throw new Error(result.error || 'Refresh failed');
        }
      }
    } catch (error) {
      message.error(`Refresh failed: ${error}`);
    } finally {
      setRefreshLoading(null);
    }
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

  const getExpirationProgress = (expiresAt: string) => {
    const now = new Date();
    const expiration = new Date(expiresAt);
    const issued = new Date(expiration.getTime() - (10 * 60 * 60 * 1000)); // Assume 10 hour session
    
    const totalDuration = expiration.getTime() - issued.getTime();
    const elapsed = now.getTime() - issued.getTime();
    const percentage = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
    
    return percentage;
  };

  const availableProfiles = profiles.filter(profile => 
    !profileStatuses.some(status => status.profileName === profile.name)
  );

  return (
    <div>
      <Title level={3}>SSO Authentication</Title>
      <Text type="secondary">
        Authenticate with your organization's SSO to access AWS resources.
      </Text>

      {profiles.length === 0 && (
        <Alert
          message="No SSO Profiles Configured"
          description="Please configure SSO profiles in the SSO Configuration tab before attempting to authenticate."
          type="warning"
          showIcon
          style={{ margin: '16px 0' }}
        />
      )}

      {profiles.length > 0 && (
        <>
          <Card style={{ marginTop: 16 }}>
            <Title level={4}>Authenticate New Profile</Title>
            
            <Form
              form={form}
              layout="vertical"
              onFinish={handleAuthenticate}
              disabled={loading || authLoading}
            >
              <Form.Item
                label="SSO Profile"
                name="profileName"
                rules={[{ required: true, message: 'Please select an SSO profile' }]}
              >
                <Select
                  placeholder="Select SSO profile to authenticate"
                  value={selectedProfile}
                  onChange={setSelectedProfile}
                >
                  {availableProfiles.map(profile => (
                    <Option key={profile.name} value={profile.name}>
                      {profile.name} ({profile.accountId}) - {profile.description || profile.roleName}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="Username"
                name="username"
                rules={[{ required: true, message: 'Please enter your username' }]}
              >
                <Input 
                  prefix={<UserOutlined />} 
                  placeholder="Enter your SSO username" 
                />
              </Form.Item>

              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: 'Please enter your password' }]}
              >
                <Input.Password 
                  prefix={<LockOutlined />} 
                  placeholder="Enter your SSO password" 
                />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button 
                    type="primary" 
                    htmlType="submit"
                    loading={authLoading}
                    disabled={!selectedProfile}
                    icon={<LoginOutlined />}
                  >
                    Authenticate
                  </Button>
                  <Button 
                    onClick={loadProfileStatuses}
                    icon={<ReloadOutlined />}
                  >
                    Refresh Status
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {profileStatuses.length > 0 && (
            <Card style={{ marginTop: 16 }}>
              <Title level={4}>Authenticated Profiles</Title>
              
              <div style={{ marginTop: 16 }}>
                {profileStatuses.map((status) => {
                  const profile = profiles.find(p => p.name === status.profileName);
                  const isExpired = status.isExpired || !status.isAuthenticated;
                  const timeLeft = status.expiresAt ? getTimeUntilExpiration(status.expiresAt) : '';
                  const progress = status.expiresAt ? getExpirationProgress(status.expiresAt) : 0;
                  
                  return (
                    <Card 
                      key={status.profileName}
                      size="small" 
                      style={{ marginBottom: 16 }}
                      title={
                        <Space>
                          {isExpired ? (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
                          ) : (
                            <CheckCircleOutlined style={{ color: '#52c41a' }} />
                          )}
                          <span>{status.profileName}</span>
                          {!isExpired && (
                            <Text type="secondary">expires in {timeLeft}</Text>
                          )}
                        </Space>
                      }
                      extra={
                        <Space>
                          {!isExpired && (
                            <Button
                              size="small"
                              onClick={() => handleRefresh(status.profileName)}
                              loading={refreshLoading === status.profileName}
                              icon={<ReloadOutlined />}
                            >
                              Refresh
                            </Button>
                          )}
                          <Button
                            size="small"
                            danger
                            onClick={() => handleLogout(status.profileName)}
                            loading={logoutLoading === status.profileName}
                            icon={<LogoutOutlined />}
                          >
                            Logout
                          </Button>
                        </Space>
                      }
                    >
                      <div>
                        <Text strong>Account:</Text> {status.accountId}<br />
                        <Text strong>Role:</Text> {status.roleArn.split('/').pop()}<br />
                        {profile?.description && (
                          <>
                            <Text strong>Description:</Text> {profile.description}<br />
                          </>
                        )}
                        <Text strong>Status:</Text> 
                        <Text type={isExpired ? 'danger' : 'success'}>
                          {isExpired ? ' Expired' : ' Active'}
                        </Text>
                      </div>
                      
                      {!isExpired && status.expiresAt && (
                        <div style={{ marginTop: 12 }}>
                          <Text type="secondary">Session Progress:</Text>
                          <Progress 
                            percent={Math.round(progress)}
                            size="small"
                            status={progress > 80 ? 'exception' : 'active'}
                            format={() => timeLeft}
                          />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}