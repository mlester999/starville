import '@starville/design-tokens/styles.css';
import './globals.css';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Next.js requires route metadata to be exported beside the layout component.
// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Starville Admin',
  description: 'Secure administration for authorized Starville staff.',
  icons: {
    icon: '/images/starville-icon-official.png',
    apple: '/images/starville-icon-official.png',
  },
  robots: {
    index: false,
    follow: false,
  },
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
