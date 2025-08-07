'use client';

import { Select, Spin, Alert, Space, Tag, Typography } from 'antd';
import { CloudOutlined, UserOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAWSProfiles, AWSProfile, UseAWSProfilesOptions } from '@/hooks/useAWSProfiles';

const { Text } = Typography;

export interface AWSProfileSelectorProps extends Omit<UseAWSProfilesOptions, 'format'> {
  /**
   * Selected profile(s) - can be string or array of strings
   */
  value?: string | string[];

  /**
   * Callback when selection changes
   */
  onChange?: (value: string | string[]) => void;

  /**
   * Select component mode
   */
  mode?: 'single' | 'multiple';

  /**
   * Placeholder text
   */
  placeholder?: string;

  /**
   * Disable the selector
   */
  disabled?: boolean;

  /**
   * Show profile type badges
   */
  showTypeBadges?: boolean;

  /**
   * Show authentication status
   */
  showAuthStatus?: boolean;

  /**
   * Custom width
   */
  width?: number | string;

  /**
   * Show refresh button
   */
  showRefresh?: boolean;

  /**
   * Size of the select component
   */
  size?: 'small' | 'middle' | 'large';

  /**
   * Additional className
   */
  className?: string;
}

/**
 * Reusable AWS Profile Selector with consistent styling and behavior
 * 
 * @example
 * // Single selection
 * <AWSProfileSelector 
 *   value={selectedProfile}
 *   onChange={setSelectedProfile}
 *   placeholder="Select AWS profile"
 * />
 * 
 * @example
 * // Multiple selection with SSO and CLI
 * <AWSProfileSelector 
 *   mode="multiple"
 *   value={selectedProfiles}
 *   onChange={setSelectedProfiles}
 *   showTypeBadges
 *   showRefresh
 * />
 * 
 * @example
 * // CLI profiles only
 * <AWSProfileSelector 
 *   includeSso={false}
 *   value={cliProfile}
 *   onChange={setCLIProfile}
 * />
 */
export default function AWSProfileSelector({
  value,
  onChange,
  mode = 'single',
  placeholder = 'Select AWS profile',
  disabled = false,
  showTypeBadges = false,
  showAuthStatus = false,
  width = '100%',
  showRefresh = false,
  size = 'middle',
  className,
  includeSso = true,
  enabled = true,
  ...options
}: AWSProfileSelectorProps) {

  const {
    profiles,
    isLoading,
    error,
    refetch,
    isEmpty,
    totalProfiles,
    ssoConfigured
  } = useAWSProfiles({
    format: 'detailed',
    includeSso,
    enabled,
    ...options
  });

  // Handle loading state
  if (isLoading) {
    return (
      <div style={{ width }}>
        <Select
          style={{ width: '100%' }}
          placeholder={placeholder}
          disabled
          size={size}
          className={className}
          notFoundContent={
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="small" />
              <div style={{ marginTop: 8 }}>Loading profiles...</div>
            </div>
          }
        />
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div style={{ width }}>
        <Select
          style={{ width: '100%' }}
          placeholder="Failed to load profiles"
          disabled
          size={size}
          className={className}
          status="error"
        />
        <Alert
          message="Failed to load AWS profiles"
          description={error instanceof Error ? error.message : 'Unknown error'}
          type="error"
          style={{ marginTop: 4 }}
          action={
            <Space>
              <ReloadOutlined
                onClick={() => refetch()}
                style={{ cursor: 'pointer' }}
                title="Retry"
              />
            </Space>
          }
        />
      </div>
    );
  }

  // Handle empty state
  if (isEmpty) {
    return (
      <div style={{ width }}>
        <Select
          style={{ width: '100%' }}
          placeholder="No AWS profiles found"
          disabled
          size={size}
          className={className}
        />
        <Alert
          message="No AWS profiles configured"
          description={
            includeSso
              ? "Configure AWS CLI profiles using 'aws configure' or set up SSO providers in the Config page."
              : "Configure AWS CLI profiles using 'aws configure'."
          }
          type="info"
          style={{ marginTop: 4 }}
        />
      </div>
    );
  }

  // Render profile option with metadata
  const renderOption = (profile: AWSProfile) => {
    return (
      <Select.Option
        key={profile.name}
        value={profile.name}
        label={profile.name}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            {profile.type === 'sso' ? (
              <CloudOutlined style={{ color: '#1890ff' }} />
            ) : profile.type === 'cli+sso' ? (
              <Space size={2}>
                <UserOutlined style={{ color: '#52c41a' }} />
                <CloudOutlined style={{ color: '#1890ff' }} />
              </Space>
            ) : (
              <UserOutlined style={{ color: '#52c41a' }} />
            )}
            <Text strong>{profile.name}</Text>
          </Space>
        </div>
      </Select.Option>
    );
  };

  const selectMode = mode === 'multiple' ? 'multiple' : undefined;

  return (
    <div style={{ width }}>
      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            style={{ flex: 1 }}
            mode={selectMode}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            size={size}
            className={className}
            showSearch
            filterOption={(input, option) => {
              const label = option?.label as string || '';
              return label.toLowerCase().includes(input.toLowerCase());
            }}
            optionLabelProp="label"
          >
            {(profiles as AWSProfile[]).map(renderOption)}
          </Select>

          {showRefresh && (
            <ReloadOutlined
              onClick={() => refetch()}
              style={{
                cursor: 'pointer',
                color: '#1890ff',
                fontSize: size === 'large' ? 16 : size === 'small' ? 12 : 14
              }}
              title="Refresh profiles"
            />
          )}
        </div>
      </Space>
    </div>
  );
}