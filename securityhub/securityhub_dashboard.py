#!/usr/bin/env python3
"""
AWS Security Hub Dashboard Generator

This script generates Security Hub dashboards using Security Hub API.
It takes a YAML configuration file as input and generates HTML reports with
findings organized by account, region, and severity.
"""

import argparse
import sys
import os
from typing import Dict, List, Any
from collections import defaultdict
import yaml
import boto3
from botocore.exceptions import ClientError, NoCredentialsError


class SecurityHubDashboard:
    def __init__(self, config_file: str):
        """Initialize the Security Hub dashboard with configuration."""
        self.config = self._load_config(config_file)
        self.findings_data = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(int))))
        self.detailed_findings = []  # Store detailed findings for the table
        self.table_counter = 0
        self.severity_order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]
        self.regions = set()

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
        required_fields = ["report_name", "profiles", "home_region"]

        for field in required_fields:
            if field not in config:
                print(f"Error: Required field '{field}' missing in configuration.")
                sys.exit(1)

        if not isinstance(config["profiles"], list):
            print("Error: 'profiles' must be a list.")
            sys.exit(1)

        if not isinstance(config["home_region"], str):
            print("Error: 'home_region' must be a string.")
            sys.exit(1)

    def _get_securityhub_client(self, profile: str) -> boto3.client:
        """Get Security Hub client for a specific profile in the home region."""
        try:
            session = boto3.Session(profile_name=profile)
            return session.client("securityhub", region_name=self.config["home_region"])
        except Exception as e:
            print(f"Error creating client for profile '{profile}' in home region '{self.config['home_region']}': {e}")
            return None

    def _get_findings_data(self, profile: str) -> None:
        """Fetch findings data from AWS Security Hub for a profile from the home region."""
        client = self._get_securityhub_client(profile)
        if not client:
            return

        try:
            paginator = client.get_paginator("get_findings")
            page_iterator = paginator.paginate(
                Filters={
                    "RecordState": [{"Value": "ACTIVE", "Comparison": "EQUALS"}],
                    "WorkflowStatus": [{"Value": "NEW", "Comparison": "EQUALS"}, {"Value": "NOTIFIED", "Comparison": "EQUALS"}],
                }
            )

            for page in page_iterator:
                findings = page.get("Findings", [])
                self._process_findings_data(findings, profile)

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code == "InvalidAccessException":
                print(f"Security Hub not enabled for profile '{profile}' in home region '{self.config['home_region']}'")
            else:
                print(f"Error fetching findings data for profile '{profile}' in home region '{self.config['home_region']}': {e}")
        except NoCredentialsError:
            print(f"Error: No credentials found for profile '{profile}'.")

    def _process_findings_data(self, findings: List[Dict[str, Any]], profile: str) -> None:
        """Process raw findings data and store in internal structure."""
        for finding in findings:
            severity = finding.get("Severity", {}).get("Label")

            # skip findings with severity INFORMATIONAL
            if severity == "INFORMATIONAL":
                continue

            # Extract region from the finding's Region field
            region = finding["Region"]
            if region not in self.regions:
                self.regions.add(region)

            id = finding.get("Id").split("/")[-1]  # Extract the finding ID
            workflow_state = finding.get("WorkflowState")
            title = finding.get("Title", "N/A")
            product_name = finding.get("ProductName", "N/A")

            # print(f"{profile} - {region} ) Finding {id} - {severity} - {workflow_state}")

            # Store detailed finding for the detailed table
            self.detailed_findings.append(
                {"account": profile, "region": region, "title": title, "severity": severity, "workflow_state": workflow_state, "product_name": product_name, "id": id}
            )

            self.findings_data[profile][region][severity]["count"] += 1

    def generate_dashboard(self) -> None:
        """Generate Security Hub dashboard for all profiles."""
        # Fetch data for all profiles from the home region
        for profile in self.config["profiles"]:
            print(f"Fetching Security Hub findings for profile: {profile} from home region: {self.config['home_region']}")
            self._get_findings_data(profile)

        # Generate HTML dashboard
        self._generate_html_dashboard()
        print("Security Hub dashboard generated successfully!")

    def _generate_html_dashboard(self) -> str:
        """Generate HTML dashboard with all tables."""
        content = self._get_html_header()

        # Generate findings per account tables
        for profile in self.config["profiles"]:
            content += f'<h2 class="aws-border-left ps-3 mt-4 mb-3">Security Hub Findings for Account - {profile}</h2>\n'
            content += self._generate_account_findings_table(profile)
            content += "\n"
            content += self._generate_account_charts(profile)
            content += "\n"

        # Generate global summary table
        content += '<h2 class="aws-border-left ps-3 mt-4 mb-3">Global Security Hub Summary</h2>\n'
        content += self._generate_global_summary_table()
        content += "\n"
        content += self._generate_global_charts()
        content += "\n"

        # Generate detailed findings table
        content += '<h2 class="aws-border-left ps-3 mt-4 mb-3">All Security Hub Findings</h2>\n'
        content += self._generate_detailed_findings_table()
        content += self._get_html_footer()

        # Save dashboard
        reports_dir = "reports"
        os.makedirs(reports_dir, exist_ok=True)

        filename = f"{self.config['report_name']}.html"
        filepath = os.path.join(reports_dir, filename)

        with open(filepath, "w") as f:
            f.write(content)
        print(f"Security Hub dashboard saved: {filepath}")

    def _generate_account_findings_table(self, profile: str) -> str:
        """Generate findings table for a specific account showing regions and severities."""
        headers = ["Region"] + self.severity_order + ["Total"]
        rows = []

        # Get all regions for this profile
        profile_regions = sorted(self.regions)

        for region in profile_regions:
            row = [region]
            region_total = 0

            for severity in self.severity_order:
                count = self.findings_data[profile][region][severity]["count"]
                row.append(str(count))
                region_total += count

            row.append(str(region_total))
            rows.append(row)

        # Add total row
        total_row = ["Total"]
        grand_total = 0

        for severity in self.severity_order:
            severity_total = 0
            for region in profile_regions:
                severity_total += self.findings_data[profile][region][severity]["count"]
            total_row.append(str(severity_total))
            grand_total += severity_total

        total_row.append(str(grand_total))
        rows.append(total_row)

        return self._generate_html_table(headers, rows)

    def _generate_global_summary_table(self) -> str:
        """Generate global summary table showing all accounts, regions, and severities."""
        headers = ["Account"] + self.severity_order + ["Total"]
        rows = []

        for profile in self.config["profiles"]:
            row = [profile]
            profile_total = 0

            for severity in self.severity_order:
                severity_total = 0
                for region in self.regions:
                    severity_total += self.findings_data[profile][region][severity]["count"]
                row.append(str(severity_total))
                profile_total += severity_total

            row.append(str(profile_total))
            rows.append(row)

        # Add total row
        total_row = ["Total"]
        grand_total = 0

        for severity in self.severity_order:
            severity_total = 0
            for profile in self.config["profiles"]:
                for region in self.regions:
                    severity_total += self.findings_data[profile][region][severity]["count"]
            total_row.append(str(severity_total))
            grand_total += severity_total

        total_row.append(str(grand_total))
        rows.append(total_row)

        return self._generate_html_table(headers, rows)

    def _generate_chart_colors(self, count: int) -> List[str]:
        """Generate a list of distinct colors for charts."""
        colors = {"CRITICAL": "#DC3545", "HIGH": "#FD7E14", "MEDIUM": "#FFC107", "LOW": "#20C997", "INFORMATIONAL": "#6C757D"}

        # For other charts, use additional colors
        additional_colors = ["#FF6384", "#36A2EB", "#FFCE56", "#4BC0C0", "#9966FF", "#FF9F40", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4"]

        return list(colors.values()) + additional_colors[: max(0, count - len(colors))]

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
                                return value.toLocaleString();
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
                                return context.dataset.label + ': ' + context.raw.toLocaleString();
                            }}
                        }}
                    }}
                }}
            }}
        }});
        </script>
        """

    def _generate_pie_chart(self, chart_id: str, title: str, labels: List[str], data: List[int], colors: List[str]) -> str:
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
                                return context.label + ': ' + context.raw.toLocaleString() + ' (' + percentage + '%)';
                            }}
                        }}
                    }}
                }}
            }}
        }});
        </script>
        """

    def _generate_account_charts(self, profile: str) -> str:
        """Generate charts for individual account findings."""
        # Prepare data for charts
        region_labels = sorted(list(self.regions))

        # Stacked bar chart data by severity
        datasets = []
        severity_colors = self._generate_chart_colors(len(self.severity_order))

        for i, severity in enumerate(self.severity_order):
            region_data = []
            for region in region_labels:
                count = self.findings_data[profile][region][severity]["count"]
                region_data.append(count)

            if sum(region_data) > 0:  # Only include severities with data
                datasets.append({"label": severity, "data": region_data, "backgroundColor": severity_colors[i], "borderColor": severity_colors[i], "borderWidth": 1})

        # Pie chart data (total findings per severity for this account)
        pie_labels = []
        pie_data = []
        pie_colors = []

        for i, severity in enumerate(self.severity_order):
            total_count = 0
            for region in self.regions:
                total_count += self.findings_data[profile][region][severity]["count"]

            if total_count > 0:
                pie_labels.append(severity)
                pie_data.append(total_count)
                pie_colors.append(severity_colors[i])

        # Generate safe chart IDs
        safe_profile = profile.replace("-", "_").replace(" ", "_")

        # Generate charts HTML
        charts_html = '<div class="chart-container">\n'
        charts_html += '    <div class="row">\n'

        if datasets:
            charts_html += self._generate_stacked_bar_chart(f"{safe_profile}FindingsBarChart", f"Security Findings by Region - {profile}", region_labels, datasets)

        if pie_labels:
            charts_html += self._generate_pie_chart(f"{safe_profile}FindingsPieChart", f"Findings by Severity - {profile}", pie_labels, pie_data, pie_colors)

        charts_html += "    </div>\n"
        charts_html += "</div>\n"

        return charts_html

    def _generate_global_charts(self) -> str:
        """Generate charts for global findings summary."""
        account_names = self.config["profiles"]

        # Stacked bar chart data by account
        datasets = []
        colors = self._generate_chart_colors(len(account_names))

        for i, profile in enumerate(account_names):
            severity_data = []
            for severity in self.severity_order:
                total_count = 0
                for region in self.regions:
                    total_count += self.findings_data[profile][region][severity]["count"]
                severity_data.append(total_count)

            if sum(severity_data) > 0:  # Only include accounts with data
                datasets.append({"label": profile, "data": severity_data, "backgroundColor": colors[i], "borderColor": colors[i], "borderWidth": 1})

        # Pie chart data (total findings per account)
        pie_labels = []
        pie_data = []
        pie_colors = []

        for i, profile in enumerate(account_names):
            total_count = 0
            for region in self.regions:
                for severity in self.severity_order:
                    total_count += self.findings_data[profile][region][severity]["count"]

            if total_count > 0:
                pie_labels.append(profile)
                pie_data.append(total_count)
                pie_colors.append(colors[i])

        # Generate charts HTML
        charts_html = '<div class="chart-container">\n'
        charts_html += '    <div class="row">\n'

        if datasets:
            charts_html += self._generate_stacked_bar_chart("globalSeverityBarChart", "Global Findings by Severity and Account", self.severity_order, datasets)

        if pie_labels:
            charts_html += self._generate_pie_chart("globalAccountPieChart", "Total Findings Distribution by Account", pie_labels, pie_data, pie_colors)

        charts_html += "    </div>\n"
        charts_html += "</div>\n"

        return charts_html

    def _generate_detailed_findings_table(self) -> str:
        """Generate detailed findings table with filtering and sorting."""
        html = """<div class="table-responsive">
            <div class="mb-3">
                <div class="row">
                    <div class="col-md-2">
                        <label for="accountFilter" class="form-label">Account:</label>
                        <select id="accountFilter" class="form-select form-select-sm">
                            <option value="">All Accounts</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label for="regionFilter" class="form-label">Region:</label>
                        <select id="regionFilter" class="form-select form-select-sm">
                            <option value="">All Regions</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label for="severityFilter" class="form-label">Severity:</label>
                        <select id="severityFilter" class="form-select form-select-sm">
                            <option value="">All Severities</option>
                            <option value="CRITICAL">CRITICAL</option>
                            <option value="HIGH">HIGH</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="LOW">LOW</option>
                        </select>
                    </div>
                    <div class="col-md-2">
                        <label for="workflowFilter" class="form-label">Workflow:</label>
                        <select id="workflowFilter" class="form-select form-select-sm">
                            <option value="">All States</option>
                            <option value="NEW">NEW</option>
                            <option value="NOTIFIED">NOTIFIED</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label for="titleSearch" class="form-label">Search Title:</label>
                        <input type="text" id="titleSearch" class="form-control form-control-sm" placeholder="Search in title...">
                    </div>
                </div>
            </div>
            <table id="detailedFindingsTable" class="table table-striped table-hover table-sm">
                <thead class="table-dark">
                    <tr>
                        <th class="sortable" onclick="sortDetailedTable(0, false)">Account <span class="sort-icon">↕️</span></th>
                        <th class="sortable" onclick="sortDetailedTable(1, false)">Region <span class="sort-icon">↕️</span></th>
                        <th class="sortable" onclick="sortDetailedTable(2, false)">Title <span class="sort-icon">↕️</span></th>
                        <th class="sortable" onclick="sortDetailedTable(3, false)">Severity <span class="sort-icon">↕️</span></th>
                        <th class="sortable" onclick="sortDetailedTable(4, false)">Workflow <span class="sort-icon">↕️</span></th>
                        <th class="sortable" onclick="sortDetailedTable(5, false)">Product <span class="sort-icon">↕️</span></th>
                    </tr>
                </thead>
                <tbody>
"""

        # Add table rows
        for finding in self.detailed_findings:
            severity_class = f"severity-{finding['severity'].lower()}"
            html += f"""                    <tr class="{severity_class}">
                        <td class="text-start fw-bold">{finding['account']}</td>
                        <td class="text-center">{finding['region']}</td>
                        <td class="text-start" title="{finding['title']}">{finding['title'][:80]}{'...' if len(finding['title']) > 80 else ''}</td>
                        <td class="text-center"><span class="badge bg-{self._get_severity_badge_color(finding['severity'])}">{finding['severity']}</span></td>
                        <td class="text-center">{finding['workflow_state']}</td>
                        <td class="text-center">{finding['product_name']}</td>
                    </tr>
"""

        html += """                </tbody>
            </table>
        </div>
        
        <script>
        // Populate filter dropdowns
        document.addEventListener('DOMContentLoaded', function() {
            const table = document.getElementById('detailedFindingsTable');
            const rows = Array.from(table.getElementsByTagName('tbody')[0].getElementsByTagName('tr'));
            
            // Get unique values for filters
            const accounts = [...new Set(rows.map(row => row.cells[0].textContent.trim()))];
            const regions = [...new Set(rows.map(row => row.cells[1].textContent.trim()))];
            
            // Populate account filter
            const accountFilter = document.getElementById('accountFilter');
            accounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account;
                option.textContent = account;
                accountFilter.appendChild(option);
            });
            
            // Populate region filter
            const regionFilter = document.getElementById('regionFilter');
            regions.forEach(region => {
                const option = document.createElement('option');
                option.value = region;
                option.textContent = region;
                regionFilter.appendChild(option);
            });
            
            // Add event listeners for filtering
            document.getElementById('accountFilter').addEventListener('change', filterTable);
            document.getElementById('regionFilter').addEventListener('change', filterTable);
            document.getElementById('severityFilter').addEventListener('change', filterTable);
            document.getElementById('workflowFilter').addEventListener('change', filterTable);
            document.getElementById('titleSearch').addEventListener('input', filterTable);
        });
        
        function filterTable() {
            const table = document.getElementById('detailedFindingsTable');
            const rows = Array.from(table.getElementsByTagName('tbody')[0].getElementsByTagName('tr'));
            
            const accountFilter = document.getElementById('accountFilter').value.toLowerCase();
            const regionFilter = document.getElementById('regionFilter').value.toLowerCase();
            const severityFilter = document.getElementById('severityFilter').value.toLowerCase();
            const workflowFilter = document.getElementById('workflowFilter').value.toLowerCase();
            const titleSearch = document.getElementById('titleSearch').value.toLowerCase();
            
            rows.forEach(row => {
                const account = row.cells[0].textContent.toLowerCase();
                const region = row.cells[1].textContent.toLowerCase();
                const title = row.cells[2].textContent.toLowerCase();
                const severity = row.cells[3].textContent.toLowerCase();
                const workflow = row.cells[4].textContent.toLowerCase();
                
                const showRow = (accountFilter === '' || account.includes(accountFilter)) &&
                              (regionFilter === '' || region.includes(regionFilter)) &&
                              (severityFilter === '' || severity.includes(severityFilter)) &&
                              (workflowFilter === '' || workflow.includes(workflowFilter)) &&
                              (titleSearch === '' || title.includes(titleSearch));
                
                row.style.display = showRow ? '' : 'none';
            });
        }
        
        function sortDetailedTable(columnIndex, isNumeric = false) {
            const table = document.getElementById('detailedFindingsTable');
            const tbody = table.getElementsByTagName('tbody')[0];
            const rows = Array.from(tbody.getElementsByTagName('tr'));
            
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
                    aVal = parseFloat(aVal.replace(/[^0-9.-]/g, '')) || 0;
                    bVal = parseFloat(bVal.replace(/[^0-9.-]/g, '')) || 0;
                    return newDirection === 'asc' ? aVal - bVal : bVal - aVal;
                } else {
                    return newDirection === 'asc' ? 
                        aVal.localeCompare(bVal) : 
                        bVal.localeCompare(aVal);
                }
            });
            
            // Rebuild table body
            tbody.innerHTML = '';
            rows.forEach(row => tbody.appendChild(row));
        }
        </script>
"""

        return html

    def _get_severity_badge_color(self, severity: str) -> str:
        """Get Bootstrap badge color for severity."""
        colors = {"CRITICAL": "danger", "HIGH": "warning", "MEDIUM": "info", "LOW": "success"}
        return colors.get(severity, "secondary")

    def _get_html_header(self) -> str:
        """Generate HTML header with Bootstrap and Chart.js."""
        return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AWS Security Hub Dashboard</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
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
        .table-responsive {
            margin: 1.5rem 0;
        }
        .severity-critical { background-color: #f8d7da !important; }
        .severity-high { background-color: #fff3cd !important; }
        .severity-medium { background-color: #d1ecf1 !important; }
        .severity-low { background-color: #d4edda !important; }
        .severity-informational { background-color: #f8f9fa !important; }
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
</head>
<body class="bg-light">
    <div class="container-fluid">
        <div class="row">
            <div class="col-12">
                <div class="bg-white shadow-sm rounded p-4 mb-4">
                    <h1 class="text-center aws-orange border-bottom border-3 pb-3 mb-4">AWS Security Hub Dashboard</h1>
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
        """Generate responsive Bootstrap HTML table from headers and rows."""
        self.table_counter += 1
        table_id = f"table_{self.table_counter}"

        html = '<div class="table-responsive">\n'
        html += f'<table id="{table_id}" class="table table-striped table-hover table-sm">\n'

        # Generate header
        html += '  <thead class="table-dark">\n'
        html += "    <tr>\n"
        for i, header in enumerate(headers):
            alignment = "text-start" if i == 0 else "text-center"
            html += f'      <th class="{alignment}">{header}</th>\n'
        html += "    </tr>\n"
        html += "  </thead>\n"

        # Generate body
        html += "  <tbody>\n"
        for i, row in enumerate(rows):
            css_class = ' class="total-row table-warning"' if i == len(rows) - 1 else ""
            html += f"    <tr{css_class}>\n"
            for j, cell in enumerate(row):
                alignment = "text-start fw-bold" if j == 0 else "text-center"

                # Add severity-based coloring for non-total rows
                severity_class = ""
                if i < len(rows) - 1 and j > 0 and j < len(headers) - 1:  # Not total row, not first/last column
                    severity = headers[j].lower()
                    if cell != "0":
                        severity_class = f"severity-{severity}"

                html += f'      <td class="{alignment} {severity_class}">{cell}</td>\n'
            html += "    </tr>\n"
        html += "  </tbody>\n"

        html += "</table>\n"
        html += "</div>\n"
        return html


def main():
    """Main function to run the Security Hub dashboard generator."""
    parser = argparse.ArgumentParser(description="Generate AWS Security Hub dashboard from YAML configuration")
    parser.add_argument("config_file", nargs="?", default="config.yaml", help="Path to YAML configuration file (default: config.yaml)")

    args = parser.parse_args()

    dashboard = SecurityHubDashboard(args.config_file)
    dashboard.generate_dashboard()


if __name__ == "__main__":
    main()
