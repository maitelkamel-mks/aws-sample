'use client';

import { Card, Tabs, Typography, Alert } from 'antd';
import CostConfigForm from './CostConfigForm';
import SecurityConfigForm from './SecurityConfigForm';
import ProxyConfigForm from './ProxyConfigForm';
import CLIProfilesDisplay from './CLIProfilesDisplay';
import SSOManagementDashboard from './SSOManagementDashboard';

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
      label: 'SSO Management',
      children: <SSOManagementDashboard />,
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
      <Card>
        <Tabs defaultActiveKey="1" items={items} />
      </Card>
    </div>
  );
}