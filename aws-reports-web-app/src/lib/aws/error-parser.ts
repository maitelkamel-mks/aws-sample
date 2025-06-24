export function parseAWSError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error occurred';
  }

  const message = error.message;

  // SSO session errors
  if (message.includes('SSO session') && message.includes('invalid')) {
    return 'AWS SSO session has expired. Please run "aws sso login" to refresh your session.';
  }

  // Credential errors
  if (message.includes('Unable to locate credentials') || message.includes('No credentials')) {
    return 'AWS credentials not found. Please configure your AWS credentials using "aws configure".';
  }

  // Permission errors
  if (message.includes('AccessDenied') || message.includes('UnauthorizedOperation')) {
    return 'Access denied. Please check your AWS permissions for this operation.';
  }

  // Cost Explorer specific errors
  if (message.includes('Cost Explorer')) {
    if (message.includes('not enabled')) {
      return 'AWS Cost Explorer is not enabled for this account. Please enable it in the AWS console.';
    }
    if (message.includes('access denied')) {
      return 'Access denied to Cost Explorer. Please ensure you have the necessary IAM permissions.';
    }
  }

  // Security Hub specific errors
  if (message.includes('Security Hub')) {
    if (message.includes('not enabled')) {
      return 'AWS Security Hub is not enabled in this region. Please enable it in the AWS console.';
    }
    if (message.includes('access denied')) {
      return 'Access denied to Security Hub. Please ensure you have the necessary IAM permissions.';
    }
  }

  // Region specific errors
  if (message.includes('InvalidRegion') || message.includes('region')) {
    return 'Invalid AWS region specified or service not available in this region.';
  }

  // Network errors
  if (message.includes('timeout') || message.includes('ENOTFOUND') || message.includes('network')) {
    return 'Network connectivity issue. Please check your internet connection.';
  }

  // Return the original message if no specific pattern is matched
  return message;
}