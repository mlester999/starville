import type { NextConfig } from 'next';

import { parseAdminPublicConfig } from './src/lib/public-config';

parseAdminPublicConfig(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@starville/config', '@starville/design-tokens'],
};

export default nextConfig;
