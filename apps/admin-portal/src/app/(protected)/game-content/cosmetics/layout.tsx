import type { ReactNode } from 'react';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  CosmeticsNavigation,
  type CosmeticsNavigationItem,
} from '../../../../components/cosmetics-navigation';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { requireEnabledPlatformModule } from '../../../../lib/platform-configuration/module-access';

export default async function CosmeticsLayout({ children }: { readonly children: ReactNode }) {
  const context = await requireAuthorizedAdmin('cosmetics.read');
  await requireEnabledPlatformModule('wardrobe');
  const items: CosmeticsNavigationItem[] = [
    { href: '/game-content/cosmetics', label: 'Overview' },
    { href: '/game-content/cosmetics/catalog', label: 'Catalog' },
    { href: '/game-content/cosmetics/collections', label: 'Collections' },
    { href: '/game-content/cosmetics/emotes', label: 'Emotes' },
    ...(hasAdminPermission(context, 'cosmetics.grant')
      ? ([
          { href: '/game-content/cosmetics/grants', label: 'Grants' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'cosmetics.revoke')
      ? ([
          { href: '/game-content/cosmetics/revocations', label: 'Revocations' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'cosmetics.review')
      ? ([
          { href: '/game-content/cosmetics/review', label: 'Review' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'cosmetics.shop.read')
      ? ([
          { href: '/game-content/cosmetics/shop', label: 'Shop' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'cosmetics.audit.read')
      ? ([
          { href: '/game-content/cosmetics/audit', label: 'Audit' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'cosmetics.settings.read')
      ? ([
          { href: '/game-content/cosmetics/settings', label: 'Settings' },
        ] satisfies CosmeticsNavigationItem[])
      : []),
  ];

  return (
    <div className="avatar-admin-area cosmetics-admin-area">
      <CosmeticsNavigation items={items} />
      {children}
    </div>
  );
}
