import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldDraftPreview } from '../../../../../components/world-draft-preview';
import { AdminApiError } from '../../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadWorldDraft, loadWorldPreview } from '../../../../../lib/worlds/api';
import { exactDraftPreviewAssetPins } from '../../../../../lib/worlds/preview-parity';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldPreviewPage(props: {
  readonly params: Promise<{ readonly mapId: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('maps.preview');
  await requireAuthorizedAdmin('maps.edit');
  await requireAuthorizedAdmin('assets.read');
  const { mapId } = await props.params;
  const versionValue = (await props.searchParams)['version'];
  const version = z.uuid().safeParse(typeof versionValue === 'string' ? versionValue : undefined);
  if (!version.success) notFound();

  try {
    const [preview, draft] = await Promise.all([
      loadWorldPreview(mapId, version.data),
      loadWorldDraft(mapId, version.data),
    ]);
    const assetPins = exactDraftPreviewAssetPins(preview, draft, preview.manifest.assets);
    if (assetPins === null) {
      throw new Error('Exact Draft Preview revision or asset-pin coverage mismatch.');
    }
    return (
      <main className="world-preview-page" aria-labelledby="preview-title">
        <header className="operations-intro">
          <div>
            <Link className="back-link" href={`/worlds/${mapId}`}>
              ← {preview.map.displayName}
            </Link>
            <p className="eyebrow">Protected validated content</p>
            <h1 id="preview-title">Draft Preview</h1>
            <p>
              Version {preview.version.versionNumber} · checksum{' '}
              <code>{preview.version.checksum?.slice(0, 16) ?? 'unavailable'}…</code>
            </p>
          </div>
          <div className="world-assets-intro__actions">
            <Link
              className="button button--secondary"
              href={`/worlds/visual-readiness?mapId=${preview.map.id}&version=${preview.version.id}`}
            >
              Visual Readiness
            </Link>
            <Link
              className="button button--secondary"
              href={`/worlds/${mapId}/editor?version=${preview.version.id}`}
            >
              Return to editor
            </Link>
          </div>
        </header>
        <WorldDraftPreview assetPins={assetPins} preview={preview} />
      </main>
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="preview-title">
        <h1 id="preview-title">Draft preview unavailable</h1>
        <section className="empty-state" role="alert">
          <p>
            Only a server-validated draft may open in the isolated administrator preview. No cached
            or player-visible draft is shown.
          </p>
          <Link className="button button--secondary" href={`/worlds/${mapId}`}>
            Return to world record
          </Link>
        </section>
      </main>
    );
  }
}
