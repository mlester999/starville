import { WorldAssetUploadWizard } from '../../../../components/world-asset-upload-wizard';
import { requireAssetManagerPermission } from '../../../../lib/world-assets/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldAssetUploadPage() {
  await requireAssetManagerPermission('assets.upload');
  return (
    <main className="operations-page world-assets-page" aria-labelledby="asset-upload-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Private intake workflow</p>
          <h1 id="asset-upload-title">Upload World Asset</h1>
          <p>
            Start a draft version. Browser checks are advisory; the trusted server inspects actual
            file contents, decodes, re-encodes, hashes, de-duplicates, and generates derivatives.
          </p>
        </div>
        <span className="state-chip state-chip--pending">Draft only</span>
      </header>
      <WorldAssetUploadWizard />
    </main>
  );
}
