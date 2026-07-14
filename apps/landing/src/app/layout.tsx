import '@starville/design-tokens/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { loadPublishedPlatformConfiguration } from '../lib/platform-configuration';

// eslint-disable-next-line react-refresh/only-export-components
export async function generateMetadata(): Promise<Metadata> {
  const platform = await loadPublishedPlatformConfiguration();
  return {
    title: `${platform.configuration.branding.fullGameName} · ${platform.configuration.branding.tagline}`,
    description: platform.configuration.branding.shortDescription,
    ...(platform.assetUrls.branding.favicon === null
      ? {}
      : { icons: { icon: platform.assetUrls.branding.favicon } }),
    ...(platform.assetUrls.branding.social_share_image === null
      ? {}
      : { openGraph: { images: [platform.assetUrls.branding.social_share_image] } }),
  };
}

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
