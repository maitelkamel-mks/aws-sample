'use client';

import {
  Form,
  Input,
  Button,
  Select,
  Card,
  Typography,
  InputNumber,
  Switch,
  Space,
  Alert,
  Divider,
  Row,
  Col,
  List,
  Popconfirm,
  App,
  Spin,
  Modal,
  Tabs,
  Badge,
  Tag,
  Collapse,
  Empty
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  SaveOutlined,
  ReloadOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MultiProviderSSOConfig,
  ProviderConfig,
  SSOProviderType,
  ProviderConfigSchema,
  ProviderStatus,
  SecuritySettings,
  ProxySettings
} from '@/lib/types/sso-providers';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

interface MultiProviderSSOConfigFormProps {
  onSave?: (config: MultiProviderSSOConfig) => Promise<void>;
}

interface ProviderFormData {
  id: string;
  type: SSOProviderType;
  name: string;
  enabled: boolean;
  settings: { [key: string]: any };
  security?: SecuritySettings;
  proxy?: ProxySettings;
}

export default function MultiProviderSSOConfigForm({ onSave }: MultiProviderSSOConfigFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<MultiProviderSSOConfig | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([]);
  const [activeTab, setActiveTab] = useState<string>('providers');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerModalVisible, setProviderModalVisible] = useState(false);
  const [providerForm] = Form.useForm();
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [availableProviderTypes, setAvailableProviderTypes] = useState<SSOProviderType[]>([]);
  const [providerSchemas, setProviderSchemas] = useState<{ [key: string]: ProviderConfigSchema }>({});

  // Load provider information from API
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

  const loadConfiguration = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/aws/sso/multi-provider/config');
      const result = await response.json();

      if (result.success && result.data) {
        const configData = result.data as MultiProviderSSOConfig;
        setConfig(configData);
        setProviders(configData.providers || []);
        form.setFieldsValue({
          version: configData.version,
          defaultProvider: configData.defaultProvider,
          globalSettings: configData.globalSettings
        });
      }

      // Load provider statuses
      await loadProviderStatuses();
    } catch (error) {
      message.error('Failed to load multi-provider SSO configuration');
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  const loadProviderStatuses = async () => {
    try {
      const response = await fetch('/api/aws/sso/multi-provider/authenticate');
      const result = await response.json();

      if (result.success) {
        const { providers } = result.data;
        // Convert provider auth status to provider status format
        const statuses: ProviderStatus[] = providers.map((p: any) => ({
          id: p.providerId,
          type: p.providerType,
          name: p.providerName,
          enabled: p.enabled,
          configured: p.configured,
          healthy: p.healthy,
          lastChecked: new Date(p.lastChecked),
          activeSessions: p.activeSessions,
          error: p.error
        }));
        setProviderStatuses(statuses);
      }
    } catch (error) {
      console.error('Failed to load provider statuses:', error);
    }
  };

  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const handleSave = async (values: any) => {
    try {
      setLoading(true);

      const multiProviderConfig: MultiProviderSSOConfig = {
        version: values.version || '1.0',
        lastModified: new Date().toISOString(),
        providers: providers,
        defaultProvider: values.defaultProvider,
        globalSettings: {
          security: values.globalSettings?.security || {
            sslVerification: true,
            tokenEncryption: true,
            sessionBinding: true,
            auditLogging: true
          },
          proxy: values.globalSettings?.proxy
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
        message.success('Multi-provider SSO configuration saved successfully');

        if (onSave) {
          await onSave(multiProviderConfig);
        }
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      message.error(`Failed to save multi-provider SSO configuration: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderAdd = () => {
    setEditingProvider(null);
    providerForm.resetFields();
    setProviderModalVisible(true);
  };

  const handleProviderEdit = (provider: ProviderConfig) => {
    setEditingProvider(provider);
    providerForm.setFieldsValue(provider);
    setProviderModalVisible(true);
  };

  const handleProviderDelete = async (providerId: string) => {
    try {
      setLoading(true);

      // Call DELETE API to remove provider from config
      const response = await fetch(`/api/aws/sso/multi-provider/config?providerId=${encodeURIComponent(providerId)}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        // Update local state only after successful API call
        const updatedProviders = providers.filter(p => p.id !== providerId);
        setProviders(updatedProviders);

        // Invalidate related queries to update other components
        queryClient.invalidateQueries({ queryKey: ['multi-provider-sso-config'] });
        queryClient.invalidateQueries({ queryKey: ['aws-profiles-unified'] });
        queryClient.invalidateQueries({ queryKey: ['sso-profile-detection'] });

        message.success('Provider successfully removed from configuration');
      } else {
        throw new Error(result.error || 'Failed to remove provider');
      }
    } catch (error) {
      console.error('Failed to remove provider:', error);
      message.error(`Failed to remove provider: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderModalSave = async (values: ProviderFormData) => {
    try {
      setLoading(true);
      
      // Basic client-side validation
      if (!values.id || !values.type || !values.name) {
        message.error('Provider ID, type, and name are required');
        return;
      }

      let updatedProviders: ProviderConfig[];

      if (editingProvider) {
        // Update existing provider
        updatedProviders = providers.map(p =>
          p.id === editingProvider.id ? values as ProviderConfig : p
        );
        setProviders(updatedProviders);
      } else {
        // Add new provider
        if (providers.some(p => p.id === values.id)) {
          message.error('Provider ID must be unique');
          return;
        }
        updatedProviders = [...providers, values as ProviderConfig];
        setProviders(updatedProviders);
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

  const renderProviderSettings = (providerType: SSOProviderType) => {
    const schema = providerSchemas[providerType];
    if (!schema) return null;

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
  };

  const getProviderStatusIcon = (providerId: string) => {
    const status = providerStatuses.find(s => s.id === providerId);
    if (!status) return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;

    if (status.configured && status.healthy) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    } else if (status.configured) {
      return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
    } else {
      return <InfoCircleOutlined style={{ color: '#d9d9d9' }} />;
    }
  };

  const getProviderStatusText = (providerId: string) => {
    const status = providerStatuses.find(s => s.id === providerId);
    if (!status) return 'Unknown';

    if (status.configured && status.healthy) {
      return 'Ready';
    } else if (status.configured && !status.healthy) {
      return 'Error';
    } else {
      return 'Not Configured';
    }
  };

  if (loading && !config) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading multi-provider SSO configuration...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card>


      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'providers',
            label: (
              <span>
                <SettingOutlined />
                &nbsp;Providers ({providers.length})
              </span>
            ),
            children: (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Button
                    type="primary"
                    onClick={handleProviderAdd}
                    icon={<PlusOutlined />}
                  >
                    Add SSO Provider
                  </Button>
                </div>

                {providers.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No SSO providers configured"
                  >
                    <Button type="primary" onClick={handleProviderAdd}>
                      Add Your First Provider
                    </Button>
                  </Empty>
                ) : (
                  <List
                    dataSource={providers}
                    renderItem={(provider) => (
                      <List.Item
                        actions={[
                          <Button
                            key="edit"
                            type="link"
                            onClick={() => handleProviderEdit(provider)}
                            icon={<SettingOutlined />}
                          >
                            Configure
                          </Button>,
                          <Popconfirm
                            key="delete"
                            title="Are you sure you want to remove this provider?"
                            onConfirm={() => handleProviderDelete(provider.id)}
                            okText="Yes"
                            cancelText="No"
                          >
                            <Button type="link" danger icon={<DeleteOutlined />}>
                              Remove
                            </Button>
                          </Popconfirm>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={getProviderStatusIcon(provider.id)}
                          title={
                            <Space>
                              <span>{provider.name}</span>
                              <Tag color={provider.type === 'SAML' ? 'blue' : provider.type === 'AWS_SSO' ? 'green' : 'purple'}>
                                {provider.type}
                              </Tag>
                              <Badge
                                status={getProviderStatusText(provider.id) === 'Ready' ? 'success' :
                                  getProviderStatusText(provider.id) === 'Error' ? 'error' : 'default'}
                                text={getProviderStatusText(provider.id)}
                              />
                            </Space>
                          }
                          description={
                            <Space direction="vertical" size="small">
                              <Text type="secondary">ID: {provider.id}</Text>
                              <Text type="secondary">Status: {getProviderStatusText(provider.id)}</Text>
                              {provider.settings.startUrl && (
                                <Text type="secondary">URL: {provider.settings.startUrl}</Text>
                              )}
                            </Space>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            )
          },
          {
            key: 'global',
            label: (
              <span>
                <CheckCircleOutlined />
                &nbsp;Global Settings
              </span>
            ),
            children: (
              <Form
                form={form}
                layout="vertical"
                onFinish={handleSave}
                initialValues={{
                  version: '1.0',
                  globalSettings: {
                    security: {
                      sslVerification: true,
                      tokenEncryption: true,
                      sessionBinding: true,
                      auditLogging: true
                    }
                  }
                }}
              >
                <Row gutter={[16, 0]}>
                  <Col span={12}>
                    <Form.Item
                      label="Default Provider"
                      name="defaultProvider"
                      tooltip="The provider to use by default when multiple providers are available"
                    >
                      <Select placeholder="Select default provider" allowClear>
                        {providers.map(provider => (
                          <Option key={provider.id} value={provider.id}>
                            {provider.name} ({provider.type})
                          </Option>
                        ))}
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>

                <Divider>Global Security Settings</Divider>

                <Row gutter={[16, 0]}>
                  <Col span={12}>
                    <Form.Item
                      label="SSL Verification"
                      name={['globalSettings', 'security', 'sslVerification']}
                      valuePropName="checked"
                      tooltip="Verify SSL certificates for all provider connections"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Token Encryption"
                      name={['globalSettings', 'security', 'tokenEncryption']}
                      valuePropName="checked"
                      tooltip="Encrypt authentication tokens at rest"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={[16, 0]}>
                  <Col span={12}>
                    <Form.Item
                      label="Session Binding"
                      name={['globalSettings', 'security', 'sessionBinding']}
                      valuePropName="checked"
                      tooltip="Bind sessions to client IP and user agent"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label="Audit Logging"
                      name={['globalSettings', 'security', 'auditLogging']}
                      valuePropName="checked"
                      tooltip="Log all authentication events for security monitoring"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                </Row>

                <Divider>Global Proxy Settings</Divider>

                <Row gutter={[16, 0]}>
                  <Col span={8}>
                    <Form.Item
                      label="Enable Proxy"
                      name={['globalSettings', 'proxy', 'enabled']}
                      valuePropName="checked"
                      tooltip="Use proxy for all provider connections"
                    >
                      <Switch />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item
                      label="Proxy URL"
                      name={['globalSettings', 'proxy', 'url']}
                      tooltip="HTTP/HTTPS proxy server URL"
                    >
                      <Input placeholder="https://proxy.company.com:3131" />
                    </Form.Item>
                  </Col>
                </Row>

                <div style={{ marginTop: 24, textAlign: 'right' }}>
                  <Space>
                    <Button
                      onClick={loadConfiguration}
                      icon={<ReloadOutlined />}
                    >
                      Reload
                    </Button>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      icon={<SaveOutlined />}
                    >
                      Save Configuration
                    </Button>
                  </Space>
                </div>
              </Form>
            )
          }
        ]}
      />

      {/* Provider Configuration Modal */}
      <Modal
        title={editingProvider ? 'Edit SSO Provider' : 'Add SSO Provider'}
        open={providerModalVisible}
        onCancel={() => {
          setProviderModalVisible(false);
          providerForm.resetFields();
          setEditingProvider(null);
        }}
        footer={null}
        width={800}
        destroyOnHidden
      >
        <Form
          form={providerForm}
          layout="vertical"
          onFinish={handleProviderModalSave}
          initialValues={{
            enabled: true,
            security: {
              sslVerification: true,
              tokenEncryption: true,
              sessionBinding: true,
              auditLogging: true
            }
          }}
        >
          <Row gutter={[16, 0]}>
            <Col span={12}>
              <Form.Item
                label="Provider ID"
                name="id"
                rules={[{ required: true, message: 'Provider ID is required' }]}
                tooltip="Unique identifier for this provider"
              >
                <Input placeholder="my-company-saml" disabled={!!editingProvider} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Provider Type"
                name="type"
                rules={[{ required: true, message: 'Provider type is required' }]}
                tooltip="The authentication protocol this provider uses"
              >
                <Select placeholder="Select provider type" disabled={!!editingProvider}>
                  {availableProviderTypes.map(type => (
                    <Option key={type} value={type}>
                      {type} - {type === 'SAML' ? 'SAML 2.0' : type === 'AWS_SSO' ? 'AWS Identity Center' : 'OpenID Connect'}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col span={16}>
              <Form.Item
                label="Provider Name"
                name="name"
                rules={[{ required: true, message: 'Provider name is required' }]}
                tooltip="Display name for this provider"
              >
                <Input placeholder="My Company SSO" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Enabled"
                name="enabled"
                valuePropName="checked"
                tooltip="Enable this provider for authentication"
              >
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Divider>Provider Settings</Divider>

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.type !== currentValues.type}>
            {({ getFieldValue }) => {
              const selectedType = getFieldValue('type');
              return selectedType ? renderProviderSettings(selectedType) : null;
            }}
          </Form.Item>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Space>
              <Button onClick={() => setProviderModalVisible(false)}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                {editingProvider ? 'Update Provider' : 'Add Provider'}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </Card>
  );
}