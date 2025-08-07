'use client';

import {
  Modal,
  Table,
  Input,
  Button,
  Typography,
  Space,
  Checkbox,
  Tag,
  Alert,
  Row,
  Col,
  Card
} from 'antd';
import {
  UserOutlined,
  EditOutlined,
  SaveOutlined
} from '@ant-design/icons';
import { useState, useEffect, useCallback } from 'react';
import { SSOProfile } from '@/lib/types/sso-providers';

const { Title, Text } = Typography;

interface RoleSelectionModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (selectedRoles: SelectedRole[]) => void;
  discoveredRoles: SSOProfile[];
  providerName: string;
  existingProfiles?: SSOProfile[];
  loading?: boolean;
}

interface SelectedRole {
  originalRole: SSOProfile;
  customName: string;
  selected: boolean;
  alreadyExists: boolean;
}

export default function RoleSelectionModal({
  visible,
  onCancel,
  onConfirm,
  discoveredRoles,
  providerName,
  existingProfiles = [],
  loading = false
}: RoleSelectionModalProps) {
  const [selectedRoles, setSelectedRoles] = useState<SelectedRole[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // Check if a role already exists in the existing profiles
  const checkRoleExists = useCallback((role: SSOProfile): boolean => {
    return existingProfiles.some(existing =>
      existing.accountId === role.accountId &&
      existing.roleName === role.roleName
    );
  }, [existingProfiles]);

  // Get the existing profile name for a role
  const getExistingProfileName = useCallback((role: SSOProfile): string | null => {
    const existing = existingProfiles.find(existing =>
      existing.accountId === role.accountId &&
      existing.roleName === role.roleName
    );
    return existing ? existing.name : null;
  }, [existingProfiles]);

  // Initialize selected roles when modal opens or roles change
  useEffect(() => {
    if (discoveredRoles.length > 0) {
      const initialized = discoveredRoles.map(role => {
        const alreadyExists = checkRoleExists(role);
        return {
          originalRole: role,
          customName: role.name, // Default to original name
          selected: false,
          alreadyExists
        };
      });
      setSelectedRoles(initialized);
    }
  }, [discoveredRoles, existingProfiles, checkRoleExists, getExistingProfileName]);

  const handleSelectAll = (checked: boolean) => {
    setSelectAll(checked);
    setSelectedRoles(prev => prev.map(role => ({
      ...role,
      selected: checked
    })));
  };

  const handleRoleSelect = (roleKey: string, checked: boolean) => {
    setSelectedRoles(prev => {
      const updated = prev.map(role => {
        const key = `${role.originalRole.accountId}-${role.originalRole.roleName}`;
        if (key === roleKey) {
          return { ...role, selected: checked };
        }
        return role;
      });

      // Update select all state
      const allSelected = updated.every(role => role.selected);
      setSelectAll(allSelected);

      return updated;
    });
  };

  const handleNameChange = (roleKey: string, newName: string) => {
    setSelectedRoles(prev => {
      return prev.map(role => {
        const key = `${role.originalRole.accountId}-${role.originalRole.roleName}`;
        if (key === roleKey) {
          return { ...role, customName: newName };
        }
        return role;
      });
    });
  };

  const handleConfirm = () => {
    const selected = selectedRoles.filter(role => role.selected);
    onConfirm(selected);
  };

  const selectedCount = selectedRoles.filter(role => role.selected).length;

  const columns = [
    {
      title: (
        <Checkbox
          checked={selectAll}
          indeterminate={selectedCount > 0 && selectedCount < selectedRoles.length}
          onChange={(e) => handleSelectAll(e.target.checked)}
        >
          Select All
        </Checkbox>
      ),
      dataIndex: 'selected',
      width: 120,
      render: (_: any, record: SelectedRole) => {
        const roleKey = `${record.originalRole.accountId}-${record.originalRole.roleName}`;
        return (
          <Space>
            <Checkbox
              checked={record.selected}
              onChange={(e) => handleRoleSelect(roleKey, e.target.checked)}
              disabled={record.alreadyExists}
            />
          </Space>
        );
      },
    },
    {
      title: 'AWS Account & Role',
      dataIndex: 'originalRole',
      render: (role: SSOProfile, record: SelectedRole) => (
        <Space direction="vertical" size="small">
          <Space>
            <Text strong style={{ color: record.alreadyExists ? '#fa8c16' : 'inherit' }}>
              {role.metadata?.accountName || ''} #{role.accountId}
            </Text>
            <Tag color={record.alreadyExists ? 'orange' : 'blue'}>
              {role.roleName}
            </Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Profile Name',
      dataIndex: 'customName',
      render: (name: string, record: SelectedRole) => {
        if (record.alreadyExists) {
          const existingName = getExistingProfileName(record.originalRole);
          return (
            <Space>
              <Text strong style={{ color: '#fa8c16' }}>
                {existingName || 'Unknown Profile'}
              </Text>
              <Tag color="orange">
                Already Imported
              </Tag>
            </Space>
          );
        }

        const roleKey = `${record.originalRole.accountId}-${record.originalRole.roleName}`;
        return (
          <Input
            value={name}
            onChange={(e) => handleNameChange(roleKey, e.target.value)}
            placeholder="Enter custom profile name"
            prefix={<EditOutlined />}
            disabled={!record.selected}
            style={{
              opacity: record.selected ? 1 : 0.5,
              backgroundColor: record.selected ? 'inherit' : '#f5f5f5'
            }}
          />
        );
      },
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <UserOutlined />
          <span>Select AWS Roles to Import</span>
          <Tag color="green">{providerName}</Tag>
        </Space>
      }
      open={visible}
      onCancel={onCancel}
      width={1000}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Close
        </Button>,
        <Button
          key="confirm"
          type="primary"
          onClick={handleConfirm}
          disabled={selectedCount === 0}
          loading={loading}
          icon={<SaveOutlined />}
        >
          Import {selectedCount} Selected Role{selectedCount !== 1 ? 's' : ''}
        </Button>
      ]}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card size="small" style={{ backgroundColor: '#fafafa' }}>
          <Row gutter={16}>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>
                  {discoveredRoles.length}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Total Found</div>
              </div>
            </Col>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>
                  {selectedCount}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Selected</div>
              </div>
            </Col>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#fa8c16' }}>
                  {selectedRoles.filter(r => r.alreadyExists).length}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>Already Exist</div>
              </div>
            </Col>
            <Col span={6}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#722ed1' }}>
                  {new Set(discoveredRoles.map(r => r.accountId)).size}
                </div>
                <div style={{ color: '#666', fontSize: 12 }}>AWS Accounts</div>
              </div>
            </Col>
          </Row>
        </Card>

        <div>
          <Title level={5}>
            <Space>
              <UserOutlined />
              Discovered AWS Roles
              <Text type="secondary">({discoveredRoles.length} total)</Text>
            </Space>
          </Title>

          <Table
            columns={columns}
            dataSource={selectedRoles}
            rowKey={(record) => `${record.originalRole.accountId}-${record.originalRole.roleName}`}
            pagination={discoveredRoles.length > 10 ? { pageSize: 10 } : false}
            size="middle"
            scroll={{ x: 800 }}
            style={{ marginTop: 16 }}
            rowClassName={(record) => record.alreadyExists ? 'existing-profile-row' : ''}
          />
        </div>

        {selectedCount > 0 && (
          <Alert
            message={`${selectedCount} role${selectedCount !== 1 ? 's' : ''} selected for import`}
            type="info"
            showIcon
          />
        )}
      </Space>

      <style jsx global>{`
        .existing-profile-row {
          background-color: #fff7e6 !important;
        }
        .existing-profile-row:hover {
          background-color: #ffe7ba !important;
        }
      `}</style>
    </Modal>
  );
}