'use client';

import { mapObjectKinds } from '@starville/game-core';
import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';

import {
  saveWorldDraftAction,
  validateWorldDraftAction,
  type WorldActionState,
} from '../app/actions/worlds';
import type {
  AdminWorldManifest,
  WorldAsset,
  WorldDraftLoad,
  WorldValidationResult,
} from '../lib/worlds/contracts';
import {
  browserManifestIssues,
  commitWorldEditorManifest,
  createWorldEditorHistory,
  manifestHasUnsavedChanges,
  nextEditorIdentifier,
  redoWorldEditorManifest,
  removeWorldEditorSelection,
  undoWorldEditorManifest,
  type WorldEditorLayer,
  type WorldEditorSelection,
} from '../lib/worlds/editor-state';
import { WorldManifestCanvas } from './world-manifest-canvas';

const INITIAL_ACTION_STATE: WorldActionState = { outcome: 'idle' };
const FACING_DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

type MapObject = AdminWorldManifest['objects'][number];
type MapCollision = AdminWorldManifest['collisions'][number];
type MapSpawn = AdminWorldManifest['spawns'][number];
type MapExit = AdminWorldManifest['exits'][number];

interface WorldEditorProps {
  readonly draft: WorldDraftLoad;
  readonly approvedAssets: readonly WorldAsset[];
  readonly saveRequestId: string;
  readonly validationRequestId: string;
}

function requestId(): string {
  return globalThis.crypto.randomUUID();
}

