export interface ProxyConfig {
  enabled: boolean;
  url?: string;
  username?: string;
  password?: string;
  no_proxy?: string[];
}

export interface ProxyStatus {
  configured: boolean;
  source: 'ui' | 'config' | 'environment' | 'none';
  url?: string;
  working?: boolean;
  error?: string;
  lastTested?: string;
}

export interface ProxyTestResult {
  success: boolean;
  error?: string;
  responseTime?: number;
  timestamp: string;
}

export interface ProxyFormData {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  no_proxy: string;
}

export interface ProxyEnvironmentDetection {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy?: string;
  detected: boolean;
}