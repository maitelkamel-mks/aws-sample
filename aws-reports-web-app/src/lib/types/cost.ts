export interface CostConfig {
  profiles: string[];
  services: string[];
  start_date: string;
  end_date: string;
  period: 'daily' | 'monthly';
  exclude_taxes: boolean;
  exclude_support: boolean;
}

export interface CostData {
  profile: string;
  service: string;
  period: string;
  amount: number;
  currency: string;
  dimensions?: Record<string, string>;
}

export interface CostSummary {
  profile: string;
  total_cost: number;
  period_costs: Record<string, number>;
  service_costs: Record<string, number>;
}

export interface CostReport {
  id: string;
  config: CostConfig;
  generated_at: string;
  data: CostData[];
  summary: CostSummary[];
  status: 'generating' | 'completed' | 'error';
}