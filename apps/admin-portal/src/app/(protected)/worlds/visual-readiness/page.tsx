import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { WorldVisualReadiness } from '../../../../components/world-visual-readiness';
import { AdminApiError } from '../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../lib/auth/authorization';
import { loadWorldRevision } from '../../../../lib/worlds/api';
import { createAdminWorldVisualReadinessSnapshot } from '../../../../lib/worlds/visual-readiness-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const selectionSchema = z.object({ mapId: z.uuid(), version: z.uuid() }).strict();

export default async function WorldVisualReadinessPage(props: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  await requireAuthorizedAdmin('maps.read');
  const searchParameters = await props.searchParams;
  const mapId = searchParameters['mapId'];
  const version = searchParameters['version'];
  if (mapId === undefined && version === undefined) return <WorldVisualReadiness />;

  const selection = selectionSchema.safeParse({
    mapId: typeof mapId === 'string' ? mapId : undefined,
    version: typeof version === 'string' ? version : undefined,
  });
  if (!selection.success) notFound();

  let revision;
  try {
    revision = await loadWorldRevision(selection.data.mapId, selection.data.version);
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 404) notFound();
    return (
      <main className="operations-page" aria-labelledby="visual-readiness-unavailable-title">
        <h1 id="visual-readiness-unavailable-title">Visual Readiness unavailable</h1>
        <section className="empty-state" role="alert">
          <p>
            The exact world revision could not be loaded safely. No cached manifest or inferred
            readiness state is shown.
          </p>
          <Link className="button button--secondary" href="/worlds">
            Return to Worlds
          </Link>
        </section>
      </main>
    );
  }
  if (revision.map.id !== selection.data.mapId || revision.version.id !== selection.data.version) {
    notFound();
  }
  return <WorldVisualReadiness revision={createAdminWorldVisualReadinessSnapshot(revision)} />;
}
