'use client';

import {
  Card,
  Typography,
  Space,
  Button,
  Tag,
  Badge,
  Empty,
  Modal,
  Form,
  Input,
  Select,
  App,
  Alert,
  Spin,
  Popconfirm,
  Tooltip,
  Table,
  Dropdown,
  Collapse,
  InputNumber,
  Switch,
  Divider
} from 'antd';
import {
  UserOutlined,
  CloudOutlined,
  SafetyCertificateOutlined,
  PlusOutlined,
  DeleteOutlined,
  LoginOutlined,
  LogoutOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  EditOutlined,
  MoreOutlined,
  SaveOutlined,
  CloseOutlined,
  SettingOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SSOProfile,
  SSOProviderType,
  ProviderConfig,
  MultiProviderSSOConfig,
  ProviderConfigSchema,
  SecuritySettings,
  ProxySettings
} from '@/lib/types/sso-providers';
import RoleSelectionModal from './RoleSelectionModal';

const { Text } = Typography;
const { Option } = Select;

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

interface ProviderFormData {
  id: string;
  type: SSOProviderType;
  name: string;
  enabled?: boolean;
  settings: { [key: string]: any };
  security?: SecuritySettings;
  proxy?: ProxySettings;
}

export default function SSOManagementDashboard() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [profilesByProvider, setProfilesByProvider] = useState<ProfilesByProvider>({});
  const [config, setConfig] = useState<MultiProviderSSOConfig | null>(null);
  
  // Provider configuration states
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [availableProviderTypes, setAvailableProviderTypes] = useState<SSOProviderType[]>([]);
  const [providerSchemas, setProviderSchemas] = useState<{ [key: string]: ProviderConfigSchema }>({});
  
  // Authentication states
  const [authModalVisible, setAuthModalVisible] = useState(false);
  const [roleSelectionVisible, setRoleSelectionVisible] = useState(false);
  const [discoveredRoles, setDiscoveredRoles] = useState<SSOProfile[]>([]);
  const [currentProviderName, setCurrentProviderName] = useState<string>('');
  const [currentProviderId, setCurrentProviderId] = useState<string>('');
  
  // Profile editing states
  const [editingProfile, setEditingProfile] = useState<{ providerId: string; profileName: string; newName: string } | null>(null);
  
  const [form] = Form.useForm();
  const [providerForm] = Form.useForm();

  // Load provider schemas and types
  useEffect(() => {
    const loadProviderInfo = async () => {
      try {
        const response = await fetch('/api/aws/sso/multi-provider/providers');
        const result = await response.json();

        if (result.success) {
          const { availableTypes, providerSchemas } = result.data;
          setAvailableProviderTypes(availableTypes);
          setProviderSchemas(providerSchemas);
        }
      } catch (error) {
        console.error('Failed to load provider information:', error);
        message.error('Failed to load provider information');
      }
    };

    loadProviderInfo();
  }, [message]);

  const loadProfilesAndSessions = useCallback(async () => {
    try {
      setLoading(true);

      // Load multi-provider configuration
      const configResponse = await fetch('/api/aws/sso/multi-provider/config');
      const configResult = await configResponse.json();

      if (configResult.success && configResult.data) {
        const multiProviderConfig = configResult.data as MultiProviderSSOConfig;
        console.log('🔍 Config Loading Debug: Loaded multi-provider config:', {
          providersCount: multiProviderConfig.providers.length,
          providers: multiProviderConfig.providers.map(p => ({
            id: p.id,
            type: p.type,
            name: p.name,
            profilesCount: p.settings?.profiles?.length || 0
          }))
        });
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
              const sessionCount = p.activeSessions || 0;
              return Array.from({ length: sessionCount }, () => ({
                providerId: p.providerId,
                profileName: `${p.providerName || p.providerId}`,
                expiresAt: new Date(Date.now() + 3600000).toISOString(),
                isActive: true,
                accountId: 'authenticated',
                roleArn: 'session-active'
              }));
            });
        }

        // For each provider, collect profiles and session status
        for (const provider of multiProviderConfig.providers) {
          console.log('🔍 Profile Loading Debug: Processing provider:', {
            id: provider.id,
            type: provider.type,
            name: provider.name,
            hasSettings: !!provider.settings,
            hasProfiles: !!(provider.settings?.profiles),
            profilesCount: provider.settings?.profiles?.length || 0
          });
          const actualProfiles: SSOProfile[] = [];

          // Load profiles for any provider type that has profiles configured
          if (provider.settings?.profiles && provider.settings.profiles.length > 0) {
            // Convert stored profile data to SSOProfile format
            for (const profileData of provider.settings.profiles) {
              console.log('🔍 Profile Loading Debug: Loading profile for', provider.type, 'provider:', profileData);
              actualProfiles.push({
                name: profileData.profileName,
                accountId: profileData.accountId || 'Unknown',
                roleName: profileData.roleName || 'Unknown',
                providerId: provider.id,
                providerType: provider.type,
                metadata: {
                  source: `${provider.type.toLowerCase()}-import`,
                  region: profileData.region,
                  roleArn: profileData.accountId && profileData.roleName
                    ? `arn:aws:iam::${profileData.accountId}:role/${profileData.roleName}`
                    : undefined
                }
              });
            }
            console.log('✅ Profile Loading Debug: Loaded', actualProfiles.length, 'profiles for provider', provider.id);
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
      message.error('Failed to load SSO information');
    } finally {
      setLoading(false);
    }
  }, [message]);

  // Use React Query to load configuration and automatically refresh when cache is invalidated
  const { data: configData } = useQuery({
    queryKey: ['multi-provider-sso-config'],
    queryFn: async () => {
      const response = await fetch('/api/aws/sso/multi-provider/config');
      const result = await response.json();
      return result.success ? result.data : null;
    },
    staleTime: 0,
    gcTime: 0,
  });

  // Load profiles and sessions when config data changes
  useEffect(() => {
    if (configData) {
      loadProfilesAndSessions();
    }
  }, [configData, loadProfilesAndSessions]);

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

  const handleAddProvider = () => {
    setEditingProvider(null);
    providerForm.resetFields();
    setProviderModalVisible(true);
  };

  const handleEditProvider = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    providerForm.setFieldsValue({
      id: provider.id,
      type: provider.type,
      name: provider.name,
      settings: provider.settings,
      security: provider.security,
      proxy: provider.proxy
    });
    setProviderModalVisible(true);
  };

  const handleProviderSave = async (values: ProviderFormData) => {
    try {
      setLoading(true);
      
      // Basic client-side validation
      if (!values.id || !values.type || !values.name) {
        message.error('Provider ID, type, and name are required');
        return;
      }

      let updatedProviders: ProviderConfig[];
      const currentProviders = config?.providers || [];

      if (editingProvider) {
        // Update existing provider
        updatedProviders = currentProviders.map(p =>
          p.id === editingProvider.id ? values as ProviderConfig : p
        );
      } else {
        // Add new provider
        if (currentProviders.some(p => p.id === values.id)) {
          message.error('Provider ID must be unique');
          return;
        }
        updatedProviders = [...currentProviders, values as ProviderConfig];
      }

      // Save the configuration immediately to the backend
      const multiProviderConfig: MultiProviderSSOConfig = {
        version: config?.version || '1.0',
        lastModified: new Date().toISOString(),
        providers: updatedProviders,
        defaultProvider: config?.defaultProvider,
        globalSettings: config?.globalSettings || {
          security: {
            sslVerification: true,
            tokenEncryption: true,
            sessionBinding: true,
            auditLogging: true
          }
        }
      };

      // Call API to save configuration
      const response = await fetch('/api/aws/sso/multi-provider/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: multiProviderConfig }),
      });

      const result = await response.json();

      if (result.success) {
        setConfig(multiProviderConfig);
        if (editingProvider) {
          message.success('Provider updated and saved successfully');
        } else {
          message.success('Provider added and saved successfully');
        }
        
        // Invalidate relevant queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }

      setProviderModalVisible(false);
      providerForm.resetFields();
      setEditingProvider(null);
    } catch (error) {
      message.error(`Failed to save provider: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    try {
      setLoading(true);

      // Call DELETE API to remove provider from config
      const response = await fetch(`/api/aws/sso/multi-provider/config?providerId=${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (result.success) {
        message.success('Provider removed successfully');
        
        // Invalidate relevant queries to refresh the UI
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });
        queryClient.invalidateQueries({ queryKey: ['sso-profile-detection'] });
      } else {
        throw new Error(result.error || 'Failed to remove provider');
      }
    } catch (error) {
      message.error(`Failed to delete provider: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAuthenticate = async (providerId: string) => {
    const provider = Object.values(profilesByProvider).find(p => p.provider.id === providerId);
    if (!provider) return;

    setCurrentProviderId(providerId);
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
                    setCurrentProviderId(values.providerId);
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
          // Handle successful authentication (SAML, OIDC, or other non-device-flow)
          const roles = result.data.roles || [];
          console.log('🔐 Frontend Debug: Authentication successful, roles found:', roles.length);
          
          if (roles.length > 0) {
            // Show role selection modal
            setDiscoveredRoles(roles);
            setCurrentProviderName(result.data.providerType || values.providerId);
            setCurrentProviderId(values.providerId);
            setRoleSelectionVisible(true);
            message.success(`Authentication completed! Discovered ${roles.length} AWS role(s).`);
          } else {
            message.success(`Successfully authenticated with ${values.providerId}, but no roles were discovered.`);
          }
          
          setAuthModalVisible(false);
          form.resetFields();
          await loadProfilesAndSessions();
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
          providerId: currentProviderId,
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

        await loadProfilesAndSessions();
      } else {
        throw new Error(result.error || 'Failed to update roles');
      }
    } catch (error) {
      message.error(`Failed to configure roles: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelectionCancel = async () => {
    setRoleSelectionVisible(false);
    setDiscoveredRoles([]);
    setCurrentProviderName('');
    setCurrentProviderId('');
    
    // Refresh profile list to reflect any changes that may have occurred during authentication
    await loadProfilesAndSessions();
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

  if (loading && Object.keys(profilesByProvider).length === 0) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading SSO management...</div>
        </div>
      </Card>
    );
  }

  return (
    <div>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleAddProvider}
            >
              Add SSO Provider
            </Button>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => loadProfilesAndSessions()}
              loading={loading}
            >
              Refresh
            </Button>
          </Space>
        </Card>

        {Object.keys(profilesByProvider).length === 0 ? (
          <Card>
            <Empty
              image={Empty.PRESENTED_IMAGE_DEFAULT}
              description="No SSO providers configured"
            >
              <Text type="secondary">
                Add an SSO provider to get started with centralized authentication.
              </Text>
              <br />
              <Button type="primary" icon={<PlusOutlined />} onClick={handleAddProvider} style={{ marginTop: 16 }}>
                Add Your First SSO Provider
              </Button>
            </Empty>
          </Card>
        ) : (
          Object.values(profilesByProvider).map(({ provider, profiles, sessionStatus }) => (
            <Card
              key={provider.id}
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
                  <Tooltip title="Configure provider settings">
                    <Button 
                      type="text" 
                      icon={<SettingOutlined />} 
                      onClick={() => handleEditProvider(provider)}
                    />
                  </Tooltip>
                  <Popconfirm
                    title="Delete SSO Provider"
                    description="Are you sure you want to delete this provider and all its profiles?"
                    onConfirm={() => handleDeleteProvider(provider.id)}
                    okText="Delete"
                    cancelText="Cancel"
                    okType="danger"
                  >
                    <Tooltip title="Delete provider">
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                </Space>
              }
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
                      render: (name) => {
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
                />
              )}
              
              <Divider />
              <Space>
                {sessionStatus === 'active' ? (
                  <Button 
                    type="default" 
                    icon={<LogoutOutlined />}
                    onClick={() => handleLogout(provider.id)}
                  >
                    Logout
                  </Button>
                ) : (
                  <Button 
                    type="primary" 
                    icon={<LoginOutlined />}
                    onClick={() => handleAuthenticate(provider.id)}
                  >
                    Authenticate
                  </Button>
                )}
              </Space>
            </Card>
          ))
        )}
      </Space>

      {/* Provider Configuration Modal */}
      <Modal
        title={editingProvider ? "Edit SSO Provider" : "Add SSO Provider"}
        open={providerModalVisible}
        onCancel={() => {
          setProviderModalVisible(false);
          setEditingProvider(null);
          providerForm.resetFields();
        }}
        footer={null}
        width={800}
      >
        <Form
          form={providerForm}
          layout="vertical"
          onFinish={handleProviderSave}
        >
          <Form.Item
            name="id"
            label="Provider ID"
            rules={[{ required: true, message: 'Provider ID is required' }]}
            tooltip="Unique identifier for this provider"
          >
            <Input 
              placeholder="e.g., company-saml" 
              disabled={!!editingProvider}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="Provider Name"
            rules={[{ required: true, message: 'Provider name is required' }]}
            tooltip="Display name for this provider"
          >
            <Input placeholder="e.g., Company SAML Authentication" />
          </Form.Item>

          <Form.Item
            name="type"
            label="Provider Type"
            rules={[{ required: true, message: 'Provider type is required' }]}
            tooltip="Authentication protocol type"
          >
            <Select 
              placeholder="Select provider type"
              onChange={() => {
                // Clear settings when provider type changes
                providerForm.setFieldValue('settings', {});
              }}
            >
              {availableProviderTypes.map(type => (
                <Option key={type} value={type}>
                  {type}
                </Option>
              ))}
            </Select>
          </Form.Item>


          <Divider orientation="left">Provider Settings</Divider>
          
          <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
            {({ getFieldValue }) => {
              const providerType = getFieldValue('type') as SSOProviderType;
              const schema = providerSchemas[providerType];
              
              if (!schema) {
                return (
                  <Alert 
                    message="Select a provider type to configure settings" 
                    type="info" 
                  />
                );
              }

              return schema.fields.map(field => {
                const fieldName = ['settings', field.name];

                switch (field.type) {
                  case 'string':
                  case 'url':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                        tooltip={field.description}
                      >
                        <Input placeholder={field.placeholder} />
                      </Form.Item>
                    );

                  case 'password':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                        tooltip={field.description}
                      >
                        <Input.Password placeholder={field.placeholder} />
                      </Form.Item>
                    );

                  case 'number':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                        tooltip={field.description}
                      >
                        <InputNumber
                          style={{ width: '100%' }}
                          placeholder={field.placeholder}
                          min={field.validation?.minLength}
                          max={field.validation?.maxLength}
                        />
                      </Form.Item>
                    );

                  case 'boolean':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        valuePropName="checked"
                        tooltip={field.description}
                      >
                        <Switch />
                      </Form.Item>
                    );

                  case 'select':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                        tooltip={field.description}
                      >
                        <Select placeholder={field.placeholder}>
                          {field.options?.map(option => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    );

                  case 'multiselect':
                    return (
                      <Form.Item
                        key={field.name}
                        name={fieldName}
                        label={field.label}
                        rules={field.required ? [{ required: true, message: `${field.label} is required` }] : []}
                        tooltip={field.description}
                      >
                        <Select mode="multiple" placeholder={field.placeholder}>
                          {field.options?.map(option => (
                            <Option key={option.value} value={option.value}>
                              {option.label}
                            </Option>
                          ))}
                        </Select>
                      </Form.Item>
                    );

                  default:
                    return null;
                }
              });
            }}
          </Form.Item>
          
          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setProviderModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" loading={loading}>
                {editingProvider ? 'Update Provider' : 'Add Provider'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Authentication Modal */}
      <Modal
        title="Authenticate with SSO Provider"
        open={authModalVisible}
        onCancel={() => {
          setAuthModalVisible(false);
          form.resetFields();
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

          <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.providerId !== currentValues.providerId}>
            {({ getFieldValue }) => {
              const selectedProviderId = getFieldValue('providerId');
              const selectedProvider = Object.values(profilesByProvider).find(p => p.provider.id === selectedProviderId);
              const providerType = selectedProvider?.provider.type;

              if (providerType === 'AWS_SSO') {
                return (
                  <>
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
                  </>
                );
              } else if (providerType === 'SAML') {
                return (
                  <>
                    {/* SAML requires username and password */}
                    <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#fff7e6', borderRadius: 6 }}>
                      <Text type="secondary">
                        <InfoCircleOutlined /> SAML authentication requires your organization credentials.
                      </Text>
                    </div>

                    <Form.Item
                      name="username"
                      label="Username"
                      rules={[{ required: true, message: 'Username is required for SAML authentication' }]}
                      tooltip="Your organization username"
                    >
                      <Input placeholder="Enter your username" />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      label="Password"
                      rules={[{ required: true, message: 'Password is required for SAML authentication' }]}
                      tooltip="Your organization password"
                    >
                      <Input.Password placeholder="Enter your password" />
                    </Form.Item>

                    <Form.Item
                      name="mfaCode"
                      label="MFA Code (Optional)"
                      tooltip="Enter MFA code if required by your organization"
                    >
                      <Input placeholder="Enter MFA code if prompted" />
                    </Form.Item>
                  </>
                );
              } else if (providerType === 'OIDC') {
                return (
                  <>
                    {/* OIDC may use browser flow or credentials */}
                    <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f0f9ff', borderRadius: 6 }}>
                      <Text type="secondary">
                        <InfoCircleOutlined /> OIDC authentication may redirect to your browser or require credentials.
                      </Text>
                    </div>

                    <Form.Item
                      name="username"
                      label="Username"
                      tooltip="Your organization username (if required)"
                    >
                      <Input placeholder="Enter username if required" />
                    </Form.Item>

                    <Form.Item
                      name="password"
                      label="Password"
                      tooltip="Your organization password (if required)"
                    >
                      <Input.Password placeholder="Enter password if required" />
                    </Form.Item>
                  </>
                );
              }

              return null;
            }}
          </Form.Item>

          <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.providerId !== currentValues.providerId}>
            {({ getFieldValue }) => {
              const selectedProviderId = getFieldValue('providerId');
              const selectedProvider = Object.values(profilesByProvider).find(p => p.provider.id === selectedProviderId);
              const providerType = selectedProvider?.provider.type;

              let buttonText = 'Authenticate';
              if (providerType === 'AWS_SSO') {
                buttonText = 'Start AWS SSO Flow';
              } else if (providerType === 'SAML') {
                buttonText = 'Authenticate with SAML';
              } else if (providerType === 'OIDC') {
                buttonText = 'Authenticate with OIDC';
              }

              return (
                <div style={{ textAlign: 'right' }}>
                  <Space>
                    <Button onClick={() => setAuthModalVisible(false)}>
                      Cancel
                    </Button>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      {buttonText}
                    </Button>
                  </Space>
                </div>
              );
            }}
          </Form.Item>
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