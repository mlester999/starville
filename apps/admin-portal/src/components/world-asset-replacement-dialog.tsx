'use client';

import {
  ASSET_CATEGORIES,
  ASSET_INTERACTION_COMPATIBILITIES,
  type AssetCategory,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { WorldEditorAssetCandidate } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import {
  isCompatibleEditorAsset,
  objectInteractionRequirements,
  replaceWorldObjectAssets,
} from '../lib/worlds/asset-replacement';
import type { AdminWorldManifest, WorldVersionSummary } from '../lib/worlds/contracts';
import { focusTrapTarget } from './dialog-focus';
import { PremiumSelect } from './premium-select';

type MapObject = AdminWorldManifest['objects'][number];

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function mediaUrl(candidate: WorldEditorAssetCandidate): string | null {
  return availableAdminAssetMediaPath(
    candidate.asset.id,
    candidate.versionId,
    'thumbnail',
    candidate.activeVersion.thumbnailUrl,
  );
}

function collisionLabel(candidate: WorldEditorAssetCandidate): string {
  const collision = candidate.activeVersion.collision;
  if (collision.shape === 'none') return 'No default collision';
  if (collision.shape === 'rectangle') {
    return `Rectangle ${collision.width.toFixed(2)} × ${collision.height.toFixed(2)} world units`;
  }
  return `Capsule radius ${collision.radius.toFixed(2)} world units`;
}

export function WorldAssetReplacementDialog(props: {
  readonly manifest: AdminWorldManifest;
  readonly lifecycleStatus: WorldVersionSummary['lifecycleStatus'];
  readonly object: MapObject;
  readonly candidates: readonly WorldEditorAssetCandidate[];
  readonly onReplace: (manifest: AdminWorldManifest) => void;
}) {
  const id = useId().replaceAll(':', '');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | AssetCategory>('all');
  const [interaction, setInteraction] = useState<'all' | AssetInteractionCompatibility>('all');
  const [showDevelopment, setShowDevelopment] = useState(false);
  const [candidateId, setCandidateId] = useState<string>();
  const [replaceAll, setReplaceAll] = useState(false);
  const [impactAccepted, setImpactAccepted] = useState(false);
  const [error, setError] = useState<string>();
  const sameAssetObjects = props.manifest.objects.filter(
    ({ assetId }) => assetId === props.object.assetId,
  );
  const selected = props.candidates.find(({ asset }) => asset.id === candidateId);
  const interactionTypes = useMemo(
    () => objectInteractionRequirements(props.manifest, props.object),
    [props.manifest, props.object],
  );

  const filteredCandidates = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return props.candidates.filter((candidate) => {
      if (!isCompatibleEditorAsset(candidate, props.object, showDevelopment, interactionTypes)) {
        return false;
      }
      if (candidate.assetKey === props.object.assetId) return false;
      if (category !== 'all' && candidate.asset.category !== category) return false;
      if (interaction !== 'all' && !candidate.supportedInteractions.includes(interaction)) {
        return false;
      }
      if (normalized === '') return true;
      return `${candidate.asset.friendlyName} ${candidate.assetKey} ${candidate.asset.assetType} ${candidate.asset.category}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [
    category,
    interaction,
    interactionTypes,
    props.candidates,
    props.object,
    search,
    showDevelopment,
  ]);

  function open(): void {
    setError(undefined);
    setCandidateId(undefined);
    setReplaceAll(false);
    setImpactAccepted(false);
    dialogRef.current?.showModal();
    queueMicrotask(() => searchRef.current?.focus());
  }

  function close(): void {
    dialogRef.current?.close();
    triggerRef.current?.focus();
  }

  function trapFocus(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [role="combobox"]:not([aria-disabled="true"])',
    );
    if (controls === undefined || controls.length === 0) return;
    const target = focusTrapTarget(
      [...controls],
      document.activeElement as HTMLElement | null,
      event.shiftKey,
    );
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
  }

  function applyReplacement(): void {
    if (selected === undefined) return;
    try {
      const objectIds = replaceAll
        ? sameAssetObjects.map(({ id: objectId }) => objectId)
        : [props.object.id];
      const next = replaceWorldObjectAssets({
        manifest: props.manifest,
        lifecycleStatus: props.lifecycleStatus,
        objectIds,
        nextAssetKey: selected.assetKey,
        collisionImpactAccepted: impactAccepted,
      });
      props.onReplace(next);
      close();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The visual replacement did not complete.',
      );
    }
  }

  const enabled = props.lifecycleStatus === 'draft';

  return (
    <>
      <button
        className="button button--secondary"
        disabled={!enabled}
        onClick={open}
        ref={triggerRef}
        type="button"
      >
        Replace visual asset
      </button>
      {enabled ? null : (
        <p className="field-hint">
          Create or reopen an unpublished draft before replacing visuals.
        </p>
      )}
      <dialog
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className="operation-dialog world-asset-replacement-dialog"
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <div className="world-asset-replacement-dialog__layout">
          <header>
            <p className="eyebrow">Unpublished world draft</p>
            <h2 id={`${id}-title`}>Replace Visual Asset</h2>
            <p id={`${id}-description`}>
              Change artwork for <strong>{props.object.id}</strong> without changing its identity,
              position, scale, gameplay interaction, destination, or map collision.
            </p>
          </header>

          <div className="world-asset-replacement-filters" role="search">
            <label className="field">
              <span>Search active assets</span>
              <input
                onChange={(event) => setSearch(event.currentTarget.value)}
                ref={searchRef}
                type="search"
                value={search}
              />
            </label>
            <label className="field">
              <span>Category</span>
              <PremiumSelect
                onChange={(value) => setCategory(value as typeof category)}
                options={[
                  { value: 'all', label: 'All compatible categories' },
                  ...ASSET_CATEGORIES.map((value) => ({ value, label: humanize(value) })),
                ]}
                value={category}
              />
            </label>
            <label className="field">
              <span>Interaction compatibility</span>
              <PremiumSelect
                onChange={(value) => setInteraction(value as typeof interaction)}
                options={[
                  { value: 'all', label: 'All interactions' },
                  ...ASSET_INTERACTION_COMPATIBILITIES.map((value) => ({
                    value,
                    label: humanize(value),
                  })),
                ]}
                value={interaction}
              />
            </label>
            <label className="asset-checkbox">
              <input
                checked={showDevelopment}
                onChange={(event) => setShowDevelopment(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>Show development markers</span>
            </label>
          </div>

          <div
            className="world-asset-replacement-results"
            role="listbox"
            aria-label="Compatible active asset versions"
          >
            {filteredCandidates.length === 0 ? (
              <p className="empty-state">No compatible active asset matches these filters.</p>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  aria-selected={candidate.asset.id === candidateId}
                  className={`replacement-asset-card ${candidate.asset.id === candidateId ? 'is-selected' : ''}`}
                  key={candidate.versionId}
                  onClick={() => {
                    setCandidateId(candidate.asset.id);
                    setImpactAccepted(false);
                  }}
                  role="option"
                  type="button"
                >
                  {/* Same-origin media route independently rechecks assets.read. */}
                  {mediaUrl(candidate) === null ? (
                    <span className="replacement-asset-card__fallback" aria-hidden="true">
                      {candidate.asset.friendlyName.slice(0, 2).toUpperCase()}
                    </span>
                  ) : (
                    <img alt="" src={mediaUrl(candidate) ?? undefined} />
                  )}
                  <span>
                    <strong>{candidate.asset.friendlyName}</strong>
                    <small>
                      {candidate.assetKey} · v{candidate.activeVersion.versionNumber}
                    </small>
                    <small>
                      {humanize(candidate.asset.category)} · rotations{' '}
                      {candidate.supportedRotations.join('°, ')}°
                    </small>
                  </span>
                  <span
                    className={`asset-production-badge asset-production-badge--${candidate.asset.productionStatus}`}
                  >
                    {humanize(candidate.asset.productionStatus)}
                  </span>
                </button>
              ))
            )}
          </div>

          {selected === undefined ? null : (
            <section className="replacement-impact" aria-labelledby={`${id}-impact-title`}>
              <div className="replacement-impact__preview">
                {mediaUrl(selected) === null ? (
                  <span role="img" aria-label={`${selected.asset.friendlyName} procedural marker`}>
                    {selected.asset.friendlyName.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <img
                    alt={`${selected.asset.friendlyName} sanitized thumbnail`}
                    src={mediaUrl(selected) ?? undefined}
                  />
                )}
              </div>
              <div>
                <h3 id={`${id}-impact-title`}>Replacement impact</h3>
                <dl>
                  <div>
                    <dt>Visual</dt>
                    <dd>
                      {props.object.assetId} → {selected.assetKey}
                    </dd>
                  </div>
                  <div>
                    <dt>New default footprint</dt>
                    <dd>{collisionLabel(selected)}</dd>
                  </div>
                  <div>
                    <dt>Map collision</dt>
                    <dd>Preserved exactly; validation is required before preview/publication</dd>
                  </div>
                  <div>
                    <dt>Object interactions</dt>
                    <dd>
                      {interactionTypes.length === 0
                        ? 'None'
                        : interactionTypes.map(humanize).join(', ')}
                    </dd>
                  </div>
                </dl>
                {sameAssetObjects.length > 1 ? (
                  <label className="asset-checkbox replacement-impact__batch">
                    <input
                      checked={replaceAll}
                      onChange={(event) => {
                        setReplaceAll(event.currentTarget.checked);
                        setImpactAccepted(false);
                      }}
                      type="checkbox"
                    />
                    <span>
                      Replace all {sameAssetObjects.length} uses of {props.object.assetId} in this
                      draft ({sameAssetObjects.map(({ id: objectId }) => objectId).join(', ')})
                    </span>
                  </label>
                ) : null}
                <label className="asset-checkbox replacement-impact__confirmation">
                  <input
                    checked={impactAccepted}
                    onChange={(event) => setImpactAccepted(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>
                    I reviewed the new footprint and understand map collision remains unchanged
                    until explicitly edited and validated.
                  </span>
                </label>
              </div>
            </section>
          )}

          {error === undefined ? null : <p role="alert">{error}</p>}
          <footer>
            <button className="button button--quiet" onClick={close} ref={closeRef} type="button">
              Cancel
            </button>
            <button
              className="button button--primary"
              disabled={selected === undefined || !impactAccepted}
              onClick={applyReplacement}
              type="button"
            >
              Apply draft replacement
            </button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
