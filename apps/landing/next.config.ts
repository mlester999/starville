import type { NextConfig } from 'next';

import { parseLandingPublicConfig } from './src/lib/public-config';

parseLandingPublicConfig(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@starville/config',
    '@starville/design-tokens',
    '@starville/platform-configuration',
    '@starville/wallet-access',
  ],
};

export default nextConfig;
