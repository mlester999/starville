import type { NextConfig } from 'next';

import { parseAdminPublicConfig } from './src/lib/public-config';

parseAdminPublicConfig(process.env);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@starville/admin-auth',
    '@starville/config',
    '@starville/design-tokens',
    '@starville/supabase',
    '@starville/wallet-access',
  ],
};

export default nextConfig;
