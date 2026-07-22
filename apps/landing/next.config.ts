import type { NextConfig } from 'next';

import { assertProductionRuntimeSafetyGatesClosed } from '@starville/config/server';

import { parseLandingPublicConfig } from './src/lib/public-config';
import { buildLandingContentSecurityPolicy } from './src/lib/security/content-security-policy';

assertProductionRuntimeSafetyGatesClosed(process.env);
const publicConfig = parseLandingPublicConfig(process.env);
const contentSecurityPolicy = buildLandingContentSecurityPolicy({
  apiUrl: publicConfig.apiUrl,
  supabaseUrl: publicConfig.supabase.url,
  development: publicConfig.environment === 'development',
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@starville/config',
    '@starville/design-tokens',
    '@starville/platform-configuration',
    '@starville/wallet-access',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          ...(publicConfig.environment === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
