import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure we're using React 18 features correctly
  reactStrictMode: true,

  // Webpack configuration (only used when not using Turbopack)
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Suppress console warnings about React compatibility during development
      config.infrastructureLogging = {
        level: 'error',
      };
    }
    return config;
  },
};

export default nextConfig;
