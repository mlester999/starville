import Link from 'next/link';

import { WorldAssetGuidePanel } from '../../../../components/world-asset-guide-panel';
import { requireAssetManagerPermission } from '../../../../lib/world-assets/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetGuidePage() {
  await requireAssetManagerPermission('assets.read');

  return (
    <main
      className="operations-page world-assets-page admin-content-shell"
      aria-labelledby="asset-guide-title"
    >
      <header className="operations-intro world-assets-intro">
        <div>
          <p className="eyebrow">Operator guidance</p>
          <h1 id="asset-guide-title">Asset Guide &amp; Templates</h1>
          <p>
            Type-specific checklists, recommended canvas sizes, and downloadable blank transparent
            PNG templates. Templates are generated in your browser and are never uploaded
            automatically. Server-side validation remains authoritative for every real upload.
          </p>
        </div>
        <div className="world-assets-intro__actions">
          <Link className="button button--primary" href="/world-assets/upload">
            Upload asset
          </Link>
          <Link className="button button--quiet" href="/world-assets">
            Asset library
          </Link>
        </div>
      </header>

      <aside className="phase-note" aria-label="Guidance boundary">
        <span aria-hidden="true">◇</span>
        <div>
          <strong>Advisory only.</strong>
          <p>
            Browser templates and checklists help you prepare artwork. They do not change storage,
            permissions, activation, or published worlds. Download a template, paint production art,
            then use Upload Asset to create a draft.
          </p>
        </div>
      </aside>

      <WorldAssetGuidePanel />
    </main>
  );
}
