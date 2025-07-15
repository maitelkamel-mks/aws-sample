'use client';

import { useState, useEffect } from 'react';
import { Form, Input, Switch, Button, Alert, Typography, Space, Divider, Tag, Spin } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, GlobalOutlined } from '@ant-design/icons';
import { ProxyConfig, ProxyFormData, ProxyStatus, ProxyEnvironmentDetection, ProxyTestResult } from '@/lib/types/proxy';

const { Title, Text } = Typography;
const { TextArea } = Input;

interface ProxyConfigFormProps {
  onSave?: (config: ProxyConfig) => void;
}

export default function ProxyConfigForm({ onSave }: ProxyConfigFormProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [proxyStatus, setProxyStatus] = useState<ProxyStatus | null>(null);
  const [envDetection, setEnvDetection] = useState<ProxyEnvironmentDetection | null>(null);
  const [testResult, setTestResult] = useState<ProxyTestResult | null>(null);

  useEffect(() => {
    loadProxyConfig();
  }, []);

  const loadProxyConfig = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/config/proxy');
      const data = await response.json();
      
      if (data.success) {
        const config = data.data.config;
        const status = data.data.status;
        const environment = data.data.environment;
        
        setProxyStatus(status);
        setEnvDetection({
          httpProxy: environment.httpProxy,
          httpsProxy: environment.httpsProxy,
          noProxy: environment.noProxy,
          detected: !!(environment.httpProxy || environment.httpsProxy),
        });
        
        // Set form values
        form.setFieldsValue({
          enabled: config?.enabled || false,
          url: config?.url || '',
          username: config?.username || '',
          password: config?.password || '',
          no_proxy: config?.no_proxy?.join(', ') || '',
        });
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: ProxyFormData) => {
    setSaving(true);
    try {
      const proxyConfig: ProxyConfig = {
        enabled: values.enabled,
        url: values.enabled ? values.url : undefined,
        username: values.enabled && values.username ? values.username : undefined,
        password: values.enabled && values.password ? values.password : undefined,
        no_proxy: values.enabled && values.no_proxy 
          ? values.no_proxy.split(',').map(s => s.trim()).filter(Boolean)
          : undefined,
      };

      const response = await fetch('/api/config/proxy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(proxyConfig),
      });

      const data = await response.json();
      
      if (data.success) {
        onSave?.(proxyConfig);
        await loadProxyConfig(); // Refresh status
      } else {
        throw new Error(data.error || 'Failed to save proxy configuration');
      }
    } catch (error) {
      console.error('Failed to save proxy config:', error);
      // You might want to show a notification here
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      const values = form.getFieldsValue();
      
      if (!values.url) {
        setTestResult({
          success: false,
          error: 'Proxy URL is required for testing',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const response = await fetch('/api/config/proxy?action=test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: values.url,
          username: values.username,
          password: values.password,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setTestResult(data.data);
      } else {
        setTestResult({
          success: false,
          error: data.error || 'Test failed',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      setTestResult({
        success: false,
        error: error instanceof Error ? error.message : 'Test failed',
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  const renderStatusInfo = () => {
    if (!proxyStatus) return null;

    const getStatusColor = (source: string) => {
      switch (source) {
        case 'config': return 'green';
        case 'environment': return 'blue';
        case 'ui': return 'purple';
        default: return 'default';
      }
    };

    const getStatusIcon = (configured: boolean) => {
      return configured ? <CheckCircleOutlined /> : <CloseCircleOutlined />;
    };

    return (
      <Alert
        type={proxyStatus.configured ? 'success' : 'info'}
        icon={getStatusIcon(proxyStatus.configured)}
        message={
          <Space>
            <span>Proxy Status: {proxyStatus.configured ? 'Configured' : 'Not Configured'}</span>
            {proxyStatus.configured && (
              <Tag color={getStatusColor(proxyStatus.source)}>
                {proxyStatus.source.toUpperCase()}
              </Tag>
            )}
          </Space>
        }
        description={
          <>
            {proxyStatus.configured && proxyStatus.url && (
              <div>Current proxy: {proxyStatus.url}</div>
            )}
            {envDetection?.detected && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary">Environment variables detected:</Text>
                <ul style={{ margin: '4px 0' }}>
                  {envDetection.httpProxy && <li>HTTP_PROXY: {envDetection.httpProxy}</li>}
                  {envDetection.httpsProxy && <li>HTTPS_PROXY: {envDetection.httpsProxy}</li>}
                  {envDetection.noProxy && <li>NO_PROXY: {envDetection.noProxy}</li>}
                </ul>
              </div>
            )}
          </>
        }
        style={{ marginBottom: 16 }}
      />
    );
  };

  const renderTestResult = () => {
    if (!testResult) return null;

    return (
      <Alert
        type={testResult.success ? 'success' : 'error'}
        icon={testResult.success ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        message={testResult.success ? 'Connection Test Successful' : 'Connection Test Failed'}
        description={
          <>
            {testResult.success && testResult.responseTime && (
              <div>Response time: {testResult.responseTime}ms</div>
            )}
            {testResult.error && <div>Error: {testResult.error}</div>}
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">Tested at: {new Date(testResult.timestamp).toLocaleString()}</Text>
            </div>
          </>
        }
        style={{ marginBottom: 16 }}
      />
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>Loading proxy configuration...</div>
      </div>
    );
  }

  return (
    <div>
      <Title level={3}>
        <GlobalOutlined style={{ marginRight: 8 }} />
        Proxy Configuration
      </Title>
      
      <Text type="secondary">
        Configure proxy settings for all AWS API calls. Settings here will take priority over environment variables.
      </Text>

      <Divider />

      {renderStatusInfo()}
      {renderTestResult()}

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          enabled: false,
          url: '',
          username: '',
          password: '',
          no_proxy: '',
        }}
      >
        <Form.Item
          name="enabled"
          label="Enable Proxy"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>

        <Form.Item
          noStyle
          shouldUpdate={(prevValues, currentValues) => 
            prevValues.enabled !== currentValues.enabled
          }
        >
          {({ getFieldValue }) => {
            const enabled = getFieldValue('enabled');
            
            return enabled ? (
              <>
                <Form.Item
                  name="url"
                  label="Proxy URL"
                  rules={[
                    { required: true, message: 'Proxy URL is required' },
                    { type: 'url', message: 'Please enter a valid URL' },
                  ]}
                >
                  <Input 
                    placeholder="http://proxy.company.com:8080" 
                    prefix={<GlobalOutlined />}
                  />
                </Form.Item>

                <Form.Item
                  name="username"
                  label="Username (optional)"
                >
                  <Input placeholder="proxy-username" />
                </Form.Item>

                <Form.Item
                  name="password"
                  label="Password (optional)"
                >
                  <Input.Password placeholder="proxy-password" />
                </Form.Item>

                <Form.Item
                  name="no_proxy"
                  label="No Proxy Domains (optional)"
                  tooltip="Comma-separated list of domains to bypass proxy"
                >
                  <TextArea 
                    placeholder="localhost, *.internal.com, 192.168.1.0/24"
                    rows={3}
                  />
                </Form.Item>

                <Form.Item>
                  <Space>
                    <Button 
                      type="default" 
                      onClick={handleTestConnection}
                      loading={testing}
                      icon={<SyncOutlined />}
                    >
                      Test Connection
                    </Button>
                  </Space>
                </Form.Item>
              </>
            ) : null;
          }}
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              Save Configuration
            </Button>
            <Button onClick={() => form.resetFields()}>
              Reset
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}