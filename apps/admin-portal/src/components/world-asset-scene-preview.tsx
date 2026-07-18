'use client';

import { PLAYER_FOOT_RADIUS, moveWithCollisions, type Point } from '@starville/game-core';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

import type {
  AssetDraftConfiguration,
  WorldAssetSummary,
  WorldAssetVersion,
} from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import { assetArtworkLabel } from '../lib/world-assets/review-model';
import {
  assetSceneWorldContextSchema,
  candidateCollisionAtTarget,
  compatibleSceneTargets,
  createSceneTestPad,
  nearbySceneObjects,
  previewDepthRelationship,
  previewScaleGuidance,
  referencePlayerPositions,
  referenceWalkPath,
  scenePreviewCollisions,
  scenePreviewNextAction,
  sceneWorldContextPath,
  visualReviewChecklist,
  type AssetSceneRenderOverride,
  type AssetSceneWorldContext,
  type AssetSceneWorldDirectory,
  type AssetSceneWorldOption,
} from '../lib/world-assets/scene-preview-model';
import type { AdminWorldManifest } from '../lib/worlds/contracts';
import type { WorldEditorSelection } from '../lib/worlds/editor-state';
import { PremiumSelect } from './premium-select';
import { WorldManifestCanvas } from './world-manifest-canvas';

type SceneMode = 'scene' | 'compare';
type Presentation = 'active' | 'candidate';
type ViewportFrame = 'mobile' | 'tablet' | 'desktop';

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

function optionValue(option: AssetSceneWorldOption): string {
  return `${option.mapId}|${option.versionId}|${option.source}`;
}

function optionLabel(option: AssetSceneWorldOption): string {
  const version = option.versionNumber === null ? '' : ` · V${String(option.versionNumber)}`;
  return `${option.displayName} · ${option.source === 'draft' ? 'Validated draft' : 'Published snapshot'}${version}`;
}

function configurationForVersion(
  asset: WorldAssetSummary,
  version: WorldAssetVersion,
): AssetDraftConfiguration {
  return {
    friendlyName: asset.friendlyName,
    category: asset.category,
    tags: version.tags,
    internalNotes: version.internalNotes,
    render: version.render,
    collision: version.collision,
    interactionCompatibility: version.interactionCompatibility,
  };
}

function mediaPath(version: WorldAssetVersion): string | null {
  if (version.sourceUrl !== null) {
    return availableAdminAssetMediaPath(version.assetId, version.id, 'source', version.sourceUrl);
  }
  return availableAdminAssetMediaPath(version.assetId, version.id, 'preview', version.previewUrl);
}

function versionDimensions(version: WorldAssetVersion): string {
  return version.width === null || version.height === null
    ? 'Not available'
    : `${String(version.width)} × ${String(version.height)}`;
}

function collisionSummary(configuration: AssetDraftConfiguration): string {
  const collision = configuration.collision;
  if (collision.shape === 'none') return 'No managed collision';
  if (collision.shape === 'rectangle') {
    return `${collision.blocking ? 'Blocking' : 'Non-blocking'} rectangle · ${collision.width.toFixed(2)} × ${collision.height.toFixed(2)}`;
  }
  return `${collision.blocking ? 'Blocking' : 'Non-blocking'} capsule · radius ${collision.radius.toFixed(2)}`;
}

