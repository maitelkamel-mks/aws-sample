export interface AuditEvent {
  timestamp: Date;
  event: string;
  level: 'info' | 'warn' | 'error';
  userId?: string;
  profileName?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
  success: boolean;
}

export interface AuditLoggerOptions {
  maxEntries?: number;
  enableConsoleLogging?: boolean;
  enableFileLogging?: boolean;
  logFilePath?: string;
}

export class AuditLogger {
  private logs: AuditEvent[] = [];
  private options: Required<AuditLoggerOptions>;

  constructor(options: AuditLoggerOptions = {}) {
    this.options = {
      maxEntries: options.maxEntries || 1000,
      enableConsoleLogging: options.enableConsoleLogging ?? true,
      enableFileLogging: options.enableFileLogging ?? false,
      logFilePath: options.logFilePath || '/tmp/aws-reports-audit.log'
    };
  }

  public logEvent(event: Omit<AuditEvent, 'timestamp'>): void {
    const auditEvent: AuditEvent = {
      ...event,
      timestamp: new Date()
    };

    // Add to in-memory log
    this.logs.push(auditEvent);

    // Trim logs if they exceed max entries
    if (this.logs.length > this.options.maxEntries) {
      this.logs = this.logs.slice(-this.options.maxEntries);
    }

    // Console logging
    if (this.options.enableConsoleLogging) {
      this.logToConsole(auditEvent);
    }

    // File logging (if enabled and in appropriate environment)
    if (this.options.enableFileLogging && typeof window === 'undefined') {
      this.logToFile(auditEvent);
    }
  }

  private logToConsole(event: AuditEvent): void {
    const message = `[${event.timestamp.toISOString()}] [${event.level.toUpperCase()}] ${event.event}`;
    const details = event.details ? ` - ${JSON.stringify(event.details)}` : '';
    const fullMessage = `${message}${details}`;

    switch (event.level) {
      case 'error':
        console.error(fullMessage);
        break;
      case 'warn':
        console.warn(fullMessage);
        break;
      default:
        console.log(fullMessage);
    }
  }

  private async logToFile(event: AuditEvent): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const logEntry = JSON.stringify(event) + '\n';
      await fs.appendFile(this.options.logFilePath, logEntry);
    } catch (error) {
      console.error('Failed to write audit log to file:', error);
    }
  }

  // SSO-specific logging methods
  public logSSOAuthentication(profileName: string, success: boolean, error?: string): void {
    this.logEvent({
      event: 'sso_authentication',
      level: success ? 'info' : 'error',
      profileName,
      success,
      details: error ? { error } : undefined
    });
  }

  public logSSOTokenRefresh(profileName: string, success: boolean, error?: string): void {
    this.logEvent({
      event: 'sso_token_refresh',
      level: success ? 'info' : 'warn',
      profileName,
      success,
      details: error ? { error } : undefined
    });
  }

  public logSSOLogout(profileName: string, success: boolean): void {
    this.logEvent({
      event: 'sso_logout',
      level: 'info',
      profileName,
      success
    });
  }

  public logConfigurationChange(configType: string, success: boolean, details?: Record<string, unknown>): void {
    this.logEvent({
      event: 'configuration_change',
      level: success ? 'info' : 'error',
      success,
      details: { configType, ...details }
    });
  }

  public logCredentialAccess(profileName: string, operation: 'store' | 'retrieve' | 'remove', success: boolean): void {
    this.logEvent({
      event: 'credential_access',
      level: success ? 'info' : 'warn',
      profileName,
      success,
      details: { operation }
    });
  }

  public logSecurityEvent(event: string, level: 'info' | 'warn' | 'error', details?: Record<string, unknown>): void {
    this.logEvent({
      event: `security_${event}`,
      level,
      success: level === 'info',
      details
    });
  }

  // Query methods
  public getLogs(filter?: {
    event?: string;
    level?: 'info' | 'warn' | 'error';
    profileName?: string;
    since?: Date;
    until?: Date;
    success?: boolean;
  }): AuditEvent[] {
    let filteredLogs = [...this.logs];

    if (filter) {
      if (filter.event) {
        filteredLogs = filteredLogs.filter(log => log.event.includes(filter.event!));
      }
      if (filter.level) {
        filteredLogs = filteredLogs.filter(log => log.level === filter.level);
      }
      if (filter.profileName) {
        filteredLogs = filteredLogs.filter(log => log.profileName === filter.profileName);
      }
      if (filter.since) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filter.since!);
      }
      if (filter.until) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filter.until!);
      }
      if (filter.success !== undefined) {
        filteredLogs = filteredLogs.filter(log => log.success === filter.success);
      }
    }

    return filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  public getSecuritySummary(since?: Date): {
    totalEvents: number;
    successfulAuthentications: number;
    failedAuthentications: number;
    tokenRefreshes: number;
    configurationChanges: number;
    securityEvents: number;
    recentErrors: AuditEvent[];
  } {
    const logs = this.getLogs(since ? { since } : undefined);

    return {
      totalEvents: logs.length,
      successfulAuthentications: logs.filter(log => 
        log.event === 'sso_authentication' && log.success
      ).length,
      failedAuthentications: logs.filter(log => 
        log.event === 'sso_authentication' && !log.success
      ).length,
      tokenRefreshes: logs.filter(log => 
        log.event === 'sso_token_refresh'
      ).length,
      configurationChanges: logs.filter(log => 
        log.event === 'configuration_change'
      ).length,
      securityEvents: logs.filter(log => 
        log.event.startsWith('security_')
      ).length,
      recentErrors: logs.filter(log => 
        log.level === 'error'
      ).slice(0, 10)
    };
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'event', 'level', 'success', 'profileName', 'details'];
      const csvRows = [
        headers.join(','),
        ...this.logs.map(log => [
          log.timestamp.toISOString(),
          log.event,
          log.level,
          log.success.toString(),
          log.profileName || '',
          log.details ? JSON.stringify(log.details).replace(/"/g, '""') : ''
        ].map(field => `"${field}"`).join(','))
      ];
      return csvRows.join('\n');
    } else {
      return JSON.stringify(this.logs, null, 2);
    }
  }
}

// Global instance
let globalAuditLogger: AuditLogger | null = null;

export function getAuditLogger(options?: AuditLoggerOptions): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = new AuditLogger(options);
  }
  return globalAuditLogger;
}

// Convenience functions
export function logSSOAuthentication(profileName: string, success: boolean, error?: string): void {
  getAuditLogger().logSSOAuthentication(profileName, success, error);
}

export function logSSOTokenRefresh(profileName: string, success: boolean, error?: string): void {
  getAuditLogger().logSSOTokenRefresh(profileName, success, error);
}

export function logSSOLogout(profileName: string, success: boolean): void {
  getAuditLogger().logSSOLogout(profileName, success);
}

export function logConfigurationChange(configType: string, success: boolean, details?: Record<string, unknown>): void {
  getAuditLogger().logConfigurationChange(configType, success, details);
}

export function logCredentialAccess(profileName: string, operation: 'store' | 'retrieve' | 'remove', success: boolean): void {
  getAuditLogger().logCredentialAccess(profileName, operation, success);
}

export function logSecurityEvent(event: string, level: 'info' | 'warn' | 'error', details?: Record<string, unknown>): void {
  getAuditLogger().logSecurityEvent(event, level, details);
}