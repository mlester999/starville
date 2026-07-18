import Link from 'next/link';

import { hasAdminPermission } from '@starville/admin-auth';
import { MOONPETAL_HARVEST_HELP } from '@starville/cooperative-activities';

import {
  cooperativeActivityEditorAction,
  cooperativeActivityLifecycleAction,
} from '../../../../actions/cooperative-activities';
import { requireAuthorizedAdmin } from '../../../../../lib/auth/authorization';
import {
  loadCooperativeActivities,
  previewCooperativeActivity,
} from '../../../../../lib/realtime/cooperative-activity-api';

export const dynamic = 'force-dynamic';

export default async function CooperativeActivityEditorPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly version?: string;
    readonly step?: string;
    readonly notice?: string;
  }>;
}) {
  const context = await requireAuthorizedAdmin('cooperative_activities.read');
  const canEdit = hasAdminPermission(context, 'cooperative_activities.edit');
  const canPreview = hasAdminPermission(context, 'cooperative_activities.preview');
  const query = await searchParams;
  const catalog = await loadCooperativeActivities({
    view: 'catalog',
    page: 1,
    pageSize: 100,
    status: 'all',
    search: '',
  });
  const selected =
    catalog.view === 'catalog'
      ? catalog.rows.find((version) => version.versionId === query.version)
      : undefined;
  const activity = selected ?? {
    ...MOONPETAL_HARVEST_HELP,
    activityKey: 'moonpetal-harvest-draft',
    name: 'Moonpetal Harvest Draft',
    status: 'draft' as const,
    revision: 1,
    publishedAt: null,
  };
  const step = Math.max(0, Math.min(16, Number(query.step ?? '0') || 0));
  const preview =
    selected === undefined
      ? undefined
      : !canPreview
        ? undefined
        : await previewCooperativeActivity(selected.versionId, step, crypto.randomUUID()).catch(
            () => undefined,
          );
  const editable = selected === undefined || selected.status === 'draft';
  return (
    <main className="operations-page activity-editor-page" aria-labelledby="activity-editor-title">
      <header className="operations-intro">
        <div>
          <p className="eyebrow">Closed-registry content workflow</p>
          <h1 id="activity-editor-title">Structured activity editor</h1>
          <p>
            Draft → Validate → Preview → Review → Publish. Published versions are immutable; this
            editor exposes no raw JSON, script, SQL, formula, or arbitrary reward item field.
          </p>
        </div>
        <Link href="/operations/activities?view=catalog">Back to catalog</Link>
      </header>
      {query.notice === undefined ? null : (
        <p className="notice-banner" role="status">
          {query.notice.replaceAll('-', ' ')}
        </p>
      )}
      <nav className="social-admin-links" aria-label="Activity versions">
        <Link href="/operations/activities/editor">New draft</Link>
        {catalog.view === 'catalog'
          ? catalog.rows.map((version) => (
              <Link
                key={version.versionId}
                href={`/operations/activities/editor?version=${version.versionId}`}
              >
                {version.name} · {version.status}
              </Link>
            ))
          : null}
      </nav>
      <form action={cooperativeActivityEditorAction} className="activity-editor-form">
        {selected === undefined ? null : (
          <>
            <input name="versionId" type="hidden" value={selected.versionId} />
            <input name="expectedRevision" type="hidden" value={selected.revision} />
          </>
        )}
        <fieldset disabled={!editable || !canEdit}>
          <legend>Identity and entry</legend>
          <label>
            Stable activity key
            <input defaultValue={activity.activityKey} maxLength={80} name="activityKey" required />
          </label>
          <label>
            Friendly name
            <input defaultValue={activity.name} maxLength={80} name="name" required />
          </label>
          <label>
            Short description
            <textarea
              defaultValue={activity.shortDescription}
              maxLength={180}
              name="shortDescription"
              required
            />
          </label>
          <label>
            Long description
            <textarea
              defaultValue={activity.longDescription}
              maxLength={1000}
              name="longDescription"
              required
            />
          </label>
          <label>
            Entry world
            <input defaultValue={activity.entryWorldId} name="entryWorldId" required />
          </label>
          <input name="entryWorldName" type="hidden" value={activity.entryWorldName} />
          <label>
            Entry interaction
            <input
              defaultValue={activity.entryInteractionKey}
              name="entryInteractionKey"
              required
            />
          </label>
          <label>
            Activity scene reference
            <input defaultValue={activity.sceneRef} name="sceneRef" required />
          </label>
        </fieldset>
        <fieldset disabled={!editable || !canEdit}>
          <legend>Party, time, and reconnect</legend>
          <label>
            Minimum party size
            <input
              defaultValue={activity.minimumPartySize}
              max={4}
              min={2}
              name="minimumPartySize"
              type="number"
            />
          </label>
          <label>
            Maximum party size
            <input
              defaultValue={activity.maximumPartySize}
              max={4}
              min={2}
              name="maximumPartySize"
              type="number"
            />
          </label>
          <label>
            Recommended level
            <input
              defaultValue={activity.recommendedLevel}
              max={999}
              min={1}
              name="recommendedLevel"
              type="number"
            />
          </label>
          <label>
            Duration seconds
            <input
              defaultValue={activity.durationSeconds}
              max={3600}
              min={60}
              name="durationSeconds"
              type="number"
            />
          </label>
          <label>
            Reconnect grace seconds
            <input
              defaultValue={activity.reconnectGraceSeconds}
              max={600}
              min={15}
              name="reconnectGraceSeconds"
              type="number"
            />
          </label>
          <label>
            Waiting timeout seconds
            <input
              defaultValue={activity.waitingForPlayersSeconds}
              max={600}
              min={15}
              name="waitingForPlayersSeconds"
              type="number"
            />
          </label>
        </fieldset>
        <fieldset disabled={!editable || !canEdit}>
          <legend>Closed objective sequence</legend>
          <p>
            Objective types and interaction keys are selected from the reviewed Moonpetal registry.
            Only bounded targets and the server timer are editable here.
          </p>
          {activity.objectives.map((objective, index) => (
            <label key={objective.key}>
              {index + 1}. {objective.label} <small>{objective.type}</small>
              {objective.type === 'timed_wait' ? (
                <input
                  defaultValue={objective.timeLimitSeconds ?? 30}
                  max={900}
                  min={5}
                  name={`objectiveTimer${index}`}
                  type="number"
                />
              ) : (
                <input
                  defaultValue={objective.target}
                  max={100}
                  min={1}
                  name={`objectiveTarget${index}`}
                  type="number"
                />
              )}
            </label>
          ))}
        </fieldset>
        <fieldset disabled={!editable || !canEdit}>
          <legend>Off-chain reward and limits</legend>
          <label>
            DUST
            <input
              defaultValue={activity.reward.dust}
              max={1000}
              min={0}
              name="rewardDust"
              type="number"
            />
          </label>
          <label>
            Moonbean quantity
            <input
              defaultValue={activity.reward.items[0]?.quantity ?? 1}
              max={20}
              min={1}
              name="rewardItemQuantity"
              type="number"
            />
          </label>
          <label>
            Minimum contribution
            <input
              defaultValue={activity.reward.minimumContribution}
              max={100}
              min={0}
              name="minimumContribution"
              type="number"
            />
          </label>
          <label>
            Entry cooldown seconds
            <input
              defaultValue={activity.entryCooldownSeconds}
              max={86400}
              min={0}
              name="entryCooldownSeconds"
              type="number"
            />
          </label>
          <label>
            Reward cooldown seconds
            <input
              defaultValue={activity.rewardCooldownSeconds}
              max={604800}
              min={0}
              name="rewardCooldownSeconds"
              type="number"
            />
          </label>
          <label>
            Daily reward limit
            <input
              defaultValue={activity.dailyRewardLimit}
              max={20}
              min={0}
              name="dailyRewardLimit"
              type="number"
            />
          </label>
          <label>
            Content version
            <input
              defaultValue={activity.contentVersion}
              min={1}
              name="contentVersion"
              type="number"
            />
          </label>
        </fieldset>
        {editable && canEdit ? (
          <button type="submit">Save draft</button>
        ) : (
          <p>
            Published and reviewed versions are read-only. Create a new draft to revise content.
          </p>
        )}
      </form>
      {selected === undefined ? null : (
        <section className="activity-lifecycle">
          <h2>Lifecycle</h2>
          <p>
            Current state: <strong>{selected.status}</strong> · revision {selected.revision}
          </p>
          <div>
            {(['validate', 'submit_review', 'publish', 'disable'] as const)
              .filter((action) =>
                hasAdminPermission(
                  context,
                  action === 'validate'
                    ? 'cooperative_activities.validate'
                    : action === 'submit_review'
                      ? 'cooperative_activities.review'
                      : 'cooperative_activities.publish',
                ),
              )
              .map((action) => (
                <form action={cooperativeActivityLifecycleAction} key={action}>
                  <input name="versionId" type="hidden" value={selected.versionId} />
                  <input name="expectedRevision" type="hidden" value={selected.revision} />
                  <input name="action" type="hidden" value={action} />
                  <button type="submit">{action.replace('_', ' ')}</button>
                </form>
              ))}
          </div>
        </section>
      )}
      {selected === undefined ? null : (
        <section className="activity-preview" aria-labelledby="preview-title">
          <p className="eyebrow">Preview Mode · no persistence · no rewards</p>
          <h2 id="preview-title">Staff-only objective preview</h2>
          {!canPreview ? (
            <p>You do not have activity preview permission.</p>
          ) : preview === undefined ? (
            <p>Preview permission or service is unavailable.</p>
          ) : (
            <>
              <p>
                Step {preview.simulationStep + 1}:{' '}
                <strong>{preview.currentObjectiveKey.replaceAll('-', ' ')}</strong>
              </p>
              <p>No completion, cooldown, inventory, DUST, or player record was created.</p>
            </>
          )}
          <nav>
            {selected.objectives.map((objective, index) => (
              <Link
                key={objective.key}
                href={`/operations/activities/editor?version=${selected.versionId}&step=${index}`}
              >
                {index + 1}
              </Link>
            ))}
          </nav>
        </section>
      )}
    </main>
  );
}
