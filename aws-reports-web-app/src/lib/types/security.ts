export interface SecurityConfig {
  report_name: string;
  profiles: string[];
  home_region: string;
}

export interface SecurityFinding {
  id: string;
  account: string;
  region: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  workflow_state: 'NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED';
  compliance_status: 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_AVAILABLE';
  product_name: string;
  resource_id?: string;
  resource_name?: string;
  created_at: string;
  updated_at: string;
  description?: string;
  remediation?: string;
  profile_name?: string;
}

export interface SecuritySummary {
  account: string;
  region: string;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  total_count: number;
  compliance_summary: Record<string, number>;
}

export interface SecurityOverview {
  total_findings: number;
  by_severity: Record<string, number>;
  by_account: Record<string, number>;
  by_region: Record<string, number>;
  compliance_overview: Record<string, number>;
}