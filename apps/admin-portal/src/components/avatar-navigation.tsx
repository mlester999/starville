'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface AvatarNavigationItem {
  readonly href: string;
  readonly label: string;
}

export function AvatarNavigation({ items }: { readonly items: readonly AvatarNavigationItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Avatar content administration" className="avatar-section-navigation">
      <div>
        {items.map((item) => {
          const active =
            item.href === '/game-content/avatars'
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link aria-current={active ? 'page' : undefined} href={item.href} key={item.href}>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
