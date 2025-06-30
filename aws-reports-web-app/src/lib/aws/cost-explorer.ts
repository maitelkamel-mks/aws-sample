import { CostExplorerClient, GetCostAndUsageCommand, GetCostAndUsageCommandInput } from '@aws-sdk/client-cost-explorer';
import { AWSCredentialsManager } from './credentials';
import { createAWSClientConfig } from './client-config';
import { CostData, CostSummary } from '../types/cost';
import { parseAWSError } from './error-parser';

export class CostExplorerService {
  private credentialsManager: AWSCredentialsManager;

  constructor() {
    this.credentialsManager = AWSCredentialsManager.getInstance();
  }

  public async getCostData(
    profile: string,
    startDate: string,
    endDate: string,
    granularity: 'HOURLY' | 'DAILY' | 'MONTHLY' = 'MONTHLY',
    services?: string[],
    excludeTaxes: boolean = false,
    excludeSupport: boolean = false
  ): Promise<CostData[]> {
    try {
      const credentials = await this.credentialsManager.getCredentialsForProfile(profile);
      const clientConfig = createAWSClientConfig('us-east-1', credentials); // Cost Explorer is only available in us-east-1
      const client = new CostExplorerClient(clientConfig);

      const input: GetCostAndUsageCommandInput = {
        TimePeriod: {
          Start: startDate,
          End: endDate,
        },
        Granularity: granularity,
        Metrics: ['BlendedCost', 'UsageQuantity'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      };

      // Build filters
      const filters = [];
      
      if (services && services.length > 0) {
        filters.push({
          Dimensions: {
            Key: 'SERVICE',
            Values: services,
            MatchOptions: ['EQUALS'],
          },
        });
      }
      
      if (excludeTaxes || excludeSupport) {
        const excludeFilters = [];
        
        if (excludeTaxes) {
          excludeFilters.push({
            Not: {
              Dimensions: {
                Key: 'SERVICE',
                Values: ['Tax'],
                MatchOptions: ['EQUALS'],
              },
            },
          });
        }
        
        if (excludeSupport) {
          // AWS Support services have various names, exclude the most common ones
          const supportServices = [
            'AWS Support (Business)',
            'AWS Support (Developer)', 
            'AWS Support (Enterprise)',
            'AWS Support (Basic)',
            'Support'
          ];
          
          excludeFilters.push({
            Not: {
              Dimensions: {
                Key: 'SERVICE',
                Values: supportServices,
                MatchOptions: ['EQUALS'],
              },
            },
          });
        }
        
        if (excludeFilters.length === 1) {
          filters.push(excludeFilters[0]);
        } else if (excludeFilters.length > 1) {
          filters.push({
            And: excludeFilters,
          });
        }
      }
      
      if (filters.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input.Filter = filters[0] as any;
      } else if (filters.length > 1) {
        input.Filter = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          And: filters as any,
        };
      }

      const command = new GetCostAndUsageCommand(input);
      const response = await client.send(command);

      const costData: CostData[] = [];

      if (response.ResultsByTime) {
        for (const result of response.ResultsByTime) {
          const period = result.TimePeriod?.Start || '';
          
          if (result.Groups) {
            for (const group of result.Groups) {
              const service = group.Keys?.[0] || 'Unknown';
              const amount = parseFloat(group.Metrics?.BlendedCost?.Amount || '0');
              const currency = group.Metrics?.BlendedCost?.Unit || 'USD';

              costData.push({
                profile,
                service,
                period,
                amount,
                currency,
                dimensions: {
                  usage_quantity: group.Metrics?.UsageQuantity?.Amount || '0',
                  usage_unit: group.Metrics?.UsageQuantity?.Unit || '',
                },
              });
            }
          }
        }
      }

      return costData;
    } catch (error) {
      throw new Error(`Failed to get cost data for profile ${profile}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async getCostSummary(
    profile: string,
    startDate: string,
    endDate: string,
    granularity: 'HOURLY' | 'DAILY' | 'MONTHLY' = 'MONTHLY'
  ): Promise<CostSummary> {
    try {
      const costData = await this.getCostData(profile, startDate, endDate, granularity);
      
      const summary: CostSummary = {
        profile,
        total_cost: 0,
        period_costs: {},
        service_costs: {},
      };

      for (const data of costData) {
        summary.total_cost += data.amount;
        
        // Aggregate by period
        if (!summary.period_costs[data.period]) {
          summary.period_costs[data.period] = 0;
        }
        summary.period_costs[data.period] += data.amount;
        
        // Aggregate by service
        if (!summary.service_costs[data.service]) {
          summary.service_costs[data.service] = 0;
        }
        summary.service_costs[data.service] += data.amount;
      }

      return summary;
    } catch (error) {
      throw new Error(`Failed to get cost summary for profile ${profile}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async getMultiProfileCostData(
    profiles: string[],
    startDate: string,
    endDate: string,
    granularity: 'HOURLY' | 'DAILY' | 'MONTHLY' = 'MONTHLY',
    services?: string[],
    excludeTaxes: boolean = false,
    excludeSupport: boolean = false
  ): Promise<{ data: CostData[]; summaries: CostSummary[] }> {
    const allData: CostData[] = [];
    const summaries: CostSummary[] = [];
    const errors: string[] = [];

    for (const profile of profiles) {
      try {
        const [data, summary] = await Promise.all([
          this.getCostData(profile, startDate, endDate, granularity, services, excludeTaxes, excludeSupport),
          this.getCostSummary(profile, startDate, endDate, granularity),
        ]);
        
        allData.push(...data);
        summaries.push(summary);
      } catch (error) {
        const errorMessage = `Profile "${profile}": ${parseAWSError(error)}`;
        console.error(`Failed to get data for profile ${profile}:`, error);
        errors.push(errorMessage);
      }
    }

    // If any profile failed and no data was retrieved, throw an error
    if (errors.length > 0 && allData.length === 0) {
      throw new Error(`Failed to retrieve cost data from any profile. Errors: ${errors.join('; ')}`);
    }

    // If some profiles failed but we have some data, we could optionally still throw
    // For now, let's throw if ANY profile fails to ensure errors are visible
    if (errors.length > 0) {
      throw new Error(`Failed to retrieve cost data from ${errors.length} profile(s). Errors: ${errors.join('; ')}`);
    }

    return { data: allData, summaries };
  }
}