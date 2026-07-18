'use client';

import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { WorldAssetType } from '../lib/world-assets/contracts';
import type { PlaceholderMarkerOption } from '../lib/world-assets/placeholder-markers';
import { assetCategoryLabel, assetTypeLabel } from '../lib/world-assets/profiles';
import { focusTrapTarget } from './dialog-focus';
import { PremiumSelect } from './premium-select';
import { WorldAssetThumbnail } from './world-asset-thumbnail';

export type { PlaceholderMarkerOption } from '../lib/world-assets/placeholder-markers';

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

export function WorldAssetPlaceholderSelector(props: {
  readonly markers: readonly PlaceholderMarkerOption[];
  readonly assetType: WorldAssetType;
  readonly selectedKey: string | null;
  readonly disabled?: boolean;
  readonly canSelect: boolean;
  readonly onSelect: (key: string | null) => void;
}) {
  const id = useId().replaceAll(':', '');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | string>('all');
  const [candidateKey, setCandidateKey] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const compatibleMarkers = useMemo(() => {
    return props.markers.filter((marker) => {
      // Prefer same type; allow markers that share a broad structure/nature family.
      if (marker.assetType === props.assetType) return true;
      const structureFamily = new Set([
        'building',
        'shop',
        'cooking_station',
        'crafting_station',
        'home_entrance',
        'decoration',
        'bridge',
      ]);
      if (structureFamily.has(props.assetType) && structureFamily.has(marker.assetType)) {
        return true;
      }
      return false;
    });
  }, [props.assetType, props.markers]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return compatibleMarkers.filter((marker) => {
      if (typeFilter !== 'all' && marker.assetType !== typeFilter) return false;
      if (normalized === '') return true;
      return `${marker.friendlyName} ${marker.key} ${marker.assetType} ${marker.category}`
        .toLowerCase()
        .includes(normalized);
    });
  }, [compatibleMarkers, search, typeFilter]);

  const markerTypes = useMemo(() => {
    return [...new Set(compatibleMarkers.map((marker) => marker.assetType))].sort();
  }, [compatibleMarkers]);

  const selected = props.markers.find((marker) => marker.key === props.selectedKey) ?? null;
  const pending = filtered.find((marker) => marker.key === candidateKey) ?? null;

  function open(): void {
    setSearch('');
    setTypeFilter('all');
    setCandidateKey(props.selectedKey);
    setConfirmed(false);
    setTechnicalOpen(false);
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

  function apply(): void {
    if (candidateKey === null) {
      props.onSelect(null);
      close();
      return;
    }
    if (!confirmed) return;
    props.onSelect(candidateKey);
    close();
  }

  if (!props.canSelect) return null;
  if (compatibleMarkers.length === 0 && props.selectedKey === null) return null;

  return (
    <div className="asset-placeholder-selector">
      <details className="asset-placeholder-selector__disclosure" open={selected !== null}>
        <summary className="asset-placeholder-selector__summary">
          <span className="asset-placeholder-selector__badge">Optional</span>
          <span className="asset-placeholder-selector__title">
            Replacing a temporary placeholder?
          </span>
          <span className="asset-placeholder-selector__hint">
            {selected === null
              ? 'Most assets skip this. Choose an existing placeholder only when needed.'
              : `Selected: ${selected.friendlyName}`}
          </span>
        </summary>
        <div className="asset-placeholder-selector__body">
          <p className="field-hint">
            Connect this asset to a development placeholder by readable name. Published worlds stay
            unchanged until a new world version is explicitly published.
          </p>
          {selected === null ? (
            <p className="asset-placeholder-selector__empty">No placeholder selected</p>
          ) : (
            <div className="asset-placeholder-selector__selected">
              <WorldAssetThumbnail
                alt=""
                fallback={selected.friendlyName}
                size="small"
                source={selected.thumbnailUrl}
              />
              <div>
                <strong>{selected.friendlyName}</strong>
                <small>
                  {assetTypeLabel(selected.assetType)} · {assetCategoryLabel(selected.category)}
                </small>
              </div>
            </div>
          )}
          <div className="asset-placeholder-selector__actions">
            <button
              className="button button--secondary"
              disabled={props.disabled || compatibleMarkers.length === 0}
              onClick={open}
              ref={triggerRef}
              type="button"
            >
              {selected === null ? 'Choose placeholder' : 'Change placeholder'}
            </button>
            {selected === null ? null : (
              <button
                className="button button--quiet"
                disabled={props.disabled}
                onClick={() => props.onSelect(null)}
                type="button"
              >
                Remove selection
              </button>
            )}
          </div>
          {compatibleMarkers.length === 0 ? (
            <p className="field-hint">No compatible development placeholders are available.</p>
          ) : null}
        </div>
      </details>

      <dialog
        aria-describedby={`${id}-description`}
        aria-labelledby={`${id}-title`}
        className="operation-dialog world-asset-placeholder-dialog"
        onClose={() => triggerRef.current?.focus()}
        onKeyDown={trapFocus}
        ref={dialogRef}
      >
        <div className="world-asset-placeholder-dialog__layout">
          <header>
            <p className="eyebrow">Development placeholder</p>
            <h2 id={`${id}-title`}>Replace existing placeholder</h2>
            <p id={`${id}-description`}>
              Select a placeholder by its readable name. This connects the asset for future draft
              world updates. Published worlds remain unchanged until a new world version is
              explicitly published.
            </p>
          </header>

          <div className="world-asset-placeholder-filters" role="search">
            <label className="field">
              <span>Search placeholders</span>
              <input
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder="General Store, Lantern…"
                ref={searchRef}
                type="search"
                value={search}
              />
            </label>
            <label className="field">
              <span>Marker type</span>
              <PremiumSelect
                onChange={setTypeFilter}
                options={[
                  { value: 'all', label: 'All compatible types' },
                  ...markerTypes.map((type) => ({
                    value: type,
                    label: assetTypeLabel(type as WorldAssetType),
                  })),
                ]}
                value={typeFilter}
              />
            </label>
          </div>

          <div
            aria-label="Compatible development placeholders"
            className="world-asset-placeholder-results"
            role="listbox"
          >
            <button
              aria-selected={candidateKey === null}
              className={`replacement-asset-card ${candidateKey === null ? 'is-selected' : ''}`}
              onClick={() => {
                setCandidateKey(null);
                setConfirmed(false);
              }}
              role="option"
              type="button"
            >
              <span className="replacement-asset-card__fallback" aria-hidden="true">
                —
              </span>
              <span>
                <strong>Not replacing a placeholder</strong>
                <small>Create this asset without a marker mapping</small>
              </span>
            </button>
            {filtered.length === 0 ? (
              <p className="empty-state">No compatible placeholders match these filters.</p>
            ) : (
              filtered.map((marker) => (
                <button
                  aria-selected={marker.key === candidateKey}
                  className={`replacement-asset-card ${marker.key === candidateKey ? 'is-selected' : ''}`}
                  key={marker.assetId}
                  onClick={() => {
                    setCandidateKey(marker.key);
                    setConfirmed(false);
                    setTechnicalOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  <WorldAssetThumbnail
                    alt=""
                    fallback={marker.friendlyName}
                    size="small"
                    source={marker.thumbnailUrl}
                  />
                  <span>
                    <strong>{marker.friendlyName}</strong>
                    <small>
                      {assetTypeLabel(marker.assetType)} · {assetCategoryLabel(marker.category)}
                    </small>
                    <small>State: {humanize(marker.lifecycleStatus)}</small>
                  </span>
                  <span className="asset-production-badge asset-production-badge--development_marker">
                    Placeholder
                  </span>
                </button>
              ))
            )}
          </div>

          {pending === null ? null : (
            <section className="replacement-impact" aria-labelledby={`${id}-impact-title`}>
              <div>
                <h3 id={`${id}-impact-title`}>Selected marker</h3>
                <dl>
                  <div>
                    <dt>Display name</dt>
                    <dd>{pending.friendlyName}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{assetTypeLabel(pending.assetType)}</dd>
                  </div>
                  <div>
                    <dt>Current state</dt>
                    <dd>{humanize(pending.lifecycleStatus)}</dd>
                  </div>
                </dl>
                <details
                  className="asset-technical-details"
                  onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
                  open={technicalOpen}
                >
                  <summary>Technical details</summary>
                  <p>
                    Technical key: <code>{pending.key}</code>
                  </p>
                </details>
                <label className="asset-checkbox replacement-impact__confirmation">
                  <input
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.currentTarget.checked)}
                    type="checkbox"
                  />
                  <span>
                    I understand this only maps the asset to the placeholder. Published worlds stay
                    unchanged until a new world version is explicitly published, and the asset is
                    not activated automatically.
                  </span>
                </label>
              </div>
            </section>
          )}

          <footer>
            <button className="button button--quiet" onClick={close} type="button">
              Cancel
            </button>
            <button
              className="button button--primary"
              disabled={candidateKey !== null && !confirmed}
              onClick={apply}
              type="button"
            >
              {candidateKey === null ? 'Continue without placeholder' : 'Confirm placeholder'}
            </button>
          </footer>
        </div>
      </dialog>
    </div>
  );
}

export function PlaceholderReplacementDisplay(props: {
  readonly markerKey: string | null;
  readonly resolved: PlaceholderMarkerOption | null;
}) {
  if (props.markerKey === null) {
    return (
      <div>
        <dt>Placeholder replacement</dt>
        <dd>None</dd>
      </div>
    );
  }

  const label = props.resolved?.friendlyName ?? props.markerKey;
  return (
    <div className="asset-placeholder-display">
      <dt>Placeholder replacement</dt>
      <dd>
        <strong>{label}</strong>
        {props.resolved === null ? null : (
          <small>
            {assetTypeLabel(props.resolved.assetType)} ·{' '}
            {assetCategoryLabel(props.resolved.category)}
          </small>
        )}
        <details className="asset-technical-details">
          <summary>Technical details</summary>
          <p>
            Technical key: <code>{props.markerKey}</code>
          </p>
        </details>
      </dd>
    </div>
  );
}
