import { useEffect, useState, useCallback } from 'react';
import { 
  getTokenRefreshService, 
  TokenRefreshOptions, 
  RefreshResult 
} from '@/lib/aws/token-refresh-service';

export interface UseTokenRefreshReturn {
  isRunning: boolean;
  start: () => void;
  stop: () => void;
  refreshProfile: (profileName: string) => Promise<RefreshResult>;
  status: {
    isRunning: boolean;
    checkIntervalMs: number;
    refreshThresholdMinutes: number;
    registeredCallbacks: number;
  };
  nextRefreshTimes: Array<{
    profileName: string;
    expiresAt: Date;
    needsRefresh: boolean;
    nextRefreshAt: Date;
  }>;
}

export interface UseTokenRefreshOptions extends TokenRefreshOptions {
  autoStart?: boolean; // Whether to automatically start the service
  onRefresh?: (result: RefreshResult) => void; // Global refresh callback
}

export function useTokenRefresh(options: UseTokenRefreshOptions = {}): UseTokenRefreshReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState({
    isRunning: false,
    checkIntervalMs: 0,
    refreshThresholdMinutes: 0,
    registeredCallbacks: 0
  });
  const [nextRefreshTimes, setNextRefreshTimes] = useState<Array<{
    profileName: string;
    expiresAt: Date;
    needsRefresh: boolean;
    nextRefreshAt: Date;
  }>>([]);

  const service = getTokenRefreshService(options);

  // Update status when service changes
  const updateStatus = useCallback(() => {
    const currentStatus = service.getStatus();
    setStatus(currentStatus);
    setIsRunning(currentStatus.isRunning);
  }, [service]);

  // Update next refresh times
  const updateNextRefreshTimes = useCallback(async () => {
    try {
      const times = await service.getNextRefreshTimes();
      setNextRefreshTimes(times);
    } catch (error) {
      console.error('Error updating next refresh times:', error);
    }
  }, [service]);

  // Start the service
  const start = useCallback(() => {
    service.start();
    updateStatus();
  }, [service, updateStatus]);

  // Stop the service
  const stop = useCallback(() => {
    service.stop();
    updateStatus();
  }, [service, updateStatus]);

  // Manual refresh for a specific profile
  const refreshProfile = useCallback(async (profileName: string): Promise<RefreshResult> => {
    const result = await service.manualRefresh(profileName);
    updateStatus();
    await updateNextRefreshTimes();
    return result;
  }, [service, updateStatus, updateNextRefreshTimes]);

  // Set up global refresh callback
  useEffect(() => {
    if (options.onRefresh) {
      // Register callback for all profiles
      // Note: This is a simplified approach. In a real implementation,
      // you might want to register for specific profiles or handle this differently
      const handleRefresh = (result: RefreshResult) => {
        options.onRefresh!(result);
        updateStatus();
        updateNextRefreshTimes();
      };

      // For now, we'll use a polling approach to detect changes
      // In a production implementation, you'd want to integrate this better
      // with the service's callback system
    }
  }, [options.onRefresh, updateStatus, updateNextRefreshTimes]);

  // Auto-start if requested
  useEffect(() => {
    if (options.autoStart) {
      start();
    }

    // Cleanup on unmount
    return () => {
      if (options.autoStart) {
        stop();
      }
    };
  }, [options.autoStart, start, stop]);

  // Update status and refresh times periodically
  useEffect(() => {
    updateStatus();
    updateNextRefreshTimes();

    const statusInterval = setInterval(() => {
      updateStatus();
    }, 30000); // Update status every 30 seconds

    const refreshTimesInterval = setInterval(() => {
      updateNextRefreshTimes();
    }, 60000); // Update refresh times every minute

    return () => {
      clearInterval(statusInterval);
      clearInterval(refreshTimesInterval);
    };
  }, [updateStatus, updateNextRefreshTimes]);

  return {
    isRunning,
    start,
    stop,
    refreshProfile,
    status,
    nextRefreshTimes
  };
}

// Profile-specific token refresh hook
export interface UseProfileTokenRefreshOptions {
  profileName: string;
  onRefresh?: (result: RefreshResult) => void;
  onError?: (error: string) => void;
}

export function useProfileTokenRefresh(options: UseProfileTokenRefreshOptions) {
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const service = getTokenRefreshService();

  // Manual refresh for this specific profile
  const refresh = useCallback(async (): Promise<RefreshResult> => {
    setIsRefreshing(true);
    try {
      const result = await service.manualRefresh(options.profileName);
      setLastRefresh(result);
      
      if (result.success && options.onRefresh) {
        options.onRefresh(result);
      } else if (!result.success && options.onError) {
        options.onError(result.error || 'Unknown error');
      }
      
      return result;
    } finally {
      setIsRefreshing(false);
    }
  }, [service, options]);

  // Register for refresh notifications for this profile
  useEffect(() => {
    if (options.onRefresh) {
      service.onRefresh(options.profileName, (result) => {
        setLastRefresh(result);
        options.onRefresh!(result);
      });

      return () => {
        service.offRefresh(options.profileName);
      };
    }
  }, [service, options.profileName, options.onRefresh]);

  return {
    refresh,
    isRefreshing,
    lastRefresh
  };
}