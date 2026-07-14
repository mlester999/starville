import type { ReactNode } from 'react';

import { PlatformSettingsTabs } from '../../../components/platform-settings-tabs';
import { requireAuthorizedAdmin } from '../../../lib/auth/authorization';

export default async function PlatformSettingsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  await requireAuthorizedAdmin('platform_configuration.read');
  return (
    <main className="platform-settings-shell">
      <header className="platform-settings-heading">
        <div>
          <p className="eyebrow">Reusable platform presentation</p>
          <h1>Platform Settings</h1>
          <p>
            Draft and preview game presentation without changing authentication, wallet, database,
            or infrastructure settings.
          </p>
        </div>
      </header>
      <PlatformSettingsTabs />
      {children}
    </main>
  );
}
