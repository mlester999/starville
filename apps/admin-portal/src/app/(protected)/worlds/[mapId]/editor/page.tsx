import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { hasAdminPermission } from '@starville/admin-auth';

import { WorldEditor } from '../../../../../components/world-editor';
import { AdminApiError } from '../../../../../lib/admin-api';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import { loadVerifiedTotpFactors } from '../../../../../lib/auth/mfa';
import { loadWorldEditorAssetCandidates } from '../../../../../lib/world-assets/api';
import { parseAdminPublicConfig } from '../../../../../lib/public-config';
import { createAdminServerClient } from '../../../../../lib/supabase/server';
import { loadWorldDraft } from '../../../../../lib/worlds/api';
import { loadWorldGameTestStatus } from '../../../../../lib/worlds/game-test-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WorldEditorPage(props: {
  readonly params: Promise<{ readonly mapId: string }>;
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const context = await requireAuthorizedAdmin('maps.edit');
  await requireAuthorizedAdmin('assets.read');
  const { mapId } = await props.params;
  const searchParameters = await props.searchParams;
  const versionValue = searchParameters['version'];
  const assetKeyValue = searchParameters['assetKey'];
  const returnedGameTestSessionValue = searchParameters['gameTestSessionId'];
  const version = z.uuid().safeParse(typeof versionValue === 'string' ? versionValue : undefined);
  const returnedGameTestSession = z
    .uuid()
    .safeParse(
      typeof returnedGameTestSessionValue === 'string' ? returnedGameTestSessionValue : undefined,
    );
  if (!version.success) notFound();
  const canOpenGameTest = hasAdminPermission(context, 'maps.preview');
  const publicConfig = parseAdminPublicConfig(process.env);

  try {
    const [draft, assets, gameTestStatus, authenticatorFactors] = await Promise.all([
      loadWorldDraft(mapId, version.data),
      loadWorldEditorAssetCandidates({
        page: 1,
        pageSize: 100,
        search: '',
        assetType: 'all',
        category: '',
        interaction: 'all',
      }),
      canOpenGameTest && context.assuranceLevel === 'aal2'
        ? loadWorldGameTestStatus(mapId, version.data, randomUUID()).catch(() => null)
        : Promise.resolve(null),
      loadVerifiedTotpFactors(await createAdminServerClient()).catch(() => []),
    ]);
    if (!['draft', 'validated'].includes(draft.version.lifecycleStatus)) notFound();

    return (
      <WorldEditor
        approvedAssets={assets.items}
        initialAssetKey={
          typeof assetKeyValue === 'string' &&
          /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(assetKeyValue)
            ? assetKeyValue
            : null
        }
        draft={draft}
        canOpenGameTest={canOpenGameTest}
        assuranceLevel={context.assuranceLevel}
        authenticatorEnrolled={authenticatorFactors.length > 0}
        gameTestEnvironment={publicConfig.environment}
        gameTestReopenUrl={new URL('/preview/world', publicConfig.gameUrl).toString()}
        initialGameTestStatus={gameTestStatus}
        returnedGameTestSessionId={
          returnedGameTestSession.success ? returnedGameTestSession.data : null
        }
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
