'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface CosmeticsNavigationItem {
  readonly href: string;
  readonly label: string;
}

export function CosmeticsNavigation({
  items,
}: {
  readonly items: readonly CosmeticsNavigationItem[];
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Cosmetic content administration" className="avatar-section-navigation">
      <div>
        {items.map((item) => {
          const active =
            item.href === '/game-content/cosmetics'
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
