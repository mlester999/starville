import Link from 'next/link';

import { WorldAssetUploadWizard } from '../../../../components/world-asset-upload-wizard';
import { loadAssetDirectory } from '../../../../lib/world-assets/api';
import {
  assetManagerCapabilities,
  requireAssetManagerPermission,
} from '../../../../lib/world-assets/authorization';
import { toPlaceholderMarkerOptions } from '../../../../lib/world-assets/placeholder-markers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetUploadPage() {
  const context = await requireAssetManagerPermission('assets.upload');
  const capabilities = assetManagerCapabilities(context);

  let markerOptions = toPlaceholderMarkerOptions([]);
  try {
    const markers = await loadAssetDirectory({
      page: 1,
      pageSize: 100,
      search: '',
      assetType: 'all',
      category: '',
      lifecycle: 'all',
      production: 'development_marker',
      sort: 'friendly_name',
      direction: 'asc',
    });
    markerOptions = toPlaceholderMarkerOptions(markers.items);
  } catch {
    markerOptions = toPlaceholderMarkerOptions([]);
  }

  return (
    <main
      className="operations-page world-assets-page admin-content-shell world-assets-upload-page"
      aria-labelledby="asset-upload-title"
    >
      <header className="operations-intro world-assets-intro">
        <div>
          <p className="eyebrow">Private intake workflow</p>
          <h1 id="asset-upload-title">Upload World Asset</h1>
          <p>
            Start a draft version. Browser checks are advisory; the trusted server inspects actual
            file contents, decodes, re-encodes, hashes, de-duplicates, and generates derivatives.
          </p>
        </div>
        <div className="world-assets-intro__actions">
          <span className="state-chip state-chip--pending">Draft only</span>
          <Link className="button button--quiet" href="/world-assets/guide">
            Guide &amp; templates
          </Link>
        </div>
      </header>
      <WorldAssetUploadWizard
        canBindPlaceholder={capabilities.canUpload}
        markerOptions={markerOptions}
      />
    </main>
  );
}
