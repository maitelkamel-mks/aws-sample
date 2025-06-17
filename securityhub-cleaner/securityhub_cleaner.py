#!/usr/bin/env python3
"""
AWS Security Hub Cleaner

This script updates the workflow status of Security Hub findings based on
configurable search parameters. It supports dry-run mode for safe testing.
"""

import argparse
import sys
import os
from typing import Dict, List, Any
import yaml
import boto3
from botocore.exceptions import ClientError, NoCredentialsError


class SecurityHubCleaner:
    def __init__(self, config_file: str, dry_run: bool = False):
        """Initialize the Security Hub cleaner with configuration."""
        self.config = self._load_config(config_file)
        self.dry_run = dry_run
        self.total_processed = 0
        self.total_updated = 0

    def _load_config(self, config_file: str) -> Dict[str, Any]:
        """Load configuration from YAML file."""
        try:
            with open(config_file, "r") as file:
                config = yaml.safe_load(file)
                self._validate_config(config)
                return config
        except FileNotFoundError:
            print(f"Error: Configuration file '{config_file}' not found.")
            sys.exit(1)
        except yaml.YAMLError as e:
            print(f"Error parsing YAML file: {e}")
            sys.exit(1)

    def _validate_config(self, config: Dict[str, Any]) -> None:
        """Validate the configuration parameters."""
        required_fields = ["new_workflow_status", "findings_search_parameters", "profiles", "home_region"]

        for field in required_fields:
            if field not in config:
                print(f"Error: Required field '{field}' missing in configuration.")
                sys.exit(1)

        if not isinstance(config["profiles"], list):
            print("Error: 'profiles' must be a list.")
            sys.exit(1)

        if not isinstance(config["findings_search_parameters"], list):
            print("Error: 'findings_search_parameters' must be a list.")
            sys.exit(1)

        valid_statuses = ["NEW", "NOTIFIED", "RESOLVED", "SUPPRESSED"]
        if config["new_workflow_status"] not in valid_statuses:
            print(f"Error: 'new_workflow_status' must be one of: {valid_statuses}")
            sys.exit(1)

    def _get_securityhub_client(self, profile: str) -> boto3.client:
        """Get Security Hub client for a specific profile in the home region."""
        try:
            session = boto3.Session(profile_name=profile)
            return session.client("securityhub", region_name=self.config["home_region"])
        except Exception as e:
            print(f"Error creating client for profile '{profile}' in home region '{self.config['home_region']}': {e}")
            return None

    def _build_filters(self, search_params: Dict[str, Any]) -> Dict[str, List[Dict[str, str]]]:
        """Build filters for Security Hub get_findings API based on search parameters."""
        filters = {
            "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}]
        }

        # Add workflow status filter
        if "workflow_status" in search_params:
            filters["WorkflowStatus"] = [{"Value": search_params["workflow_status"], "Comparison": "EQUALS"}]

        # Add product name filter
        if "product_name" in search_params:
            filters["ProductName"] = [{"Value": search_params["product_name"], "Comparison": "EQUALS"}]

        # Add title filter
        if "title" in search_params:
            filters["Title"] = [{"Value": search_params["title"], "Comparison": "EQUALS"}]

        # Add compliance status filter
        if "compliance_status" in search_params:
            filters["ComplianceStatus"] = [{"Value": search_params["compliance_status"], "Comparison": "EQUALS"}]

        # Add severity filter
        if "severity" in search_params:
            filters["SeverityLabel"] = [{"Value": search_params["severity"], "Comparison": "EQUALS"}]

        # Add region filter
        if "region" in search_params:
            filters["Region"] = [{"Value": search_params["region"], "Comparison": "EQUALS"}]

        # Add generator ID filter (for specific rule/check)
        if "generator_id" in search_params:
            filters["GeneratorId"] = [{"Value": search_params["generator_id"], "Comparison": "EQUALS"}]

        return filters

    def _get_findings(self, client: boto3.client, filters: Dict[str, List[Dict[str, str]]]) -> List[Dict[str, Any]]:
        """Get findings from Security Hub based on filters."""
        findings = []
        try:
            paginator = client.get_paginator('get_findings')
            page_iterator = paginator.paginate(Filters=filters)

            for page in page_iterator:
                findings.extend(page.get('Findings', []))

        except ClientError as e:
            print(f"Error fetching findings: {e}")
            return []

        return findings

    def _update_findings_workflow(self, client: boto3.client, finding_ids: List[str], new_status: str) -> bool:
        """Update workflow status for a list of findings."""
        if not finding_ids:
            return True

        try:
            if self.dry_run:
                print(f"  [DRY RUN] Would update {len(finding_ids)} findings to status: {new_status}")
                return True
            else:
                response = client.batch_update_findings(
                    FindingIdentifiers=[{"Id": finding_id} for finding_id in finding_ids],
                    Workflow={"Status": new_status}
                )
                
                failed_count = len(response.get('UnprocessedFindings', []))
                if failed_count > 0:
                    print(f"  Warning: {failed_count} findings failed to update")
                    for failed in response.get('UnprocessedFindings', []):
                        print(f"    Failed: {failed.get('Id', 'Unknown')}")
                
                success_count = len(finding_ids) - failed_count
                print(f"  Successfully updated {success_count} findings to status: {new_status}")
                return failed_count == 0

        except ClientError as e:
            print(f"  Error updating findings: {e}")
            return False

    def _process_search_params(self, profile: str, search_params: Dict[str, Any]) -> None:
        """Process a single search parameter set for a profile."""
        client = self._get_securityhub_client(profile)
        if not client:
            return

        description = search_params.get("description", "Unnamed search")
        print(f"\n  Processing: {description}")

        # Build filters
        filters = self._build_filters(search_params)
        print(f"    Filters: {filters}")

        # Get findings
        findings = self._get_findings(client, filters)
        finding_count = len(findings)
        self.total_processed += finding_count

        if finding_count == 0:
            print(f"    No findings matched the criteria")
            return

        print(f"    Found {finding_count} findings matching criteria")

        # Extract finding IDs
        finding_ids = [finding.get("Id") for finding in findings if finding.get("Id")]

        if not finding_ids:
            print(f"    No valid finding IDs found")
            return

        # Update workflow status
        success = self._update_findings_workflow(client, finding_ids, self.config["new_workflow_status"])
        if success:
            self.total_updated += len(finding_ids)

    def run_cleanup(self) -> None:
        """Run the cleanup process for all profiles and search parameters."""
        if self.dry_run:
            print("🔍 Running in DRY RUN mode - no changes will be made\n")
        else:
            print("⚠️  Running in LIVE mode - findings will be updated\n")

        for profile in self.config["profiles"]:
            print(f"📋 Processing profile: {profile}")
            
            try:
                for search_params in self.config["findings_search_parameters"]:
                    self._process_search_params(profile, search_params)
                    
            except Exception as e:
                print(f"Error processing profile '{profile}': {e}")
                continue

        print(f"\n📊 Summary:")
        print(f"   Total findings processed: {self.total_processed}")
        print(f"   Total findings updated: {self.total_updated}")
        
        if self.dry_run:
            print(f"   (Dry run - no actual changes made)")


def main():
    """Main function to run the Security Hub cleaner."""
    parser = argparse.ArgumentParser(description="Update Security Hub finding workflow status based on search criteria")
    parser.add_argument("config_file", nargs='?', default="config.yaml", help="Path to YAML configuration file (default: config.yaml)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be updated without making changes")

    args = parser.parse_args()

    cleaner = SecurityHubCleaner(args.config_file, dry_run=args.dry_run)
    cleaner.run_cleanup()


if __name__ == "__main__":
    main()