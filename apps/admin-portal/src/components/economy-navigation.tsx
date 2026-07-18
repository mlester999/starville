'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface EconomyNavigationItem {
  readonly href: string;
  readonly label: string;
}

export function EconomyNavigation({ items }: { readonly items: readonly EconomyNavigationItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Economy administration" className="economy-section-navigation">
      <div>
        {items.map((item) => {
          const active =
            item.href === '/economy'
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
