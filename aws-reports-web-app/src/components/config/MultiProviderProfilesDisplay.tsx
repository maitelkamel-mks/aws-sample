'use client';

import {
  Card,
  Typography,
  Space,
  Button,
  List,
  Tag,
  Badge,
  Collapse,
  Empty,
  Modal,
  Form,
  Input,
  Select,
  App,
  Alert,
  Tabs,
  Row,
  Col,
  Statistic,
  Spin,
  Popconfirm,
  Tooltip,
  Table,
  Dropdown
} from 'antd';
import {
  UserOutlined,
  CloudOutlined,
  SafetyCertificateOutlined,
  PlusOutlined,
  DeleteOutlined,
  LoginOutlined,
  LogoutOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  EditOutlined,
  MoreOutlined,
  SaveOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SSOProfile,
  SSOProviderType,
  ProviderConfig,
  MultiProviderSSOConfig
} from '@/lib/types/sso-providers';
import RoleSelectionModal from './RoleSelectionModal';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;
const { TabPane } = Tabs;

interface ProfilesByProvider {
  [providerId: string]: {
    provider: ProviderConfig;
    profiles: SSOProfile[];
    sessionStatus: 'active' | 'expired' | 'none';
    lastUsed?: Date;
  };
}

interface AuthSession {
  providerId: string;
  profileName: string;
  expiresAt: string;
  isActive: boolean;
  accountId: string;
  roleArn: string;
}

