'use client';

import { Card, Tabs, Typography, Alert } from 'antd';
import CostConfigForm from './CostConfigForm';
import SecurityConfigForm from './SecurityConfigForm';
import ProfilesDisplay from './ProfilesDisplay';

const { Title } = Typography;

export default function ConfigDashboard() {
  const items = [
    {
      key: '1',
      label: 'AWS Profiles',
      children: <ProfilesDisplay />,
    },
    {
      key: '2',
      label: 'Cost Configuration',
      children: <CostConfigForm />,
    },
    {
      key: '3',
      label: 'Security Configuration',
      children: <SecurityConfigForm />,
    },
  ];

  return (
    <div>
      <Title level={2}>Configuration</Title>
      
      <Alert
        message="Default Report Configuration"
        description="Manage AWS profiles and configure default settings for report generation. These configurations will be saved as defaults and can be loaded when generating cost and security reports."
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />

      <Card>
        <Tabs defaultActiveKey="1" items={items} />
      </Card>
    </div>
  );
}