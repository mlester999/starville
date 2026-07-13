'use client';

import {
  ASSET_ROTATIONS,
  type AssetCategory,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';
import { useActionState, useEffect, useState } from 'react';

import { saveWorldAssetDraftAction, type WorldAssetActionState } from '../app/actions/world-assets';
import type {
  AssetCollisionProfile,
  AssetDraftConfiguration,
  AssetManagerCapabilities,
  WorldAssetVersionDetail,
} from '../lib/world-assets/contracts';
import { assetTypeLabel, assetTypeProfile, formatAssetBytes } from '../lib/world-assets/profiles';
import { PremiumSelect } from './premium-select';
import {
  WorldAssetOperationDialog,
  type WorldAssetOperation,
} from './world-asset-operation-dialog';
import { WorldAssetPreviewWorkspace } from './world-asset-preview-workspace';

const INITIAL_STATE: WorldAssetActionState = { outcome: 'idle' };
type OperationRequestIds = Readonly<Record<WorldAssetOperation, string>>;

function initialConfiguration(detail: WorldAssetVersionDetail): AssetDraftConfiguration {
  return {
    friendlyName: detail.asset.friendlyName,
    category: detail.asset.category,
    tags: detail.version.tags,
    internalNotes: detail.version.internalNotes,
    render: detail.version.render,
    collision: detail.version.collision,
    interactionCompatibility: detail.version.interactionCompatibility,
  };
}

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function safeNumber(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function operationDescription(operation: WorldAssetOperation): Readonly<{
  title: string;
  description: string;
  button: string;
  severity: 'neutral' | 'caution' | 'critical';
  typed?: string;
}> {
  if (operation === 'validate') {
    return {
      title: 'Run trusted validation?',
      description:
        'The server will inspect the sanitized derivative and this exact configuration. No asset becomes active.',
      button: 'Validate',
      severity: 'neutral',
    };
  }
  if (operation === 'submit-review') {
    return {
      title: 'Submit this version for review?',
      description:
        'Editing pauses while authorized reviewers inspect validation, metadata, anchors, collision, duplicates, and references.',
      button: 'Submit for review',
      severity: 'caution',
    };
  }
  if (operation === 'request-changes') {
    return {
      title: 'Request changes?',
      description: 'The version returns to draft without changing any approved or active version.',
      button: 'Request changes',
      severity: 'caution',
    };
  }
  if (operation === 'reject') {
    return {
      title: 'Reject this version?',
      description:
        'The candidate will not be approved. Referenced approved history is never deleted.',
      button: 'Reject',
      severity: 'critical',
    };
  }
  if (operation === 'approve') {
    return {
      title: 'Approve this version?',
      description:
        'Approval confirms the reviewed candidate, but it remains unavailable to World Editor placement until separately activated.',
      button: 'Approve',
      severity: 'caution',
    };
  }
  if (operation === 'activate') {
    return {
      title: 'Activate this approved version?',
      description:
        'Activation makes this immutable version available to controlled content workflows. Existing published worlds remain pinned.',
      button: 'Activate asset',
      severity: 'critical',
      typed: 'ACTIVATE ASSET',
    };
  }
  if (operation === 'archive') {
    return {
      title: 'Archive this unreferenced asset?',
      description:
        'Archival hides the asset from normal selection while retaining immutable files and append-only history. It is blocked whenever a tracked reference exists.',
      button: 'Archive',
      severity: 'critical',
    };
  }
  return {
    title: 'Deprecate this active asset?',
    description:
      'New placement is discouraged, while existing published references remain stable and available.',
    button: 'Deprecate',
    severity: 'critical',
  };
}

function NumberField(props: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled: boolean;
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        disabled={props.disabled}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(safeNumber(event.currentTarget.value, props.value))}
        step={props.step ?? 0.01}
        type="number"
        value={props.value}
      />
    </label>
  );
}