export default function MultiProviderProfilesDisplay() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [profilesByProvider, setProfilesByProvider] = useState<ProfilesByProvider>({});
  const [activeSessions, setActiveSessions] = useState<AuthSession[]>([]);
  const [config, setConfig] = useState<MultiProviderSSOConfig | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [authenticatingProvider, setAuthenticatingProvider] = useState<string | null>(null);
  const [roleSelectionVisible, setRoleSelectionVisible] = useState(false);
  const [editingProfile, setEditingProfile] = useState<{ providerId: string; profileName: string; newName: string } | null>(null);
  const [discoveredRoles, setDiscoveredRoles] = useState<SSOProfile[]>([]);
  const [currentProviderName, setCurrentProviderName] = useState<string>('');
  const [currentProviderId, setCurrentProviderId] = useState<string>('');
  const [form] = Form.useForm();

  const loadProfilesAndSessions = useCallback(async () => {
    try {
      setLoading(true);

      // Load multi-provider configuration
      const configResponse = await fetch('/api/aws/sso/multi-provider/config');
      const configResult = await configResponse.json();

      if (configResult.success && configResult.data) {
        const multiProviderConfig = configResult.data as MultiProviderSSOConfig;
        setConfig(multiProviderConfig);

        // Organize profiles by provider
        const organized: ProfilesByProvider = {};

        // Get authentication status for all providers
        const authResponse = await fetch('/api/aws/sso/multi-provider/authenticate');
        const authResult = await authResponse.json();

        let allActiveSessions: AuthSession[] = [];

        if (authResult.success) {
          // Build active sessions list from actual provider status
          allActiveSessions = authResult.data.providers
            .filter((p: any) => p.hasActiveSessions)
            .flatMap((p: any) => {
              // Get actual session information instead of mocked data
              const sessionCount = p.activeSessions || 0;
              return Array.from({ length: sessionCount }, (_, i) => ({
                providerId: p.providerId,
                profileName: `${p.providerName || p.providerId}`,
                expiresAt: new Date(Date.now() + 3600000).toISOString(), // Default 1 hour expiry
                isActive: true,
                accountId: 'authenticated',
                roleArn: 'session-active'
              }));
            });
        }

        setActiveSessions(allActiveSessions);

        // For each provider, collect profiles and session status
        for (const provider of multiProviderConfig.providers) {
          // Get actual profiles from provider settings
          const actualProfiles: SSOProfile[] = [];

          if (provider.type === 'AWS_SSO' && provider.settings?.profiles) {
            // Convert stored profile data to SSOProfile format
            for (const profileData of provider.settings.profiles) {
              actualProfiles.push({
                name: profileData.profileName,
                accountId: profileData.accountId || 'Unknown',
                roleName: profileData.roleName || 'Unknown',
                providerId: provider.id,
                providerType: provider.type,
                metadata: {
                  source: 'cli-import',
                  region: profileData.region,
                  roleArn: profileData.accountId && profileData.roleName
                    ? `arn:aws:iam::${profileData.accountId}:role/${profileData.roleName}`
                    : undefined
                }
              });
            }
          }

          // If no profiles are configured, show a placeholder
          if (actualProfiles.length === 0) {
            actualProfiles.push({
              name: `${provider.id}-no-profiles`,
              accountId: 'No profiles configured',
              roleName: 'Authenticate to discover roles',
              providerId: provider.id,
              providerType: provider.type,
              metadata: {
                source: 'placeholder',
                requiresAuth: true
              }
            });
          }

          const providerSessions = allActiveSessions.filter(s => s.providerId === provider.id);
          const sessionStatus = providerSessions.length > 0 ? 'active' : 'none';

          organized[provider.id] = {
            provider,
            profiles: actualProfiles,
            sessionStatus,
            lastUsed: providerSessions.length > 0 ? new Date() : undefined
          };
        }

        setProfilesByProvider(organized);
      }
    } catch (error) {
      console.error('Failed to load profiles and sessions:', error);
      message.error('Failed to load profile information');
    } finally {
      setLoading(false);
    }
  }, [message]);

  // Use React Query to load configuration and automatically refresh when cache is invalidated
  const { data: configData, refetch: refetchConfig } = useQuery({
    queryKey: ['multi-provider-sso-config'],
    queryFn: async () => {
      const response = await fetch('/api/aws/sso/multi-provider/config');
      const result = await response.json();
      return result.success ? result.data : null;
    },
    staleTime: 0, // Always check for fresh data
    gcTime: 0, // Don't cache
  });

  // Load profiles and sessions when config data changes
  useEffect(() => {
    if (configData) {
      loadProfilesAndSessions();
    }
  }, [configData, loadProfilesAndSessions]);

  const handleAuthenticate = async (providerId: string) => {
    const provider = Object.values(profilesByProvider).find(p => p.provider.id === providerId);
    if (!provider) return;

    setAuthenticatingProvider(providerId);
    setSelectedProviderId(providerId);
    form.setFieldsValue({ providerId });
    setAuthModalVisible(true);
  };

  const handleAuthSubmit = async (values: any) => {
    try {
      setLoading(true);

      const response = await fetch('/api/aws/sso/multi-provider/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: values.providerId,
          credentials: {
            username: values.username,
            password: values.password
          },
          discoverRoles: true
        }),
      });

      const result = await response.json();

      if (result.success) {
        if (result.data?.requiresDeviceFlow) {
          // Handle AWS SSO device flow
          const deviceFlow = result.data.deviceFlow;
          message.info(result.data.message || 'Opening browser for authentication...');

          // Open the verification URL in a new window/tab
          window.open(deviceFlow.verificationUriComplete, '_blank');

          // Show device code to user with completion button
          modal.confirm({
            title: 'AWS SSO Authentication',
            width: 600,
            content: (
              <div>
                <p><strong>Step 1:</strong> A new browser window should have opened.</p>
                <p><strong>Step 2:</strong> If it didn't open, please go to: <a href={deviceFlow.verificationUriComplete} target="_blank" rel="noopener noreferrer">{deviceFlow.verificationUri}</a></p>
                <p><strong>Step 3:</strong> Enter this code if prompted: <code style={{ fontSize: '16px', fontWeight: 'bold', backgroundColor: '#f0f0f0', padding: '4px 8px' }}>{deviceFlow.userCode}</code></p>
                <p><strong>Note:</strong> Complete any MFA challenges in your browser, then click "I've completed authentication" below.</p>
              </div>
            ),
            okText: "I've completed authentication",
            cancelText: 'Cancel',
            onOk: async () => {
              // Complete the device flow
              try {
                setLoading(true);
                const completeResponse = await fetch('/api/aws/sso/multi-provider/complete-device-flow', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    providerId: values.providerId,
                    deviceFlow: deviceFlow,
                    discoverRoles: true
                  })
                });

                const completeResult = await completeResponse.json();

                if (completeResult.success) {
                  const roles = completeResult.data.roles || [];
                  if (roles.length > 0) {
                    // Show role selection modal
                    setDiscoveredRoles(roles);
                    setCurrentProviderName(completeResult.data.providerType || 'AWS SSO');
                    setCurrentProviderId(values.providerId); // Track which provider is being used
                    setRoleSelectionVisible(true);
                    message.success(`Authentication completed! Discovered ${roles.length} AWS roles. Profile sessions will be created on-demand when first used.`);
                  } else {
                    message.warning('Authentication completed but no roles were discovered.');
                  }
                  // Always refresh data after successful authentication to update session status
                  await loadProfilesAndSessions();
                } else {
                  throw new Error(completeResult.error || 'Failed to complete authentication');
                }
              } catch (error) {
                message.error(`Failed to complete authentication: ${error}`);
              } finally {
                setLoading(false);
              }
            },
            onCancel() {
              message.info('Authentication cancelled. You can try again later.');
            }
          });

          setAuthModalVisible(false);
          form.resetFields();
        } else {
          message.success(`Successfully authenticated with ${values.providerId}`);
          setAuthModalVisible(false);
          form.resetFields();
          await loadProfilesAndSessions(); // Refresh data
        }
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      message.error(`Authentication failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async (providerId: string) => {
    try {
      setLoading(true);

      // Call the logout API
      const response = await fetch('/api/aws/sso/multi-provider/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          providerId: providerId
        }),
      });

      const result = await response.json();

      if (result.success) {
        message.success(result.message || `Successfully logged out from ${providerId}`);

        // Invalidate related queries to update other components
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });

        // Refresh the display to show updated session status
        await loadProfilesAndSessions();
      } else {
        throw new Error(result.error || 'Logout failed');
      }
    } catch (error) {
      console.error(`Logout failed for ${providerId}:`, error);
      message.error(`Failed to logout from ${providerId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelectionConfirm = async (selectedRoles: any[]) => {
    try {
      setLoading(true);

      // Update provider configuration with selected roles
      const response = await fetch('/api/aws/sso/multi-provider/update-roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: selectedProviderId, // Use the currently selected provider
          selectedRoles: selectedRoles
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success(`Successfully configured ${result.data.profilesCount} AWS role(s)! Sessions will be created automatically when profiles are first used.`);
        setRoleSelectionVisible(false);
        setDiscoveredRoles([]);
        setCurrentProviderName('');
        setCurrentProviderId('');

        // Invalidate related queries to update other components
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });
        queryClient.invalidateQueries({ queryKey: ['sso-profile-detection'] });

        await loadProfilesAndSessions(); // Refresh data to show updated profiles
      } else {
        throw new Error(result.error || 'Failed to update roles');
      }
    } catch (error) {
      message.error(`Failed to configure roles: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelectionCancel = () => {
    setRoleSelectionVisible(false);
    setDiscoveredRoles([]);
    setCurrentProviderName('');
    setCurrentProviderId('');
  };

  const handleProfileEdit = (providerId: string, profileName: string) => {
    setEditingProfile({ providerId, profileName, newName: profileName });
  };

  const handleProfileSave = async () => {
    if (!editingProfile) return;

    try {
      setLoading(true);

      // Get the provider config
      const provider = config?.providers.find(p => p.id === editingProfile.providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Update the profile name in the provider's settings
      const updatedProfiles = provider.settings.profiles?.map((profile: any) =>
        profile.profileName === editingProfile.profileName
          ? { ...profile, profileName: editingProfile.newName }
          : profile
      ) || [];

      const updatedProvider = {
        ...provider,
        settings: {
          ...provider.settings,
          profiles: updatedProfiles
        }
      };

      // Update the provider configuration
      const response = await fetch('/api/aws/sso/multi-provider/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: editingProfile.providerId,
          providerConfig: updatedProvider
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success('Profile name updated successfully');
        setEditingProfile(null);

        // Invalidate caches to refresh data
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });

        await loadProfilesAndSessions();
      } else {
        throw new Error(result.error || 'Failed to update profile');
      }
    } catch (error) {
      message.error(`Failed to update profile: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileDelete = async (providerId: string, profileName: string) => {
    try {
      setLoading(true);

      // Get the provider config
      const provider = config?.providers.find(p => p.id === providerId);
      if (!provider) {
        throw new Error('Provider not found');
      }

      // Remove the profile from the provider's settings
      const updatedProfiles = provider.settings.profiles?.filter((profile: any) =>
        profile.profileName !== profileName
      ) || [];

      const updatedProvider = {
        ...provider,
        settings: {
          ...provider.settings,
          profiles: updatedProfiles
        }
      };

      // Update the provider configuration
      const response = await fetch('/api/aws/sso/multi-provider/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: providerId,
          providerConfig: updatedProvider
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success('Profile deleted successfully');

        // Invalidate caches to refresh data
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });

        await loadProfilesAndSessions();
      } else {
        throw new Error(result.error || 'Failed to delete profile');
      }
    } catch (error) {
      message.error(`Failed to delete profile: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileEditCancel = () => {
    setEditingProfile(null);
  };

  const getProviderIcon = (type: SSOProviderType) => {
    switch (type) {
      case 'SAML':
        return <SafetyCertificateOutlined />;
      case 'AWS_SSO':
        return <CloudOutlined />;
      case 'OIDC':
        return <KeyOutlined />;
      default:
        return <UserOutlined />;
    }
  };

  const getSessionStatusBadge = (status: 'active' | 'expired' | 'none') => {
    switch (status) {
      case 'active':
        return <Badge status="success" text="Active Session" />;
      case 'expired':
        return <Badge status="warning" text="Session Expired" />;
      case 'none':
        return <Badge status="default" text="Not Authenticated" />;
    }
  };

  const renderProviderProfiles = (providerData: ProfilesByProvider[string]) => {
    const { provider, profiles, sessionStatus } = providerData;

    return (
      <Card
        key={provider.id}
        size="small"
        title={
          <Space>
            {getProviderIcon(provider.type)}
            <span>{provider.name}</span>
            <Tag color={provider.type === 'SAML' ? 'blue' : provider.type === 'AWS_SSO' ? 'green' : 'purple'}>
              {provider.type}
            </Tag>
            {getSessionStatusBadge(sessionStatus)}
          </Space>
        }
        extra={
          <Space>
            {sessionStatus === 'active' ? (
              <Popconfirm
                title="Are you sure you want to logout?"
                onConfirm={() => handleLogout(provider.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="link" icon={<LogoutOutlined />} size="small">
                  Logout
                </Button>
              </Popconfirm>
            ) : (
              <Button
                type="link"
                icon={<LoginOutlined />}
                onClick={() => handleAuthenticate(provider.id)}
                size="small"
              >
                Authenticate
              </Button>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {profiles.length === 0 || (profiles.length === 1 && profiles[0].metadata?.source === 'placeholder') ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No profiles configured for this provider"
          >
            <Button
              type="primary"
              icon={<LoginOutlined />}
              onClick={() => handleAuthenticate(provider.id)}
            >
              Authenticate to Discover Roles
            </Button>
          </Empty>
        ) : (
          <Table
            dataSource={profiles.filter(p => p.metadata?.source !== 'placeholder')}
            pagination={false}
            size="small"
            rowKey="name"
            columns={[
              {
                title: 'Profile Name',
                dataIndex: 'name',
                key: 'name',
                width: '30%',
                render: (name, profile) => {
                  const isEditing = editingProfile?.providerId === provider.id && editingProfile?.profileName === name;

                  if (isEditing) {
                    return (
                      <Space.Compact>
                        <Input
                          value={editingProfile.newName}
                          onChange={(e) => setEditingProfile({ ...editingProfile, newName: e.target.value })}
                          onPressEnter={handleProfileSave}
                          size="small"
                          autoFocus
                        />
                        <Button
                          type="primary"
                          size="small"
                          icon={<SaveOutlined />}
                          onClick={handleProfileSave}
                          loading={loading}
                        />
                        <Button
                          size="small"
                          icon={<CloseOutlined />}
                          onClick={handleProfileEditCancel}
                        />
                      </Space.Compact>
                    );
                  }

                  return (
                    <Space>
                      <UserOutlined style={{ color: '#52c41a' }} />
                      <Text strong>{name}</Text>
                    </Space>
                  );
                }
              },
              {
                title: 'Account ID',
                dataIndex: 'accountId',
                key: 'accountId',
                width: '25%',
                render: (accountId) => (
                  accountId !== 'Unknown' ? (
                    <Text code>{accountId}</Text>
                  ) : (
                    <Text type="secondary" italic>Unknown</Text>
                  )
                )
              },
              {
                title: 'Role',
                dataIndex: 'roleName',
                key: 'roleName',
                width: '25%',
                render: (roleName) => (
                  roleName !== 'Unknown' ? (
                    <Text>{roleName}</Text>
                  ) : (
                    <Text type="secondary" italic>Unknown</Text>
                  )
                )
              },
              {
                title: 'Actions',
                key: 'actions',
                width: '20%',
                render: (_, profile) => {
                  const isEditing = editingProfile?.providerId === provider.id && editingProfile?.profileName === profile.name;

                  if (isEditing) {
                    return null; // Actions are shown inline when editing
                  }

                  const items = [
                    {
                      key: 'edit',
                      label: 'Edit Name',
                      icon: <EditOutlined />,
                      onClick: () => handleProfileEdit(provider.id, profile.name)
                    },
                    {
                      key: 'delete',
                      label: 'Delete Profile',
                      icon: <DeleteOutlined />,
                      danger: true,
                      onClick: () => {
                        modal.confirm({
                          title: 'Delete Profile',
                          content: `Are you sure you want to delete profile "${profile.name}"?`,
                          okText: 'Delete',
                          okType: 'danger',
                          onOk: () => handleProfileDelete(provider.id, profile.name)
                        });
                      }
                    }
                  ];

                  return (
                    <Dropdown
                      menu={{ items }}
                      trigger={['click']}
                      placement="bottomRight"
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<MoreOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Dropdown>
                  );
                }
              }
            ]}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space direction="vertical">
                      <Text type="secondary">No profiles configured</Text>
                      {(profiles.some(p => p.accountId === 'Unknown' || p.roleName === 'Unknown')) && (
                        <Text type="warning">
                          <InfoCircleOutlined /> Authenticate to discover role information
                        </Text>
                      )}
                    </Space>
                  }
                />
              )
            }}
          />
        )}
      </Card>
    );
  };

  if (loading && Object.keys(profilesByProvider).length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading multi-provider profiles...</div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Card>

        {Object.keys(profilesByProvider).length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_DEFAULT}
            description="No SSO providers configured"
          >
            <Text type="secondary">
              Configure SSO providers in the Multi-Provider SSO tab to see available profiles.
            </Text>
          </Empty>
        ) : (
          <div>
            {Object.values(profilesByProvider).map(renderProviderProfiles)}
          </div>
        )}
      </Card>

      {/* Authentication Modal */}
      <Modal
        title="Authenticate with SSO Provider"
        open={authModalVisible}
        onCancel={() => {
          setAuthModalVisible(false);
          form.resetFields();
          setAuthenticatingProvider(null);
        }}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAuthSubmit}
        >
          <Form.Item
            name="providerId"
            label="SSO Provider"
          >
            <Select disabled>
              {Object.values(profilesByProvider).map(({ provider }) => (
                <Option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.type})
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* AWS SSO uses device flow - credentials handled in browser */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f6f8fa', borderRadius: 6 }}>
            <Text type="secondary">
              <InfoCircleOutlined /> AWS SSO uses device flow authentication. You'll be redirected to your browser to complete the login process, including MFA if required.
            </Text>
          </div>

          <Form.Item
            name="username"
            label="Username (Not Required for AWS SSO)"
            tooltip="AWS SSO handles authentication in the browser"
          >
            <Input placeholder="Leave empty - handled in browser" disabled />
          </Form.Item>

          <Form.Item
            name="password"
            label="Password (Not Required for AWS SSO)"
            tooltip="AWS SSO handles authentication in the browser"
          >
            <Input.Password placeholder="Leave empty - handled in browser" disabled />
          </Form.Item>

          <Form.Item
            name="mfaCode"
            label="MFA Code (Handled in Browser)"
            tooltip="AWS SSO will prompt for MFA during the browser authentication flow if required"
          >
            <Input placeholder="MFA will be prompted in browser" disabled />
          </Form.Item>

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setAuthModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                Start AWS SSO Flow
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Role Selection Modal */}
      <RoleSelectionModal
        visible={roleSelectionVisible}
        onCancel={handleRoleSelectionCancel}
        onConfirm={handleRoleSelectionConfirm}
        discoveredRoles={discoveredRoles}
        providerName={currentProviderName}
        existingProfiles={currentProviderId ? (profilesByProvider[currentProviderId]?.profiles || []) : []}
        loading={loading}
      />
    </div>
  );
}