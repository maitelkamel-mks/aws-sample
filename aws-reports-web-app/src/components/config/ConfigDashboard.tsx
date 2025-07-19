'use client';

import { Card, Tabs, Typography, Alert } from 'antd';
import CostConfigForm from './CostConfigForm';
import SecurityConfigForm from './SecurityConfigForm';
import ProfilesDisplay from './ProfilesDisplay';
import ProxyConfigForm from './ProxyConfigForm';
import SSOConfigForm from './SSOConfigForm';

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
      label: 'SSO Configuration',
      children: <SSOConfigForm />,
    },
    {
      key: '3',
      label: 'Cost Configuration',
      children: <CostConfigForm />,
    },
    {
      key: '4',
      label: 'Security Configuration',
      children: <SecurityConfigForm />,
    },
    {
      key: '5',
      label: 'Proxy Settings',
      children: <ProxyConfigForm />,
    },
  ];

  return (
    <div>
      <Title level={2}>Configuration</Title>

      <Card>
        <Tabs defaultActiveKey="1" items={items} />
      </Card>
    </div>
  );
}