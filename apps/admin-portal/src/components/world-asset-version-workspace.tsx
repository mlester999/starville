'use client';

import {
  ASSET_ROTATIONS,
  type AssetCategory,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';
import Link from 'next/link';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';

import { saveWorldAssetDraftAction, type WorldAssetActionState } from '../app/actions/world-assets';
import type {
  AssetCollisionProfile,
  AssetDraftConfiguration,
  AssetManagerCapabilities,
  WorldAssetVersion,
  WorldAssetVersionDetail,
} from '../lib/world-assets/contracts';
import {
  assetCategoryLabel,
  assetTypeLabel,
  assetTypeProfile,
  formatAssetBytes,
} from '../lib/world-assets/profiles';
import {
  assessAssetDraft,
  changedAssetSections,
  deriveAssetSaveState,
  type AssetVersionEditabilityModel,
} from '../lib/world-assets/workspace-model';
import {
  assetArtworkLabel,
  safeAdministratorLabel,
  shouldAcceptAuthoritativeVersionRevision,
} from '../lib/world-assets/review-model';
import type { AssetSceneWorldDirectory } from '../lib/world-assets/scene-preview-model';
import { PremiumSelect } from './premium-select';
import {
  WorldAssetOperationDialog,
  type WorldAssetOperation,
} from './world-asset-operation-dialog';
import { WorldAssetPreviewModes } from './world-asset-preview-modes';
import { BeforeAssetSave, WorldAssetWorkspaceGuidance } from './world-asset-workspace-guidance';

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

function formatDate(value: string | null): string {
  if (value === null) return 'Not recorded';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
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
  readonly id?: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled: boolean;
  readonly error?: string;
  readonly status?: 'Required' | 'Optional' | 'Read-only' | 'Lifecycle locked';
  readonly onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {props.label}{' '}
        {props.status === undefined ? null : <small className="field-badge">{props.status}</small>}
      </span>
      <input
        aria-describedby={props.error === undefined ? undefined : `${props.id ?? 'number'}-error`}
        aria-invalid={props.error === undefined ? undefined : true}
        disabled={props.disabled}
        id={props.id}
        max={props.max}
        min={props.min}
        onChange={(event) => props.onChange(safeNumber(event.currentTarget.value, props.value))}
        step={props.step ?? 0.01}
        type="number"
        value={props.value}
      />
      {props.error === undefined ? null : (
        <small className="field-error" id={`${props.id ?? 'number'}-error`}>
          {props.error}
        </small>
      )}
    </label>
  );
}

