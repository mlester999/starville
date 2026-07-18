import { hasAdminPermission } from '@starville/admin-auth';

import {
  activateAvatarVersionAction,
  approveAvatarVersionAction,
  reviewAvatarVersionAction,
  submitAvatarVersionAction,
  supersedeAvatarVersionAction,
  updateAvatarDraftAction,
  validateAvatarVersionAction,
} from '../../../../../actions/avatar-content';
import {
  AVATAR_DIRECTIONS,
  AvatarLifecycle,
  AvatarPageHeader,
  AvatarStatus,
  DirectionCoverage,
  SpriteSheetMapperPreview,
} from '../../../../../../components/avatar-admin-ui';
import { formatDate, friendlyKey } from '../../../../../../components/economy-admin-ui';
import { loadAvatarDefinition } from '../../../../../../lib/avatar-api';
import { requireAuthorizedAdmin } from '../../../../../../lib/auth/authorization';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ANIMATION_STATES = ['idle', 'walk', 'jog'] as const;

function LifecycleForm({
  action,
  definitionId,
  versionId,
  revision,
  label,
  decision,
  reasonRequired = true,
}: {
  readonly action: (formData: FormData) => Promise<void>;
  readonly definitionId: string;
  readonly versionId: string;
  readonly revision: number;
  readonly label: string;
  readonly decision?: 'accept' | 'changes_requested' | 'reject';
  readonly reasonRequired?: boolean;
}) {
  return (
    <form action={action} className="avatar-lifecycle-action">
      <input name="definitionId" type="hidden" value={definitionId} />
      <input name="versionId" type="hidden" value={versionId} />
      <input name="expectedRevision" type="hidden" value={revision} />
      {decision === undefined ? null : <input name="decision" type="hidden" value={decision} />}
      {reasonRequired ? (
        <label>
          Reason <span>(required, 12–500 characters)</span>
          <input maxLength={500} minLength={12} name="reason" required />
        </label>
      ) : null}
      <button type="submit">{label}</button>
    </form>
  );
}

