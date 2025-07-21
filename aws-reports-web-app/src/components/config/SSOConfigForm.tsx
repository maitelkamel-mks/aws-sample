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
  message,
  Spin,
  Modal,
  Checkbox,
  Table
} from 'antd';
import { 
  PlusOutlined, 
  DeleteOutlined, 
  CheckCircleOutlined,
  SaveOutlined,
  ReloadOutlined,
  LoginOutlined 
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { SSOConfiguration, SSOProfile } from '@/lib/types/sso';

const { Title, Text } = Typography;
const { Option } = Select;

interface SSOConfigFormProps {
  onSave?: (config: SSOConfiguration) => Promise<void>;
  onTest?: (config: SSOConfiguration) => Promise<boolean>;
}

export default function SSOConfigForm({ onSave, onTest }: SSOConfigFormProps) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [config, setConfig] = useState<SSOConfiguration | null>(null);
  const [profiles, setProfiles] = useState<SSOProfile[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<SSOProfile[]>([]);
  const [showRoleSelection, setShowRoleSelection] = useState(false);

  const loadConfiguration = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/aws/sso/config');
      const result = await response.json();
      
      if (result.success && result.data) {
        const configData = result.data;
        setConfig(configData);
        setProfiles(configData.profiles || []);
        form.setFieldsValue(configData);
      }
    } catch (error) {
      message.error('Failed to load SSO configuration');
    } finally {
      setLoading(false);
    }
  }, [form]);

  // Load existing configuration
  useEffect(() => {
    loadConfiguration();
  }, [loadConfiguration]);

  const handleSave = async (values: any) => {
    try {
      setLoading(true);
      
      const ssoConfig: SSOConfiguration = {
        ...values,
        profiles: profiles
      };

      // Call API to save configuration
      const response = await fetch('/api/aws/sso/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: ssoConfig }),
      });

      const result = await response.json();
      
      if (result.success) {
        setConfig(ssoConfig);
        message.success('SSO configuration saved successfully');
        
        if (onSave) {
          await onSave(ssoConfig);
        }
      } else {
        throw new Error(result.error || 'Failed to save configuration');
      }
    } catch (error) {
      message.error(`Failed to save SSO configuration: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    try {
      setTestLoading(true);
      
      const values = await form.validateFields();
      const testConfig: SSOConfiguration = {
        ...values,
        profiles: profiles
      };

      if (onTest) {
        const success = await onTest(testConfig);
        if (success) {
          message.success('SSO configuration test successful');
        } else {
          message.error('SSO configuration test failed');
        }
      } else {
        message.info('Test functionality not implemented');
      }
    } catch (error) {
      message.error(`Configuration test failed: ${error}`);
    } finally {
      setTestLoading(false);
    }
  };

  const addProfile = () => {
    const newProfile: SSOProfile = {
      name: `profile-${profiles.length + 1}`,
      accountId: '',
      roleName: '',
      roleArn: '',
      principalArn: '',
      type: 'sso'
    };
    setProfiles([...profiles, newProfile]);
  };

  const updateProfile = (index: number, field: keyof SSOProfile, value: string) => {
    const updatedProfiles = [...profiles];
    updatedProfiles[index] = { ...updatedProfiles[index], [field]: value };
    setProfiles(updatedProfiles);
  };

  const removeProfile = (index: number) => {
    const updatedProfiles = profiles.filter((_, i) => i !== index);
    setProfiles(updatedProfiles);
  };

  const handleLogin = async () => {
    try {
      setLoginLoading(true);
      
      // Validate form to ensure we have the SSO configuration
      const values = await form.validateFields();
      
      // Make SSO login request
      const response = await fetch('/api/aws/sso/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startUrl: values.startUrl,
          region: values.region || 'us-east-1',
          providerName: values.providerName
        }),
      });

      const result = await response.json();
      
      if (result.success && result.data?.roles) {
        // Set available roles and show role selection
        const roleProfiles: SSOProfile[] = result.data.roles.map((role: any, index: number) => ({
          name: `${role.accountName || role.accountId}-${role.roleName}`,
          accountId: role.accountId,
          roleName: role.roleName,
          roleArn: role.roleArn,
          principalArn: role.principalArn || `arn:aws:iam::${role.accountId}:saml-provider/${values.providerName}`,
          description: `${role.accountName || 'Account'} - ${role.roleName}`,
          region: values.region || 'us-east-1',
          type: 'sso'
        }));
        
        setAvailableRoles(roleProfiles);
        setShowRoleSelection(true);
        message.success(`SSO login successful! Found ${roleProfiles.length} available roles.`);
      } else {
        throw new Error(result.error || 'Failed to login and retrieve roles');
      }
    } catch (error) {
      message.error(`SSO login failed: ${error}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRoleSelection = (selectedRoles: SSOProfile[]) => {
    // Add selected roles to the current profiles list
    const updatedProfiles = [...profiles];
    
    selectedRoles.forEach(role => {
      // Check if role already exists (by accountId and roleName)
      const existingIndex = updatedProfiles.findIndex(
        p => p.accountId === role.accountId && p.roleName === role.roleName
      );
      
      if (existingIndex >= 0) {
        // Update existing profile
        updatedProfiles[existingIndex] = role;
      } else {
        // Add new profile
        updatedProfiles.push(role);
      }
    });
    
    setProfiles(updatedProfiles);
    setShowRoleSelection(false);
    setAvailableRoles([]);
    message.success(`Added ${selectedRoles.length} role(s) to configuration`);
  };

  const cancelRoleSelection = () => {
    setShowRoleSelection(false);
    setAvailableRoles([]);
  };

  if (loading && !config) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: '50px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>Loading SSO configuration...</div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ marginBottom: 16 }}>
        <Title level={3}>SSO Configuration</Title>
        <Text type="secondary">
          Configure SAML/SSO authentication settings for enterprise single sign-on.
        </Text>
      </div>

      <Alert
        message="Enterprise SSO Integration"
        description="Configure your organization's SSO endpoint and AWS role mappings. This enables authentication using corporate credentials and automatic AWS credential provisioning."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          enabled: true,
          authenticationType: 'SoftID',
          sessionDuration: 36000,
          region: 'eu-west-1',
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
              label="Enable SSO"
              name="enabled"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Provider Name"
              name="providerName"
              rules={[{ required: true, message: 'Please enter provider name' }]}
            >
              <Input placeholder="e.g., Corporate SSO" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 0]}>
          <Col span={12}>
            <Form.Item
              label="SSO Start URL"
              name="startUrl"
              rules={[
                { required: true, message: 'Please enter SSO start URL' },
                { type: 'url', message: 'Please enter a valid URL' }
              ]}
            >
              <Input placeholder="https://websso-company.com/saml/login" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Authentication Type"
              name="authenticationType"
              rules={[{ required: true, message: 'Please select authentication type' }]}
            >
              <Select>
                <Option value="SoftID">SoftID</Option>
                <Option value="LDAP">LDAP</Option>
                <Option value="OAuth2">OAuth2</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 0]}>
          <Col span={12}>
            <Form.Item
              label="Session Duration (seconds)"
              name="sessionDuration"
              rules={[{ required: true, message: 'Please enter session duration' }]}
            >
              <InputNumber 
                min={900} 
                max={43200} 
                style={{ width: '100%' }}
                placeholder="36000"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Default Region"
              name="region"
              rules={[{ required: true, message: 'Please enter default region' }]}
            >
              <Input placeholder="eu-west-1" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item
          label="SAML Destination"
          name="samlDestination"
        >
          <Input placeholder="urn:amazon:webservices" />
        </Form.Item>

        <Divider>Provider Settings</Divider>

        <Row gutter={[16, 0]}>
          <Col span={12}>
            <Form.Item
              label="Realm"
              name={['providerSettings', 'realm']}
            >
              <Input placeholder="multiauth" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Module"
              name={['providerSettings', 'module']}
            >
              <Input placeholder="SoftID" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={[16, 0]}>
          <Col span={12}>
            <Form.Item
              label="Goto URL"
              name={['providerSettings', 'gotoUrl']}
            >
              <Input placeholder="https://websso-company.com/gardianwebsso/saml2/jsp/idpSSOInit.jsp" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label="Meta Alias"
              name={['providerSettings', 'metaAlias']}
            >
              <Input placeholder="/multiauth/idp6-20261219" />
            </Form.Item>
          </Col>
        </Row>

        <Divider>Proxy Configuration</Divider>

        <Row gutter={[16, 0]}>
          <Col span={8}>
            <Form.Item
              label="Enable Proxy"
              name={['proxy', 'enabled']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item
              label="Proxy URL"
              name={['proxy', 'url']}
            >
              <Input placeholder="https://proxy.company.com:3131" />
            </Form.Item>
          </Col>
        </Row>

        <Divider>Security Settings</Divider>

        <Row gutter={[16, 0]}>
          <Col span={6}>
            <Form.Item
              label="SSL Verification"
              name={['security', 'sslVerification']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="Token Encryption"
              name={['security', 'tokenEncryption']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="Session Binding"
              name={['security', 'sessionBinding']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="Audit Logging"
              name={['security', 'auditLogging']}
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Col>
        </Row>

        <Divider>AWS Role Profiles</Divider>

        <div style={{ marginBottom: 16 }}>
          <Button 
            type="dashed" 
            onClick={addProfile} 
            icon={<PlusOutlined />}
            block
          >
            Add SSO Profile
          </Button>
        </div>

        <List
          dataSource={profiles}
          renderItem={(profile, index) => (
            <List.Item>
              <Card 
                size="small" 
                style={{ width: '100%' }}
                extra={
                  <Popconfirm
                    title="Are you sure you want to delete this profile?"
                    onConfirm={() => removeProfile(index)}
                    okText="Yes"
                    cancelText="No"
                  >
                    <Button type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                }
              >
                <Row gutter={[16, 8]}>
                  <Col span={12}>
                    <Input
                      placeholder="Profile Name"
                      value={profile.name}
                      onChange={(e) => updateProfile(index, 'name', e.target.value)}
                      addonBefore="Name"
                    />
                  </Col>
                  <Col span={12}>
                    <Input
                      placeholder="123456789012"
                      value={profile.accountId}
                      onChange={(e) => updateProfile(index, 'accountId', e.target.value)}
                      addonBefore="Account ID"
                    />
                  </Col>
                  <Col span={12}>
                    <Input
                      placeholder="Role Name"
                      value={profile.roleName}
                      onChange={(e) => updateProfile(index, 'roleName', e.target.value)}
                      addonBefore="Role"
                    />
                  </Col>
                  <Col span={12}>
                    <Input
                      placeholder="eu-west-1"
                      value={profile.region || ''}
                      onChange={(e) => updateProfile(index, 'region', e.target.value)}
                      addonBefore="Region"
                    />
                  </Col>
                  <Col span={24}>
                    <Input
                      placeholder="arn:aws:iam::123456789012:role/RoleName"
                      value={profile.roleArn}
                      onChange={(e) => updateProfile(index, 'roleArn', e.target.value)}
                      addonBefore="Role ARN"
                    />
                  </Col>
                  <Col span={24}>
                    <Input
                      placeholder="arn:aws:iam::123456789012:saml-provider/ProviderName"
                      value={profile.principalArn}
                      onChange={(e) => updateProfile(index, 'principalArn', e.target.value)}
                      addonBefore="Principal ARN"
                    />
                  </Col>
                  <Col span={24}>
                    <Input
                      placeholder="Profile description (optional)"
                      value={profile.description || ''}
                      onChange={(e) => updateProfile(index, 'description', e.target.value)}
                      addonBefore="Description"
                    />
                  </Col>
                </Row>
              </Card>
            </List.Item>
          )}
        />

        <div style={{ marginTop: 24, textAlign: 'right' }}>
          <Space>
            <Button 
              onClick={loadConfiguration}
              icon={<ReloadOutlined />}
            >
              Reload
            </Button>
            <Button 
              onClick={handleLogin}
              loading={loginLoading}
              icon={<LoginOutlined />}
              type="default"
            >
              SSO Login & Get Roles
            </Button>
            <Button 
              onClick={handleTest}
              loading={testLoading}
              icon={<CheckCircleOutlined />}
            >
              Test Configuration
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

      {/* Role Selection Modal */}
      <Modal
        title="Select AWS Roles to Add"
        open={showRoleSelection}
        onCancel={cancelRoleSelection}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Text>
            Select the AWS roles you want to add to your SSO configuration. 
            These roles will be saved for automatic login.
          </Text>
        </div>
        
        <RoleSelectionTable
          roles={availableRoles}
          onConfirm={handleRoleSelection}
          onCancel={cancelRoleSelection}
        />
      </Modal>
    </Card>
  );
}

// Role Selection Component
interface RoleSelectionTableProps {
  roles: SSOProfile[];
  onConfirm: (selectedRoles: SSOProfile[]) => void;
  onCancel: () => void;
}

function RoleSelectionTable({ roles, onConfirm, onCancel }: RoleSelectionTableProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const columns = [
    {
      title: 'Account ID',
      dataIndex: 'accountId',
      key: 'accountId',
    },
    {
      title: 'Role Name',
      dataIndex: 'roleName',
      key: 'roleName',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: 'Region',
      dataIndex: 'region',
      key: 'region',
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    onSelectAll: (selected: boolean, _: any, changeRows: any) => {
      if (selected) {
        setSelectedRowKeys(roles.map((_, index) => index));
      } else {
        setSelectedRowKeys([]);
      }
    },
  };

  const handleConfirm = () => {
    const selectedRoles = selectedRowKeys.map(key => roles[Number(key)]);
    onConfirm(selectedRoles);
  };

  return (
    <div>
      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={roles}
        rowKey={(_, index) => index!}
        pagination={false}
        scroll={{ y: 400 }}
      />
      
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            type="primary" 
            onClick={handleConfirm}
            disabled={selectedRowKeys.length === 0}
          >
            Add Selected Roles ({selectedRowKeys.length})
          </Button>
        </Space>
      </div>
    </div>
  );
}