import type { ReactNode } from 'react';

import { hasAdminPermission } from '@starville/admin-auth';

import {
  AvatarNavigation,
  type AvatarNavigationItem,
} from '../../../../components/avatar-navigation';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { requireEnabledPlatformModule } from '../../../../lib/platform-configuration/module-access';

export default async function AvatarContentLayout({ children }: { readonly children: ReactNode }) {
  const context = await requireAuthorizedAdmin('avatar_content.read');
  await requireEnabledPlatformModule('avatar_customization');
  const items: AvatarNavigationItem[] = [
    { href: '/game-content/avatars', label: 'Overview' },
    { href: '/game-content/avatars/catalog', label: 'Catalog' },
    { href: '/game-content/avatars/assets', label: 'Assets' },
    ...(hasAdminPermission(context, 'avatar_content.review')
      ? ([
          { href: '/game-content/avatars/review', label: 'Review' },
          { href: '/game-content/avatars/validation', label: 'Validation' },
        ] satisfies AvatarNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'avatar_content.edit')
      ? ([
          { href: '/game-content/avatars/presets', label: 'Presets' },
        ] satisfies AvatarNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'avatar_content.audit.read')
      ? ([{ href: '/game-content/avatars/audit', label: 'Audit' }] satisfies AvatarNavigationItem[])
      : []),
    ...(hasAdminPermission(context, 'avatar_content.settings.read')
      ? ([
          { href: '/game-content/avatars/settings', label: 'Settings' },
        ] satisfies AvatarNavigationItem[])
      : []),
  ];

  return (
    <div className="avatar-admin-area">
      <AvatarNavigation items={items} />
      {children}
    </div>
  );
}
