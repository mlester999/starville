import type { Metadata } from 'next';
import Link from 'next/link';
import { z } from 'zod';

import { PlatformPreview } from '../../../../components/platform-preview';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import {
  loadPlatformConfiguration,
  loadPlatformPreview,
} from '../../../../lib/platform-configuration/api';

// Next.js route metadata intentionally shares the page module.
// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function PreviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly version?: string }>;
}) {
  await requireAuthorizedAdmin('platform_configuration.preview');
  const state = await loadPlatformConfiguration();
  const requested = z.uuid().safeParse((await searchParams).version);
  const versionId = requested.success ? requested.data : state.draft?.id;
  if (versionId === undefined) {
    return (
      <section className="platform-empty">
        <h2>No draft to preview</h2>
        <p>Create a draft first. The published presentation has not changed.</p>
      </section>
    );
  }
  const version = await loadPlatformPreview(versionId);
  return (
    <section className="platform-preview-page">
      <div className="platform-preview-banner" role="status">
        <strong>Preview Mode</strong>
        <span>Exact draft v{version.versionNumber}; nothing here is live.</span>
        <Link href="/platform-settings">Exit preview</Link>
      </div>
      <div className="platform-preview-sizes" aria-label="Preview viewport guidance">
        <span>Mobile · 390 × 844</span>
        <span>Tablet · 820 × 1180</span>
        <span>Desktop · 1440 × 900</span>
      </div>
      <PlatformPreview
        current={state.active.configuration}
        currentAssetUrls={state.active.assetUrls}
        draft={version.configuration}
        draftAssetUrls={version.assetUrls}
      />
    </section>
  );
}
