'use client';

import { 
  Card, 
  Typography, 
  Switch, 
  Space, 
  Tag, 
  List, 
  Button, 
  Progress, 
  Tooltip,
  message,
  Statistic
} from 'antd';
import { 
  ReloadOutlined, 
  PlayCircleOutlined, 
  PauseCircleOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useState, useCallback } from 'react';
import { useTokenRefresh, useProfileTokenRefresh } from '@/hooks/useTokenRefresh';

const { Title, Text } = Typography;

interface TokenRefreshStatusProps {
  compact?: boolean;
  showControls?: boolean;
  showProfileDetails?: boolean;
}

export default function TokenRefreshStatus({ 
  compact = false, 
  showControls = true,
  showProfileDetails = true 
}: TokenRefreshStatusProps) {
  const [manualRefreshLoading, setManualRefreshLoading] = useState<string | null>(null);

  const {
    isRunning,
    start,
    stop,
    refreshProfile,
    status,
    nextRefreshTimes
  } = useTokenRefresh({
    autoStart: true, // Auto-start the service
    onRefresh: (result) => {
      if (result.success) {
        message.success(`Token refreshed for profile: ${result.profileName}`);
      } else {
        message.error(`Failed to refresh token for ${result.profileName}: ${result.error}`);
      }
    }
  });

  const handleToggleService = useCallback((checked: boolean) => {
    if (checked) {
      start();
      message.success('Token refresh service started');
    } else {
      stop();
      message.info('Token refresh service stopped');
    }
  }, [start, stop]);

  const handleManualRefresh = useCallback(async (profileName: string) => {
    setManualRefreshLoading(profileName);
    try {
      const result = await refreshProfile(profileName);
      if (result.success) {
        message.success(`Successfully refreshed token for ${profileName}`);
      } else {
        message.error(`Failed to refresh token for ${profileName}: ${result.error}`);
      }
    } finally {
      setManualRefreshLoading(null);
    }
  }, [refreshProfile]);

  const getTimeUntilRefresh = (nextRefreshAt: Date) => {
    const now = new Date();
    const diffMs = nextRefreshAt.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Now';
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes < 60) return `${diffMinutes}m`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    const remainingMinutes = diffMinutes % 60;
    return `${diffHours}h ${remainingMinutes}m`;
  };

  const getExpirationProgress = (expiresAt: Date, nextRefreshAt: Date) => {
    const now = new Date();
    const total = expiresAt.getTime() - nextRefreshAt.getTime();
    const elapsed = now.getTime() - nextRefreshAt.getTime();
    const percentage = Math.max(0, Math.min(100, (elapsed / total) * 100));
    return percentage;
  };

  if (compact) {
    return (
      <Card size="small">
        <Space>
          <Tag color={isRunning ? 'green' : 'red'}>
            {isRunning ? 'Token Refresh: ON' : 'Token Refresh: OFF'}
          </Tag>
          {nextRefreshTimes.filter(t => t.needsRefresh).length > 0 && (
            <Tag color="orange">
              {nextRefreshTimes.filter(t => t.needsRefresh).length} need refresh
            </Tag>
          )}
          {showControls && (
            <Switch 
              size="small"
              checked={isRunning} 
              onChange={handleToggleService}
              checkedChildren={<PlayCircleOutlined />}
              unCheckedChildren={<PauseCircleOutlined />}
            />
          )}
        </Space>
      </Card>
    );
  }

  return (
    <Card>
      <div style={{ marginBottom: 16 }}>
        <Title level={4}>
          <Space>
            <ClockCircleOutlined />
            Token Refresh Service
          </Space>
        </Title>
        <Text type="secondary">
          Automatic refresh of SSO tokens before expiration
        </Text>
      </div>

      <Space direction="vertical" style={{ width: '100%' }}>
        {showControls && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Text strong>Service Status:</Text>
              <Tag color={isRunning ? 'green' : 'red'}>
                {isRunning ? 'Running' : 'Stopped'}
              </Tag>
            </Space>
            <Switch 
              checked={isRunning} 
              onChange={handleToggleService}
              checkedChildren="ON"
              unCheckedChildren="OFF"
            />
          </div>
        )}

        <div style={{ display: 'flex', gap: 16 }}>
          <Statistic
            title="Check Interval"
            value={Math.round(status.checkIntervalMs / 1000 / 60)}
            suffix="min"
            prefix={<ClockCircleOutlined />}
          />
          <Statistic
            title="Refresh Threshold"
            value={status.refreshThresholdMinutes}
            suffix="min"
            prefix={<ExclamationCircleOutlined />}
          />
          <Statistic
            title="Active Profiles"
            value={nextRefreshTimes.length}
            prefix={<CheckCircleOutlined />}
          />
        </div>

        {showProfileDetails && nextRefreshTimes.length > 0 && (
          <div>
            <Title level={5}>Profile Status</Title>
            <List
              dataSource={nextRefreshTimes}
              renderItem={(item) => {
                const timeUntilRefresh = getTimeUntilRefresh(item.nextRefreshAt);
                const progress = getExpirationProgress(item.expiresAt, item.nextRefreshAt);
                
                return (
                  <List.Item
                    actions={[
                      <Button
                        key="refresh"
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={manualRefreshLoading === item.profileName}
                        onClick={() => handleManualRefresh(item.profileName)}
                      >
                        Refresh Now
                      </Button>
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        <Space>
                          {item.profileName}
                          {item.needsRefresh ? (
                            <Tag color="orange">Needs Refresh</Tag>
                          ) : (
                            <Tag color="green">Active</Tag>
                          )}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" style={{ width: '100%' }}>
                          <div>
                            <Text type="secondary">Expires: </Text>
                            <Text>{item.expiresAt.toLocaleString()}</Text>
                          </div>
                          <div>
                            <Text type="secondary">Next refresh: </Text>
                            <Text>{timeUntilRefresh}</Text>
                          </div>
                          <Tooltip title={`${Math.round(progress)}% through refresh window`}>
                            <Progress 
                              percent={Math.round(progress)}
                              size="small"
                              status={item.needsRefresh ? 'exception' : 'active'}
                              format={() => `${timeUntilRefresh}`}
                            />
                          </Tooltip>
                        </Space>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>
        )}

        {nextRefreshTimes.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Text type="secondary">No active SSO sessions to monitor</Text>
          </div>
        )}
      </Space>
    </Card>
  );
}

// Profile-specific token refresh component
interface ProfileTokenRefreshProps {
  profileName: string;
  showButton?: boolean;
  size?: 'small' | 'middle' | 'large';
}

export function ProfileTokenRefresh({ 
  profileName, 
  showButton = true, 
  size = 'middle' 
}: ProfileTokenRefreshProps) {
  const { refresh, isRefreshing, lastRefresh } = useProfileTokenRefresh({
    profileName,
    onRefresh: (result) => {
      if (result.success) {
        message.success(`Token refreshed for ${profileName}`);
      }
    },
    onError: (error) => {
      message.error(`Failed to refresh token for ${profileName}: ${error}`);
    }
  });

  if (!showButton) {
    return null;
  }

  return (
    <Button
      size={size}
      icon={<ReloadOutlined />}
      loading={isRefreshing}
      onClick={refresh}
      type="link"
    >
      Refresh Token
    </Button>
  );
}