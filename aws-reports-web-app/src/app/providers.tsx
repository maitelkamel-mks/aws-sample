'use client';

import { ConfigProvider, App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0, // Always consider data stale - no caching
        gcTime: 0, // Don't cache results in memory (formerly cacheTime)
        refetchOnMount: 'always', // Always refetch when component mounts
        retry: 2,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#1890ff',
          },
        }}
      >
        <App>
          {children}
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
}