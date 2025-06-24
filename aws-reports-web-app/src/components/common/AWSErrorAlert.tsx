'use client';

import { Alert, Button, Typography } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface AWSErrorAlertProps {
  error: Error;
  service: 'cost' | 'security' | 'profiles';
  onRetry?: () => void;
  loading?: boolean;
}

export default function AWSErrorAlert({ error, service, onRetry, loading }: AWSErrorAlertProps) {
  const getServiceName = () => {
    switch (service) {
      case 'cost': return 'Cost Explorer';
      case 'security': return 'Security Hub';
      case 'profiles': return 'AWS Profiles';
      default: return 'AWS Service';
    }
  };

  const getTroubleshootingSteps = () => {
    const message = error.message;
    
    // SSO session expired
    if (message.includes('SSO session') || message.includes('sso login')) {
      return (
        <div>
          <Paragraph>Your AWS SSO session has expired. To fix this:</Paragraph>
          <ol>
            <li>Open your terminal</li>
            <li>Run: <Text code>aws sso login --profile your-profile-name</Text></li>
            <li>Follow the browser authentication flow</li>
            <li>Return here and try again</li>
          </ol>
        </div>
      );
    }

    // General credential issues
    if (message.includes('credentials') || message.includes('AccessDenied')) {
      return (
        <div>
          <Paragraph>There is an issue with your AWS credentials:</Paragraph>
          <ul>
            <li>Verify your AWS credentials are configured correctly</li>
            <li>Check that your profile has the necessary permissions</li>
            <li>Ensure your credentials have not expired</li>
            <li>Try running: <Text code>aws sts get-caller-identity</Text> to test your credentials</li>
          </ul>
        </div>
      );
    }

    // Service-specific errors
    if (service === 'cost' && message.includes('not enabled')) {
      return (
        <div>
          <Paragraph>AWS Cost Explorer is not enabled:</Paragraph>
          <ol>
            <li>Go to the AWS Cost Management console</li>
            <li>Navigate to Cost Explorer</li>
            <li>Click Enable Cost Explorer</li>
            <li>Wait for it to be activated (can take up to 24 hours)</li>
          </ol>
        </div>
      );
    }

    if (service === 'security' && message.includes('not enabled')) {
      return (
        <div>
          <Paragraph>AWS Security Hub is not enabled in this region:</Paragraph>
          <ol>
            <li>Go to the AWS Security Hub console</li>
            <li>Select the correct region</li>
            <li>Click Enable Security Hub</li>
            <li>Choose your security standards</li>
          </ol>
        </div>
      );
    }

    // Default troubleshooting
    return (
      <div>
        <Paragraph>Common solutions:</Paragraph>
        <ul>
          <li>Check your AWS credentials configuration</li>
          <li>Verify you have the necessary permissions</li>
          <li>Ensure the service is enabled in your account/region</li>
          <li>Check your network connectivity</li>
        </ul>
      </div>
    );
  };

  return (
    <Alert
      message={`Failed to Load ${getServiceName()} Data`}
      description={
        <div>
          <Paragraph>
            <Text strong>Error:</Text> {error.message}
          </Paragraph>
          {getTroubleshootingSteps()}
        </div>
      }
      type="error"
      showIcon
      icon={<ExclamationCircleOutlined />}
      style={{ marginBottom: 16 }}
      action={
        onRetry && (
          <Button 
            size="small" 
            danger 
            onClick={onRetry}
            loading={loading}
          >
            Retry
          </Button>
        )
      }
    />
  );
}