export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface FilterParams {
  accounts?: string[];
  regions?: string[];
  severities?: string[];
  compliance_status?: string[];
  date_range?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface PaginationParams {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}