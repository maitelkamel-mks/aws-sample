'use client';

import { Card, Row, Col, Typography, Button, Space, Alert, List } from 'antd';
import { 
  DollarOutlined, 
  SecurityScanOutlined, 
  SettingOutlined, 
  CloudServerOutlined,
  CheckCircleOutlined,
  RightOutlined 
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

const { Title, Paragraph, Text } = Typography;

export default function HomePage() {
  const router = useRouter();

  const { data: profiles, error: profilesError } = useQuery({
    queryKey: ['aws-profiles'],
    queryFn: async () => {
      const response = await fetch('/api/aws/profiles');
      if (!response.ok) throw new Error('Failed to fetch AWS profiles');
      const result = await response.json();
      return result.data as string[];
    },
  });

  const features = [
    {
      icon: <DollarOutlined style={{ fontSize: '24px', color: '#1890ff' }} />,
      title: 'Cost Analysis',
      description: 'Generate detailed AWS cost reports with multi-account support, service breakdowns, and time-series analysis.',
      action: () => router.push('/cost'),
      buttonText: 'Generate Cost Report'
    },
    {
      icon: <SecurityScanOutlined style={{ fontSize: '24px', color: '#52c41a' }} />,
      title: 'Security Monitoring',
      description: 'Monitor AWS Security Hub findings across accounts and regions with intelligent filtering and resource identification.',
      action: () => router.push('/security'),
      buttonText: 'View Security Findings'
    },
    {
      icon: <SettingOutlined style={{ fontSize: '24px', color: '#722ed1' }} />,
      title: 'Configuration Management',
      description: 'Manage AWS profiles, test connectivity, and configure reporting settings with an intuitive interface.',
      action: () => router.push('/config'),
      buttonText: 'Manage Configuration'
    }
  ];

  const getStartedSteps = [
    'Configure your AWS profiles and test connectivity',
    'Set up cost and security reporting configurations',
    'Generate your first reports and analyze the results'
  ];

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <Title level={1} style={{ fontSize: '3rem', marginBottom: 16 }}>
          <CloudServerOutlined style={{ marginRight: 16, color: '#1890ff' }} />
          AWS Reports Portal
        </Title>
        <Paragraph style={{ fontSize: '1.2rem', color: '#666', maxWidth: '600px', margin: '0 auto' }}>
          Unified dashboard for AWS cost analysis and security monitoring across multiple accounts and regions
        </Paragraph>
      </div>

      {profilesError && (
        <Alert
          message="AWS Configuration Required"
          description={
            <div>
              <p>To get started, you need to configure your AWS credentials and profiles.</p>
              <p><strong>Run:</strong> <code>aws configure</code> or set up your AWS credentials files manually.</p>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" onClick={() => router.push('/config')}>
              Setup Configuration
            </Button>
          }
        />
      )}

      {profiles && profiles.length === 0 && (
        <Alert
          message="No AWS Profiles Detected"
          description="Configure your first AWS profile to start generating reports."
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
          action={
            <Button size="small" onClick={() => router.push('/config')}>
              Add Profiles
            </Button>
          }
        />
      )}


      <Row gutter={[24, 24]} style={{ marginBottom: 48 }}>
        {features.map((feature, index) => (
          <Col xs={24} lg={8} key={index}>
            <Card
              hoverable
              style={{ height: '100%', textAlign: 'center' }}
              styles={{ body: { padding: '24px' } }}
            >
              <div style={{ marginBottom: 16 }}>
                {feature.icon}
              </div>
              <Title level={4} style={{ marginBottom: 12 }}>
                {feature.title}
              </Title>
              <Paragraph style={{ color: '#666', marginBottom: 24, minHeight: '60px' }}>
                {feature.description}
              </Paragraph>
              <Button type="primary" onClick={feature.action} block>
                {feature.buttonText}
                <RightOutlined />
              </Button>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={12}>
          <Card title="Getting Started" style={{ height: '100%' }}>
            <List
              dataSource={getStartedSteps}
              renderItem={(item, index) => (
                <List.Item>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{
                      backgroundColor: '#1890ff',
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '12px',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}>
                      {index + 1}
                    </div>
                    <Text>{item}</Text>
                  </div>
                </List.Item>
              )}
            />
            <div style={{ marginTop: 16 }}>
              <Button type="dashed" onClick={() => router.push('/config')} block>
                Start Configuration
              </Button>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Key Features" style={{ height: '100%' }}>
            <List
              dataSource={[
                'Multi-account AWS cost reporting with charts and breakdowns',
                'Security Hub findings monitoring with intelligent filtering',
                'Automated AWS connectivity testing',
                'Configurable date ranges and granularity options',
                'Resource-specific security finding analysis',
                'Export capabilities for further analysis'
              ]}
              renderItem={item => (
                <List.Item>
                  <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  <Text>{item}</Text>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}