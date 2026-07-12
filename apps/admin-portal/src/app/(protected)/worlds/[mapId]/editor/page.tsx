import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldEditor } from '../../../../../components/world-editor';
import { AdminApiError } from '../../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadWorldAssets, loadWorldDraft } from '../../../../../lib/worlds/api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldEditorPage(props: {
  readonly params: Promise<{ readonly mapId: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('maps.edit');
  await requireAuthorizedAdmin('assets.read');
  const { mapId } = await props.params;
  const versionValue = (await props.searchParams)['version'];
  const version = z.uuid().safeParse(typeof versionValue === 'string' ? versionValue : undefined);
  if (!version.success) notFound();

  try {
    const [draft, assets] = await Promise.all([
      loadWorldDraft(mapId, version.data),
      loadWorldAssets({ page: 1, pageSize: 100, search: '' }),
    ]);
    if (!['draft', 'validated'].includes(draft.version.lifecycleStatus)) notFound();

    return (
      <WorldEditor
        approvedAssets={assets.items}
        draft={draft}
        saveRequestId={randomUUID()}
        validationRequestId={randomUUID()}
      />
    );
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="editor-unavailable-title">
        <h1 id="editor-unavailable-title">World editor unavailable</h1>
        <section className="empty-state" role="alert">
          <p>
            The protected draft or approved asset catalog could not be loaded. No cached manifest is
            opened for editing.
          </p>
          <Link className="button button--secondary" href={`/worlds/${mapId}`}>
            Return to world record
          </Link>
        </section>
      </main>
    );
  }
}
