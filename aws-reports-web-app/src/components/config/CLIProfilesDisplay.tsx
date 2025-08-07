'use client';

import {
  Card,
  Typography,
  Space,
  Button,
  List,
  Tag,
  Badge,
  Empty,
  Alert,
  Row,
  Col,
  Statistic,
  Spin,
  Tooltip,
  App,
  Modal,
  Divider
} from 'antd';
import {
  UserOutlined,
  CloudOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  PlusOutlined
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const { Title, Text } = Typography;

interface CLIProfile {
  name: string;
  type: 'cli' | 'sso';
  isAuthenticated: boolean;
  region?: string;
  accountId?: string;
  roleArn?: string;
  description?: string;
  expiresAt?: string;
  userId?: string;
  // SSO specific fields
  ssoStartUrl?: string;
  ssoRegion?: string;
  ssoAccountId?: string;
  ssoRoleName?: string;
}

interface SSOProviderGroup {
  ssoStartUrl: string;
  ssoRegion: string;
  organizationName: string;
  profiles: {
    profileName: string;
    ssoStartUrl?: string;
    ssoRegion?: string;
    ssoAccountId?: string;
    ssoRoleName?: string;
    region?: string;
    output?: string;
    isSSO: boolean;
  }[];
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

interface EnhancedSSOProviderGroup extends SSOProviderGroup {
  isAlreadyImported: boolean;
  existingProviderId?: string;
  existingProviderName?: string;
}

export default function CLIProfilesDisplay() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [ssoProviderGroups, setSsoProviderGroups] = useState<EnhancedSSOProviderGroup[]>([]);
  const [showSsoModal, setShowSsoModal] = useState(false);

  // Fetch CLI profiles
  const { data: profilesData, isLoading: profilesLoading, refetch: refetchProfiles } = useQuery({
    queryKey: ['aws-profiles-unified'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/aws/profiles/unified');
        if (!response.ok) throw new Error('Failed to fetch profiles');
        const result = await response.json();
        return result.data;
      } catch (error) {
        console.error('Failed to fetch AWS profiles:', error);
        message.error('Failed to fetch AWS profiles');
        return {
          cliProfiles: [],
          ssoProfiles: [],
          unifiedProfiles: [],
          ssoConfigured: false,
          totalProfiles: 0,
          authenticatedSSOProfiles: 0
        };
      }
    },
  });

  // Fetch SSO profile detections
  const { data: ssoDetectionData, isLoading: ssoDetectionLoading, refetch: refetchDetections } = useQuery({
    queryKey: ['sso-profile-detection'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/aws/sso/detect');
        if (!response.ok) throw new Error('Failed to detect SSO profiles');
        const result = await response.json();
        return result.data;
      } catch (error) {
        console.error('Failed to detect SSO profiles:', error);
        message.error('Failed to detect SSO profiles');
        return {
          ssoProviderGroups: [],
          regularProfiles: [],
          totalProfiles: 0,
          ssoProfileCount: 0,
          ssoProviderCount: 0,
          validSSOProviders: 0,
          profilesByProvider: 0
        };
      }
    },
  });

  // Fetch existing multi-provider configurations
  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ['multi-provider-sso-config'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/aws/sso/multi-provider/config');
        if (!response.ok) throw new Error('Failed to fetch configuration');
        const result = await response.json();
        return result.data;
      } catch (error) {
        console.error('Failed to fetch configuration:', error);
        return {
          providers: [],
          version: '1.0',
          lastModified: new Date().toISOString()
        };
      }
    },
  });

  // Utility function to check if provider group is already imported
  const checkProviderStatus = useCallback((providerGroup: SSOProviderGroup, existingProviders: any[]): EnhancedSSOProviderGroup => {
    // Check if any existing provider matches the SSO start URL
    const matchingProvider = existingProviders.find(provider =>
      provider.type === 'AWS_SSO' &&
      provider.settings?.startUrl === providerGroup.ssoStartUrl
    );

    return {
      ...providerGroup,
      isAlreadyImported: !!matchingProvider,
      existingProviderId: matchingProvider?.id,
      existingProviderName: matchingProvider?.name
    };
  }, []);

  // Update local state when detection data changes
  useEffect(() => {
    if (ssoDetectionData?.ssoProviderGroups && configData?.providers) {
      const enhancedGroups = ssoDetectionData.ssoProviderGroups.map((group: SSOProviderGroup) =>
        checkProviderStatus(group, configData.providers)
      );
      setSsoProviderGroups(enhancedGroups);
    } else if (ssoDetectionData?.ssoProviderGroups) {
      // If config data is not available yet, enhance with default status
      const enhancedGroups = ssoDetectionData.ssoProviderGroups.map((group: SSOProviderGroup) => ({
        ...group,
        isAlreadyImported: false,
        existingProviderId: undefined,
        existingProviderName: undefined
      }));
      setSsoProviderGroups(enhancedGroups);
    }
  }, [ssoDetectionData, configData, checkProviderStatus]);

  const handleCreateSSOProvider = async (providerGroup: SSOProviderGroup) => {
    try {
      setLoading(true);

      const response = await fetch('/api/aws/sso/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ssoStartUrl: providerGroup.ssoStartUrl,
          organizationName: providerGroup.organizationName
        })
      });

      const result = await response.json();

      if (result.success) {
        message.success(`Created SSO provider '${providerGroup.organizationName}' with ${providerGroup.profiles.length} profile(s)`);
        // Invalidate and refresh all related queries
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        await Promise.all([refetchProfiles(), refetchDetections()]);
      } else {
        throw new Error(result.error || 'Failed to create SSO provider');
      }
    } catch (error) {
      message.error(`Failed to create SSO provider: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await Promise.all([refetchProfiles(), refetchDetections()]);
      message.success('Refreshed profile information');
    } catch (error) {
      message.error('Failed to refresh profiles');
    } finally {
      setLoading(false);
    }
  };

  if ((profilesLoading || ssoDetectionLoading || configLoading) && !profilesData) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading AWS profiles...</div>
        </div>
      </Card>
    );
  }

  const cliProfiles = profilesData?.cliProfiles || [];
  const availableForImport = ssoProviderGroups.filter(group => group.isValid && !group.isAlreadyImported).length;

  return (
    <div>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              onClick={handleRefresh}
              icon={<ReloadOutlined />}
              loading={loading}
            >
              Refresh
            </Button>
            {availableForImport > 0 && (
              <Button
                type="primary"
                onClick={() => setShowSsoModal(true)}
                icon={<PlusOutlined />}
              >
                Import SSO Providers ({availableForImport})
              </Button>
            )}
          </Space>
        </div>

        {cliProfiles.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_DEFAULT}
            description="No AWS CLI profiles found"
          >
            <Text type="secondary">
              Configure AWS CLI profiles using <code>aws configure</code> or <code>aws configure sso</code>
            </Text>
          </Empty>
        ) : (
          <div>
            <List
              dataSource={cliProfiles}
              size="small"
              renderItem={(profile: CLIProfile) => (
                <List.Item style={{ padding: '8px 0' }}>
                  <List.Item.Meta
                    avatar={<UserOutlined style={{ fontSize: 16 }} />}
                    title={
                      <Space size="small">
                        <span style={{ fontWeight: 500 }}>{profile.name}</span>
                        {profile.description && (
                          <Tag color={
                            profile.description === 'SSO' ? 'blue' :
                              profile.description === 'Access Keys' ? 'green' :
                                profile.description === 'Assumed Role' ? 'orange' :
                                  'default'
                          }>
                            {profile.description}
                          </Tag>
                        )}
                        {profile.isAuthenticated ? (
                          <Badge status="success" text="Active" />
                        ) : (
                          <Badge status="default" text="Inactive" />
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />

            {ssoProviderGroups.length > 0 && (
              <>
                <Divider />
                <List
                  header="Detected SSO Organizations"
                  dataSource={ssoProviderGroups}
                  size="small"
                  renderItem={(providerGroup: EnhancedSSOProviderGroup) => (
                    <List.Item
                      style={{ padding: '8px 0' }}
                      actions={[
                        providerGroup.isAlreadyImported ? (
                          <Tooltip key="imported" title={`Already imported as provider: ${providerGroup.existingProviderName}`}>
                            <Button type="link" icon={<CheckCircleOutlined />} style={{ color: '#52c41a' }} disabled size="small">
                              Already Imported
                            </Button>
                          </Tooltip>
                        ) : providerGroup.isValid ? (
                          <Tooltip key="import" title={`Import ${providerGroup.profiles.length} profile(s) as single SSO provider`}>
                            <Button
                              type="link"
                              icon={<PlusOutlined />}
                              onClick={() => handleCreateSSOProvider(providerGroup)}
                              loading={loading}
                              size="small"
                            >
                              Import ({providerGroup.profiles.length})
                            </Button>
                          </Tooltip>
                        ) : (
                          <Tooltip key="invalid" title={providerGroup.errors.join(', ')}>
                            <Button type="link" icon={<ExclamationCircleOutlined />} danger disabled size="small">
                              Invalid
                            </Button>
                          </Tooltip>
                        )
                      ]}
                    >
                      <List.Item.Meta
                        avatar={
                          providerGroup.isValid ? (
                            <CloudOutlined style={{ color: '#1890ff', fontSize: 16 }} />
                          ) : (
                            <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 16 }} />
                          )
                        }
                        title={
                          <Space size="small">
                            <span style={{ fontWeight: 500 }}>{providerGroup.organizationName}</span>
                            <Tag color="blue">SSO Organization</Tag>
                            <Tag color="green">{providerGroup.profiles.length} profiles</Tag>
                            {providerGroup.isAlreadyImported ? (
                              <Badge status="success" text="Imported" />
                            ) : providerGroup.isValid ? (
                              <Badge status="processing" text="Available" />
                            ) : (
                              <Badge status="error" text="Invalid" />
                            )}
                          </Space>
                        }
                        description={
                          <div style={{ lineHeight: 1.4 }}>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                              <span style={{ fontWeight: 500 }}>Start URL:</span> {providerGroup.ssoStartUrl}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                              <span style={{ fontWeight: 500 }}>SSO Region:</span> {providerGroup.ssoRegion}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                              <span style={{ fontWeight: 500 }}>Profiles:</span> {providerGroup.profiles.map(p => p.profileName).join(', ')}
                            </Text>
                            {providerGroup.isAlreadyImported && providerGroup.existingProviderName && (
                              <Text type="success" style={{ fontSize: 12, display: 'block' }}>
                                <CheckCircleOutlined /> Connected to provider: {providerGroup.existingProviderName}
                              </Text>
                            )}
                            {!providerGroup.isValid && (
                              <Text type="danger" style={{ fontSize: 12, display: 'block' }}>
                                <ExclamationCircleOutlined /> {providerGroup.errors.join(', ')}
                              </Text>
                            )}
                            {providerGroup.warnings.length > 0 && (
                              <Text type="warning" style={{ fontSize: 12, display: 'block' }}>
                                <InfoCircleOutlined /> {providerGroup.warnings.join(', ')}
                              </Text>
                            )}
                          </div>
                        }
                      />
                    </List.Item>
                  )}
                />
              </>
            )}
          </div>
        )}
      </Card>

      {/* SSO Import Modal */}
      <Modal
        title="Import SSO Organizations"
        open={showSsoModal}
        onCancel={() => setShowSsoModal(false)}
        footer={null}
        width={800}
      >
        <Alert
          message="Automatic SSO Provider Creation"
          description="The following SSO organizations have been detected. Each organization will be imported as a single provider containing all its profiles."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <List
          dataSource={ssoProviderGroups.filter(group => group.isValid && !group.isAlreadyImported)}
          size="small"
          renderItem={(providerGroup) => (
            <List.Item
              style={{ padding: '8px 0' }}
              actions={[
                <Button
                  key="import"
                  type="primary"
                  size="small"
                  onClick={() => handleCreateSSOProvider(providerGroup)}
                  loading={loading}
                >
                  Import ({providerGroup.profiles.length})
                </Button>
              ]}
            >
              <List.Item.Meta
                avatar={<CloudOutlined style={{ color: '#1890ff', fontSize: 16 }} />}
                title={<span style={{ fontWeight: 500 }}>{providerGroup.organizationName}</span>}
                description={
                  <div style={{ lineHeight: 1.4 }}>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      SSO organization with {providerGroup.profiles.length} profile(s)
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      Will create provider: <Text code style={{ fontSize: 12 }}>sso-{providerGroup.organizationName.replace(/[^a-zA-Z0-9]/g, '-')}</Text>
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      <span style={{ fontWeight: 500 }}>Start URL:</span> {providerGroup.ssoStartUrl}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                      <span style={{ fontWeight: 500 }}>Profiles:</span> {providerGroup.profiles.map(p => p.profileName).join(', ')}
                    </Text>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Modal>
    </div>
  );
}