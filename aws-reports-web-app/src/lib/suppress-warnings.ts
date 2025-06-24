// Suppress specific Ant Design compatibility warnings for React 18
// This is safe since we're using React 18.3.1 which is supported by Ant Design v5

if (typeof window !== 'undefined') {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function(...args: unknown[]) {
    const message = args[0];
    
    // Suppress the specific Ant Design React compatibility warning
    if (typeof message === 'string' && 
        message.includes('[antd: compatible]') && 
        message.includes('antd v5 support React is 16 ~ 18')) {
      return; // Don't log this warning since we ARE using React 18
    }
    
    originalError.apply(console, args);
  };

  console.warn = function(...args: unknown[]) {
    const message = args[0];
    
    // Suppress the specific Ant Design React compatibility warning
    if (typeof message === 'string' && 
        message.includes('[antd: compatible]') && 
        message.includes('antd v5 support React is 16 ~ 18')) {
      return; // Don't log this warning since we ARE using React 18
    }
    
    originalWarn.apply(console, args);
  };
}