function numeric(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function EditorField({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="editor-field">
      <span>{label}</span>
      {children}
      {hint === undefined ? null : <small>{hint}</small>}
    </label>
  );
}

function NumberEditor(props: {
  readonly label: string;
  readonly hint?: string;
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly onCommit: (value: number) => void;
}) {
  return (
    <EditorField {...(props.hint === undefined ? {} : { hint: props.hint })} label={props.label}>
      <input
        key={props.value}
        defaultValue={props.value}
        max={props.max}
        min={props.min}
        onBlur={(event) => props.onCommit(numeric(event.currentTarget.value, props.value))}
        step={props.step ?? 0.1}
        type="number"
      />
    </EditorField>
  );
}

function layerLabel(layer: WorldEditorLayer): string {
  return layer.slice(0, 1).toUpperCase() + layer.slice(1);
}

function appendBaseFields(
  formData: FormData,
  props: WorldEditorProps,
  editVersion: number,
  checksum: string | null,
  id: string,
): void {
  formData.set('mapId', props.draft.map.id);
  formData.set('versionId', props.draft.version.id);
  formData.set('requestId', id);
  formData.set('expectedEditVersion', String(editVersion));
  formData.set('expectedChecksum', checksum ?? '');
}

export function WorldEditor(props: WorldEditorProps) {
  const [history, setHistory] = useState(() => createWorldEditorHistory(props.draft.manifest));
  const [lastSaved, setLastSaved] = useState(props.draft.manifest);
  const [selection, setSelection] = useState<WorldEditorSelection>();
  const [layer, setLayer] = useState<WorldEditorLayer>('objects');
  const [showGrid, setShowGrid] = useState(true);
  const [showCollisions, setShowCollisions] = useState(true);
  const [showSpawns, setShowSpawns] = useState(true);
  const [showExits, setShowExits] = useState(true);
  const [assetKey, setAssetKey] = useState(props.approvedAssets[0]?.assetKey ?? '');
  const [objectKind, setObjectKind] = useState<MapObject['kind']>('building');
  const [editVersion, setEditVersion] = useState(props.draft.version.editVersion);
  const [checksum, setChecksum] = useState(props.draft.version.checksum);
  const [saveId, setSaveId] = useState(props.saveRequestId);
  const [validationId, setValidationId] = useState(props.validationRequestId);
  const [actionState, setActionState] = useState<WorldActionState>(INITIAL_ACTION_STATE);
  const [serverValidation, setServerValidation] = useState<WorldValidationResult | null>(
    props.draft.version.validationResult,
  );
  const [previewReady, setPreviewReady] = useState(
    props.draft.version.lifecycleStatus === 'validated',
  );
  const [operation, setOperation] = useState<'save' | 'validate'>('save');
  const [pending, startTransition] = useTransition();
  const manifest = history.present;
  const issues = useMemo(() => browserManifestIssues(manifest), [manifest]);
  const dirty = manifestHasUnsavedChanges(manifest, lastSaved);

  useEffect(() => {
    function protectUnload(event: BeforeUnloadEvent): void {
      if (!dirty) return;
      event.preventDefault();
    }

    function protectPortalLink(event: MouseEvent): void {
      if (!dirty || !(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>('a[href]');
      if (link === null || link.target === '_blank') return;
      if (!window.confirm('Leave the editor and discard unsaved world changes?')) {
        event.preventDefault();
      }
    }

    window.addEventListener('beforeunload', protectUnload);
    document.addEventListener('click', protectPortalLink);
    return () => {
      window.removeEventListener('beforeunload', protectUnload);
      document.removeEventListener('click', protectPortalLink);
    };
  }, [dirty]);

  function commit(next: AdminWorldManifest): void {
    setHistory((current) => commitWorldEditorManifest(current, next));
    setActionState(INITIAL_ACTION_STATE);
    setServerValidation(null);
    setPreviewReady(false);
  }

  function updateObject(id: string, patch: Partial<MapObject>): void {
    commit({
      ...manifest,
      objects: manifest.objects.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function updateCollision(id: string, next: MapCollision): void {
    commit({
      ...manifest,
      collisions: manifest.collisions.map((item) => (item.id === id ? next : item)),
    });
  }

  function updateSpawn(id: string, patch: Partial<MapSpawn>): void {
    commit({
      ...manifest,
      spawns: manifest.spawns.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function updateExit(id: string, patch: Partial<MapExit>): void {
    commit({
      ...manifest,
      exits: manifest.exits.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    });
  }

  function placeObject(): void {
    if (assetKey === '') return;
    const id = nextEditorIdentifier(manifest, objectKind);
    const next: MapObject = {
      id,
      assetId: assetKey,
      kind: objectKind,
      x: manifest.width / 2,
      y: manifest.height / 2,
      scale: 1,
    };
    commit({
      ...manifest,
      assets: manifest.assets.includes(assetKey) ? manifest.assets : [...manifest.assets, assetKey],
      objects: [...manifest.objects, next],
    });
    setLayer('objects');
    setSelection({ layer: 'objects', id });
  }

  function addCollision(shape: MapCollision['shape']): void {
    const id = nextEditorIdentifier(manifest, `collision-${shape}`);
    const x = manifest.width / 2;
    const y = manifest.height / 2;
    const collision: MapCollision =
      shape === 'rectangle'
        ? { id, shape, x: x - 0.5, y: y - 0.5, width: 1, height: 1, blocking: true }
        : shape === 'circle'
          ? { id, shape, x, y, radius: 0.5, blocking: true }
          : {
              id,
              shape,
              startX: x - 0.5,
              startY: y,
              endX: x + 0.5,
              endY: y,
              radius: 0.35,
              blocking: true,
            };
    commit({ ...manifest, collisions: [...manifest.collisions, collision] });
    setLayer('collisions');
    setSelection({ layer: 'collisions', id });
  }

  function addSpawn(): void {
    const id = nextEditorIdentifier(manifest, 'spawn');
    const spawn: MapSpawn = {
      id,
      x: manifest.width / 2,
      y: manifest.height / 2,
      facingDirection: 'south',
      purpose: 'transition-entry',
      enabled: true,
    };
    commit({ ...manifest, spawns: [...manifest.spawns, spawn] });
    setLayer('spawns');
    setSelection({ layer: 'spawns', id });
  }

  function removeSelected(): void {
    if (selection === undefined) return;
    const next = removeWorldEditorSelection(manifest, selection);
    if (next === manifest) return;
    commit(next);
    setSelection(undefined);
  }

  function saveDraft(): void {
    const formData = new FormData();
    appendBaseFields(formData, props, editVersion, checksum, saveId);
    formData.set('manifest', JSON.stringify(manifest));
    formData.set('confirmed', 'yes');
    setOperation('save');
    startTransition(async () => {
      const result = await saveWorldDraftAction(INITIAL_ACTION_STATE, formData);
      setActionState(result);
      setSaveId(requestId());
      if (result.outcome === 'success') {
        setLastSaved(manifest);
        setEditVersion(result.editVersion ?? editVersion);
        setChecksum(result.checksum ?? null);
        setServerValidation(result.validation ?? null);
        setPreviewReady(false);
      }
    });
  }

  function validateDraft(): void {
    const formData = new FormData();
    appendBaseFields(formData, props, editVersion, checksum, validationId);
    setOperation('validate');
    startTransition(async () => {
      const result = await validateWorldDraftAction(INITIAL_ACTION_STATE, formData);
      setActionState(result);
      setValidationId(requestId());
      if (result.editVersion !== undefined) setEditVersion(result.editVersion);
      if (result.checksum !== undefined) setChecksum(result.checksum);
      if (result.validation !== undefined) setServerValidation(result.validation);
      setPreviewReady(result.outcome === 'success');
    });
  }

  const selectedObject =
    selection?.layer === 'objects'
      ? manifest.objects.find(({ id }) => id === selection.id)
      : undefined;
  const selectedCollision =
    selection?.layer === 'collisions'
      ? manifest.collisions.find(({ id }) => id === selection.id)
      : undefined;
  const selectedSpawn =
    selection?.layer === 'spawns'
      ? manifest.spawns.find(({ id }) => id === selection.id)
      : undefined;
  const selectedExit =
    selection?.layer === 'exits' ? manifest.exits.find(({ id }) => id === selection.id) : undefined;

  function layerItems(): readonly Readonly<{ id: string; label: string; detail: string }>[] {
    if (layer === 'objects')
      return manifest.objects.map((item) => ({
        id: item.id,
        label: item.id,
        detail: `${item.kind} · ${item.assetId}`,
      }));
    if (layer === 'collisions')
      return manifest.collisions.map((item) => ({
        id: item.id,
        label: item.id,
        detail: `${item.shape} · ${item.blocking ? 'blocking' : 'non-blocking'}`,
      }));
    if (layer === 'spawns')
      return manifest.spawns.map((item) => ({
        id: item.id,
        label: item.id,
        detail: `${item.purpose} · ${item.enabled ? 'enabled' : 'disabled'}`,
      }));
    if (layer === 'exits')
      return manifest.exits.map((item) => ({
        id: item.id,
        label: item.direction,
        detail: item.enabled ? (item.transitionLabel ?? 'Enabled') : 'Disabled',
      }));
    return [];
  }

  function selectionFor(id: string): WorldEditorSelection | undefined {
    if (!['objects', 'collisions', 'spawns', 'exits'].includes(layer)) return undefined;
    return { layer: layer as WorldEditorSelection['layer'], id };
  }

  return (
    <main className="world-editor-page" aria-labelledby="editor-title">
      <header className="world-editor-header">
        <div>
          <Link className="back-link" href={`/worlds/${props.draft.map.id}`}>
            ← {props.draft.map.displayName}
          </Link>
          <p className="eyebrow">Protected structured draft</p>
          <h1 id="editor-title">World Editor</h1>
          <p>
            Version {props.draft.version.versionNumber} · edit revision {editVersion}
          </p>
        </div>
        <div className="world-editor-header__actions">
          <span
            className={`state-chip ${dirty ? 'state-chip--pending' : 'state-chip--success'}`}
            role="status"
          >
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <button
            className="button button--quiet"
            disabled={history.past.length === 0 || pending}
            onClick={() => setHistory(undoWorldEditorManifest)}
            type="button"
          >
            Undo
          </button>
          <button
            className="button button--quiet"
            disabled={history.future.length === 0 || pending}
            onClick={() => setHistory(redoWorldEditorManifest)}
            type="button"
          >
            Redo
          </button>
          <button
            className="button button--primary"
            disabled={pending || issues.length > 0 || !dirty}
            onClick={saveDraft}
            type="button"
          >
            {pending && operation === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            className="button button--secondary"
            disabled={pending || dirty || issues.length > 0}
            onClick={validateDraft}
            type="button"
          >
            {pending && operation === 'validate' ? 'Validating…' : 'Validate saved draft'}
          </button>
          {previewReady && serverValidation?.valid === true ? (
            <Link
              className="button button--secondary"
              href={`/worlds/${props.draft.map.id}/preview?version=${props.draft.version.id}`}
            >
              Preview
            </Link>
          ) : null}
        </div>
      </header>

      {actionState.outcome === 'idle' ? null : (
        <p
          className={`notice ${actionState.outcome === 'success' ? 'notice--success' : 'notice--warning'}`}
          role={actionState.outcome === 'error' ? 'alert' : 'status'}
        >
          {actionState.message}
        </p>
      )}

      <section className="world-editor-toolbar" aria-label="Editor view controls">
        {[
          ['Grid', showGrid, setShowGrid],
          ['Collision', showCollisions, setShowCollisions],
          ['Spawns', showSpawns, setShowSpawns],
          ['Exit regions', showExits, setShowExits],
        ].map(([label, checked, setter]) => (
          <label key={String(label)}>
            <input
              checked={Boolean(checked)}
              onChange={(event) =>
                (setter as (value: boolean) => void)(event.currentTarget.checked)
              }
              type="checkbox"
            />
            {String(label)}
          </label>
        ))}
      </section>

      <div className="world-editor-layout">
        <aside className="world-editor-layers" aria-labelledby="layers-title">
          <h2 id="layers-title">Layers</h2>
          <div className="editor-layer-tabs" role="tablist" aria-label="World editor layers">
            {(['metadata', 'objects', 'collisions', 'spawns', 'exits', 'bounds'] as const).map(
              (item) => (
                <button
                  aria-selected={layer === item}
                  className={layer === item ? 'is-active' : ''}
                  key={item}
                  onClick={() => {
                    setLayer(item);
                    setSelection(undefined);
                  }}
                  role="tab"
                  type="button"
                >
                  {layerLabel(item)}
                </button>
              ),
            )}
          </div>

          {layer === 'objects' ? (
            <div className="editor-create-panel">
              <EditorField label="Approved asset">
                <select
                  onChange={(event) => setAssetKey(event.currentTarget.value)}
                  value={assetKey}
                >
                  {props.approvedAssets
                    .filter(({ approvalStatus }) => approvalStatus === 'approved')
                    .map((asset) => (
                      <option key={asset.id} value={asset.assetKey}>
                        {asset.assetKey}
                      </option>
                    ))}
                </select>
              </EditorField>
              <EditorField label="Object kind">
                <select
                  onChange={(event) =>
                    setObjectKind(event.currentTarget.value as MapObject['kind'])
                  }
                  value={objectKind}
                >
                  {mapObjectKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </EditorField>
              <button
                className="button button--secondary"
                disabled={assetKey === ''}
                onClick={placeObject}
                type="button"
              >
                Place at map center
              </button>
            </div>
          ) : null}
          {layer === 'collisions' ? (
            <div className="editor-create-buttons" aria-label="Create collision footprint">
              <button onClick={() => addCollision('rectangle')} type="button">
                + Rectangle
              </button>
              <button onClick={() => addCollision('circle')} type="button">
                + Circle
              </button>
              <button onClick={() => addCollision('capsule')} type="button">
                + Capsule
              </button>
            </div>
          ) : null}
          {layer === 'spawns' ? (
            <button
              className="button button--secondary editor-add-button"
              onClick={addSpawn}
              type="button"
            >
              Add transition spawn
            </button>
          ) : null}

          {layerItems().length === 0 ? null : (
            <ul className="editor-entity-list">
              {layerItems().map((item) => {
                const target = selectionFor(item.id);
                return (
                  <li key={item.id}>
                    <button
                      aria-pressed={
                        target !== undefined &&
                        selection?.layer === target.layer &&
                        selection.id === target.id
                      }
                      onClick={() => setSelection(target)}
                      type="button"
                    >
                      <strong>{item.label}</strong>
                      <small>{item.detail}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="world-editor-stage" aria-labelledby="stage-title">
          <div className="world-editor-stage__heading">
            <div>
              <p className="eyebrow">Isometric data view</p>
              <h2 id="stage-title">{manifest.name}</h2>
            </div>
            <span>
              {manifest.width} × {manifest.height} world units
            </span>
          </div>
          <WorldManifestCanvas
            manifest={manifest}
            onSelect={(target) => {
              setLayer(target.layer);
              setSelection(target);
            }}
            {...(selection === undefined ? {} : { selection })}
            showCollisions={showCollisions}
            showExits={showExits}
            showGrid={showGrid}
            showSpawns={showSpawns}
          />
          <p className="world-editor-stage__note">
            The canvas visualizes structured map data; it does not flatten or upload a background
            image.
          </p>
        </section>

        <aside className="world-editor-inspector" aria-labelledby="inspector-title">
          <h2 id="inspector-title">Property inspector</h2>
          {layer === 'metadata' ? (
            <div className="editor-fields">
              <EditorField label="Map display name">
                <input
                  maxLength={80}
                  onChange={(event) => commit({ ...manifest, name: event.currentTarget.value })}
                  value={manifest.name}
                />
              </EditorField>
              <EditorField label="Description">
                <textarea
                  maxLength={240}
                  onChange={(event) =>
                    commit({ ...manifest, description: event.currentTarget.value })
                  }
                  rows={5}
                  value={manifest.description}
                />
              </EditorField>
              <EditorField
                hint="Temporary Phase 6 art must remain truthfully labelled."
                label="Development-art label"
              >
                <input
                  maxLength={120}
                  onChange={(event) =>
                    commit({
                      ...manifest,
                      developmentArt: {
                        ...manifest.developmentArt,
                        label: event.currentTarget.value,
                      },
                    })
                  }
                  value={manifest.developmentArt.label}
                />
              </EditorField>
            </div>
          ) : null}
          {layer === 'bounds' ? (
            <div className="editor-fields">
              <h3>Safe save bounds</h3>
              {(['minX', 'minY', 'maxX', 'maxY'] as const).map((field) => (
                <NumberEditor
                  key={`safe-${field}`}
                  label={field}
                  onCommit={(value) =>
                    commit({
                      ...manifest,
                      safeSaveBounds: { ...manifest.safeSaveBounds, [field]: value },
                    })
                  }
                  value={manifest.safeSaveBounds[field]}
                />
              ))}
              <h3>Camera bounds</h3>
              {(['minX', 'minY', 'maxX', 'maxY'] as const).map((field) => (
                <NumberEditor
                  key={`camera-${field}`}
                  label={field}
                  onCommit={(value) =>
                    commit({
                      ...manifest,
                      cameraBounds: { ...manifest.cameraBounds, [field]: value },
                    })
                  }
                  value={manifest.cameraBounds[field]}
                />
              ))}
            </div>
          ) : null}
          {selectedObject !== undefined ? (
            <div className="editor-fields">
              <p className="editor-selection-id">{selectedObject.id}</p>
              <EditorField label="Approved asset">
                <select
                  onChange={(event) =>
                    updateObject(selectedObject.id, { assetId: event.currentTarget.value })
                  }
                  value={selectedObject.assetId}
                >
                  {props.approvedAssets
                    .filter(({ approvalStatus }) => approvalStatus === 'approved')
                    .map((asset) => (
                      <option key={asset.id} value={asset.assetKey}>
                        {asset.assetKey}
                      </option>
                    ))}
                </select>
              </EditorField>
              <EditorField label="Object kind">
                <select
                  onChange={(event) =>
                    updateObject(selectedObject.id, {
                      kind: event.currentTarget.value as MapObject['kind'],
                    })
                  }
                  value={selectedObject.kind}
                >
                  {mapObjectKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </EditorField>
              <NumberEditor
                label="World X"
                onCommit={(value) => updateObject(selectedObject.id, { x: value })}
                value={selectedObject.x}
              />
              <NumberEditor
                hint="Depth sorting uses the logical world Y base."
                label="World Y / depth base"
                onCommit={(value) => updateObject(selectedObject.id, { y: value })}
                value={selectedObject.y}
              />
              <NumberEditor
                label="Scale"
                max={4}
                min={0.1}
                onCommit={(value) => updateObject(selectedObject.id, { scale: value })}
                value={selectedObject.scale}
              />
              <button className="button button--danger" onClick={removeSelected} type="button">
                Delete object
              </button>
            </div>
          ) : null}
          {selectedCollision !== undefined ? (
            <CollisionInspector
              collision={selectedCollision}
              onChange={(next) => updateCollision(selectedCollision.id, next)}
              onDelete={removeSelected}
            />
          ) : null}
          {selectedSpawn !== undefined ? (
            <div className="editor-fields">
              <p className="editor-selection-id">{selectedSpawn.id}</p>
              <NumberEditor
                label="World X"
                onCommit={(value) => updateSpawn(selectedSpawn.id, { x: value })}
                value={selectedSpawn.x}
              />
              <NumberEditor
                label="World Y"
                onCommit={(value) => updateSpawn(selectedSpawn.id, { y: value })}
                value={selectedSpawn.y}
              />
              <EditorField label="Facing direction">
                <select
                  onChange={(event) =>
                    updateSpawn(selectedSpawn.id, {
                      facingDirection: event.currentTarget.value as MapSpawn['facingDirection'],
                    })
                  }
                  value={selectedSpawn.facingDirection}
                >
                  {FACING_DIRECTIONS.map((facing) => (
                    <option key={facing} value={facing}>
                      {facing}
                    </option>
                  ))}
                </select>
              </EditorField>
              <EditorField label="Purpose">
                <select
                  disabled={selectedSpawn.id === manifest.defaultSpawnId}
                  onChange={(event) =>
                    updateSpawn(selectedSpawn.id, {
                      purpose: event.currentTarget.value as MapSpawn['purpose'],
                    })
                  }
                  value={selectedSpawn.purpose}
                >
                  <option value="default">Default</option>
                  <option value="transition-entry">Transition entry</option>
                </select>
              </EditorField>
              <label className="editor-check">
                <input
                  checked={selectedSpawn.enabled}
                  onChange={(event) =>
                    updateSpawn(selectedSpawn.id, { enabled: event.currentTarget.checked })
                  }
                  type="checkbox"
                />{' '}
                Enabled
              </label>
              {selectedSpawn.id === manifest.defaultSpawnId ? (
                <p className="field-hint">The approved default spawn cannot be deleted.</p>
              ) : (
                <button className="button button--danger" onClick={removeSelected} type="button">
                  Delete spawn
                </button>
              )}
            </div>
          ) : null}
          {selectedExit !== undefined ? (
            <ExitInspector
              exit={selectedExit}
              onChange={(patch) => updateExit(selectedExit.id, patch)}
            />
          ) : null}
          {!['metadata', 'bounds'].includes(layer) && selection === undefined ? (
            <p className="editor-empty-inspector">
              Select an item from the layer list or canvas to edit its structured properties.
            </p>
          ) : null}
        </aside>
      </div>

      <section className="world-validation-panel" aria-labelledby="validation-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Validation boundary</p>
            <h2 id="validation-title">Validation results</h2>
          </div>
          <span
            className={`state-chip ${issues.length === 0 ? 'state-chip--success' : 'state-chip--error'}`}
          >
            {issues.length === 0 ? 'Browser schema clear' : `${issues.length} local issue(s)`}
          </span>
        </div>
        <p>
          Browser checks provide immediate field guidance. Only the trusted server validator can
          move a saved draft to <strong>validated</strong>.
        </p>
        {issues.length === 0 ? null : (
          <ul className="validation-issues" role="alert">
            {issues.map((issue) => (
              <li key={`${issue.path}-${issue.message}`}>
                <code>{issue.path}</code>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        )}
        {serverValidation === null ? (
          <p className="field-hint">
            No trusted validation result is attached to the current edited state.
          </p>
        ) : (
          <>
            <h3>
              {serverValidation.valid
                ? 'Trusted validation passed'
                : 'Trusted validation found blockers'}
            </h3>
            <ul className="validation-issues">
              {[...serverValidation.errors, ...serverValidation.warnings].map((issue) => (
                <li key={`${issue.code}-${issue.path}`}>
                  <code>{issue.path || issue.code}</code>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}

function CollisionInspector({
  collision,
  onChange,
  onDelete,
}: {
  readonly collision: MapCollision;
  readonly onChange: (next: MapCollision) => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="editor-fields">
      <p className="editor-selection-id">{collision.id}</p>
      <p className="field-hint">{collision.shape} footprint · logical world coordinates</p>
      {collision.shape === 'rectangle' ? (
        <>
          <NumberEditor
            label="X"
            onCommit={(x) => onChange({ ...collision, x })}
            value={collision.x}
          />
          <NumberEditor
            label="Y"
            onCommit={(y) => onChange({ ...collision, y })}
            value={collision.y}
          />
          <NumberEditor
            label="Width"
            min={0.1}
            onCommit={(width) => onChange({ ...collision, width })}
            value={collision.width}
          />
          <NumberEditor
            label="Height"
            min={0.1}
            onCommit={(height) => onChange({ ...collision, height })}
            value={collision.height}
          />
        </>
      ) : collision.shape === 'circle' ? (
        <>
          <NumberEditor
            label="Center X"
            onCommit={(x) => onChange({ ...collision, x })}
            value={collision.x}
          />
          <NumberEditor
            label="Center Y"
            onCommit={(y) => onChange({ ...collision, y })}
            value={collision.y}
          />
          <NumberEditor
            label="Radius"
            min={0.1}
            onCommit={(radius) => onChange({ ...collision, radius })}
            value={collision.radius}
          />
        </>
      ) : (
        <>
          <NumberEditor
            label="Start X"
            onCommit={(startX) => onChange({ ...collision, startX })}
            value={collision.startX}
          />
          <NumberEditor
            label="Start Y"
            onCommit={(startY) => onChange({ ...collision, startY })}
            value={collision.startY}
          />
          <NumberEditor
            label="End X"
            onCommit={(endX) => onChange({ ...collision, endX })}
            value={collision.endX}
          />
          <NumberEditor
            label="End Y"
            onCommit={(endY) => onChange({ ...collision, endY })}
            value={collision.endY}
          />
          <NumberEditor
            label="Radius"
            min={0.1}
            onCommit={(radius) => onChange({ ...collision, radius })}
            value={collision.radius}
          />
        </>
      )}
      <label className="editor-check">
        <input
          checked={collision.blocking}
          onChange={(event) => onChange({ ...collision, blocking: event.currentTarget.checked })}
          type="checkbox"
        />{' '}
        Blocking
      </label>
      <button className="button button--danger" onClick={onDelete} type="button">
        Delete collision
      </button>
    </div>
  );
}

function ExitInspector({
  exit,
  onChange,
}: {
  readonly exit: MapExit;
  readonly onChange: (patch: Partial<MapExit>) => void;
}) {
  const destinationEnabled = exit.enabled;
  return (
    <div className="editor-fields">
      <p className="editor-selection-id">
        {exit.direction} · {exit.id}
      </p>
      <label className="editor-check">
        <input
          checked={destinationEnabled}
          onChange={(event) =>
            onChange(
              event.currentTarget.checked
                ? { enabled: true }
                : {
                    enabled: false,
                    destinationMapId: null,
                    destinationSpawnId: null,
                    transitionLabel: null,
                  },
            )
          }
          type="checkbox"
        />{' '}
        Enabled
      </label>
      {(['x', 'y', 'width', 'height'] as const).map((field) => (
        <NumberEditor
          key={field}
          label={`Trigger ${field}`}
          {...(field === 'width' || field === 'height' ? { min: 0.1 } : {})}
          onCommit={(value) => onChange({ trigger: { ...exit.trigger, [field]: value } })}
          value={exit.trigger[field]}
        />
      ))}
      <EditorField
        hint="Must be an approved map ID; the server resolves and validates it."
        label="Destination map ID"
      >
        <input
          disabled={!destinationEnabled}
          maxLength={64}
          onChange={(event) =>
            onChange({
              destinationMapId:
                event.currentTarget.value === ''
                  ? null
                  : (event.currentTarget.value as MapExit['destinationMapId']),
            })
          }
          value={exit.destinationMapId ?? ''}
        />
      </EditorField>
      <EditorField label="Destination spawn ID">
        <input
          disabled={!destinationEnabled}
          maxLength={64}
          onChange={(event) => onChange({ destinationSpawnId: event.currentTarget.value || null })}
          value={exit.destinationSpawnId ?? ''}
        />
      </EditorField>
      <EditorField label="Transition label">
        <input
          disabled={!destinationEnabled}
          maxLength={80}
          onChange={(event) => onChange({ transitionLabel: event.currentTarget.value || null })}
          value={exit.transitionLabel ?? ''}
        />
      </EditorField>
      <p className="field-hint">
        Enabling an exit is not sufficient for publication. The trusted graph validator must confirm
        its destination and safe spawn.
      </p>
    </div>
  );
}
