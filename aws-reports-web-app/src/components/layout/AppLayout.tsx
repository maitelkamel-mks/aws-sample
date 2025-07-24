'use client';

import { Layout, Menu, Typography, Button, message, Modal, Form, Input, Alert, Table } from 'antd';
import { HomeOutlined, DollarOutlined, SecurityScanOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined, LoginOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useState, useEffect, useCallback } from 'react';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentialsForm] = Form.useForm();
  const [errorAlert, setErrorAlert] = useState<string | null>(null);
  const [showRoleSelection, setShowRoleSelection] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<any[]>([]);
  const [existingProfiles, setExistingProfiles] = useState<any[]>([]);
  const [currentSamlAssertion, setCurrentSamlAssertion] = useState<string | null>(null);

  // Load SSO configuration
  const loadSSOConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/aws/sso/config');
      const result = await response.json();
      
      if (result.success && result.data) {
        setSsoEnabled(result.data.enabled || false);
      }
    } catch (error) {
      // Silently fail - SSO might not be configured
      setSsoEnabled(false);
    }
  }, []);

  // Load collapse state from localStorage on mount and load SSO config
  useEffect(() => {
    const savedCollapsed = localStorage.getItem('sidebar-collapsed');
    if (savedCollapsed !== null) {
      setCollapsed(JSON.parse(savedCollapsed));
    }
    loadSSOConfig();
  }, [loadSSOConfig]);

  // Save collapse state to localStorage whenever it changes
  const handleCollapse = (value: boolean) => {
    setCollapsed(value);
    localStorage.setItem('sidebar-collapsed', JSON.stringify(value));
  };

  // Handle SSO login
  const handleSSOLogin = async () => {
    try {
      setSsoLoading(true);
      
      // Get SSO configuration first
      const configResponse = await fetch('/api/aws/sso/config');
      const configResult = await configResponse.json();
      
      if (!configResult.success || !configResult.data) {
        throw new Error('SSO not configured');
      }
      
      const ssoConfig = configResult.data;
      
      // Check if authentication type is SAML (which requires username/password)
      if (ssoConfig.authenticationType === 'SAML') {
        // Show credentials modal for SAML authentication
        setShowCredentialsModal(true);
        setSsoLoading(false);
        return;
      }
      
      // Perform direct SSO login for other authentication types
      await performSSOLogin(ssoConfig);
    } catch (error) {
      const errorMessage = `SSO login failed: ${error}`;
      message.error(errorMessage);
      setErrorAlert(errorMessage);
      setSsoLoading(false);
    }
  };

  // Perform the actual SSO login API call
  const performSSOLogin = async (ssoConfig: any, credentials?: { username: string; password: string }) => {
    try {
      const response = await fetch('/api/aws/sso/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startUrl: ssoConfig.startUrl,
          region: ssoConfig.region || 'us-east-1',
          providerName: ssoConfig.providerName,
          ...(credentials && { 
            username: credentials.username, 
            password: credentials.password 
          })
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        if (result.data?.roles && result.data.roles.length > 0) {
          // Load current configuration to check existing profiles
          const configResponse = await fetch('/api/aws/sso/config');
          const configResult = await configResponse.json();
          const currentProfiles = configResult.success ? (configResult.data?.profiles || []) : [];
          
          // Store SAML assertion for credential retrieval
          setCurrentSamlAssertion(result.data.samlAssertion || null);
          
          // Show role selection modal
          setAvailableRoles(result.data.roles);
          setExistingProfiles(currentProfiles);
          setShowRoleSelection(true);
          setShowCredentialsModal(false);
          credentialsForm.resetFields();
          setErrorAlert(null);
          message.success(`SSO login successful! Found ${result.data.roles.length} available roles.`);
        } else {
          message.success('SSO login successful!');
          setShowCredentialsModal(false);
          credentialsForm.resetFields();
          setErrorAlert(null);
        }
      } else {
        throw new Error(result.error || 'SSO login failed');
      }
    } catch (error) {
      const errorMessage = `SSO login failed: ${error}`;
      message.error(errorMessage);
      setErrorAlert(errorMessage);
      throw error;
    } finally {
      setSsoLoading(false);
    }
  };

  // Handle credentials form submission
  const handleCredentialsSubmit = async (values: { username: string; password: string }) => {
    try {
      setSsoLoading(true);
      
      const configResponse = await fetch('/api/aws/sso/config');
      const configResult = await configResponse.json();
      
      if (!configResult.success || !configResult.data) {
        throw new Error('SSO not configured');
      }
      
      await performSSOLogin(configResult.data, values);
    } catch (error) {
      // Error is already handled in performSSOLogin
    }
  };

  // Handle role selection confirmation
  const handleRoleSelection = async (selectedRolesWithNames: any[]) => {
    try {
      // Save selected roles to SSO configuration
      const configResponse = await fetch('/api/aws/sso/config');
      const configResult = await configResponse.json();
      
      if (!configResult.success || !configResult.data) {
        throw new Error('SSO configuration not found');
      }
      
      const currentConfig = configResult.data;
      
      // Update existing profiles or add new ones
      const existingProfiles = currentConfig.profiles || [];
      const updatedProfiles = [...existingProfiles];
      
      selectedRolesWithNames.forEach((role: any) => {
        const existingIndex = updatedProfiles.findIndex(
          (p: any) => p.accountId === role.accountId && p.roleName === role.roleName
        );
        
        if (existingIndex >= 0) {
          // Update existing profile with new name
          updatedProfiles[existingIndex] = { ...updatedProfiles[existingIndex], name: role.name };
        } else {
          // Add new profile
          updatedProfiles.push(role);
        }
      });
      
      const updatedConfig = {
        ...currentConfig,
        profiles: updatedProfiles
      };
      
      const saveResponse = await fetch('/api/aws/sso/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config: updatedConfig }),
      });
      
      const saveResult = await saveResponse.json();
      
      if (saveResult.success) {
        // Now retrieve STS tokens and update AWS credentials
        const credentialsResponse = await fetch('/api/aws/sso/credentials', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            selectedRoles: selectedRolesWithNames,
            samlAssertion: currentSamlAssertion
          }),
        });
        
        const credentialsResult = await credentialsResponse.json();
        
        if (credentialsResult.success) {
          const updatedProfiles = credentialsResult.data?.updatedProfiles || [];
          setShowRoleSelection(false);
          setAvailableRoles([]);
          message.success(`Updated ${selectedRolesWithNames.length} role(s) in configuration and retrieved AWS credentials for ${updatedProfiles.length} profile(s)`);
        } else {
          // Configuration was saved but credentials update failed
          setShowRoleSelection(false);
          setAvailableRoles([]);
          message.warning(`Updated ${selectedRolesWithNames.length} role(s) in configuration, but failed to update AWS credentials: ${credentialsResult.error}`);
        }
      } else {
        throw new Error(saveResult.error || 'Failed to save roles');
      }
    } catch (error) {
      message.error(`Failed to save roles: ${error}`);
    }
  };

  // Cancel role selection
  const cancelRoleSelection = () => {
    setShowRoleSelection(false);
    setAvailableRoles([]);
  };

  const menuItems = [
    {
      key: '/',
      icon: <HomeOutlined />,
      label: 'Home',
    },
    {
      key: '/cost',
      icon: <DollarOutlined />,
      label: 'Cost Reports',
    },
    {
      key: '/security',
      icon: <SecurityScanOutlined />,
      label: 'Security Hub',
    },
    {
      key: '/config',
      icon: <SettingOutlined />,
      label: 'Configuration',
    },
    ...(ssoEnabled ? [{
      key: 'sso-login',
      icon: <LoginOutlined />,
      label: 'SSO Login',
    }] : []),
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'sso-login') {
      handleSSOLogin();
    } else {
      router.push(key);
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        width={250} 
        theme="dark" 
        collapsible 
        collapsed={collapsed}
        onCollapse={handleCollapse}
        trigger={null}
      >
        <div style={{ padding: '16px', textAlign: 'center' }}>
          <Title level={4} style={{ color: 'white', margin: 0, fontSize: collapsed ? '14px' : '16px' }}>
            {collapsed ? 'AWS' : 'AWS Reports'}
          </Title>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => handleCollapse(!collapsed)}
              style={{ marginRight: '16px', fontSize: '16px' }}
            />
            <Title level={3} style={{ margin: 0 }}>
              AWS Reports Portal
            </Title>
          </div>
        </Header>
        <Content style={{ margin: '24px', background: '#fff', padding: '24px' }}>
          {children}
        </Content>
      </Layout>

      {/* SAML Credentials Modal */}
      <Modal
        title="SAML Authentication"
        open={showCredentialsModal}
        onCancel={() => {
          setShowCredentialsModal(false);
          credentialsForm.resetFields();
          setSsoLoading(false);
          setErrorAlert(null);
        }}
        footer={null}
        width={400}
      >
        {errorAlert && (
          <Alert
            message="Authentication Error"
            description={errorAlert}
            type="error"
            closable
            onClose={() => setErrorAlert(null)}
            style={{ marginBottom: 16 }}
          />
        )}
        
        <Form
          form={credentialsForm}
          layout="vertical"
          onFinish={handleCredentialsSubmit}
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: 'Please enter your username' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="Enter your username"
              autoComplete="username"
            />
          </Form.Item>
          
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Please enter your password' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
          </Form.Item>
          
          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                onClick={() => {
                  setShowCredentialsModal(false);
                  credentialsForm.resetFields();
                  setSsoLoading(false);
                  setErrorAlert(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={ssoLoading}
                icon={<LoginOutlined />}
              >
                Login
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>

      {/* Role Selection Modal */}
      <Modal
        title="Select AWS Roles to Add"
        open={showRoleSelection}
        onCancel={cancelRoleSelection}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Typography.Text>
            Select the AWS roles you want to add to your SSO configuration. 
            These roles will be saved for automatic login.
          </Typography.Text>
        </div>
        
        <RoleSelectionTable
          roles={availableRoles}
          onConfirm={handleRoleSelection}
          onCancel={cancelRoleSelection}
          existingProfiles={existingProfiles}
        />
      </Modal>
    </Layout>
  );
}

// Role Selection Component
interface RoleSelectionTableProps {
  roles: any[];
  existingProfiles: any[];
  onConfirm: (selectedRoles: any[]) => void;
  onCancel: () => void;
}

function RoleSelectionTable({ roles, existingProfiles, onConfirm, onCancel }: RoleSelectionTableProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [profileNames, setProfileNames] = useState<{ [key: number]: string }>({});

  // Initialize selected rows and profile names based on existing profiles
  useEffect(() => {
    const preselectedKeys: React.Key[] = [];
    const initialNames: { [key: number]: string } = {};

    roles.forEach((role, index) => {
      const existingProfile = existingProfiles.find(
        (p: any) => p.accountId === role.accountId && p.roleName === role.roleName
      );
      
      if (existingProfile) {
        preselectedKeys.push(index);
        initialNames[index] = existingProfile.name;
      } else {
        // Generate default name for new roles
        initialNames[index] = `${role.accountId}-${role.roleName}`;
      }
    });

    setSelectedRowKeys(preselectedKeys);
    setProfileNames(initialNames);
  }, [roles, existingProfiles]);

  const columns = [
    {
      title: 'Account ID',
      dataIndex: 'accountId',
      key: 'accountId',
      width: 150,
    },
    {
      title: 'Role Name',
      dataIndex: 'roleName',
      key: 'roleName',
      width: 200,
    },
    {
      title: 'Region',
      dataIndex: 'region',
      key: 'region',
      width: 100,
    },
    {
      title: 'Profile Name',
      key: 'profileName',
      width: 250,
      render: (_: any, record: any, index: number) => (
        <Input
          value={profileNames[index] || ''}
          onChange={(e) => {
            setProfileNames(prev => ({
              ...prev,
              [index]: e.target.value
            }));
          }}
          placeholder="Enter profile name"
          disabled={!selectedRowKeys.includes(index)}
        />
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => {
      setSelectedRowKeys(keys);
    },
    onSelectAll: (selected: boolean) => {
      if (selected) {
        setSelectedRowKeys(roles.map((_, index) => index));
      } else {
        setSelectedRowKeys([]);
      }
    },
  };

  const handleConfirm = () => {
    const selectedRoles = selectedRowKeys.map(key => {
      const role = roles[Number(key)];
      return {
        ...role,
        name: profileNames[Number(key)] || `${role.accountId}-${role.roleName}`,
        type: 'sso'
      };
    });
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
        size="small"
      />
      
      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button onClick={onCancel} style={{ marginRight: 8 }}>
          Cancel
        </Button>
        <Button 
          type="primary" 
          onClick={handleConfirm}
          disabled={selectedRowKeys.length === 0}
        >
          Save Selected Profiles ({selectedRowKeys.length})
        </Button>
      </div>
    </div>
  );
}