export function WorldAssetVersionWorkspace(props: {
  readonly detail: WorldAssetVersionDetail;
  readonly capabilities: AssetManagerCapabilities;
  readonly saveRequestId: string;
  readonly operationRequestIds: OperationRequestIds;
}) {
  const [configuration, setConfiguration] = useState(() => initialConfiguration(props.detail));
  const [revision, setRevision] = useState(props.detail.version.editVersion);
  const [state, formAction, pending] = useActionState(saveWorldAssetDraftAction, INITIAL_STATE);
  const { asset, version } = props.detail;
  const editableLifecycle = ['draft', 'validation_failed', 'changes_requested'].includes(
    version.lifecycleStatus,
  );
  const editable = props.capabilities.canEdit && editableLifecycle;
  const profile = assetTypeProfile(asset.assetType);
  const validation = props.detail.validationResults ?? version.validationResult;
  const referenceTotal =
    props.detail.referenceSummary.published +
    props.detail.referenceSummary.drafts +
    props.detail.referenceSummary.activeConfiguration;

  useEffect(() => {
    if (state.outcome === 'success' && state.editVersion !== undefined) {
      setRevision(state.editVersion);
    }
  }, [state]);

  function updateCollisionShape(shape: AssetCollisionProfile['shape']): void {
    const collision: AssetCollisionProfile =
      shape === 'none'
        ? { shape: 'none', blocking: false }
        : shape === 'rectangle'
          ? { shape, blocking: true, offsetX: 0, offsetY: 0, width: 1, height: 1 }
          : {
              shape,
              blocking: true,
              startX: -0.5,
              startY: 0,
              endX: 0.5,
              endY: 0,
              radius: 0.35,
            };
    setConfiguration({ ...configuration, collision });
  }

  function updateRectangle(
    patch: Partial<Extract<AssetCollisionProfile, { shape: 'rectangle' }>>,
  ): void {
    if (configuration.collision.shape !== 'rectangle') return;
    setConfiguration({
      ...configuration,
      collision: { ...configuration.collision, ...patch },
    });
  }

  function updateCapsule(
    patch: Partial<Extract<AssetCollisionProfile, { shape: 'capsule' }>>,
  ): void {
    if (configuration.collision.shape !== 'capsule') return;
    setConfiguration({
      ...configuration,
      collision: { ...configuration.collision, ...patch },
    });
  }

  function operationButton(operation: WorldAssetOperation) {
    const content = operationDescription(operation);
    return (
      <WorldAssetOperationDialog
        assetId={asset.id}
        assetRevision={asset.revision}
        buttonLabel={content.button}
        description={content.description}
        expectedRevision={revision}
        operation={operation}
        requestId={props.operationRequestIds[operation]}
        severity={content.severity}
        title={content.title}
        {...(content.typed === undefined ? {} : { typedConfirmation: content.typed })}
        versionId={version.id}
      />
    );
  }

  return (
    <div className="world-asset-version-workspace">
      <section className="asset-version-summary" aria-label="Asset version summary">
        <div>
          <span className={`state-chip state-chip--${version.lifecycleStatus}`}>
            {humanize(version.lifecycleStatus)}
          </span>
          <span className={`state-chip state-chip--${version.validationStatus}`}>
            Validation: {version.validationStatus}
          </span>
        </div>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>
              {version.detectedMediaType?.replace('image/', '').toUpperCase() ?? 'Pending'} ·{' '}
              {version.width === null || version.height === null
                ? 'dimensions pending'
                : `${String(version.width)} × ${String(version.height)}`}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatAssetBytes(version.sourceSizeBytes)}</dd>
          </div>
          <div>
            <dt>Checksum</dt>
            <dd>
              <code>
                {version.checksumPrefix === null ? 'Pending' : `${version.checksumPrefix}…`}
              </code>
            </dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{revision}</dd>
          </div>
        </dl>
      </section>

      <WorldAssetPreviewWorkspace
        configuration={configuration}
        editable={editable}
        onChange={setConfiguration}
        version={version}
      />

      <form action={formAction} className="asset-configuration-form">
        <input name="assetId" type="hidden" value={asset.id} />
        <input name="versionId" type="hidden" value={version.id} />
        <input name="requestId" type="hidden" value={props.saveRequestId} />
        <input name="expectedRevision" type="hidden" value={revision} />
        <input name="configuration" type="hidden" value={JSON.stringify(configuration)} />
        <input name="confirmed" type="hidden" value="yes" />

        <section className="detail-card" aria-labelledby="asset-identity-title">
          <h2 id="asset-identity-title">Identity and classification</h2>
          <div className="asset-configuration-grid">
            <label className="field">
              <span>Friendly name</span>
              <input
                disabled={!editable}
                maxLength={100}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    friendlyName: event.currentTarget.value,
                  })
                }
                value={configuration.friendlyName}
              />
            </label>
            <label className="field">
              <span>Immutable slug</span>
              <input disabled readOnly value={asset.slug} />
            </label>
            <label className="field">
              <span>Immutable asset type</span>
              <input disabled readOnly value={assetTypeLabel(asset.assetType)} />
            </label>
            <label className="field">
              <span>Category</span>
              <PremiumSelect
                disabled={!editable}
                onChange={(category) =>
                  setConfiguration({ ...configuration, category: category as AssetCategory })
                }
                options={profile.allowedCategories.map((category) => ({
                  value: category,
                  label: humanize(category),
                }))}
                value={configuration.category}
              />
            </label>
            <label className="field asset-configuration-grid__wide">
              <span>Tags (comma separated)</span>
              <input
                disabled={!editable}
                maxLength={500}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    tags: event.currentTarget.value
                      .split(',')
                      .map((tag) =>
                        tag
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/gu, '-'),
                      )
                      .filter((tag) => tag.length >= 3)
                      .slice(0, 24),
                  })
                }
                value={configuration.tags.join(', ')}
              />
            </label>
            <label className="field asset-configuration-grid__wide">
              <span>Internal notes</span>
              <textarea
                disabled={!editable}
                maxLength={1_000}
                onChange={(event) =>
                  setConfiguration({
                    ...configuration,
                    internalNotes: event.currentTarget.value,
                  })
                }
                rows={4}
                value={configuration.internalNotes}
              />
            </label>
          </div>
          <p className="field-hint">{profile.guidance}</p>
        </section>

        <section className="detail-card" aria-labelledby="asset-rendering-title">
          <h2 id="asset-rendering-title">Rendering and anchors</h2>
          <div className="asset-configuration-grid asset-configuration-grid--numbers">
            <NumberField
              disabled={!editable}
              label="Render width"
              max={4096}
              min={1}
              onChange={(renderWidth) =>
                setConfiguration({
                  ...configuration,
                  render: { ...configuration.render, renderWidth: Math.round(renderWidth) },
                })
              }
              step={1}
              value={configuration.render.renderWidth}
            />
            <NumberField
              disabled={!editable}
              label="Render height"
              max={4096}
              min={1}
              onChange={(renderHeight) =>
                setConfiguration({
                  ...configuration,
                  render: { ...configuration.render, renderHeight: Math.round(renderHeight) },
                })
              }
              step={1}
              value={configuration.render.renderHeight}
            />
            <NumberField
              disabled={!editable}
              label="Scale"
              max={8}
              min={0.05}
              onChange={(scale) =>
                setConfiguration({
                  ...configuration,
                  render: { ...configuration.render, scale },
                })
              }
              value={configuration.render.scale}
            />
            {(['anchor', 'footAnchor', 'depthAnchor'] as const).flatMap((key) => [
              <NumberField
                disabled={!editable}
                key={`${key}-x`}
                label={`${key.replace('Anchor', ' anchor')} X`}
                max={1}
                min={0}
                onChange={(x) =>
                  setConfiguration({
                    ...configuration,
                    render: {
                      ...configuration.render,
                      [key]: { ...configuration.render[key], x },
                    },
                  })
                }
                value={configuration.render[key].x}
              />,
              <NumberField
                disabled={!editable}
                key={`${key}-y`}
                label={`${key.replace('Anchor', ' anchor')} Y`}
                max={1}
                min={0}
                onChange={(y) =>
                  setConfiguration({
                    ...configuration,
                    render: {
                      ...configuration.render,
                      [key]: { ...configuration.render[key], y },
                    },
                  })
                }
                value={configuration.render[key].y}
              />,
            ])}
          </div>
          <button
            className="button button--quiet"
            disabled={!editable}
            onClick={() =>
              setConfiguration({
                ...configuration,
                render: {
                  ...configuration.render,
                  anchor: { x: 0.5, y: 1 },
                  footAnchor: { x: 0.5, y: 1 },
                  depthAnchor: { x: 0.5, y: 1 },
                },
              })
            }
            type="button"
          >
            Reset recommended anchors
          </button>
        </section>

        <section className="detail-card" aria-labelledby="asset-collision-title">
          <h2 id="asset-collision-title">Collision footprint</h2>
          <div className="asset-configuration-grid">
            <label className="field">
              <span>Shape</span>
              <PremiumSelect
                disabled={!editable || profile.collisionSupport === 'none'}
                onChange={(next) => updateCollisionShape(next as AssetCollisionProfile['shape'])}
                options={[
                  { value: 'none', label: 'No collision' },
                  { value: 'rectangle', label: 'Rectangle' },
                  { value: 'capsule', label: 'Capsule' },
                ]}
                value={configuration.collision.shape}
              />
            </label>
            {configuration.collision.shape === 'none' ? null : (
              <label className="asset-checkbox">
                <input
                  checked={configuration.collision.blocking}
                  disabled={!editable}
                  onChange={(event) => {
                    if (configuration.collision.shape === 'rectangle') {
                      updateRectangle({ blocking: event.currentTarget.checked });
                    } else if (configuration.collision.shape === 'capsule') {
                      updateCapsule({ blocking: event.currentTarget.checked });
                    }
                  }}
                  type="checkbox"
                />
                <span>Blocks player movement</span>
              </label>
            )}
            {configuration.collision.shape === 'rectangle' ? (
              <>
                <NumberField
                  disabled={!editable}
                  label="Width"
                  max={128}
                  min={0.05}
                  onChange={(width) => updateRectangle({ width })}
                  value={configuration.collision.width}
                />
                <NumberField
                  disabled={!editable}
                  label="Height"
                  max={128}
                  min={0.05}
                  onChange={(height) => updateRectangle({ height })}
                  value={configuration.collision.height}
                />
                <NumberField
                  disabled={!editable}
                  label="Offset X"
                  max={128}
                  min={-128}
                  onChange={(offsetX) => updateRectangle({ offsetX })}
                  value={configuration.collision.offsetX}
                />
                <NumberField
                  disabled={!editable}
                  label="Offset Y"
                  max={128}
                  min={-128}
                  onChange={(offsetY) => updateRectangle({ offsetY })}
                  value={configuration.collision.offsetY}
                />
              </>
            ) : configuration.collision.shape === 'capsule' ? (
              <>
                <NumberField
                  disabled={!editable}
                  label="Start X"
                  max={128}
                  min={-128}
                  onChange={(startX) => updateCapsule({ startX })}
                  value={configuration.collision.startX}
                />
                <NumberField
                  disabled={!editable}
                  label="Start Y"
                  max={128}
                  min={-128}
                  onChange={(startY) => updateCapsule({ startY })}
                  value={configuration.collision.startY}
                />
                <NumberField
                  disabled={!editable}
                  label="End X"
                  max={128}
                  min={-128}
                  onChange={(endX) => updateCapsule({ endX })}
                  value={configuration.collision.endX}
                />
                <NumberField
                  disabled={!editable}
                  label="End Y"
                  max={128}
                  min={-128}
                  onChange={(endY) => updateCapsule({ endY })}
                  value={configuration.collision.endY}
                />
                <NumberField
                  disabled={!editable}
                  label="Radius"
                  max={64}
                  min={0.05}
                  onChange={(radius) => updateCapsule({ radius })}
                  value={configuration.collision.radius}
                />
              </>
            ) : null}
          </div>
          <p className="field-hint">
            This version default is previewed in logical world units. Replacing an object in a map
            never silently rewrites map collision geometry.
          </p>
        </section>

        <section className="detail-card" aria-labelledby="asset-rotations-title">
          <h2 id="asset-rotations-title">Rotations and interaction compatibility</h2>
          <div className="asset-rotation-options">
            {ASSET_ROTATIONS.map((rotation) => (
              <label className="asset-checkbox" key={rotation}>
                <input
                  checked={configuration.render.supportedRotations.includes(rotation)}
                  disabled={
                    !editable ||
                    (configuration.render.supportedRotations.length === 1 &&
                      configuration.render.supportedRotations[0] === rotation)
                  }
                  onChange={(event) => {
                    const supportedRotations = event.currentTarget.checked
                      ? [...configuration.render.supportedRotations, rotation].sort(
                          (left, right) => left - right,
                        )
                      : configuration.render.supportedRotations.filter(
                          (value) => value !== rotation,
                        );
                    setConfiguration({
                      ...configuration,
                      render: {
                        ...configuration.render,
                        supportedRotations,
                        defaultRotation: supportedRotations.includes(
                          configuration.render.defaultRotation,
                        )
                          ? configuration.render.defaultRotation
                          : (supportedRotations[0] ?? 0),
                      },
                    });
                  }}
                  type="checkbox"
                />
                <span>{rotation}°</span>
              </label>
            ))}
          </div>
          <label className="field asset-default-rotation">
            <span>Default rotation</span>
            <PremiumSelect
              disabled={!editable}
              onChange={(value) =>
                setConfiguration({
                  ...configuration,
                  render: {
                    ...configuration.render,
                    defaultRotation: Number(value) as (typeof ASSET_ROTATIONS)[number],
                  },
                })
              }
              options={configuration.render.supportedRotations.map((rotation) => ({
                value: String(rotation),
                label: `${String(rotation)}°`,
              }))}
              value={String(configuration.render.defaultRotation)}
            />
          </label>
          <fieldset className="asset-interaction-options" disabled={!editable}>
            <legend>Supported interactions</legend>
            {profile.allowedInteractions.map((interaction) => (
              <label className="asset-checkbox" key={interaction}>
                <input
                  checked={configuration.interactionCompatibility.includes(interaction)}
                  onChange={(event) => {
                    const next: AssetInteractionCompatibility[] = event.currentTarget.checked
                      ? [...configuration.interactionCompatibility, interaction]
                      : configuration.interactionCompatibility.filter(
                          (value) => value !== interaction,
                        );
                    setConfiguration({ ...configuration, interactionCompatibility: next });
                  }}
                  type="checkbox"
                />
                <span>{humanize(interaction)}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <div className="asset-save-bar">
          <div aria-live="polite">
            {state.outcome === 'idle'
              ? editable
                ? 'Edits remain local until Save draft.'
                : 'This version is immutable or your role is read only.'
              : state.message}
          </div>
          <button className="button button--primary" disabled={!editable || pending} type="submit">
            {pending ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </form>

      <section
        className="detail-card asset-validation-results"
        aria-labelledby="asset-validation-title"
      >
        <h2 id="asset-validation-title">Automated validation</h2>
        {validation === null || validation.issues.length === 0 ? (
          <p>No trusted validation issue exists for this revision.</p>
        ) : (
          <ul className="asset-validation-list">
            {validation.issues.map((issue) => (
              <li className={`is-${issue.level}`} key={`${issue.code}-${issue.path}`}>
                <strong>{humanize(issue.code)}</strong>
                <span>{issue.message}</span>
                <small>{humanize(issue.level)}</small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="detail-card" aria-labelledby="asset-references-title">
        <h2 id="asset-references-title">Reference impact</h2>
        <p>
          {referenceTotal} tracked reference(s): {props.detail.referenceSummary.published}{' '}
          published, {props.detail.referenceSummary.drafts} draft, and{' '}
          {props.detail.referenceSummary.activeConfiguration} active configuration.
        </p>
        <p className="field-hint">
          {props.detail.referenceSummary.mayArchive
            ? 'No reference currently blocks archival.'
            : 'One or more references prevent archival. No file or history will be deleted.'}
        </p>
      </section>

      {props.detail.reviews.length === 0 ? null : (
        <section className="detail-card" aria-labelledby="asset-reviews-title">
          <h2 id="asset-reviews-title">Review history</h2>
          <ol className="asset-reference-list">
            {props.detail.reviews.map((review) => (
              <li key={review.id}>
                <strong>{humanize(review.action)}</strong>
                <span>{review.reason}</span>
                <small>{new Date(review.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section
        className="detail-card asset-lifecycle-actions"
        aria-labelledby="asset-lifecycle-actions-title"
      >
        <h2 id="asset-lifecycle-actions-title">Review and lifecycle</h2>
        <p>
          Every decision is permission checked by the portal, API, and database and recorded with a
          reason.
        </p>
        <div>
          {props.capabilities.canValidate && editableLifecycle ? operationButton('validate') : null}
          {props.capabilities.canEdit && version.lifecycleStatus === 'validated'
            ? operationButton('submit-review')
            : null}
          {props.capabilities.canReview && version.lifecycleStatus === 'in_review'
            ? operationButton('request-changes')
            : null}
          {props.capabilities.canReview && version.lifecycleStatus === 'in_review'
            ? operationButton('reject')
            : null}
          {props.capabilities.canApprove && version.lifecycleStatus === 'in_review'
            ? operationButton('approve')
            : null}
          {props.capabilities.canActivate && version.lifecycleStatus === 'approved'
            ? operationButton('activate')
            : null}
          {props.capabilities.canDeprecate && version.lifecycleStatus === 'active'
            ? operationButton('deprecate')
            : null}
          {props.capabilities.canDeprecate &&
          props.detail.referenceSummary.mayArchive &&
          (asset.lifecycleStatus === 'draft' || asset.lifecycleStatus === 'deprecated')
            ? operationButton('archive')
            : null}
        </div>
      </section>
    </div>
  );
}
