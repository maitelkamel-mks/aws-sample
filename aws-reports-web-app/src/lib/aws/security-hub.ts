import { SecurityHubClient, GetFindingsCommand, GetFindingsCommandInput } from '@aws-sdk/client-securityhub';
import { AWSCredentialsManager } from './credentials';
import { createAWSClientConfig } from './client-config';
import { SecurityFinding, SecuritySummary, SecurityOverview } from '../types/security';
import { parseAWSError } from './error-parser';

export class SecurityHubService {
  private credentialsManager: AWSCredentialsManager;

  constructor() {
    this.credentialsManager = AWSCredentialsManager.getInstance();
  }

  public async getFindings(
    profile: string,
    region: string,
    filters?: {
      severities?: string[];
      workflowState?: string[];
      complianceStatus?: string[];
      productName?: string[];
    },
    profileType?: 'cli' | 'sso'
  ): Promise<SecurityFinding[]> {
    try {
      // Use the credentials manager for CLI profiles
      const credentials = await this.credentialsManager.getCredentialsForProfile(profile);
      const clientConfig = await createAWSClientConfig(region, credentials);
      const client = new SecurityHubClient(clientConfig);

      const input: GetFindingsCommandInput = {
        MaxResults: 100,
      };

      // Build filters - start with base filters matching Python script
      const findingFilters: Record<string, unknown> = {
        // Only get ACTIVE findings
        RecordState: [{ Value: 'ACTIVE', Comparison: 'EQUALS' }],
        // Only get NEW and NOTIFIED workflow status
        WorkflowStatus: [
          { Value: 'NEW', Comparison: 'EQUALS' },
          { Value: 'NOTIFIED', Comparison: 'EQUALS' }
        ]
      };

      // Add additional filters if provided
      if (filters?.severities && filters.severities.length > 0) {
        findingFilters.SeverityLabel = filters.severities.map(severity => ({
          Value: severity,
          Comparison: 'EQUALS'
        }));
      }

      if (filters?.workflowState && filters.workflowState.length > 0) {
        // Override the default workflow status filter if specific ones are requested
        findingFilters.WorkflowStatus = filters.workflowState.map(state => ({
          Value: state,
          Comparison: 'EQUALS'
        }));
      }

      if (filters?.complianceStatus && filters.complianceStatus.length > 0) {
        findingFilters.ComplianceStatus = filters.complianceStatus.map(status => ({
          Value: status,
          Comparison: 'EQUALS'
        }));
      }

      if (filters?.productName && filters.productName.length > 0) {
        findingFilters.ProductName = filters.productName.map(product => ({
          Value: product,
          Comparison: 'EQUALS'
        }));
      }

      input.Filters = findingFilters;

      const findings: SecurityFinding[] = [];
      let nextToken: string | undefined;

      do {
        if (nextToken) {
          input.NextToken = nextToken;
        }

        const command = new GetFindingsCommand(input);
        const response = await client.send(command);

        if (response.Findings) {
          for (const finding of response.Findings) {
            // Extract resource information from the first resource if available
            let resourceId: string | undefined;
            let resourceName: string | undefined;
            
            if (finding.Resources && finding.Resources.length > 0) {
              const resource = finding.Resources[0];
              resourceId = resource.Id;
              
              // Extract resource name based on resource type
              if (resource.Details) {
                 
                const details = resource.Details as any;
                
                // Try to extract name from various AWS resource types
                if (details.AwsEc2Instance?.InstanceId) {
                   
                  resourceName = details.AwsEc2Instance.Tags?.find((tag: any) => tag.Key === 'Name')?.Value || details.AwsEc2Instance.InstanceId;
                } else if (details.AwsS3Bucket?.Name) {
                  resourceName = details.AwsS3Bucket.Name;
                } else if (details.AwsRdsDbInstance?.DBInstanceIdentifier) {
                  resourceName = details.AwsRdsDbInstance.DBInstanceIdentifier;
                } else if (details.AwsElbv2LoadBalancer?.LoadBalancerName) {
                  resourceName = details.AwsElbv2LoadBalancer.LoadBalancerName;
                } else if (details.AwsLambdaFunction?.FunctionName) {
                  resourceName = details.AwsLambdaFunction.FunctionName;
                } else if (details.AwsIamRole?.RoleName) {
                  resourceName = details.AwsIamRole.RoleName;
                } else if (details.AwsIamUser?.UserName) {
                  resourceName = details.AwsIamUser.UserName;
                } else if (details.AwsCloudFormationStack?.StackName) {
                  resourceName = details.AwsCloudFormationStack.StackName;
                } else if (details.AwsEksCluster?.Name) {
                  resourceName = details.AwsEksCluster.Name;
                } else if (details.AwsEcsCluster?.ClusterName) {
                  resourceName = details.AwsEcsCluster.ClusterName;
                } else if (details.AwsAutoScalingGroup?.AutoScalingGroupName) {
                  resourceName = details.AwsAutoScalingGroup.AutoScalingGroupName;
                } else if (details.AwsCloudTrail?.Name) {
                  resourceName = details.AwsCloudTrail.Name;
                } else if (details.AwsKmsKey?.KeyId) {
                  resourceName = details.AwsKmsKey.Description || details.AwsKmsKey.KeyId;
                } else if (details.AwsSecretsManagerSecret?.Name) {
                  resourceName = details.AwsSecretsManagerSecret.Name;
                } else if (details.AwsRedshiftCluster?.ClusterIdentifier) {
                  resourceName = details.AwsRedshiftCluster.ClusterIdentifier;
                } else if (details.AwsElasticSearchDomain?.DomainName) {
                  resourceName = details.AwsElasticSearchDomain.DomainName;
                } else if (details.AwsSqsQueue?.QueueName) {
                  resourceName = details.AwsSqsQueue.QueueName;
                } else if (details.AwsSnsTopicSubscription?.TopicArn) {
                  // Extract topic name from ARN
                  const topicArn = details.AwsSnsTopicSubscription.TopicArn;
                  resourceName = topicArn.split(':').pop();
                } else if (details.AwsApiGatewayRestApi?.Name) {
                  resourceName = details.AwsApiGatewayRestApi.Name;
                } else if (details.AwsCloudFrontDistribution?.DomainName) {
                  resourceName = details.AwsCloudFrontDistribution.DomainName;
                }
                
                // If no specific name found, try to extract from resource ID
                if (!resourceName && resourceId) {
                  // For ARNs, try to extract the resource name
                  if (resourceId.startsWith('arn:')) {
                    const arnParts = resourceId.split(':');
                    if (arnParts.length >= 6) {
                      const resourcePart = arnParts[5];
                      // Handle different ARN formats
                      if (resourcePart.includes('/')) {
                        resourceName = resourcePart.split('/').pop();
                      } else {
                        resourceName = resourcePart;
                      }
                    }
                  }
                }
              }
            }

            findings.push({
              id: finding.Id || '',
              account: finding.AwsAccountId || '',
              region: finding.Region || region,
              title: finding.Title || '',
              severity: (finding.Severity?.Label as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW') || 'LOW',
              workflow_state: (finding.Workflow?.Status as 'NEW' | 'NOTIFIED' | 'RESOLVED' | 'SUPPRESSED') || 'NEW',
              compliance_status: (finding.Compliance?.Status as 'PASSED' | 'WARNING' | 'FAILED' | 'NOT_AVAILABLE') || 'NOT_AVAILABLE',
              product_name: finding.ProductName || '',
              resource_id: resourceId,
              resource_name: resourceName,
              created_at: finding.CreatedAt ? new Date(finding.CreatedAt).toISOString() : '',
              updated_at: finding.UpdatedAt ? new Date(finding.UpdatedAt).toISOString() : '',
              description: finding.Description,
              remediation: finding.Remediation?.Recommendation?.Text,
            });
          }
        }

        nextToken = response.NextToken;
      } while (nextToken);

      return findings;
    } catch (error) {
      throw new Error(`Failed to get Security Hub findings for profile ${profile} in region ${region}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async getSecuritySummary(
    profile: string,
    region: string
  ): Promise<SecuritySummary> {
    try {
      const findings = await this.getFindings(profile, region);
      
      const summary: SecuritySummary = {
        account: profile,
        region,
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 0,
        total_count: findings.length,
        compliance_summary: {},
      };

      for (const finding of findings) {
        // Count by severity
        switch (finding.severity) {
          case 'CRITICAL':
            summary.critical_count++;
            break;
          case 'HIGH':
            summary.high_count++;
            break;
          case 'MEDIUM':
            summary.medium_count++;
            break;
          case 'LOW':
            summary.low_count++;
            break;
        }

        // Count by compliance status
        if (!summary.compliance_summary[finding.compliance_status]) {
          summary.compliance_summary[finding.compliance_status] = 0;
        }
        summary.compliance_summary[finding.compliance_status]++;
      }

      return summary;
    } catch (error) {
      throw new Error(`Failed to get security summary for profile ${profile} in region ${region}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async getMultiProfileSecurityData(
    profiles: string[],
    regions: string[]
  ): Promise<{ findings: SecurityFinding[]; summaries: SecuritySummary[]; overview: SecurityOverview }> {
    const allFindings: SecurityFinding[] = [];
    const summaries: SecuritySummary[] = [];
    const errors: string[] = [];

    // Get data for all profile-region combinations
    for (const profile of profiles) {
      for (const region of regions) {
        try {
          const [findings, summary] = await Promise.all([
            this.getFindings(profile, region),
            this.getSecuritySummary(profile, region),
          ]);
          
          // Add profile information to each finding
          const findingsWithProfile = findings.map(finding => ({
            ...finding,
            profile_name: profile,
          }));
          
          allFindings.push(...findingsWithProfile);
          summaries.push(summary);
        } catch (error) {
          const parsedError = parseAWSError(error);
          const errorMessage = `Profile "${profile}" in region "${region}": ${parsedError}`;
          
          // Check if this is a "service not available in region" error
          if (parsedError.includes('Invalid AWS region specified or service not available in this region') ||
              parsedError.includes('Security Hub is not enabled in this region')) {
            // Treat region unavailability as no data, not an error
            console.warn(`Security Hub not available in region ${region} for profile ${profile}, skipping...`);
            continue;
          }
          
          console.error(`Failed to get data for profile ${profile} in region ${region}:`, error);
          errors.push(errorMessage);
        }
      }
    }

    // Only throw if ALL profile/region combinations failed with non-region errors
    if (errors.length > 0 && allFindings.length === 0) {
      // Check if all errors are just region unavailability (which we now handle gracefully)
      const nonRegionErrors = errors.filter(error => 
        !error.includes('Invalid AWS region specified or service not available in this region') &&
        !error.includes('Security Hub is not enabled in this region')
      );
      
      // Only throw if there are actual errors (not just region unavailability)
      if (nonRegionErrors.length > 0) {
        throw new Error(`Failed to retrieve security data from any profile/region combination. Errors: ${errors.join('; ')}`);
      }
    }

    // If some combinations failed but we have some data, log warnings but continue
    if (errors.length > 0) {
      const nonRegionErrors = errors.filter(error => 
        !error.includes('Invalid AWS region specified or service not available in this region') &&
        !error.includes('Security Hub is not enabled in this region')
      );
      
      if (nonRegionErrors.length > 0) {
        console.warn(`Some profile/region combinations failed (${nonRegionErrors.length}):`, nonRegionErrors);
      }
    }

    // Calculate overview
    const overview: SecurityOverview = {
      total_findings: allFindings.length,
      by_severity: {},
      by_account: {},
      by_region: {},
      compliance_overview: {},
    };

    for (const finding of allFindings) {
      // Count by severity
      if (!overview.by_severity[finding.severity]) {
        overview.by_severity[finding.severity] = 0;
      }
      overview.by_severity[finding.severity]++;

      // Count by account
      if (!overview.by_account[finding.account]) {
        overview.by_account[finding.account] = 0;
      }
      overview.by_account[finding.account]++;

      // Count by region
      if (!overview.by_region[finding.region]) {
        overview.by_region[finding.region] = 0;
      }
      overview.by_region[finding.region]++;

      // Count by compliance status
      if (!overview.compliance_overview[finding.compliance_status]) {
        overview.compliance_overview[finding.compliance_status] = 0;
      }
      overview.compliance_overview[finding.compliance_status]++;
    }

    return { findings: allFindings, summaries, overview };
  }
}