'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const sections = [
  ['Overview', '/platform-settings'],
  ['Branding', '/platform-settings/branding'],
  ['Theme', '/platform-settings/theme'],
  ['Typography', '/platform-settings/typography'],
  ['Admin login', '/platform-settings/admin-login'],
  ['Landing', '/platform-settings/landing'],
  ['Navigation', '/platform-settings/navigation'],
  ['Modules', '/platform-settings/modules'],
  ['Preview', '/platform-settings/preview'],
  ['Versions', '/platform-settings/versions'],
  ['Audit', '/platform-settings/audit'],
] as const;

export function PlatformSettingsTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Platform settings sections" className="platform-settings-tabs">
      {sections.map(([label, href]) => {
        const current = pathname === href;
        return (
          <Link
            aria-current={current ? 'page' : undefined}
            className={current ? 'is-active' : undefined}
            href={href}
            key={href}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
