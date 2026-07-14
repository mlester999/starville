import type { NextConfig } from 'next';

import { parseAdminPublicConfig } from './src/lib/public-config';
import { buildAdminContentSecurityPolicy } from './src/lib/security/content-security-policy';

const publicConfig = parseAdminPublicConfig(process.env);
const contentSecurityPolicy = buildAdminContentSecurityPolicy({
  apiUrl: publicConfig.apiUrl,
  supabaseUrl: publicConfig.supabase.url,
  development: publicConfig.environment === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@starville/admin-auth',
    '@starville/asset-management',
    '@starville/config',
    '@starville/design-tokens',
    '@starville/platform-configuration',
    '@starville/supabase',
    '@starville/wallet-access',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