export function WorldAssetVersionWorkspace(props: {
  readonly detail: WorldAssetVersionDetail;
  readonly capabilities: AssetManagerCapabilities;
  readonly editability: AssetVersionEditabilityModel;
  readonly saveRequestId: string;
  readonly operationRequestIds: OperationRequestIds;
  readonly activeVersion: WorldAssetVersion | null;
  readonly latestCandidate: WorldAssetVersion | null;
  readonly currentAdministrator: Readonly<{
    id: string;
    displayName: string;
    roleName: string;
  }>;
  readonly environment: string;
  readonly referenceSummary: Readonly<{
    published: number;
    drafts: number;
    activeConfiguration: number;
    mayArchive: boolean;
  }>;
  readonly selectedVersionUsage: Readonly<{
    published: number;
    drafts: number;
    activeConfiguration: number;
    complete: boolean;
  }>;
  readonly sceneWorldDirectory: AssetSceneWorldDirectory;
}) {
  const [configuration, setConfiguration] = useState(() => initialConfiguration(props.detail));
  const [savedConfiguration, setSavedConfiguration] = useState(() =>
    initialConfiguration(props.detail),
  );
  const [revision, setRevision] = useState(props.detail.version.editVersion);
  const versionIdentityRef = useRef(props.detail.version.id);
  const [state, formAction, pending] = useActionState(saveWorldAssetDraftAction, INITIAL_STATE);
  const configurationRef = useRef(configuration);
  configurationRef.current = configuration;
  const workspaceRef = useRef<HTMLDivElement>(null);
  const saveBarRef = useRef<HTMLDivElement>(null);
  const { asset, version } = props.detail;
  const editable = props.editability.canEditMetadata;
  const profile = assetTypeProfile(asset.assetType);
  const validation = props.detail.validationResults ?? version.validationResult;
  const referenceTotal =
    props.detail.referenceSummary.published +
    props.detail.referenceSummary.drafts +
    props.detail.referenceSummary.activeConfiguration;
  const changedSections = useMemo(
    () => changedAssetSections(savedConfiguration, configuration),
    [configuration, savedConfiguration],
  );
  const assessment = useMemo(
    () =>
      assessAssetDraft({
        configuration,
        detail: props.detail,
        collisionSupported: profile.collisionSupport !== 'none',
        transparencyRequired: profile.requiredTransparency,
        recommendedWidth: profile.recommendedWidth,
        recommendedHeight: profile.recommendedHeight,
      }),
    [configuration, profile, props.detail],
  );
  const saveState = useMemo(
    () =>
      deriveAssetSaveState({
        editability: props.editability,
        assessment,
        changedSections,
        pending,
        outcome: state.outcome,
        ...(state.errorKind === undefined ? {} : { errorKind: state.errorKind }),
      }),
    [assessment, changedSections, pending, props.editability, state.errorKind, state.outcome],
  );

  useEffect(() => {
    if (state.outcome === 'success' && state.editVersion !== undefined) {
      setRevision(state.editVersion);
      setSavedConfiguration(configurationRef.current);
    }
  }, [state]);

  useEffect(() => {
    if (
      !shouldAcceptAuthoritativeVersionRevision({
        currentVersionId: versionIdentityRef.current,
        incomingVersionId: props.detail.version.id,
        currentRevision: revision,
        incomingRevision: props.detail.version.editVersion,
      })
    ) {
      return;
    }
    versionIdentityRef.current = props.detail.version.id;
    setRevision(props.detail.version.editVersion);
    if (changedSections.length === 0) {
      const authoritative = initialConfiguration(props.detail);
      setConfiguration(authoritative);
      setSavedConfiguration(authoritative);
    }
  }, [changedSections.length, props.detail, revision]);

  useEffect(() => {
    if (!editable || changedSections.length === 0) return undefined;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [changedSections.length, editable]);

  useEffect(() => {
    const bar = saveBarRef.current;
    const workspace = workspaceRef.current;
    if (bar === null || workspace === null) return undefined;

    const scrollParent = workspace.closest('.portal-content');
    const applyMeasuredHeight = () => {
      const height = Math.ceil(bar.getBoundingClientRect().height);
      if (height <= 0) return;
      const value = `${String(height)}px`;
      workspace.style.setProperty('--world-asset-action-bar-height', value);
      if (scrollParent instanceof HTMLElement) {
        scrollParent.style.setProperty('--world-asset-action-bar-height', value);
      }
    };

    applyMeasuredHeight();
    const observer = new ResizeObserver(applyMeasuredHeight);
    observer.observe(bar);
    window.addEventListener('resize', applyMeasuredHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', applyMeasuredHeight);
      workspace.style.removeProperty('--world-asset-action-bar-height');
      if (scrollParent instanceof HTMLElement) {
        scrollParent.style.removeProperty('--world-asset-action-bar-height');
      }
    };
  }, [
    changedSections.length,
    pending,
    saveState.explanation,
    saveState.state,
    state.message,
    state.outcome,
  ]);

  function firstIssue(path: string): string | undefined {
    return assessment.issues.find((issue) => issue.path.startsWith(path))?.message;
  }

  function goToFirstIssue(): void {
    const first = saveState.issues[0];
    if (first === undefined) return;
    const control = document.getElementById(first.fieldId);
    // scroll-margin-bottom on fields clears the sticky action bar safe area.
    control?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    control?.focus({ preventScroll: true });
  }

  function discardChanges(): void {
    setConfiguration(savedConfiguration);
  }

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
        key={operation}
        assetId={asset.id}
        assetRevision={asset.revision}
        buttonLabel={content.button}
        description={content.description}
        expectedRevision={revision}
        operation={operation}
        onRevisionConfirmed={setRevision}
        requestId={props.operationRequestIds[operation]}
        severity={content.severity}
        title={content.title}
        {...(content.typed === undefined ? {} : { typedConfirmation: content.typed })}
        versionId={version.id}
        activeVersion={props.activeVersion}
        candidateVersion={version}
        referenceSummary={props.referenceSummary}
      />
    );
  }

  function primaryLifecycleAction() {
    if (props.editability.canSubmitReview) return operationButton('submit-review');
    if (props.editability.canActivate) return operationButton('activate');
    if (props.editability.isInReview) {
      return (
        <a className="button button--secondary" href="#asset-lifecycle-actions-title">
          View review status
        </a>
      );
    }
    if (props.editability.isActive) {
      return (
        <Link className="button button--secondary" href={`/world-assets/${asset.id}#references`}>
          View references
        </Link>
      );
    }
    if (props.editability.isRejected) {
      return (
        <Link
          className="button button--secondary"
          href={`/world-assets/${asset.id}#create-next-version`}
        >
          Create revised version
        </Link>
      );
    }
    if (props.editability.isRetired || props.editability.isArchived) {
      return (
        <Link className="button button--secondary" href={`/world-assets/${asset.id}`}>
          View active version
        </Link>
      );
    }
    return undefined;
  }

  const saveLocked =
    saveState.state === 'LIFECYCLE_LOCKED' || saveState.state === 'PERMISSION_LOCKED';
  const nextSafeAction = saveLocked ? primaryLifecycleAction() : undefined;

  return (
    <div className="world-asset-version-workspace" ref={workspaceRef}>
      <WorldAssetWorkspaceGuidance
        assessment={assessment}
        assetId={asset.id}
        assetRevision={asset.revision}
        assetType={asset.assetType}
        editability={props.editability}
        primaryAction={primaryLifecycleAction()}
        saveState={saveState}
        sourceVersionId={version.id}
      />
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

      {version.lifecycleStatus === 'in_review' || version.lifecycleStatus === 'approved' ? (
        <section
          className="detail-card asset-review-workspace"
          aria-labelledby="asset-review-workspace-title"
        >
          <div className="section-heading-row">
            <div>
              <p className="eyebrow">Human review workspace</p>
              <h2 id="asset-review-workspace-title">
                Review Version {version.versionNumber} · {asset.friendlyName}
              </h2>
            </div>
            <span className={`state-chip state-chip--${version.lifecycleStatus}`}>
              {humanize(version.lifecycleStatus)}
            </span>
          </div>
          <div className="asset-review-workspace__grid">
            <article>
              <h3>Assignment and policy</h3>
              <dl className="detail-list">
                <div>
                  <dt>Submitted by</dt>
                  <dd>
                    {safeAdministratorLabel({
                      actorId: version.submittedByAdminId,
                      currentAdministratorId: props.currentAdministrator.id,
                      currentAdministratorName: props.currentAdministrator.displayName,
                      emptyLabel: 'Not submitted',
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Submitted at</dt>
                  <dd>{formatDate(version.submittedAt)} UTC</dd>
                </div>
                <div>
                  <dt>Assigned reviewer</dt>
                  <dd>
                    {safeAdministratorLabel({
                      actorId: version.reviewedByAdminId,
                      currentAdministratorId: props.currentAdministrator.id,
                      currentAdministratorName: props.currentAdministrator.displayName,
                      emptyLabel: 'Unassigned',
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Reviewer eligibility</dt>
                  <dd>
                    {props.capabilities.canApprove
                      ? 'Eligible to approve'
                      : props.capabilities.canReview
                        ? 'Eligible to request changes or reject'
                        : 'Read-only'}
                  </dd>
                </div>
              </dl>
              {props.capabilities.canApprove ? (
                <p>
                  Self-review is permitted for your current {props.currentAdministrator.roleName}{' '}
                  role
                  {props.environment.toLowerCase().includes('prod')
                    ? '.'
                    : ' in the development environment.'}
                </p>
              ) : (
                <p>This version must be reviewed by another authorized administrator.</p>
              )}
              <p className="field-hint">
                Production teams may assign upload, review, and activation to separate authorized
                administrators. This is operational guidance; the current RBAC policy does not add
                an unstored separation-of-duties rule.
              </p>
            </article>
            <article>
              <h3>Review evidence</h3>
              <dl className="detail-list">
                <div>
                  <dt>Validation</dt>
                  <dd>{humanize(version.validationStatus)}</dd>
                </div>
                <div>
                  <dt>Artwork</dt>
                  <dd>{assetArtworkLabel(version)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>
                    {version.detectedMediaType?.replace('image/', '').toUpperCase() ??
                      version.processingStatus}{' '}
                    · {formatAssetBytes(version.sourceSizeBytes)}
                  </dd>
                </div>
                <div>
                  <dt>Dimensions</dt>
                  <dd>
                    {version.width === null || version.height === null
                      ? 'Processing'
                      : `${String(version.width)} × ${String(version.height)}`}
                  </dd>
                </div>
                <div>
                  <dt>Scale</dt>
                  <dd>{version.render.scale}</dd>
                </div>
                <div>
                  <dt>Foot anchor</dt>
                  <dd>
                    {version.render.footAnchor.x}, {version.render.footAnchor.y}
                  </dd>
                </div>
                <div>
                  <dt>Depth anchor</dt>
                  <dd>
                    {version.render.depthAnchor.x}, {version.render.depthAnchor.y}
                  </dd>
                </div>
                <div>
                  <dt>Collision</dt>
                  <dd>{humanize(version.collision.shape)}</dd>
                </div>
              </dl>
            </article>
          </div>
          {props.activeVersion === null || props.activeVersion.id === version.id ? null : (
            <div className="asset-review-differences">
              <h3>Difference from active Version {props.activeVersion.versionNumber}</h3>
              <div
                className="data-table-region"
                role="region"
                aria-label="Candidate difference from active version"
                tabIndex={0}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Evidence</th>
                      <th scope="col">Active</th>
                      <th scope="col">Candidate</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Artwork</th>
                      <td>{assetArtworkLabel(props.activeVersion)}</td>
                      <td>{assetArtworkLabel(version)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Dimensions</th>
                      <td>
                        {props.activeVersion.width ?? 'Not recorded'} ×{' '}
                        {props.activeVersion.height ?? 'Not recorded'}
                      </td>
                      <td>
                        {version.width ?? 'Processing'} × {version.height ?? 'Processing'}
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Scale</th>
                      <td>{props.activeVersion.render.scale}</td>
                      <td>{version.render.scale}</td>
                    </tr>
                    <tr>
                      <th scope="row">Collision</th>
                      <td>{humanize(props.activeVersion.collision.shape)}</td>
                      <td>{humanize(version.collision.shape)}</td>
                    </tr>
                    <tr>
                      <th scope="row">Validation</th>
                      <td>{humanize(props.activeVersion.validationStatus)}</td>
                      <td>{humanize(version.validationStatus)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <aside className="phase-note">
            <span aria-hidden="true">◇</span>
            <div>
              <strong>Published-reference safety</strong>
              <p>
                {props.referenceSummary.published} published reference(s) remain pinned to their
                immutable versions. Approval changes no active pointer, world draft, or publication.
              </p>
              <p>
                Next action:{' '}
                {version.lifecycleStatus === 'in_review'
                  ? 'complete approval or rejection; the current active version remains unchanged.'
                  : 'review activation requirements; approval alone does not change the active version.'}
              </p>
            </div>
          </aside>
        </section>
      ) : null}

      <WorldAssetPreviewModes
        activeVersion={props.activeVersion}
        asset={asset}
        configuration={configuration}
        editable={editable}
        onChange={setConfiguration}
        version={version}
        worldDirectory={props.sceneWorldDirectory}
      />

      <form action={formAction} className="asset-configuration-form">
        <input name="assetId" type="hidden" value={asset.id} />
        <input name="versionId" type="hidden" value={version.id} />
        <input name="requestId" type="hidden" value={props.saveRequestId} />
        <input name="expectedRevision" type="hidden" value={revision} />
        <input name="configuration" type="hidden" value={JSON.stringify(configuration)} />
        <input name="confirmed" type="hidden" value="yes" />

        <div className="asset-configuration-form__sections">
          <section
            className="detail-card asset-form-section"
            aria-labelledby="asset-identity-title"
          >
            <div className="section-heading-row">
              <h2 id="asset-identity-title">Identity and classification</h2>
              <span className="control-category control-category--saved">Saved configuration</span>
            </div>
            <div className="asset-configuration-grid">
              <label className="field">
                <span>
                  Friendly name <small className="field-badge">Required</small>
                </span>
                <small className="field-hint">
                  The readable name shown in World Assets and the World Editor.
                </small>
                <input
                  aria-describedby={
                    firstIssue('friendlyName') === undefined
                      ? undefined
                      : 'asset-friendly-name-error'
                  }
                  aria-invalid={firstIssue('friendlyName') === undefined ? undefined : true}
                  disabled={!editable}
                  id="asset-friendly-name"
                  maxLength={100}
                  onChange={(event) =>
                    setConfiguration({
                      ...configuration,
                      friendlyName: event.currentTarget.value,
                    })
                  }
                  value={configuration.friendlyName}
                />
                {firstIssue('friendlyName') === undefined ? null : (
                  <small className="field-error" id="asset-friendly-name-error">
                    {firstIssue('friendlyName')}
                  </small>
                )}
              </label>
              <label className="field">
                <span>
                  Stable key <small className="field-badge">Set at creation</small>
                </span>
                <small className="field-hint">
                  Generated at creation and permanently stable. Changing the friendly name does not
                  change this identifier.
                </small>
                <input disabled readOnly value={asset.slug} />
              </label>
              <label className="field">
                <span>
                  Asset type <small className="field-badge">Set at creation</small>
                </span>
                <small className="field-hint">Set at creation and cannot be changed.</small>
                <input disabled readOnly value={assetTypeLabel(asset.assetType)} />
              </label>
              <label className="field">
                <span>
                  Category <small className="field-badge">Required</small>
                </span>
                <small className="field-hint">
                  Controls where this asset appears in the asset library.
                </small>
                <PremiumSelect
                  disabled={!editable}
                  id="asset-category"
                  onChange={(category) =>
                    setConfiguration({ ...configuration, category: category as AssetCategory })
                  }
                  options={profile.allowedCategories.map((category) => ({
                    value: category,
                    label: assetCategoryLabel(category),
                  }))}
                  {...(firstIssue('category') === undefined
                    ? {}
                    : { error: firstIssue('category') as string })}
                  value={configuration.category}
                />
              </label>
              <label className="field asset-configuration-grid__wide">
                <span>
                  Tags <small className="field-badge">Optional</small>
                </span>
                <small className="field-hint">
                  Comma-separated administrative search tags, for example: nature, evergreen,
                  blocking, outdoor. Whitespace and duplicates are removed.
                </small>
                <input
                  aria-describedby="asset-tags-hint"
                  disabled={!editable}
                  id="asset-tags"
                  maxLength={500}
                  onChange={(event) =>
                    setConfiguration({
                      ...configuration,
                      tags: [
                        ...new Set(
                          event.currentTarget.value
                            .split(',')
                            .map((tag) =>
                              tag
                                .trim()
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/gu, '-'),
                            )
                            .filter((tag) => tag.length >= 2),
                        ),
                      ].slice(0, 24),
                    })
                  }
                  value={configuration.tags.join(', ')}
                />
                <small id="asset-tags-hint">Empty optional tags do not block saving.</small>
              </label>
              <label className="field asset-configuration-grid__wide">
                <span>
                  Internal notes <small className="field-badge">Optional · Admin only</small>
                </span>
                <small className="field-hint">
                  Not shown in the game. Do not include credentials, private paths, or secrets.
                </small>
                <textarea
                  disabled={!editable}
                  id="asset-internal-notes"
                  maxLength={2_000}
                  onChange={(event) =>
                    setConfiguration({
                      ...configuration,
                      internalNotes: event.currentTarget.value,
                    })
                  }
                  rows={4}
                  value={configuration.internalNotes}
                />
                <small>{2_000 - configuration.internalNotes.length} characters remaining</small>
              </label>
            </div>
            <p className="field-hint">{profile.guidance}</p>
          </section>

          <section
            className="detail-card asset-form-section"
            aria-labelledby="asset-rendering-title"
          >
            <div className="section-heading-row">
              <div>
                <h2 id="asset-rendering-title">Rendering and anchors</h2>
                <p className="field-hint asset-form-section__description">
                  {props.editability.canEditRendering
                    ? assessment.issues.length === 0
                      ? 'Rendering configuration · required settings complete'
                      : `Rendering configuration · ${String(assessment.issues.length)} issue(s) must be resolved before saving`
                    : props.editability.isImmutable
                      ? `Rendering configuration · Read-only because Version ${String(version.versionNumber)} is ${humanize(version.lifecycleStatus)}`
                      : 'Rendering configuration · Read-only because your role lacks edit permission'}
                </p>
              </div>
              <span className="control-category control-category--saved">Saved configuration</span>
            </div>
            <div className="asset-form-section__body">
              <div className="asset-configuration-grid asset-configuration-grid--numbers">
                <NumberField
                  disabled={!editable}
                  id="asset-render-width"
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
                  status={editable ? 'Required' : 'Lifecycle locked'}
                  value={configuration.render.renderWidth}
                />
                <NumberField
                  disabled={!editable}
                  id="asset-render-height"
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
                  status={editable ? 'Required' : 'Lifecycle locked'}
                  value={configuration.render.renderHeight}
                />
                <NumberField
                  disabled={!editable}
                  id="asset-render-scale"
                  label="Scale"
                  max={8}
                  min={0.05}
                  onChange={(scale) =>
                    setConfiguration({
                      ...configuration,
                      render: { ...configuration.render, scale },
                    })
                  }
                  status={editable ? 'Required' : 'Lifecycle locked'}
                  value={configuration.render.scale}
                />
                {(['anchor', 'footAnchor', 'depthAnchor'] as const).flatMap((key) => [
                  <NumberField
                    disabled={!editable}
                    id={`asset-${key === 'footAnchor' ? 'foot-anchor' : key === 'depthAnchor' ? 'depth-anchor' : 'render-anchor'}-x`}
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
                    {...(firstIssue(`render.${key}.x`) === undefined
                      ? {}
                      : { error: firstIssue(`render.${key}.x`) as string })}
                    value={configuration.render[key].x}
                  />,
                  <NumberField
                    disabled={!editable}
                    id={`asset-${key === 'footAnchor' ? 'foot-anchor' : key === 'depthAnchor' ? 'depth-anchor' : 'render-anchor'}-y`}
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
                    {...(firstIssue(`render.${key}.y`) === undefined
                      ? {}
                      : { error: firstIssue(`render.${key}.y`) as string })}
                    value={configuration.render[key].y}
                  />,
                ])}
              </div>
              <div className="asset-form-secondary-actions">
                <p className="field-hint">
                  Recommended anchors place the foot and depth points at the bottom center of the
                  sprite.
                </p>
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
              </div>
            </div>
          </section>

          <section
            className="detail-card asset-form-section"
            aria-labelledby="asset-collision-title"
          >
            <div className="section-heading-row">
              <div>
                <h2 id="asset-collision-title">Collision footprint</h2>
                <p className="field-hint asset-form-section__description">
                  Configure the physical ground obstacle, or explicitly choose no collision for a
                  passable asset. Collision is saved configuration, not a preview overlay.
                </p>
              </div>
              <span className="control-category control-category--saved">Saved configuration</span>
            </div>
            <div className="asset-form-section__body">
              <div className="asset-configuration-grid">
                <label className="field">
                  <span>
                    Shape <small className="field-badge">Required choice</small>
                  </span>
                  <PremiumSelect
                    disabled={!editable || profile.collisionSupport === 'none'}
                    id="asset-collision-shape"
                    onChange={(next) =>
                      updateCollisionShape(next as AssetCollisionProfile['shape'])
                    }
                    options={[
                      { value: 'none', label: 'No collision' },
                      { value: 'rectangle', label: 'Rectangle' },
                      { value: 'capsule', label: 'Capsule' },
                    ]}
                    {...(firstIssue('collision') === undefined
                      ? {}
                      : { error: firstIssue('collision') as string })}
                    value={configuration.collision.shape}
                  />
                </label>
                {configuration.collision.shape === 'none' ? (
                  <p className="field-hint asset-configuration-grid__wide asset-collision-shape-hint">
                    No collision is an explicit passable configuration and does not block saving for
                    this asset type.
                  </p>
                ) : (
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
              <p className="field-hint asset-form-section__footer-hint">
                This version default is previewed in logical world units. Replacing an object in a
                map never silently rewrites map collision geometry.
              </p>
            </div>
          </section>

          <section
            className="detail-card asset-form-section asset-form-section--final"
            aria-labelledby="asset-rotations-title"
          >
            <div className="section-heading-row">
              <div>
                <h2 id="asset-rotations-title">Rotations and interaction compatibility</h2>
                <p className="field-hint asset-form-section__description">
                  These values are saved with this version. Keep only rotations with trusted
                  artwork.
                </p>
              </div>
              <span className="control-category control-category--saved">Saved configuration</span>
            </div>
            <div className="asset-form-section__body">
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
              <fieldset
                className="asset-interaction-options"
                disabled={!editable}
                id="asset-interactions"
              >
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
            </div>
          </section>

          <BeforeAssetSave
            assessment={assessment}
            onGoToFirstIssue={goToFirstIssue}
            saveState={saveState}
          />
        </div>

        <div
          ref={saveBarRef}
          className={`asset-save-bar asset-save-bar--${saveState.state.toLowerCase()}${saveLocked ? ' asset-save-bar--locked' : ''}`}
          role="region"
          aria-label="Draft save actions"
        >
          <div aria-live="polite" id="asset-save-state" className="asset-save-bar__message">
            <strong>{saveState.explanation}</strong>
            {changedSections.length > 0 ? (
              <small>Unsaved changes: {changedSections.join(', ')}.</small>
            ) : null}
            {state.message === undefined || state.message === saveState.explanation ? null : (
              <small>{state.message}</small>
            )}
            {state.outcome === 'success' && state.savedAt !== undefined ? (
              <small>
                Confirmed by the server at {new Date(state.savedAt).toLocaleTimeString()}.
              </small>
            ) : null}
            {state.outcome === 'error' && state.requestId !== undefined ? (
              <small>
                Safe request ID: <code>{state.requestId}</code>
              </small>
            ) : null}
          </div>
          <div className="asset-save-bar__actions">
            {editable && changedSections.length > 0 ? (
              <button className="button button--quiet" onClick={discardChanges} type="button">
                Discard changes
              </button>
            ) : null}
            {nextSafeAction === undefined ? null : (
              <div className="asset-save-bar__next-action">{nextSafeAction}</div>
            )}
            <button
              aria-describedby="asset-save-state"
              className={`button ${
                saveState.canSubmit
                  ? 'button--primary'
                  : saveLocked
                    ? 'button--quiet asset-save-bar__disabled-action'
                    : 'button--secondary'
              }`}
              disabled={!saveState.canSubmit}
              type="submit"
            >
              {pending ? 'Saving…' : 'Save draft'}
            </button>
          </div>
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

      <section className="detail-card" id="references" aria-labelledby="asset-references-title">
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
        <p>
          This exact version has {props.selectedVersionUsage.complete ? '' : 'at least '}
          {props.selectedVersionUsage.published} published, {props.selectedVersionUsage.drafts}{' '}
          draft, and {props.selectedVersionUsage.activeConfiguration} active-configuration
          reference(s). Activation never rewrites these pins and never publishes a world.
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
          {props.editability.canValidate ? operationButton('validate') : null}
          {props.editability.canSubmitReview ? operationButton('submit-review') : null}
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