function targetLabel(object: AdminWorldManifest['objects'][number]): string {
  return object.id
    .replace(/^phase7[-_]/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

export function WorldAssetScenePreview(props: {
  readonly asset: WorldAssetSummary;
  readonly version: WorldAssetVersion;
  readonly activeVersion: WorldAssetVersion | null;
  readonly configuration: AssetDraftConfiguration;
  readonly worldDirectory: AssetSceneWorldDirectory;
  readonly mode: SceneMode;
  readonly onReturnToTechnical: () => void;
}) {
  const initialOption = props.worldDirectory.items[0];
  const [selectedWorldValue, setSelectedWorldValue] = useState(
    initialOption === undefined ? '' : optionValue(initialOption),
  );
  const selectedWorld = props.worldDirectory.items.find(
    (option) => optionValue(option) === selectedWorldValue,
  );
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [context, setContext] = useState<AssetSceneWorldContext | null>(null);
  const [loadMessage, setLoadMessage] = useState(props.worldDirectory.message);
  const [locationId, setLocationId] = useState('');
  const [presentation, setPresentation] = useState<Presentation>('candidate');
  const [showGrid, setShowGrid] = useState(false);
  const [showCollision, setShowCollision] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [showSpawns, setShowSpawns] = useState(false);
  const [showExits, setShowExits] = useState(false);
  const [showPlayer, setShowPlayer] = useState(true);
  const [viewport, setViewport] = useState<ViewportFrame>('desktop');
  const [zoom, setZoom] = useState(1.25);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [followPlayer, setFollowPlayer] = useState(false);
  const [selection, setSelection] = useState<WorldEditorSelection | undefined>();
  const [player, setPlayer] = useState<Point>({ x: 0, y: 0 });
  const [walking, setWalking] = useState(false);
  const [walkIndex, setWalkIndex] = useState(0);
  const [pathResult, setPathResult] = useState<'not-run' | 'passable' | 'blocked'>('not-run');
  const [announcement, setAnnouncement] = useState(
    'Choose a world and compatible test location to begin the read-only simulation.',
  );
  const [notes, setNotes] = useState('');
  const [checkedItems, setCheckedItems] = useState<ReadonlySet<string>>(() => new Set());
  const [reducedMotion, setReducedMotion] = useState(false);
  const pointerRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    previousX: number;
    previousY: number;
    dragged: boolean;
  } | null>(null);
  const suppressSelectionRef = useRef(false);

  useEffect(() => {
    if (selectedWorld === undefined) {
      setContext(null);
      setLoadState('idle');
      return undefined;
    }
    const controller = new AbortController();
    setLoadState('loading');
    setLoadMessage('Loading the selected read-only world context…');
    void fetch(sceneWorldContextPath(selectedWorld), {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`scene-preview-${String(response.status)}`);
        const parsed = assetSceneWorldContextSchema.safeParse(await response.json());
        if (!parsed.success) throw new Error('scene-preview-invalid-response');
        setContext(parsed.data);
        setLoadState('loaded');
        setLoadMessage(
          `${parsed.data.map.displayName} ${parsed.data.source === 'draft' ? 'validated draft' : 'published snapshot'} loaded read-only.`,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setContext(null);
        setLoadState('error');
        setLoadMessage(
          error instanceof Error && error.message.endsWith('403')
            ? 'Your current role cannot open this world context.'
            : 'The selected world context is unavailable. No asset or world state changed.',
        );
      });
    return () => controller.abort();
  }, [selectedWorld]);

  const compatibleTargets = useMemo(
    () =>
      context === null
        ? []
        : compatibleSceneTargets(context.manifest, props.asset.assetType, props.asset.slug),
    [context, props.asset.assetType, props.asset.slug],
  );
  const testPad = useMemo(
    () =>
      context === null
        ? null
        : createSceneTestPad(context.manifest, props.asset.assetType, props.asset.slug),
    [context, props.asset.assetType, props.asset.slug],
  );

  useEffect(() => {
    if (context === null) return;
    const nextLocation = compatibleTargets[0]?.id ?? (testPad === null ? '' : '__test_pad__');
    setLocationId(nextLocation);
    setWalking(false);
    setWalkIndex(0);
    setPathResult('not-run');
  }, [compatibleTargets, context, testPad]);

  const sceneLocation = useMemo(() => {
    if (context === null) return null;
    if (locationId === '__test_pad__') return testPad;
    const target = context.manifest.objects.find(({ id }) => id === locationId);
    return target === undefined ? null : { manifest: context.manifest, target };
  }, [context, locationId, testPad]);

  const activeConfiguration = useMemo(
    () =>
      props.activeVersion === null
        ? null
        : configurationForVersion(props.asset, props.activeVersion),
    [props.activeVersion, props.asset],
  );
  const candidateConfiguration = props.configuration;
  const candidateManifest = useMemo(
    () =>
      sceneLocation === null
        ? null
        : {
            ...sceneLocation.manifest,
            collisions: scenePreviewCollisions(
              sceneLocation.manifest,
              sceneLocation.target,
              candidateConfiguration,
            ),
          },
    [candidateConfiguration, sceneLocation],
  );
  const activeManifest = useMemo(
    () =>
      sceneLocation === null || activeConfiguration === null
        ? null
        : {
            ...sceneLocation.manifest,
            collisions: scenePreviewCollisions(
              sceneLocation.manifest,
              sceneLocation.target,
              activeConfiguration,
            ),
          },
    [activeConfiguration, sceneLocation],
  );

  const playerPositions = useMemo(
    () =>
      sceneLocation === null
        ? null
        : referencePlayerPositions(sceneLocation.manifest, sceneLocation.target),
    [sceneLocation],
  );
  const walkPath = useMemo(
    () =>
      sceneLocation === null
        ? []
        : referenceWalkPath(sceneLocation.manifest, sceneLocation.target, props.asset.assetType),
    [props.asset.assetType, sceneLocation],
  );

  useEffect(() => {
    if (playerPositions === null || sceneLocation === null) return;
    setPlayer(playerPositions.front);
    setSelection({ layer: 'objects', id: sceneLocation.target.id });
    setAnnouncement(
      `Preview target ${targetLabel(sceneLocation.target)} selected. Reference player is in front.`,
    );
  }, [playerPositions, sceneLocation]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setWalking(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const movementManifest = presentation === 'active' ? activeManifest : candidateManifest;

  useEffect(() => {
    if (
      !walking ||
      reducedMotion ||
      movementManifest === null ||
      walkPath.length === 0 ||
      sceneLocation === null
    ) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      const goal = walkPath[walkIndex];
      if (goal === undefined) {
        setWalking(false);
        setPathResult('passable');
        setAnnouncement('Walking path completed. Preview player position was not persisted.');
        return;
      }
      setPlayer((current) => {
        const distance = Math.hypot(goal.x - current.x, goal.y - current.y);
        if (distance <= 0.12) {
          setWalkIndex((value) => value + 1);
          return goal;
        }
        const amount = Math.min(0.18, distance);
        const delta = {
          x: ((goal.x - current.x) / distance) * amount,
          y: ((goal.y - current.y) / distance) * amount,
        };
        const next = moveWithCollisions(
          current,
          delta,
          PLAYER_FOOT_RADIUS,
          movementManifest.safeSaveBounds,
          movementManifest.collisions,
        );
        if (Math.hypot(next.x - current.x, next.y - current.y) < 0.001) {
          setWalking(false);
          setPathResult('blocked');
          setAnnouncement(
            'The simulated walking path is blocked by the selected collision profile or nearby map collision.',
          );
        }
        return next;
      });
    }, 80);
    return () => window.clearInterval(timer);
  }, [movementManifest, reducedMotion, sceneLocation, walkIndex, walkPath, walking]);

  const candidateOverride = useMemo<AssetSceneRenderOverride | null>(
    () =>
      sceneLocation === null
        ? null
        : {
            targetObjectId: sceneLocation.target.id,
            assetId: props.asset.id,
            assetKey: props.asset.slug,
            friendlyName: props.asset.friendlyName,
            version: props.version,
            configuration: candidateConfiguration,
            mediaUrl: mediaPath(props.version),
            presentation: 'candidate',
          },
    [candidateConfiguration, props.asset, props.version, sceneLocation],
  );
  const activeOverride = useMemo<AssetSceneRenderOverride | null>(
    () =>
      sceneLocation === null || props.activeVersion === null || activeConfiguration === null
        ? null
        : {
            targetObjectId: sceneLocation.target.id,
            assetId: props.asset.id,
            assetKey: props.asset.slug,
            friendlyName: props.asset.friendlyName,
            version: props.activeVersion,
            configuration: activeConfiguration,
            mediaUrl: mediaPath(props.activeVersion),
            presentation: 'active',
          },
    [activeConfiguration, props.activeVersion, props.asset, sceneLocation],
  );

  const displayedVersion = presentation === 'active' ? props.activeVersion : props.version;
  const displayedConfiguration =
    presentation === 'active' ? activeConfiguration : candidateConfiguration;
  const displayedOverride = presentation === 'active' ? activeOverride : candidateOverride;
  const displayedManifest = presentation === 'active' ? activeManifest : candidateManifest;
  const selectedObject =
    selection?.layer === 'objects' && context !== null
      ? (context.manifest.objects.find(({ id }) => id === selection.id) ??
        (sceneLocation?.target.id === selection.id ? sceneLocation.target : undefined))
      : undefined;
  const nearby =
    sceneLocation === null ? [] : nearbySceneObjects(sceneLocation.manifest, sceneLocation.target);
  const checklist = visualReviewChecklist(props.asset.assetType);
  const nextAction = scenePreviewNextAction(props.version);
  const depthRelationship =
    sceneLocation === null || displayedConfiguration === null
      ? null
      : previewDepthRelationship({
          target: sceneLocation.target,
          player,
          configuration: displayedConfiguration,
        });

  function placePlayer(position: 'front' | 'behind' | 'beside'): void {
    if (playerPositions === null) return;
    setWalking(false);
    setPlayer(playerPositions[position]);
    setAnnouncement(`Reference player placed ${position} the asset. Position is preview only.`);
  }

  function resetPlayer(): void {
    setWalking(false);
    setWalkIndex(0);
    setPathResult('not-run');
    if (playerPositions !== null) setPlayer(playerPositions.front);
    setAnnouncement('Reference player and walking path reset. No position was saved.');
  }

  function beginWalk(): void {
    if (reducedMotion) {
      setAnnouncement('Automatic walking is disabled by reduced-motion preference.');
      return;
    }
    if (walkPath.length === 0) return;
    setPlayer(walkPath[0] ?? player);
    setWalkIndex(1);
    setPathResult('not-run');
    setWalking(true);
    setAnnouncement('Bounded preview walking path started. It will reset without persistence.');
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    pointerRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previousX: event.clientX,
      previousY: event.clientY,
      dragged: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A cancelled pointer simply leaves the camera unchanged.
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>): void {
    const pointer = pointerRef.current;
    if (pointer === null || pointer.id !== event.pointerId) return;
    const total = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
    if (total < 6 && !pointer.dragged) return;
    pointer.dragged = true;
    const dx = pointer.previousX - event.clientX;
    const dy = pointer.previousY - event.clientY;
    pointer.previousX = event.clientX;
    pointer.previousY = event.clientY;
    setPan((current) => ({ x: current.x + dx / zoom, y: current.y + dy / zoom }));
  }

  function finishPointer(event: PointerEvent<HTMLDivElement>): void {
    const pointer = pointerRef.current;
    if (pointer === null || pointer.id !== event.pointerId) return;
    if (pointer.dragged) {
      suppressSelectionRef.current = true;
      window.setTimeout(() => {
        suppressSelectionRef.current = false;
      }, 0);
    }
    pointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Lost capture is already equivalent to ending this preview-only gesture.
    }
  }

  function selectCanvasItem(next: WorldEditorSelection): void {
    if (suppressSelectionRef.current) return;
    setSelection(next);
    setAnnouncement(`Selected ${next.layer.slice(0, -1)} ${next.id} for read-only inspection.`);
  }

  function renderScenePanel(input: {
    readonly panelPresentation: Presentation;
    readonly manifest: AdminWorldManifest;
    readonly override: AssetSceneRenderOverride;
    readonly label: string;
  }) {
    const cameraCenter =
      followPlayer || sceneLocation === null
        ? player
        : { x: sceneLocation.target.x, y: sceneLocation.target.y };
    return (
      <article className="asset-scene-panel" aria-label={input.label}>
        <header>
          <strong>{input.label}</strong>
          <span>
            Version {input.override.version.versionNumber} ·{' '}
            {input.panelPresentation === 'candidate' ? 'Not Active' : 'Current Active'}
          </span>
        </header>
        <div
          aria-label={`${input.label} in ${context?.manifest.name ?? 'selected world'}; use the adjacent object list for a text alternative`}
          className="asset-scene-stage"
          onPointerCancel={finishPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
        >
          <WorldManifestCanvas
            activeLayer="objects"
            emphasisObjectIds={sceneLocation === null ? [] : [sceneLocation.target.id]}
            manifest={input.manifest}
            onAssetMediaError={() =>
              setAnnouncement(
                `${input.label} derivative could not be decoded. A safe marker fallback is shown.`,
              )
            }
            onSelect={selectCanvasItem}
            {...(showPlayer ? { playerPosition: player } : {})}
            renderMode="mixed"
            sceneCamera={{ center: cameraCenter, zoom, panX: pan.x, panY: pan.y }}
            scenePreviewOverride={input.override}
            {...(selection === undefined ? {} : { selection })}
            showCollisions={showCollision}
            showExits={showExits}
            showGrid={showGrid}
            showInteractions
            showSceneAnchors={showAnchors}
            showSpawns={showSpawns}
            zoom={zoom}
          />
        </div>
      </article>
    );
  }

  if (props.worldDirectory.status !== 'loaded' || props.worldDirectory.items.length === 0) {
    return (
      <section className="asset-scene-preview" aria-labelledby="asset-scene-preview-title">
        <h2 id="asset-scene-preview-title">In-Game Scene Preview unavailable</h2>
        <div className="empty-state" role="alert">
          <p>{props.worldDirectory.message}</p>
          <p>No cached world, private map data, or synthetic production state is shown.</p>
          <button
            className="button button--secondary"
            onClick={props.onReturnToTechnical}
            type="button"
          >
            Return to Technical Preview
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="asset-scene-preview" aria-labelledby="asset-scene-preview-title">
      <header className="asset-scene-preview__heading">
        <div>
          <p className="eyebrow">Real map context · simulation only</p>
          <h2 id="asset-scene-preview-title">
            {props.mode === 'compare' ? 'Compare Versions' : 'In-Game Scene Preview'}
          </h2>
          <p>
            Reuses the structured Starville map, isometric projection, foot-depth ordering, and
            collision movement model. Temporary controls cannot save asset or world state.
          </p>
        </div>
        <span className="control-category control-category--preview">Read-only preview</span>
      </header>

      <aside className="asset-scene-safety" aria-label="Preview-only safety boundary" role="note">
        <strong>Preview only</strong>
        <p>No world data will be changed.</p>
        {props.version.id === props.activeVersion?.id ? (
          <p>This view does not modify world placement or publication.</p>
        ) : (
          <p>
            Candidate Version {props.version.versionNumber} is not active. Published and draft
            references remain unchanged; current active Version{' '}
            {props.activeVersion?.versionNumber ?? 'none'} remains authoritative.
          </p>
        )}
      </aside>

      <div className="asset-scene-selectors">
        <label>
          World context
          <PremiumSelect
            aria-label="Read-only world context"
            onChange={(value) => {
              setSelectedWorldValue(value);
              setContext(null);
              setLocationId('');
            }}
            options={props.worldDirectory.items.map((option) => ({
              value: optionValue(option),
              label: optionLabel(option),
            }))}
            value={selectedWorldValue}
          />
        </label>
        <label>
          Compatible test location
          <PremiumSelect
            aria-label="Compatible preview target"
            disabled={context === null || (compatibleTargets.length === 0 && testPad === null)}
            onChange={(value) => {
              setLocationId(value);
              setWalking(false);
              setPan({ x: 0, y: 0 });
              setZoom(1.25);
            }}
            options={[
              ...compatibleTargets.map((object) => ({
                value: object.id,
                label: `${targetLabel(object)} · ${object.kind.replaceAll('_', ' ')} · ${object.assetId}`,
              })),
              ...(testPad === null
                ? []
                : [
                    {
                      value: '__test_pad__',
                      label: 'Dedicated preview test pad · temporary',
                    },
                  ]),
            ]}
            value={locationId}
          />
        </label>
        <label>
          Framing
          <PremiumSelect
            aria-label="Scene preview framing"
            onChange={(value) => setViewport(value as ViewportFrame)}
            options={[
              { value: 'mobile', label: 'Mobile viewport' },
              { value: 'tablet', label: 'Tablet viewport' },
              { value: 'desktop', label: 'Desktop viewport' },
            ]}
            value={viewport}
          />
        </label>
      </div>

      <div aria-live="polite" className="asset-scene-load-status" role="status">
        <strong>{loadState === 'loading' ? 'Loading scene' : 'Scene status'}</strong>
        <span>{loadMessage}</span>
      </div>

      {context === null || sceneLocation === null ? (
        <div className="empty-state" role={loadState === 'error' ? 'alert' : 'status'}>
          <p>
            {loadState === 'loading'
              ? 'Loading only the selected authorized map context…'
              : loadMessage}
          </p>
          {loadState === 'error' ? (
            <button
              className="button button--secondary"
              onClick={() => {
                const retry = selectedWorld;
                if (retry === undefined) return;
                setSelectedWorldValue('');
                window.setTimeout(() => setSelectedWorldValue(optionValue(retry)), 0);
              }}
              type="button"
            >
              Retry selected world
            </button>
          ) : null}
        </div>
      ) : candidateOverride === null || candidateManifest === null ? (
        <div className="empty-state" role="alert">
          <p>This asset type has no compatible structured world-object target in this renderer.</p>
          <button
            className="button button--secondary"
            onClick={props.onReturnToTechnical}
            type="button"
          >
            Return to Technical Preview
          </button>
        </div>
      ) : (
        <>
          <section className="asset-scene-context" aria-label="Selected read-only scene context">
            <dl className="detail-list">
              <div>
                <dt>World</dt>
                <dd>{context.map.displayName}</dd>
              </div>
              <div>
                <dt>World key</dt>
                <dd>{context.map.slug}</dd>
              </div>
              <div>
                <dt>Snapshot</dt>
                <dd>{context.source === 'draft' ? 'Validated draft' : 'Published'}</dd>
              </div>
              <div>
                <dt>Dimensions</dt>
                <dd>
                  {context.manifest.width} × {context.manifest.height} tiles
                </dd>
              </div>
              <div>
                <dt>Objects</dt>
                <dd>{context.manifest.objects.length}</dd>
              </div>
              <div>
                <dt>Map revision</dt>
                <dd>{context.map.recordVersion}</dd>
              </div>
              <div>
                <dt>World version</dt>
                <dd>
                  V{context.version.versionNumber} · {humanize(context.version.lifecycleStatus)}
                </dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>
                  {targetLabel(sceneLocation.target)} · X {sceneLocation.target.x}, Y{' '}
                  {sceneLocation.target.y}
                </dd>
              </div>
            </dl>
            {locationId === '__test_pad__' ? (
              <p className="asset-scene-temporary-label">
                Preview position only · Not saved · Reset on exit
              </p>
            ) : null}
          </section>

          <div className="asset-scene-toolbar" data-scene-control="true">
            {props.mode === 'scene' ? (
              <>
                <button
                  aria-pressed={presentation === 'active'}
                  className="button button--quiet"
                  disabled={activeOverride === null}
                  onClick={() => setPresentation('active')}
                  type="button"
                >
                  Show Active
                </button>
                <button
                  aria-pressed={presentation === 'candidate'}
                  className="button button--quiet"
                  onClick={() => setPresentation('candidate')}
                  type="button"
                >
                  Show Candidate
                </button>
                <button
                  className="button button--quiet"
                  disabled={activeOverride === null}
                  onClick={() =>
                    setPresentation((value) => (value === 'active' ? 'candidate' : 'active'))
                  }
                  type="button"
                >
                  A/B Toggle
                </button>
              </>
            ) : null}
            {[
              ['Grid', showGrid, setShowGrid],
              ['Collision', showCollision, setShowCollision],
              ['Depth anchors', showAnchors, setShowAnchors],
              ['Spawns', showSpawns, setShowSpawns],
              ['Exits', showExits, setShowExits],
              ['Player', showPlayer, setShowPlayer],
            ].map(([label, state, setter]) => (
              <button
                aria-pressed={Boolean(state)}
                className="button button--quiet"
                key={String(label)}
                onClick={() => (setter as (value: boolean) => void)(!state)}
                type="button"
              >
                {String(label)}
              </button>
            ))}
          </div>

          <div className="asset-scene-camera-controls" data-scene-control="true">
            <button
              aria-label="Zoom scene in"
              className="button button--quiet"
              onClick={() => setZoom((value) => Math.min(2, value + 0.15))}
              type="button"
            >
              +
            </button>
            <button
              aria-label="Zoom scene out"
              className="button button--quiet"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.15))}
              type="button"
            >
              −
            </button>
            <button
              className="button button--quiet"
              onClick={() => {
                setZoom(1.25);
                setPan({ x: 0, y: 0 });
                setFollowPlayer(false);
              }}
              type="button"
            >
              Fit selected asset
            </button>
            <button
              className="button button--quiet"
              onClick={() => {
                setZoom(0.55);
                setPan({ x: 0, y: 0 });
                setFollowPlayer(false);
              }}
              type="button"
            >
              Fit local scene
            </button>
            <button
              aria-pressed={followPlayer}
              className="button button--quiet"
              onClick={() => setFollowPlayer((value) => !value)}
              type="button"
            >
              Follow player
            </button>
            <button
              className="button button--quiet"
              onClick={() => {
                setZoom(1.25);
                setPan({ x: 0, y: 0 });
                setFollowPlayer(false);
              }}
              type="button"
            >
              Reset camera
            </button>
            <span aria-live="polite">{Math.round(zoom * 100)}% · drag map to pan</span>
          </div>

          <div className={`asset-scene-frame asset-scene-frame--${viewport}`}>
            {props.mode === 'compare' ? (
              <div className="asset-scene-comparison-stage">
                {activeManifest === null || activeOverride === null ? (
                  <article className="asset-scene-panel empty-state" role="status">
                    <strong>Current Active unavailable</strong>
                    <p>
                      No active-version pointer is available. Candidate state remains unchanged.
                    </p>
                  </article>
                ) : (
                  renderScenePanel({
                    panelPresentation: 'active',
                    manifest: activeManifest,
                    override: activeOverride,
                    label: 'Current Active',
                  })
                )}
                {renderScenePanel({
                  panelPresentation: 'candidate',
                  manifest: candidateManifest,
                  override: candidateOverride,
                  label: 'Candidate',
                })}
              </div>
            ) : displayedManifest === null || displayedOverride === null ? (
              <div className="empty-state" role="status">
                <p>The selected active derivative is unavailable. Use Show Candidate.</p>
              </div>
            ) : (
              renderScenePanel({
                panelPresentation: presentation,
                manifest: displayedManifest,
                override: displayedOverride,
                label: presentation === 'active' ? 'Current Active' : 'Candidate',
              })
            )}
          </div>

          <div className="asset-scene-player-controls" data-scene-control="true">
            <h3>Reference player simulation</h3>
            <div>
              <button
                className="button button--quiet"
                onClick={() => setShowPlayer(true)}
                type="button"
              >
                Show player
              </button>
              <button
                className="button button--quiet"
                onClick={() => {
                  setShowPlayer(false);
                  setWalking(false);
                }}
                type="button"
              >
                Hide player
              </button>
              <button
                className="button button--quiet"
                onClick={() => placePlayer('front')}
                type="button"
              >
                Place in front
              </button>
              <button
                className="button button--quiet"
                onClick={() => placePlayer('behind')}
                type="button"
              >
                Place behind
              </button>
              <button
                className="button button--quiet"
                onClick={() => placePlayer('beside')}
                type="button"
              >
                Place beside
              </button>
              <button
                className="button button--quiet"
                disabled={reducedMotion || walking}
                onClick={beginWalk}
                type="button"
              >
                Play walking path
              </button>
              <button
                className="button button--quiet"
                disabled={!walking}
                onClick={() => {
                  setWalking(false);
                  setAnnouncement('Walking path paused at its preview-only position.');
                }}
                type="button"
              >
                Pause walking path
              </button>
              <button className="button button--quiet" onClick={resetPlayer} type="button">
                Reset player and path
              </button>
            </div>
            <p>
              Reference player ·{' '}
              {depthRelationship === null
                ? 'No depth result'
                : `renders ${depthRelationship} the asset`}{' '}
              · path {pathResult === 'not-run' ? 'not attempted' : pathResult}
              {reducedMotion ? ' · automatic walking disabled by reduced-motion preference' : ''}
            </p>
            <p aria-live="polite" role="status">
              {announcement}
            </p>
          </div>

          <div className="asset-scene-inspection-layout">
            <aside className="asset-scene-object-list" aria-labelledby="nearby-objects-title">
              <h3 id="nearby-objects-title">Nearby world objects</h3>
              <p className="field-hint">
                Keyboard-accessible text alternative to canvas selection.
              </p>
              <ul>
                <li>
                  <button
                    aria-pressed={selection?.id === sceneLocation.target.id}
                    onClick={() => setSelection({ layer: 'objects', id: sceneLocation.target.id })}
                    type="button"
                  >
                    {targetLabel(sceneLocation.target)} · preview target
                  </button>
                </li>
                {nearby.map((object) => (
                  <li key={object.id}>
                    <button
                      aria-pressed={selection?.id === object.id}
                      onClick={() => setSelection({ layer: 'objects', id: object.id })}
                      type="button"
                    >
                      {targetLabel(object)} · {object.kind.replaceAll('_', ' ')}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <aside
              className="asset-scene-object-inspector"
              aria-labelledby="object-inspector-title"
            >
              <h3 id="object-inspector-title">Object inspector</h3>
              {selectedObject === undefined ? (
                <p>Select an object from the map or adjacent list.</p>
              ) : (
                <dl className="detail-list">
                  <div>
                    <dt>Name</dt>
                    <dd>{targetLabel(selectedObject)}</dd>
                  </div>
                  <div>
                    <dt>Type</dt>
                    <dd>{selectedObject.kind.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt>Asset binding</dt>
                    <dd>{selectedObject.assetId}</dd>
                  </div>
                  <div>
                    <dt>Rendered version</dt>
                    <dd>
                      {selectedObject.id === sceneLocation.target.id && displayedVersion !== null
                        ? `Preview Version ${String(displayedVersion.versionNumber)}`
                        : 'World snapshot marker or pinned presentation'}
                    </dd>
                  </div>
                  <div>
                    <dt>Position</dt>
                    <dd>
                      X {selectedObject.x} · Y {selectedObject.y}
                    </dd>
                  </div>
                  <div>
                    <dt>Scale</dt>
                    <dd>{selectedObject.scale}</dd>
                  </div>
                  <div>
                    <dt>Collision</dt>
                    <dd>
                      {selectedObject.id === sceneLocation.target.id &&
                      displayedConfiguration !== null
                        ? collisionSummary(displayedConfiguration)
                        : 'World snapshot collision'}
                    </dd>
                  </div>
                  <div>
                    <dt>Depth layer</dt>
                    <dd>Foot-position sorting</dd>
                  </div>
                </dl>
              )}
            </aside>
          </div>

          <section className="asset-scene-comparison" aria-labelledby="scene-comparison-title">
            <h3 id="scene-comparison-title">Current Active vs Candidate</h3>
            <div className="data-table-region" role="region" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Evidence</th>
                    <th scope="col">Current Active</th>
                    <th scope="col">Candidate</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    [
                      'Version',
                      props.activeVersion?.versionNumber ?? 'None',
                      props.version.versionNumber,
                    ],
                    [
                      'Lifecycle',
                      props.activeVersion?.lifecycleStatus ?? 'None',
                      props.version.lifecycleStatus,
                    ],
                    [
                      'Active',
                      props.activeVersion === null ? 'No active pointer' : 'Yes',
                      props.version.id === props.activeVersion?.id ? 'Yes' : 'No',
                    ],
                    [
                      'Artwork',
                      props.activeVersion === null
                        ? 'Unavailable'
                        : assetArtworkLabel(props.activeVersion),
                      assetArtworkLabel(props.version),
                    ],
                    [
                      'Source',
                      props.activeVersion?.detectedMediaType ??
                        props.activeVersion?.processingStatus ??
                        'Unavailable',
                      props.version.detectedMediaType ?? props.version.processingStatus,
                    ],
                    [
                      'Dimensions',
                      props.activeVersion === null
                        ? 'Unavailable'
                        : versionDimensions(props.activeVersion),
                      versionDimensions(props.version),
                    ],
                    [
                      'Scale',
                      activeConfiguration?.render.scale ?? 'Unavailable',
                      candidateConfiguration.render.scale,
                    ],
                    [
                      'Foot anchor',
                      activeConfiguration === null
                        ? 'Unavailable'
                        : `${activeConfiguration.render.footAnchor.x}, ${activeConfiguration.render.footAnchor.y}`,
                      `${candidateConfiguration.render.footAnchor.x}, ${candidateConfiguration.render.footAnchor.y}`,
                    ],
                    [
                      'Depth anchor',
                      activeConfiguration === null
                        ? 'Unavailable'
                        : `${activeConfiguration.render.depthAnchor.x}, ${activeConfiguration.render.depthAnchor.y}`,
                      `${candidateConfiguration.render.depthAnchor.x}, ${candidateConfiguration.render.depthAnchor.y}`,
                    ],
                    [
                      'Collision',
                      activeConfiguration === null
                        ? 'Unavailable'
                        : collisionSummary(activeConfiguration),
                      collisionSummary(candidateConfiguration),
                    ],
                    [
                      'Validation',
                      props.activeVersion?.validationStatus ?? 'Unavailable',
                      props.version.validationStatus,
                    ],
                    [
                      'Render status',
                      props.activeVersion === null
                        ? 'Unavailable'
                        : props.activeVersion.processingStatus,
                      props.version.processingStatus,
                    ],
                  ].map(([label, active, candidate]) => (
                    <tr key={String(label)}>
                      <th scope="row">{label}</th>
                      <td>{String(active)}</td>
                      <td>{String(candidate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="asset-scene-review-grid">
            <fieldset className="asset-scene-checklist">
              <legend>Visual review checklist</legend>
              <p>Local preview state only · cleared on exit · never approves a version.</p>
              {checklist.map((item) => (
                <label key={item}>
                  <input
                    checked={checkedItems.has(item)}
                    onChange={(event) =>
                      setCheckedItems((current) => {
                        const next = new Set(current);
                        if (event.currentTarget.checked) next.add(item);
                        else next.delete(item);
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  {item}
                </label>
              ))}
            </fieldset>
            <label className="asset-scene-notes">
              Preview notes
              <textarea
                maxLength={1_000}
                onChange={(event) => setNotes(event.currentTarget.value)}
                placeholder="Temporary observation, for example: Tree feels too small beside the cottage."
                rows={8}
                value={notes}
              />
              <small>
                {String(1_000 - notes.length)} characters remaining · local only · not a review
                decision reason
              </small>
            </label>
          </div>

          <section className="asset-scene-guidance" aria-labelledby="scene-guidance-title">
            <h3 id="scene-guidance-title">Simulation evidence and next safe action</h3>
            <ul>
              <li>Scale guidance: {previewScaleGuidance(candidateConfiguration)}</li>
              <li>
                Candidate collision:{' '}
                {candidateCollisionAtTarget(candidateConfiguration, sceneLocation.target) === null
                  ? 'no blocking profile'
                  : collisionSummary(candidateConfiguration)}
              </li>
              <li>World snapshot and object placement remain unchanged.</li>
              <li>Published references and current active-version pointer remain unchanged.</li>
            </ul>
            <strong>{nextAction.label}</strong>
            <p>{nextAction.explanation}</p>
            <div className="asset-scene-next-actions">
              {props.version.lifecycleStatus === 'active' ? (
                <Link
                  className="button button--primary"
                  href={`/worlds?assetKey=${encodeURIComponent(props.asset.slug)}`}
                >
                  Open world draft placement
                </Link>
              ) : (
                <a className="button button--primary" href="#asset-lifecycle-actions-title">
                  {nextAction.label}
                </a>
              )}
              <button
                className="button button--secondary"
                onClick={props.onReturnToTechnical}
                type="button"
              >
                Return to Technical Preview
              </button>
            </div>
            <p className="field-hint">
              Entering World Editor is a separate authorized draft-editing workflow. It may modify a
              draft only after an explicit save; publication remains separate.
            </p>
          </section>
        </>
      )}
    </section>
  );
}
