#!/usr/bin/env python3
"""
AWS Cost Report Generator

This script generates AWS cost reports using Cost Explorer API.
It takes a YAML configuration file as input and generates markdown reports.
"""

import argparse
import sys
import os
from datetime import datetime, timedelta
from typing import Dict, List, Any, Tuple
from collections import defaultdict
import yaml
import boto3
from botocore.exceptions import ClientError, NoCredentialsError


class AWSCostReporter:
    def __init__(self, config_file: str):
        """Initialize the cost reporter with configuration."""
        self.config = self._load_config(config_file)
        self.all_periods = self._generate_periods()
        self.cost_data = defaultdict(lambda: defaultdict(lambda: defaultdict(float)))
        self.table_counter = 0

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
        required_fields = ["report_name", "report_format", "sort_by", "profiles", "services", "start_date", "end_date", "period", "exclude_taxes", "exclude_support"]

        for field in required_fields:
            if field not in config:
                print(f"Error: Required field '{field}' missing in configuration.")
                sys.exit(1)

        # Services can be empty (to show all services) but must be a list
        if not isinstance(config["services"], list):
            print("Error: 'services' must be a list (can be empty to show all services).")
            sys.exit(1)

        if config["period"] not in ["daily", "monthly"]:
            print("Error: Period must be 'daily' or 'monthly'.")
            sys.exit(1)

        if config["report_format"] not in ["markdown", "html", "both"]:
            print("Error: Report format must be 'markdown', 'html', or 'both'.")
            sys.exit(1)

        if config["sort_by"] not in ["name", "total_cost"]:
            print("Error: Sort by must be 'name' or 'total_cost'.")
            sys.exit(1)

        try:
            datetime.strptime(config["start_date"], "%Y-%m-%d")
            datetime.strptime(config["end_date"], "%Y-%m-%d")
        except ValueError:
            print("Error: Dates must be in YYYY-MM-DD format.")
            sys.exit(1)

    def _get_cost_explorer_client(self, profile: str) -> boto3.client:
        """Get Cost Explorer client for a specific profile."""
        try:
            session = boto3.Session(profile_name=profile)
            return session.client("ce", region_name="us-east-1")
        except Exception as e:
            print(f"Error creating client for profile '{profile}': {e}")
            return None

    def _get_granularity(self) -> str:
        """Convert period to AWS Cost Explorer granularity."""
        return "DAILY" if self.config["period"] == "daily" else "MONTHLY"

    def _generate_periods(self) -> List[str]:
        """Generate list of periods based on start/end date and granularity."""
        start = datetime.strptime(self.config["start_date"], "%Y-%m-%d")
        end = datetime.strptime(self.config["end_date"], "%Y-%m-%d")
        periods = []

        if self.config["period"] == "monthly":
            current = start.replace(day=1)
            while current < end:
                periods.append(current.strftime("%Y-%m"))
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)
        else:  # daily
            current = start
            while current < end:
                periods.append(current.strftime("%Y-%m-%d"))
                current += timedelta(days=1)

        return periods

    def _format_period_display(self, period: str) -> str:
        """Format period for display according to README specifications."""
        if self.config["period"] == "monthly":
            # Convert YYYY-MM to month name
            date_obj = datetime.strptime(period, "%Y-%m")
            return date_obj.strftime("%B")
        else:  # daily
            # Convert YYYY-MM-DD to DD/MM
            date_obj = datetime.strptime(period, "%Y-%m-%d")
            return date_obj.strftime("%d/%m")

    def _get_cost_data(self, profile: str) -> None:
        """Fetch cost data from AWS Cost Explorer for a profile."""
        client = self._get_cost_explorer_client(profile)
        if not client:
            return

        try:
            metrics = ["UnblendedCost"]

            response = client.get_cost_and_usage(
                TimePeriod={"Start": self.config["start_date"], "End": self.config["end_date"]},
                Granularity=self._get_granularity(),
                Metrics=metrics,
                GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
            )

            self._process_cost_data(response.get("ResultsByTime", []), profile)

        except ClientError as e:
            print(f"Error fetching cost data for profile '{profile}': {e}")
        except NoCredentialsError:
            print(f"Error: No credentials found for profile '{profile}'.")

    def _process_cost_data(self, raw_data: List[Dict[str, Any]], profile: str) -> None:
        """Process raw cost data and store in internal structure."""
        target_services = self.config["services"]
        show_all_services = len(target_services) == 0

        for time_period in raw_data:
            period_start = time_period["TimePeriod"]["Start"]
            period_key = period_start[:7] if self.config["period"] == "monthly" else period_start
            groups = time_period.get("Groups", [])

            other_cost = 0.0
            period_total = 0.0

            for group in groups:
                service_name = group["Keys"][0] if group["Keys"] else "Unknown"
                cost_amount = float(group["Metrics"]["UnblendedCost"]["Amount"])

                ## filter support and taxes
                if service_name.startswith("AWS Support") and self.config["exclude_support"] == True:
                    continue

                if service_name == "Tax" and self.config["exclude_taxes"] == True:
                    continue

                if show_all_services or service_name in target_services:
                    self.cost_data[profile][service_name][period_key] += cost_amount
                else:
                    other_cost += cost_amount

                period_total += cost_amount

            if other_cost > 0 and not show_all_services:
                self.cost_data[profile]["Other"][period_key] += other_cost

    def generate_reports(self) -> None:
        """Generate cost reports for all profiles."""
        # Fetch data for all profiles
        for profile in self.config["profiles"]:
            print(f"Fetching cost data for profile: {profile}")
            self._get_cost_data(profile)

        # Generate reports based on format configuration
        if self.config["report_format"] in ["markdown", "both"]:
            self._generate_combined_report("markdown")
        if self.config["report_format"] in ["html", "both"]:
            self._generate_combined_report("html")
        print("Reports generated successfully!")

    def _format_currency(self, amount: float) -> str:
        """Format amount as currency in English format."""
        return f"$ {amount:,.2f}"

    def _should_include_service(self, service: str) -> bool:
        """Check if a service should be included in the report."""
        if len(self.config["services"]) == 0:  # Show all services if list is empty
            return service != "Other"  # Don't show Other when showing all services
        else:
            return service in self.config["services"]

    def _sort_services_by_config(self, services_list: List[str], profile: str = None) -> List[str]:
        """Sort services list based on configuration."""
        if self.config["sort_by"] == "name":
            return sorted(services_list)
        elif self.config["sort_by"] == "total_cost":
            # Calculate total cost for each service to sort by
            service_totals = []
            for service in services_list:
                total_cost = 0.0
                if profile:
                    # Sort for single profile
                    for period in self.all_periods:
                        total_cost += self.cost_data.get(profile, {}).get(service, {}).get(period, 0.0)
                else:
                    # Sort across all profiles
                    for prof in self.config["profiles"]:
                        for period in self.all_periods:
                            total_cost += self.cost_data.get(prof, {}).get(service, {}).get(period, 0.0)
                service_totals.append((service, total_cost))

            # Sort by total cost (descending)
            service_totals.sort(key=lambda x: x[1], reverse=True)
            return [service for service, _ in service_totals]
        else:
            return services_list

    def _sort_profiles_by_config(self, profiles_list: List[str]) -> List[str]:
        """Sort profiles list based on configuration."""
        if self.config["sort_by"] == "name":
            return sorted(profiles_list)
        elif self.config["sort_by"] == "total_cost":
            # Calculate total cost for each profile to sort by
            profile_totals = []
            for profile in profiles_list:
                total_cost = 0.0
                for service in self.cost_data.get(profile, {}):
                    for period in self.all_periods:
                        total_cost += self.cost_data[profile][service].get(period, 0.0)
                profile_totals.append((profile, total_cost))

            # Sort by total cost (descending)
            profile_totals.sort(key=lambda x: x[1], reverse=True)
            return [profile for profile, _ in profile_totals]
        else:
            return profiles_list

    def _generate_combined_report(self, format_type: str) -> None:
        """Generate combined report with all tables in one file."""
        if format_type == "markdown":
            content = "# AWS cost report\n\n"
        else:  # html
            content = self._get_html_header()

        # Generate cost per service per account for each profile
        for profile in self.config["profiles"]:
            if format_type == "markdown":
                content += f"## Cost per service for account - {profile}\n\n"
                content += self._generate_service_table_for_profile(profile, format_type)
                content += "\n\n"
            else:  # html
                content += f'<h2 class="aws-border-left ps-3 mt-4 mb-3">Cost per service for account - {profile}</h2>\n'
                content += self._generate_service_table_for_profile(profile, format_type)
                content += "\n"
                content += self._generate_profile_service_charts(profile)
                content += "\n"

        # Generate cost total per account
        if format_type == "markdown":
            content += "## Cost total per account\n\n"
            content += self._generate_account_total_table(format_type)
            content += "\n\n"
        else:  # html
            content += '<h2 class="aws-border-left ps-3 mt-4 mb-3">Cost total per account</h2>\n'
            content += self._generate_account_total_table(format_type)
            content += "\n"
            content += self._generate_account_total_charts()
            content += "\n"

        # Generate cost total per service for every account
        if format_type == "markdown":
            content += "## Cost total per service\n\n"
            content += self._generate_service_total_table(format_type)
        else:  # html
            content += '<h2 class="aws-border-left ps-3 mt-4 mb-3">Cost total per service</h2>\n'
            content += self._generate_service_total_table(format_type)
            content += "\n"
            content += self._generate_service_total_charts()
            content += self._get_html_footer()

        # Save combined report with timestamped filename in reports folder
        reports_dir = "reports"
        os.makedirs(reports_dir, exist_ok=True)

        now = datetime.now()
        timestamp = now.strftime("%Y%d%m-%H%M")
        extension = "md" if format_type == "markdown" else "html"
        filename = f"{self.config['report_name']}-{timestamp}.{extension}"
        filepath = os.path.join(reports_dir, filename)

        with open(filepath, "w") as f:
            f.write(content)
        print(f"Combined cost report saved: {filepath}")

    def _generate_service_table_for_profile(self, profile: str, format_type: str = "markdown") -> str:
        """Generate service cost table for a specific profile."""
        if format_type == "html":
            return self._generate_service_table_html(profile)

        # Create table header for markdown
        header = "| Service |"
        separator = "| ------- |"
        for period in self.all_periods:
            header += f" {self._format_period_display(period)} |"
            separator += " --------- |"
        header += " Total |\n"
        separator += " ----- |\n"

        content = header + separator

        # Get all services for this profile
        if len(self.config["services"]) == 0:
            # Show all services if config list is empty
            all_services = set()
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            # Use configured services
            all_services = set(self.config["services"])
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        # Filter and sort services
        filtered_services = [service for service in all_services if self._should_include_service(service)]
        sorted_services = self._sort_services_by_config(filtered_services, profile)

        # Add service rows
        for service in sorted_services:
            # Handle regular service rows
            row = f"| {service} |"
            service_total = 0.0

            for period in self.all_periods:
                cost = self.cost_data[profile].get(service, {}).get(period, 0.0)
                row += f" {self._format_currency(cost)} |"
                service_total += cost

            row += f" {self._format_currency(service_total)} |\n"
            content += row

        # Add Other row if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            row = "| Other |"
            service_total = 0.0

            for period in self.all_periods:
                cost = self.cost_data[profile].get("Other", {}).get(period, 0.0)
                row += f" {self._format_currency(cost)} |"
                service_total += cost

            row += f" {self._format_currency(service_total)} |\n"
            content += row

        # Add total row
        row = "| Total |"
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for service in self.cost_data[profile]:
                period_total += self.cost_data[profile][service].get(period, 0.0)
            row += f" {self._format_currency(period_total)} |"
            grand_total += period_total
        row += f" {self._format_currency(grand_total)} |\n"
        content += row

        return content

    def _generate_account_total_table(self, format_type: str = "markdown") -> str:
        """Generate cost total per account table."""
        if format_type == "html":
            return self._generate_account_total_table_html()

        # Create table header for markdown
        header = "| Account |"
        separator = "| ------- |"
        for period in self.all_periods:
            header += f" {self._format_period_display(period)} |"
            separator += " --------- |"
        header += " Total |\n"
        separator += " ----- |\n"

        content = header + separator

        # Sort and add account rows
        sorted_profiles = self._sort_profiles_by_config(self.config["profiles"])
        for profile in sorted_profiles:
            row = f"| {profile} |"
            account_total = 0.0

            for period in self.all_periods:
                period_total = 0.0
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
                row += f" {self._format_currency(period_total)} |"
                account_total += period_total

            row += f" {self._format_currency(account_total)} |\n"
            content += row

        # Add total row
        row = "| Total |"
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for profile in self.config["profiles"]:
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
            row += f" {self._format_currency(period_total)} |"
            grand_total += period_total
        row += f" {self._format_currency(grand_total)} |\n"
        content += row

        return content

    def _generate_service_total_table(self, format_type: str = "markdown") -> str:
        """Generate cost total per service for every account table."""
        if format_type == "html":
            return self._generate_service_total_table_html()

        # Create table header for markdown
        header = "| Service |"
        separator = "| ------- |"
        for period in self.all_periods:
            header += f" {self._format_period_display(period)} |"
            separator += " --------- |"
        header += " Total |\n"
        separator += " ----- |\n"

        content = header + separator

        # Get all services across all profiles
        if len(self.config["services"]) == 0:
            # Show all services if config list is empty
            all_services = set()
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            # Use configured services
            all_services = set(self.config["services"])
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        # Filter and sort services
        filtered_services = [service for service in all_services if self._should_include_service(service)]
        sorted_services = self._sort_services_by_config(filtered_services)

        # Add service rows
        for service in sorted_services:
            # Handle regular service rows
            row = f"| {service} |"
            service_total = 0.0

            for period in self.all_periods:
                period_total = 0.0
                for profile in self.config["profiles"]:
                    period_total += self.cost_data[profile].get(service, {}).get(period, 0.0)
                row += f" {self._format_currency(period_total)} |"
                service_total += period_total

            row += f" {self._format_currency(service_total)} |\n"
            content += row

        # Add Other row if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            row = "| Other |"
            service_total = 0.0

            for period in self.all_periods:
                period_total = 0.0
                for profile in self.config["profiles"]:
                    period_total += self.cost_data[profile].get("Other", {}).get(period, 0.0)
                row += f" {self._format_currency(period_total)} |"
                service_total += period_total

            row += f" {self._format_currency(service_total)} |\n"
            content += row

        # Add total row
        row = "| Total |"
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for profile in self.config["profiles"]:
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
            row += f" {self._format_currency(period_total)} |"
            grand_total += period_total
        row += f" {self._format_currency(grand_total)} |\n"
        content += row

        return content

    def _generate_service_table_html(self, profile: str) -> str:
        """Generate service cost table for a specific profile in HTML format."""
        # Create headers
        headers = ["Service"] + [self._format_period_display(period) for period in self.all_periods] + ["Total"]

        # Get all services for this profile
        if len(self.config["services"]) == 0:
            # Show all services if config list is empty
            all_services = set()
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            # Use configured services
            all_services = set(self.config["services"])
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        rows = []

        # Filter and sort services
        filtered_services = [service for service in all_services if self._should_include_service(service)]
        sorted_services = self._sort_services_by_config(filtered_services, profile)

        # Add service rows (including taxes if enabled)
        for service in sorted_services:
            if service == "Taxes":
                # Handle taxes row
                row = ["Taxes"]
                tax_total = 0.0
                for period in self.all_periods:
                    tax = self.tax_data.get(profile, {}).get(period, 0.0)
                    row.append(self._format_currency(tax))
                    tax_total += tax
                row.append(self._format_currency(tax_total))
                rows.append(row)
            else:
                # Handle regular service rows
                row = [service]
                service_total = 0.0

                for period in self.all_periods:
                    cost = self.cost_data[profile].get(service, {}).get(period, 0.0)
                    row.append(self._format_currency(cost))
                    service_total += cost

                row.append(self._format_currency(service_total))
                rows.append(row)

        # Add Other row if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            row = ["Other"]
            service_total = 0.0

            for period in self.all_periods:
                cost = self.cost_data[profile].get("Other", {}).get(period, 0.0)
                row.append(self._format_currency(cost))
                service_total += cost

            row.append(self._format_currency(service_total))
            rows.append(row)

        # Add total row
        row = ["Total"]
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for service in self.cost_data[profile]:
                period_total += self.cost_data[profile][service].get(period, 0.0)
            row.append(self._format_currency(period_total))
            grand_total += period_total
        row.append(self._format_currency(grand_total))
        rows.append(row)

        return self._generate_html_table(headers, rows)

    def _generate_account_total_table_html(self) -> str:
        """Generate cost total per account table in HTML format."""
        # Create headers
        headers = ["Account"] + [self._format_period_display(period) for period in self.all_periods] + ["Total"]

        rows = []

        # Sort and add account rows
        sorted_profiles = self._sort_profiles_by_config(self.config["profiles"])
        for profile in sorted_profiles:
            row = [profile]
            account_total = 0.0

            for period in self.all_periods:
                period_total = 0.0
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
                row.append(self._format_currency(period_total))
                account_total += period_total

            row.append(self._format_currency(account_total))
            rows.append(row)

        # Add total row
        row = ["Total"]
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for profile in self.config["profiles"]:
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
            row.append(self._format_currency(period_total))
            grand_total += period_total
        row.append(self._format_currency(grand_total))
        rows.append(row)

        return self._generate_html_table(headers, rows)

    def _generate_service_total_table_html(self) -> str:
        """Generate cost total per service for every account table in HTML format."""
        # Create headers
        headers = ["Service"] + [self._format_period_display(period) for period in self.all_periods] + ["Total"]

        # Get all services across all profiles
        if len(self.config["services"]) == 0:
            # Show all services if config list is empty
            all_services = set()
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            # Use configured services
            all_services = set(self.config["services"])
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        rows = []

        # Filter and sort services
        filtered_services = [service for service in all_services if self._should_include_service(service)]
        sorted_services = self._sort_services_by_config(filtered_services)

        # Add service rows (including taxes if enabled)
        for service in sorted_services:
            if service == "Taxes":
                # Handle taxes row
                row = ["Taxes"]
                tax_total = 0.0
                for period in self.all_periods:
                    period_tax = 0.0
                    for profile in self.config["profiles"]:
                        period_tax += self.tax_data.get(profile, {}).get(period, 0.0)
                    row.append(self._format_currency(period_tax))
                    tax_total += period_tax
                row.append(self._format_currency(tax_total))
                rows.append(row)
            else:
                # Handle regular service rows
                row = [service]
                service_total = 0.0

                for period in self.all_periods:
                    period_total = 0.0
                    for profile in self.config["profiles"]:
                        period_total += self.cost_data[profile].get(service, {}).get(period, 0.0)
                    row.append(self._format_currency(period_total))
                    service_total += period_total

                row.append(self._format_currency(service_total))
                rows.append(row)

        # Add Other row if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            row = ["Other"]
            service_total = 0.0

            for period in self.all_periods:
                period_total = 0.0
                for profile in self.config["profiles"]:
                    period_total += self.cost_data[profile].get("Other", {}).get(period, 0.0)
                row.append(self._format_currency(period_total))
                service_total += period_total

            row.append(self._format_currency(service_total))
            rows.append(row)

        # Add total row
        row = ["Total"]
        grand_total = 0.0
        for period in self.all_periods:
            period_total = 0.0
            for profile in self.config["profiles"]:
                for service in self.cost_data[profile]:
                    period_total += self.cost_data[profile][service].get(period, 0.0)
            row.append(self._format_currency(period_total))
            grand_total += period_total
        row.append(self._format_currency(grand_total))
        rows.append(row)

        return self._generate_html_table(headers, rows)

    def _generate_chart_colors(self, count: int) -> List[str]:
        """Generate a list of distinct colors for charts."""
        colors = [
            "#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF",
            "#FF9F40", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
            "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE",
            "#85C1E9", "#F8C471", "#82E0AA", "#F1948A", "#85929E",
            "#5DADE2", "#58D68D", "#F4D03F", "#AF7AC5", "#5499C7",
            "#52BE80", "#F39C12", "#E74C3C", "#8E44AD", "#3498DB"
        ]
        return colors[:count] if count <= len(colors) else colors * ((count // len(colors)) + 1)

    def _generate_stacked_bar_chart(self, chart_id: str, title: str, labels: List[str], datasets: List[Dict]) -> str:
        """Generate HTML for a responsive Bootstrap stacked bar chart."""
        return f"""
        <div class="col-lg-6 col-md-12 mb-4">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="card-title text-center mb-0">{title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="{chart_id}"></canvas>
                </div>
            </div>
        </div>
        <script>
        const ctx_{chart_id} = document.getElementById('{chart_id}').getContext('2d');
        new Chart(ctx_{chart_id}, {{
            type: 'bar',
            data: {{
                labels: {labels},
                datasets: {datasets}
            }},
            options: {{
                responsive: true,
                scales: {{
                    x: {{
                        stacked: true,
                    }},
                    y: {{
                        stacked: true,
                        ticks: {{
                            callback: function(value) {{
                                return '$' + value.toLocaleString();
                            }}
                        }}
                    }}
                }},
                plugins: {{
                    legend: {{
                        position: 'top',
                    }},
                    tooltip: {{
                        callbacks: {{
                            label: function(context) {{
                                return context.dataset.label + ': $' + context.raw.toLocaleString();
                            }}
                        }}
                    }}
                }}
            }}
        }});
        </script>
        """

    def _generate_pie_chart(self, chart_id: str, title: str, labels: List[str], data: List[float], colors: List[str]) -> str:
        """Generate HTML for a responsive Bootstrap pie chart."""
        return f"""
        <div class="col-lg-6 col-md-12 mb-4">
            <div class="card h-100">
                <div class="card-header bg-light">
                    <h5 class="card-title text-center mb-0">{title}</h5>
                </div>
                <div class="card-body">
                    <canvas id="{chart_id}"></canvas>
                </div>
            </div>
        </div>
        <script>
        const ctx_{chart_id} = document.getElementById('{chart_id}').getContext('2d');
        new Chart(ctx_{chart_id}, {{
            type: 'pie',
            data: {{
                labels: {labels},
                datasets: [{{
                    data: {data},
                    backgroundColor: {colors},
                    borderWidth: 1
                }}]
            }},
            options: {{
                responsive: true,
                plugins: {{
                    legend: {{
                        position: 'right',
                    }},
                    tooltip: {{
                        callbacks: {{
                            label: function(context) {{
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = ((context.raw / total) * 100).toFixed(1);
                                return context.label + ': $' + context.raw.toLocaleString() + ' (' + percentage + '%)';
                            }}
                        }}
                    }}
                }}
            }}
        }});
        </script>
        """

    def _generate_account_total_charts(self) -> str:
        """Generate charts for account total data."""
        # Prepare data for charts
        period_labels = [self._format_period_display(period) for period in self.all_periods]
        account_names = self.config["profiles"]

        # Stacked bar chart data
        datasets = []
        colors = self._generate_chart_colors(len(account_names))

        for i, profile in enumerate(account_names):
            period_data = []
            for period in self.all_periods:
                period_total = 0.0
                for service in self.cost_data.get(profile, {}):
                    period_total += self.cost_data[profile][service].get(period, 0.0)
                period_data.append(period_total)

            datasets.append({"label": profile, "data": period_data, "backgroundColor": colors[i], "borderColor": colors[i], "borderWidth": 1})

        # Pie chart data (total costs per account)
        pie_labels = []
        pie_data = []
        pie_colors = []

        for i, profile in enumerate(account_names):
            total_cost = 0.0
            for service in self.cost_data.get(profile, {}):
                for period in self.all_periods:
                    total_cost += self.cost_data[profile][service].get(period, 0.0)

            if total_cost > 0:
                pie_labels.append(profile)
                pie_data.append(total_cost)
                pie_colors.append(colors[i])

        # Generate charts HTML
        charts_html = '<div class="chart-container">\n'
        charts_html += '    <div class="row">\n'
        charts_html += self._generate_stacked_bar_chart("accountBarChart", "Cost per Account over Time", period_labels, datasets)
        charts_html += self._generate_pie_chart("accountPieChart", "Total Cost Distribution by Account", pie_labels, pie_data, pie_colors)
        charts_html += "    </div>\n"
        charts_html += "</div>\n"

        return charts_html

    def _generate_service_total_charts(self) -> str:
        """Generate charts for service total data."""
        # Get all services across all profiles
        if len(self.config["services"]) == 0:
            all_services = set()
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            all_services = set(self.config["services"])
            for profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        # Filter services
        services_list = [service for service in sorted(all_services) if self._should_include_service(service)]

        # Add Other if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            services_list.append("Other")

        period_labels = [self._format_period_display(period) for period in self.all_periods]

        # Stacked bar chart data
        datasets = []
        colors = self._generate_chart_colors(len(services_list))

        for i, service in enumerate(services_list):
            period_data = []
            for period in self.all_periods:
                period_total = 0.0
                for profile in self.config["profiles"]:
                    period_total += self.cost_data.get(profile, {}).get(service, {}).get(period, 0.0)
                period_data.append(period_total)

            datasets.append({"label": service, "data": period_data, "backgroundColor": colors[i], "borderColor": colors[i], "borderWidth": 1})

        # Pie chart data (total costs per service)
        pie_labels = []
        pie_data = []
        pie_colors = []

        for i, service in enumerate(services_list):
            total_cost = 0.0
            for profile in self.config["profiles"]:
                for period in self.all_periods:
                    total_cost += self.cost_data.get(profile, {}).get(service, {}).get(period, 0.0)

            if total_cost > 0:
                pie_labels.append(service)
                pie_data.append(total_cost)
                pie_colors.append(colors[i])

        # Generate charts HTML
        charts_html = '<div class="chart-container">\n'
        charts_html += '    <div class="row">\n'
        charts_html += self._generate_stacked_bar_chart("serviceBarChart", "Cost per Service over Time", period_labels, datasets)
        charts_html += self._generate_pie_chart("servicePieChart", "Total Cost Distribution by Service", pie_labels, pie_data, pie_colors)
        charts_html += "    </div>\n"
        charts_html += "</div>\n"

        return charts_html

    def _generate_profile_service_charts(self, profile: str) -> str:
        """Generate charts for individual profile service costs."""
        # Get all services for this profile
        if len(self.config["services"]) == 0:
            # Show all services if config list is empty
            all_services = set()
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())
        else:
            # Use configured services
            all_services = set(self.config["services"])
            if profile in self.cost_data:
                all_services.update(self.cost_data[profile].keys())

        # Filter services
        services_list = [service for service in sorted(all_services) if self._should_include_service(service)]

        # Add Other if it exists and we're not showing all services
        if "Other" in all_services and len(self.config["services"]) > 0:
            services_list.append("Other")

        if not services_list:
            return ""

        period_labels = [self._format_period_display(period) for period in self.all_periods]

        # Stacked bar chart data
        datasets = []
        colors = self._generate_chart_colors(len(services_list))

        for i, service in enumerate(services_list):
            period_data = []
            for period in self.all_periods:
                cost = self.cost_data.get(profile, {}).get(service, {}).get(period, 0.0)
                period_data.append(cost)

            datasets.append({"label": service, "data": period_data, "backgroundColor": colors[i], "borderColor": colors[i], "borderWidth": 1})

        # Pie chart data (total costs per service for this profile)
        pie_labels = []
        pie_data = []
        pie_colors = []

        for i, service in enumerate(services_list):
            total_cost = 0.0
            for period in self.all_periods:
                total_cost += self.cost_data.get(profile, {}).get(service, {}).get(period, 0.0)

            if total_cost > 0:
                pie_labels.append(service)
                pie_data.append(total_cost)
                pie_colors.append(colors[i])

        if not pie_labels:
            return ""

        # Generate safe chart IDs
        safe_profile = profile.replace("-", "_").replace(" ", "_")

        # Generate charts HTML
        charts_html = '<div class="chart-container">\n'
        charts_html += '    <div class="row">\n'
        charts_html += self._generate_stacked_bar_chart(f"{safe_profile}ServiceBarChart", f"Cost per Service over Time - {profile}", period_labels, datasets)
        charts_html += self._generate_pie_chart(f"{safe_profile}ServicePieChart", f"Service Cost Distribution - {profile}", pie_labels, pie_data, pie_colors)
        charts_html += "    </div>\n"
        charts_html += "</div>\n"

        return charts_html

    def _get_html_header(self) -> str:
        """Generate HTML header with Bootstrap and Chart.js."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS cost report</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        /* Custom AWS-themed colors */
        .aws-orange {
            color: #ff9900;
            border-color: #ff9900;
        }
        .aws-orange-bg {
            background-color: #ff9900;
            color: white;
        }
        .aws-border-left {
            border-left: 4px solid #ff9900;
        }
        .chart-container {
            margin: 2rem 0;
        }
        .total-row {
            background-color: #e9ecef !important;
            font-weight: bold;
        }
        canvas {
            max-height: 400px;
        }
        /* Responsive table wrapper */
        .table-responsive {
            margin: 1.5rem 0;
        }
        /* Sortable table headers */
        .sortable {
            cursor: pointer;
            user-select: none;
        }
        .sortable:hover {
            background-color: #495057 !important;
        }
        .sort-icon {
            margin-left: 5px;
            opacity: 0.5;
        }
        .sort-active {
            opacity: 1;
        }
    </style>
    <script>
        // Table sorting functionality
        function sortTable(tableId, columnIndex, isNumeric = false) {
            const table = document.getElementById(tableId);
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
            // Don't sort the total row (last row)
            const totalRow = rows.pop();
            
            // Get current sort direction
            const header = table.getElementsByTagName('th')[columnIndex];
            const currentDirection = header.getAttribute('data-sort-direction') || 'none';
            const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';
            
            // Clear all sort indicators
            const headers = table.getElementsByTagName('th');
            for (let i = 0; i < headers.length; i++) {
                headers[i].setAttribute('data-sort-direction', 'none');
                const icon = headers[i].querySelector('.sort-icon');
                if (icon) {
                    icon.innerHTML = '↕️';
                    icon.classList.remove('sort-active');
                }
            }
            
            // Set new sort direction
            header.setAttribute('data-sort-direction', newDirection);
            const icon = header.querySelector('.sort-icon');
            if (icon) {
                icon.innerHTML = newDirection === 'asc' ? '↑' : '↓';
                icon.classList.add('sort-active');
            }
            
            // Sort rows
            rows.sort((a, b) => {
                let aVal = a.getElementsByTagName('td')[columnIndex].textContent.trim();
                let bVal = b.getElementsByTagName('td')[columnIndex].textContent.trim();
                
                if (isNumeric) {
                    // Remove currency symbols and commas for numeric comparison
                    aVal = parseFloat(aVal.replace(/[$,]/g, '')) || 0;
                    bVal = parseFloat(bVal.replace(/[$,]/g, '')) || 0;
                    return newDirection === 'asc' ? aVal - bVal : bVal - aVal;
                } else {
                    // String comparison
                    return newDirection === 'asc' ? 
                        aVal.localeCompare(bVal) : 
                        bVal.localeCompare(aVal);
                }
            });
            
            // Rebuild table body
            tbody.innerHTML = '';
            rows.forEach(row => tbody.appendChild(row));
            tbody.appendChild(totalRow); // Add total row back at the end
        }
        
        // Initialize sorting on page load
        document.addEventListener('DOMContentLoaded', function() {
            // Add sort icons to sortable headers
            const sortableHeaders = document.querySelectorAll('.sortable');
            sortableHeaders.forEach(header => {
                const icon = document.createElement('span');
                icon.className = 'sort-icon';
                icon.innerHTML = '↕️';
                header.appendChild(icon);
            });
        });
    </script>
</head>
<body class="bg-light">
    <div class="container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="bg-white shadow-sm rounded p-4 mb-4">
                    <h1 class="text-center aws-orange border-bottom border-3 pb-3 mb-4">AWS cost report</h1>
"""

    def _get_html_footer(self) -> str:
        """Generate HTML footer."""
        return """                </div>
            </div>
        </div>
    </div>
</body>
</html>"""

    def _generate_html_table(self, headers: List[str], rows: List[List[str]]) -> str:
        """Generate responsive Bootstrap HTML table from headers and rows with sorting."""
        self.table_counter += 1
        table_id = f"table_{self.table_counter}"

        html = '<div class="table-responsive">\n'
        html += f'<table id="{table_id}" class="table table-striped table-hover table-sm">\n'

        # Generate header with sorting
        html += '  <thead class="table-dark">\n'
        html += "    <tr>\n"
        for i, header in enumerate(headers):
            alignment = "text-start" if i == 0 else "text-end"
            is_numeric = i > 0  # First column is name, others are numeric
            sortable_class = "sortable" if i == 0 or i == len(headers) - 1 else ""  # Make name and total columns sortable
            onclick = f"onclick=\"sortTable('{table_id}', {i}, {str(is_numeric).lower()})\"" if sortable_class else ""
            html += f'      <th class="{alignment} {sortable_class}" {onclick}>{header}</th>\n'
        html += "    </tr>\n"
        html += "  </thead>\n"

        # Generate body
        html += "  <tbody>\n"
        for i, row in enumerate(rows):
            css_class = ' class="total-row table-warning"' if i == len(rows) - 1 else ""
            html += f"    <tr{css_class}>\n"
            for j, cell in enumerate(row):
                alignment = "text-start fw-bold" if j == 0 else "text-end"
                html += f'      <td class="{alignment}">{cell}</td>\n'
            html += "    </tr>\n"
        html += "  </tbody>\n"

        html += "</table>\n"
        html += "</div>\n"
        return html


def main():
    """Main function to run the cost reporter."""
    parser = argparse.ArgumentParser(description="Generate AWS cost reports from YAML configuration")
    parser.add_argument("config_file", help="Path to YAML configuration file")

    args = parser.parse_args()

    reporter = AWSCostReporter(args.config_file)
    reporter.generate_reports()


if __name__ == "__main__":
    main()