export default async function AvatarDefinitionPage({
  params,
}: {
  readonly params: Promise<{ readonly definitionId: string }>;
}) {
  const context = await requireAuthorizedAdmin('avatar_content.read');
  const { definitionId } = await params;
  const result = await loadAvatarDefinition(definitionId);
  const { definition } = result;

  return (
    <main className="avatar-page" aria-labelledby="avatar-page-title">
      <AvatarPageHeader
        description="Edit bounded presentation metadata, inspect approved immutable asset references, map animation frames, and advance each version through separated lifecycle controls."
        eyebrow={`${friendlyKey(definition.category)} · ${friendlyKey(definition.layer)}`}
        title={definition.publicName}
      />

      <div className="avatar-editor-summary">
        <div>
          <code>{definition.stableKey}</code>
          <p>{definition.description}</p>
        </div>
        <div className="avatar-status-stack">
          <AvatarStatus value={definition.publicationState} />
          <AvatarStatus value={definition.validationState} />
        </div>
      </div>

      {result.versions.map((version) => {
        const canEdit =
          hasAdminPermission(context, 'avatar_content.edit') &&
          ['draft', 'invalid', 'changes_requested'].includes(version.state);
        return (
          <article className="avatar-version-editor" key={version.versionId}>
            <header>
              <div>
                <p className="eyebrow">Version {version.versionNumber}</p>
                <h2>{friendlyKey(version.state)}</h2>
              </div>
              <AvatarStatus value={version.validationState} />
            </header>
            <AvatarLifecycle state={version.state} />

            <section aria-labelledby={`general-${version.versionId}`}>
              <h3 id={`general-${version.versionId}`}>General and rendering</h3>
              {canEdit ? (
                <form action={updateAvatarDraftAction} className="avatar-structured-form">
                  <input name="definitionId" type="hidden" value={definition.definitionId} />
                  <input name="versionId" type="hidden" value={version.versionId} />
                  <input name="expectedRevision" type="hidden" value={version.revision} />
                  <label>
                    Public name
                    <input
                      defaultValue={definition.publicName}
                      maxLength={80}
                      minLength={3}
                      name="publicName"
                      required
                    />
                  </label>
                  <label>
                    Render order
                    <input
                      defaultValue={version.renderOrder}
                      max={100}
                      min={-100}
                      name="renderOrder"
                      required
                      type="number"
                    />
                  </label>
                  <label className="avatar-form-span">
                    Description
                    <textarea
                      defaultValue={definition.description}
                      maxLength={500}
                      minLength={3}
                      name="description"
                      required
                      rows={3}
                    />
                  </label>
                  {[
                    {
                      name: 'anchorX',
                      label: 'Anchor X',
                      value: version.anchorX,
                      min: 0,
                      max: 1,
                      step: 0.01,
                    },
                    {
                      name: 'anchorY',
                      label: 'Anchor Y',
                      value: version.anchorY,
                      min: 0,
                      max: 1,
                      step: 0.01,
                    },
                    {
                      name: 'offsetX',
                      label: 'Offset X',
                      value: version.offsetX,
                      min: -256,
                      max: 256,
                      step: 1,
                    },
                    {
                      name: 'offsetY',
                      label: 'Offset Y',
                      value: version.offsetY,
                      min: -256,
                      max: 256,
                      step: 1,
                    },
                  ].map(({ name, label, value, min, max, step }) => (
                    <label key={name}>
                      {label}
                      <input
                        defaultValue={value}
                        max={max}
                        min={min}
                        name={name}
                        required
                        step={step}
                        type="number"
                      />
                    </label>
                  ))}
                  <label>
                    Approved fallback key
                    <input
                      defaultValue={version.fallbackKey ?? ''}
                      maxLength={80}
                      name="fallbackKey"
                      pattern="[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*"
                    />
                  </label>
                  <fieldset className="avatar-form-span">
                    <legend>Supported directions</legend>
                    <div className="avatar-checkbox-grid">
                      {AVATAR_DIRECTIONS.map((direction) => (
                        <label key={direction}>
                          <input
                            defaultChecked={version.directions.includes(direction)}
                            name="directions"
                            type="checkbox"
                            value={direction}
                          />
                          {friendlyKey(direction)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset className="avatar-form-span">
                    <legend>Animation states</legend>
                    <div className="avatar-checkbox-grid">
                      {ANIMATION_STATES.map((state) => (
                        <label key={state}>
                          <input
                            defaultChecked={version.animationStates.includes(state)}
                            name="animationStates"
                            type="checkbox"
                            value={state}
                          />
                          {friendlyKey(state)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button type="submit">Save draft metadata</button>
                </form>
              ) : (
                <dl className="avatar-definition-list">
                  <div>
                    <dt>Render order</dt>
                    <dd>{version.renderOrder}</dd>
                  </div>
                  <div>
                    <dt>Anchor</dt>
                    <dd>
                      {version.anchorX}, {version.anchorY}
                    </dd>
                  </div>
                  <div>
                    <dt>Offset</dt>
                    <dd>
                      {version.offsetX}, {version.offsetY}
                    </dd>
                  </div>
                  <div>
                    <dt>Fallback</dt>
                    <dd>{version.fallbackKey ?? 'None'}</dd>
                  </div>
                </dl>
              )}
            </section>

            <section className="avatar-editor-grid" aria-label="Compatibility and preview">
              <div>
                <h3>Compatibility</h3>
                <DirectionCoverage directions={version.directions} />
                <p>
                  Body presets:{' '}
                  {version.compatibleBodyKeys.map(friendlyKey).join(', ') || 'No compatible body'}
                </p>
                <p>States: {version.animationStates.map(friendlyKey).join(', ') || 'Missing'}</p>
              </div>
              <div>
                <h3>Frame mapping preview</h3>
                <SpriteSheetMapperPreview />
              </div>
            </section>

            <section>
              <h3>Approved asset references</h3>
              {version.assets.length === 0 ? (
                <p>No approved asset reference has been selected for this version.</p>
              ) : (
                <div className="cozy-admin-table-wrap">
                  <table className="cozy-admin-table">
                    <thead>
                      <tr>
                        <th>Role</th>
                        <th>Asset</th>
                        <th>State</th>
                        <th>Media</th>
                        <th>Dimensions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {version.assets.map((asset) => (
                        <tr
                          key={`${asset.worldAssetId}:${asset.worldAssetVersionId}:${asset.role}`}
                        >
                          <td>{friendlyKey(asset.role)}</td>
                          <td>
                            <code>{asset.assetKey}</code>
                          </td>
                          <td>
                            <AvatarStatus value={asset.assetState} />
                          </td>
                          <td>{asset.mediaType}</td>
                          <td>
                            {asset.width} × {asset.height}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3>Animation mapping</h3>
              <p>
                {version.animations.length} bounded mapping rows. Source assets are immutable and no
                executable configuration is accepted.
              </p>
              <div className="avatar-animation-summary">
                {ANIMATION_STATES.map((state) => (
                  <span key={state}>
                    <strong>{friendlyKey(state)}</strong>
                    {version.animations.filter((mapping) => mapping.state === state).length}/8
                    directions
                  </span>
                ))}
              </div>
            </section>

            <section aria-live="polite">
              <h3>Validation</h3>
              {version.validationMessages.length === 0 ? (
                <p>No validation messages.</p>
              ) : (
                <ul>
                  {version.validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3>Controlled lifecycle actions</h3>
              <div className="avatar-lifecycle-actions">
                {hasAdminPermission(context, 'avatar_content.edit') &&
                ['draft', 'invalid', 'changes_requested'].includes(version.state) ? (
                  <>
                    <LifecycleForm
                      action={validateAvatarVersionAction}
                      definitionId={definition.definitionId}
                      label="Validate"
                      reasonRequired={false}
                      revision={version.revision}
                      versionId={version.versionId}
                    />
                    {version.validationState === 'valid' ? (
                      <LifecycleForm
                        action={submitAvatarVersionAction}
                        definitionId={definition.definitionId}
                        label="Submit for review"
                        revision={version.revision}
                        versionId={version.versionId}
                      />
                    ) : null}
                  </>
                ) : null}
                {hasAdminPermission(context, 'avatar_content.review') &&
                version.state === 'in_review' ? (
                  <>
                    <LifecycleForm
                      action={reviewAvatarVersionAction}
                      decision="accept"
                      definitionId={definition.definitionId}
                      label="Accept review"
                      revision={version.revision}
                      versionId={version.versionId}
                    />
                    <LifecycleForm
                      action={reviewAvatarVersionAction}
                      decision="changes_requested"
                      definitionId={definition.definitionId}
                      label="Request changes"
                      revision={version.revision}
                      versionId={version.versionId}
                    />
                    <LifecycleForm
                      action={reviewAvatarVersionAction}
                      decision="reject"
                      definitionId={definition.definitionId}
                      label="Reject review"
                      revision={version.revision}
                      versionId={version.versionId}
                    />
                  </>
                ) : null}
                {hasAdminPermission(context, 'avatar_content.approve') &&
                version.state === 'in_review' ? (
                  <LifecycleForm
                    action={approveAvatarVersionAction}
                    definitionId={definition.definitionId}
                    label="Approve explicitly"
                    revision={version.revision}
                    versionId={version.versionId}
                  />
                ) : null}
                {hasAdminPermission(context, 'avatar_content.activate') &&
                version.state === 'approved' ? (
                  <LifecycleForm
                    action={activateAvatarVersionAction}
                    definitionId={definition.definitionId}
                    label="Activate approved version"
                    revision={version.revision}
                    versionId={version.versionId}
                  />
                ) : null}
                {hasAdminPermission(context, 'avatar_content.activate') &&
                version.state === 'active' ? (
                  <LifecycleForm
                    action={supersedeAvatarVersionAction}
                    definitionId={definition.definitionId}
                    label="Supersede active version"
                    revision={version.revision}
                    versionId={version.versionId}
                  />
                ) : null}
              </div>
            </section>

            <footer>
              Created {formatDate(version.createdAt)} · revision {version.revision} · submitted by{' '}
              {version.submittedBy ?? 'nobody'} · reviewed by {version.reviewedBy ?? 'nobody'}
            </footer>
          </article>
        );
      })}
    </main>
  );
}
