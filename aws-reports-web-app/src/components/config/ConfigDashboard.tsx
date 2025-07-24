'use client';

import { Card, Tabs, Typography, Alert } from 'antd';
import CostConfigForm from './CostConfigForm';
import SecurityConfigForm from './SecurityConfigForm';
import MultiProviderProfilesDisplay from './MultiProviderProfilesDisplay';
import ProxyConfigForm from './ProxyConfigForm';
import MultiProviderSSOConfigForm from './MultiProviderSSOConfigForm';
import CLIProfilesDisplay from './CLIProfilesDisplay';

const { Title } = Typography;

export default function ConfigDashboard() {
  const items = [
    {
      key: '1',
      label: 'CLI Profiles',
      children: <CLIProfilesDisplay />,
    },
    {
      key: '2',
      label: 'SSO Profiles',
      children: <MultiProviderProfilesDisplay />,
    },
    {
      key: '3',
      label: 'SSO Providers',
      children: <MultiProviderSSOConfigForm />,
    },
    {
      key: '4',
      label: 'Cost Configuration',
      children: <CostConfigForm />,
    },
    {
      key: '5',
      label: 'Security Configuration',
      children: <SecurityConfigForm />,
    },
    {
      key: '6',
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