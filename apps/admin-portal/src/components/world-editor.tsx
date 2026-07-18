'use client';

import {
  ASSET_CATEGORIES,
  ASSET_INTERACTION_COMPATIBILITIES,
  type AssetCategory,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';
import { mapObjectKinds } from '@starville/game-core';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

import {
  saveWorldDraftAction,
  validateWorldDraftAction,
  type WorldActionState,
} from '../app/actions/worlds';
import type {
  AdminWorldManifest,
  WorldDraftAssetPin,
  WorldDraftLoad,
  WorldValidationResult,
} from '../lib/worlds/contracts';
import type { WorldGameTestStatus } from '../lib/worlds/game-test-api';
import type { WorldEditorAssetCandidate } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import {
  resolveWorldObjectRendering,
  WORLD_OBJECT_RENDER_MODES,
  type WorldObjectRenderMode,
} from '../lib/worlds/asset-rendering';
import {
  objectInteractionRequirements,
  objectKindAssetType,
} from '../lib/worlds/asset-replacement';
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
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  CANVAS_ZOOM_STEP,
  clampCanvasPan,
  clampCanvasZoom,
  computeFitCanvasView,
  draftPreviewAvailability,
  isWorldEditorGuideCompleted,
  readLocalBoolean,
  WORLD_EDITOR_STORAGE_KEYS,
  writeLocalBoolean,
  zoomPercentage,
} from '../lib/worlds/editor-usability';
import {
  beginCanvasPointerGesture,
  finishCanvasPointerGesture,
  moveCanvasPointerGesture,
  type CanvasPointerGesture,
} from '../lib/worlds/pointer-gesture';
import { EditorScrollRegion } from './editor-scroll-region';
import { PremiumSelect } from './premium-select';
import { WorldEditorGuide } from './world-editor-guide';
import { WorldAssetReplacementDialog } from './world-asset-replacement-dialog';
import { WorldManifestCanvas } from './world-manifest-canvas';
import { WorldGameTestLauncher } from './world-game-test-launcher';

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
type AssetCategoryFilter = 'all' | AssetCategory;
type AssetInteractionFilter = 'all' | AssetInteractionCompatibility;
type AssetProductionFilter = 'approved' | 'development' | 'all';
type MobilePanel = 'none' | 'assets' | 'inspector';

interface WorldEditorProps {
  readonly draft: WorldDraftLoad;
  readonly approvedAssets: readonly WorldEditorAssetCandidate[];
  readonly initialAssetKey: string | null;
  readonly canOpenGameTest: boolean;
  readonly assuranceLevel: 'aal1' | 'aal2';
  readonly gameTestEnvironment: string;
  readonly gameTestReopenUrl: string;
  readonly initialGameTestStatus: WorldGameTestStatus | null;
  readonly returnedGameTestSessionId: string | null;
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

function safelyCapturePointer(node: HTMLElement, pointerId: number): void {
  if (node.hasPointerCapture(pointerId)) return;
  try {
    node.setPointerCapture(pointerId);
  } catch {
    // The pointer may already have been cancelled by the browser or operating system.
  }
}

function safelyReleasePointer(node: HTMLElement, pointerId: number): void {
  if (!node.hasPointerCapture(pointerId)) return;
  try {
    node.releasePointerCapture(pointerId);
  } catch {
    // Lost capture is handled by the same safe gesture reset path.
  }
}

function humanizeKey(value: string): string {
  return value
    .replace(/^phase7[-_]/iu, '')
    .replace(/[-_]+marker$/iu, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (char) => char.toUpperCase())
    .trim();
}

function isDevelopmentAsset(asset: WorldEditorAssetCandidate): boolean {
  return asset.asset.productionStatus === 'development_marker';
}

function assetCollisionSummary(
  source: WorldEditorAssetCandidate | WorldDraftAssetPin | null,
): string {
  if (source === null) return 'No managed profile available';
  const collision =
    'pinnedVersion' in source ? source.pinnedVersion.collision : source.activeVersion.collision;
  if (collision.shape === 'none') return 'No managed blocking footprint';
  if (collision.shape === 'rectangle') {
    return `${collision.blocking ? 'Blocking' : 'Non-blocking'} rectangle · ${collision.width.toFixed(2)} × ${collision.height.toFixed(2)}`;
  }
  return `${collision.blocking ? 'Blocking' : 'Non-blocking'} capsule · radius ${collision.radius.toFixed(2)}`;
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
      <span className="editor-field__label">{label}</span>
      {children}
      {hint === undefined ? null : <small className="editor-field__hint">{hint}</small>}
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
        className="editor-input"
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

function renderModeLabel(mode: WorldObjectRenderMode): string {
  if (mode === 'collision') return 'Collision Debug';
  return mode.slice(0, 1).toUpperCase() + mode.slice(1);
}

function appendBaseFields(
  formData: FormData,
  props: WorldEditorProps,
  versionId: string,
  editVersion: number,
  checksum: string | null,
  id: string,
): void {
  formData.set('mapId', props.draft.map.id);
  formData.set('versionId', versionId);
  formData.set('requestId', id);
  formData.set('expectedEditVersion', String(editVersion));
  formData.set('expectedChecksum', checksum ?? '');
}

function ToggleChip(props: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
  readonly disabled?: boolean;
  readonly title?: string;
}) {
  return (
    <button
      aria-pressed={props.pressed}
      className={`world-editor-toggle ${props.pressed ? 'is-active' : ''}`}
      disabled={props.disabled}
      onClick={props.onToggle}
      title={props.title}
      type="button"
    >
      {props.label}
    </button>
  );
}

function InspectorSection({
  title,
  defaultOpen = true,
  children,
}: {
  readonly title: string;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary className="inspector-section__summary">{title}</summary>
      <div className="inspector-section__body">{children}</div>
    </details>
  );
}

export function WorldEditor(props: WorldEditorProps) {
  const router = useRouter();
  const initialAssetCandidate = props.approvedAssets.find(
    ({ assetKey }) => assetKey === props.initialAssetKey,
  );
  const [history, setHistory] = useState(() => createWorldEditorHistory(props.draft.manifest));
  const [lastSaved, setLastSaved] = useState(props.draft.manifest);
  const [selection, setSelection] = useState<WorldEditorSelection>();
  const [layer, setLayer] = useState<WorldEditorLayer>('objects');
  const [showGrid, setShowGrid] = useState(true);
  const [showCollisions, setShowCollisions] = useState(true);
  const [showSpawns, setShowSpawns] = useState(true);
  const [showExits, setShowExits] = useState(true);
  const [renderMode, setRenderMode] = useState<WorldObjectRenderMode>('mixed');
  const [failedAssetVersionIds, setFailedAssetVersionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [assetKey, setAssetKey] = useState(
    initialAssetCandidate !== undefined
      ? initialAssetCandidate.assetKey
      : (props.approvedAssets.find(({ asset }) => asset.assetType === 'building')?.assetKey ?? ''),
  );
  const [objectKind, setObjectKind] = useState<MapObject['kind']>(() =>
    initialAssetCandidate === undefined
      ? 'building'
      : (mapObjectKinds.find(
          (kind) => objectKindAssetType(kind) === initialAssetCandidate.asset.assetType,
        ) ?? 'building'),
  );
  const [assetSearch, setAssetSearch] = useState('');
  const [assetCategory, setAssetCategory] = useState<AssetCategoryFilter>('all');
  const [assetInteraction, setAssetInteraction] = useState<AssetInteractionFilter>('all');
  const [assetProduction, setAssetProduction] = useState<AssetProductionFilter>('approved');
  const [placementPreview, setPlacementPreview] = useState<Readonly<{
    x: number;
    y: number;
  }> | null>(null);
  const showDevelopmentAssets = assetProduction !== 'approved';
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1.45);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [moveToolActive, setMoveToolActive] = useState(false);
  const [canvasHelpOpen, setCanvasHelpOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const [objectListSearch, setObjectListSearch] = useState('');
  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const panSession = useRef<CanvasPointerGesture | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasTransformRef = useRef<HTMLDivElement>(null);
  const canvasZoomRef = useRef(canvasZoom);
  const canvasPanRef = useRef(canvasPan);
  const spaceHeldRef = useRef(false);
  const panFrameRef = useRef(0);
  /** Suppress the click-select that follows a completed pan gesture. */
  const suppressNextSelectRef = useRef(false);
  const suppressSelectTimerRef = useRef(0);
  /** When true, layout changes do not auto-refit the map. */
  const userAdjustedView = useRef(false);
  const lastSuccessfulValidation = useRef(false);

  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
  }, [canvasZoom]);

  useEffect(() => {
    canvasPanRef.current = canvasPan;
    const node = canvasTransformRef.current;
    if (node !== null) {
      node.style.transform = `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoomRef.current})`;
    }
  }, [canvasPan]);
  const [editVersion, setEditVersion] = useState(props.draft.version.editVersion);
  const [currentVersionId, setCurrentVersionId] = useState(props.draft.version.id);
  const [currentVersionNumber, setCurrentVersionNumber] = useState(
    props.draft.version.versionNumber,
  );
  const [revisionLifecycle, setRevisionLifecycle] = useState(props.draft.version.lifecycleStatus);
  const [checksum, setChecksum] = useState(props.draft.version.checksum);
  const [saveId, setSaveId] = useState(props.saveRequestId);
  const [validationId, setValidationId] = useState(props.validationRequestId);
  const [actionState, setActionState] = useState<WorldActionState>(INITIAL_ACTION_STATE);
  const [serverValidation, setServerValidation] = useState<WorldValidationResult | null>(
    props.draft.version.validationResult,
  );
  /** Checksum of the saved revision that last passed trusted validation (enables Draft Preview). */
  const [validatedChecksum, setValidatedChecksum] = useState<string | null>(() => {
    const initial = props.draft.version;
    if (
      initial.lifecycleStatus === 'validated' &&
      initial.validationResult?.valid === true &&
      initial.checksum
    ) {
      return initial.checksum;
    }
    return null;
  });
  const [operation, setOperation] = useState<'save' | 'validate'>('save');
  const [pending, startTransition] = useTransition();
  const manifest = history.present;
  const editableDraft = revisionLifecycle === 'draft';
  const issues = useMemo(() => browserManifestIssues(manifest), [manifest]);
  const dirty = manifestHasUnsavedChanges(manifest, lastSaved);
  const localChangeSummary = useMemo(() => {
    const before = new Map(lastSaved.objects.map((object) => [object.id, object]));
    const after = new Map(manifest.objects.map((object) => [object.id, object]));
    let moved = 0;
    let modified = 0;
    for (const [id, object] of after) {
      const previous = before.get(id);
      if (previous === undefined) continue;
      if (previous.x !== object.x || previous.y !== object.y) moved += 1;
      if (JSON.stringify(previous) !== JSON.stringify(object)) modified += 1;
    }
    return {
      added: [...after.keys()].filter((id) => !before.has(id)).length,
      removed: [...before.keys()].filter((id) => !after.has(id)).length,
      moved,
      modified,
      collisionsChanged:
        JSON.stringify(lastSaved.collisions) !== JSON.stringify(manifest.collisions),
      exitsChanged: JSON.stringify(lastSaved.exits) !== JSON.stringify(manifest.exits),
      terrainChanged: JSON.stringify(lastSaved.terrain) !== JSON.stringify(manifest.terrain),
    };
  }, [lastSaved, manifest]);
  const preview = draftPreviewAvailability({
    dirty,
    pending,
    localIssueCount: issues.length,
    serverValidation,
    validatedChecksum,
    currentChecksum: checksum,
  });

  const approvedAssets = useMemo(
    () =>
      props.approvedAssets.filter(
        ({ asset, activeVersion, versionId }) =>
          asset.lifecycleStatus === 'active' &&
          activeVersion.lifecycleStatus === 'active' &&
          asset.activeVersionId === versionId,
      ),
    [props.approvedAssets],
  );

  const placementPreviewObject = useMemo<MapObject | undefined>(() => {
    if (placementPreview === null || !editableDraft) return undefined;
    const candidate = approvedAssets.find(
      (asset) =>
        asset.assetKey === assetKey &&
        asset.asset.assetType === objectKindAssetType(objectKind) &&
        (!isDevelopmentAsset(asset) || showDevelopmentAssets),
    );
    if (candidate === undefined) return undefined;
    return {
      id: nextEditorIdentifier(manifest, 'placement-preview'),
      assetId: candidate.assetKey,
      kind: objectKind,
      x: placementPreview.x,
      y: placementPreview.y,
      scale: 1,
      rotation: candidate.activeVersion.render.defaultRotation,
    };
  }, [
    approvedAssets,
    assetKey,
    editableDraft,
    manifest,
    objectKind,
    placementPreview,
    showDevelopmentAssets,
  ]);
  const canvasManifest = useMemo<AdminWorldManifest>(() => {
    if (placementPreviewObject === undefined) return manifest;
    return {
      ...manifest,
      assets: manifest.assets.includes(placementPreviewObject.assetId)
        ? manifest.assets
        : [...manifest.assets, placementPreviewObject.assetId],
      objects: [...manifest.objects, placementPreviewObject],
    };
  }, [manifest, placementPreviewObject]);

  const filteredAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    return approvedAssets.filter((asset) => {
      const development = isDevelopmentAsset(asset);
      if (assetProduction === 'approved' && development) return false;
      if (assetProduction === 'development' && !development) return false;
      if (asset.asset.assetType !== objectKindAssetType(objectKind)) return false;
      const category = asset.asset.category;
      if (assetCategory !== 'all' && category !== assetCategory) return false;
      if (assetInteraction !== 'all' && !asset.supportedInteractions.includes(assetInteraction)) {
        return false;
      }
      if (query === '') return true;
      const haystack =
        `${asset.assetKey} ${asset.asset.friendlyName} ${asset.asset.assetType} ${asset.asset.category}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [approvedAssets, assetCategory, assetInteraction, assetProduction, assetSearch, objectKind]);

  const setLayersCollapsedPersist = useCallback((value: boolean) => {
    setLayersCollapsed(value);
    writeLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.layersCollapsed, value);
    userAdjustedView.current = false;
  }, []);

  const setInspectorCollapsedPersist = useCallback((value: boolean) => {
    setInspectorCollapsed(value);
    writeLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.inspectorCollapsed, value);
    userAdjustedView.current = false;
  }, []);

  const setValidationExpandedPersist = useCallback((value: boolean) => {
    setValidationExpanded(value);
    writeLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.validationExpanded, value);
    userAdjustedView.current = false;
  }, []);

  useEffect(() => {
    setLayersCollapsed(readLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.layersCollapsed, false));
    setInspectorCollapsed(readLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.inspectorCollapsed, false));
    setValidationExpanded(readLocalBoolean(WORLD_EDITOR_STORAGE_KEYS.validationExpanded, false));
    // First-time users see the guide automatically; the button remains available forever.
    if (!isWorldEditorGuideCompleted()) setGuideOpen(true);
  }, []);

  const applyFitCanvas = useCallback(
    (options?: { readonly force?: boolean }) => {
      const host = canvasHostRef.current;
      if (host === null) return;
      if (userAdjustedView.current && options?.force !== true) return;
      // Use layout box (client*) so clipped overflow min-heights cannot inflate the fit target.
      const hostWidth = host.clientWidth;
      const hostHeight = host.clientHeight;
      if (hostWidth < 80 || hostHeight < 80) return;
      const fitted = computeFitCanvasView({
        hostWidth,
        hostHeight,
        mapWidth: manifest.width,
        mapHeight: manifest.height,
      });
      canvasZoomRef.current = fitted.zoom;
      canvasPanRef.current = { x: fitted.panX, y: fitted.panY };
      setCanvasZoom(fitted.zoom);
      setCanvasPan({ x: fitted.panX, y: fitted.panY });
    },
    [manifest.width, manifest.height],
  );

  const commitPan = useCallback(
    (next: Readonly<{ x: number; y: number }>): void => {
      const host = canvasHostRef.current;
      const clamped =
        host === null
          ? next
          : clampCanvasPan({
              panX: next.x,
              panY: next.y,
              zoom: canvasZoomRef.current,
              hostWidth: host.clientWidth,
              hostHeight: host.clientHeight,
              mapWidth: manifest.width,
              mapHeight: manifest.height,
            });
      canvasPanRef.current = clamped;
      const node = canvasTransformRef.current;
      if (node !== null) {
        node.style.transform = `translate(${clamped.x}px, ${clamped.y}px) scale(${canvasZoomRef.current})`;
      }
      setCanvasPan(clamped);
    },
    [manifest.width, manifest.height],
  );

  const scheduleLivePan = useCallback(
    (next: Readonly<{ x: number; y: number }>): void => {
      const host = canvasHostRef.current;
      const clamped =
        host === null
          ? next
          : clampCanvasPan({
              panX: next.x,
              panY: next.y,
              zoom: canvasZoomRef.current,
              hostWidth: host.clientWidth,
              hostHeight: host.clientHeight,
              mapWidth: manifest.width,
              mapHeight: manifest.height,
            });
      canvasPanRef.current = clamped;
      if (panFrameRef.current !== 0) return;
      panFrameRef.current = window.requestAnimationFrame(() => {
        panFrameRef.current = 0;
        const node = canvasTransformRef.current;
        const pan = canvasPanRef.current;
        if (node !== null) {
          node.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${canvasZoomRef.current})`;
        }
      });
    },
    [manifest.width, manifest.height],
  );

  const scheduleFitCanvas = useCallback(
    (options?: { readonly force?: boolean }) => {
      // Wait two frames so toolbar wrap / dock expand / panel collapse settle first.
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => applyFitCanvas(options));
      });
    },
    [applyFitCanvas],
  );

  useEffect(() => {
    const host = canvasHostRef.current;
    if (host === null) return;
    scheduleFitCanvas({ force: true });
    const observer = new ResizeObserver(() => {
      scheduleFitCanvas();
    });
    observer.observe(host);
    // Dock and page shell also change available canvas height.
    const page = host.closest('.world-editor-page');
    if (page instanceof HTMLElement) observer.observe(page);
    return () => observer.disconnect();
  }, [scheduleFitCanvas, layersCollapsed, inspectorCollapsed, validationExpanded, guideOpen]);

  useEffect(() => {
    const success = serverValidation?.valid === true && issues.length === 0 && !dirty;
    if (success && !lastSuccessfulValidation.current) {
      setValidationExpandedPersist(false);
    }
    lastSuccessfulValidation.current = success;
  }, [serverValidation?.valid, issues.length, dirty, setValidationExpandedPersist]);

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

    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (event.key === 'Escape' && mobilePanel !== 'none') {
          setMobilePanel('none');
        }
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        // Space is reserved for pan-modifier while the canvas is focused.
        if (document.activeElement === canvasHostRef.current) {
          event.preventDefault();
          spaceHeldRef.current = true;
        }
        return;
      }
      if (event.key === 'Escape') {
        if (guideOpen) {
          // Dialog component owns Escape; avoid double-handling.
          return;
        }
        if (canvasHelpOpen) {
          setCanvasHelpOpen(false);
          return;
        }
        if (mobilePanel !== 'none') {
          setMobilePanel('none');
          return;
        }
        return;
      }
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        userAdjustedView.current = true;
        const next = clampCanvasZoom(canvasZoomRef.current + CANVAS_ZOOM_STEP);
        canvasZoomRef.current = next;
        setCanvasZoom(next);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        userAdjustedView.current = true;
        const next = clampCanvasZoom(canvasZoomRef.current - CANVAS_ZOOM_STEP);
        canvasZoomRef.current = next;
        setCanvasZoom(next);
      } else if (event.key === '0') {
        event.preventDefault();
        userAdjustedView.current = false;
        scheduleFitCanvas({ force: true });
      } else if (
        editableDraft &&
        event.altKey &&
        selection?.layer === 'objects' &&
        (event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown')
      ) {
        event.preventDefault();
        const step = event.shiftKey ? 0.5 : 0.125;
        setHistory((current) => {
          const selectedId = selection.id;
          const bounds = current.present.safeSaveBounds;
          const next = {
            ...current.present,
            objects: current.present.objects.map((object) =>
              object.id === selectedId
                ? {
                    ...object,
                    x: Math.min(
                      bounds.maxX,
                      Math.max(
                        bounds.minX,
                        object.x +
                          (event.key === 'ArrowLeft'
                            ? -step
                            : event.key === 'ArrowRight'
                              ? step
                              : 0),
                      ),
                    ),
                    y: Math.min(
                      bounds.maxY,
                      Math.max(
                        bounds.minY,
                        object.y +
                          (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                      ),
                    ),
                  }
                : object,
            ),
          };
          return commitWorldEditorManifest(current, next);
        });
        setActionState(INITIAL_ACTION_STATE);
        setServerValidation(null);
        setValidatedChecksum(null);
      } else if (
        document.activeElement === canvasHostRef.current &&
        (event.key === 'ArrowLeft' ||
          event.key === 'ArrowRight' ||
          event.key === 'ArrowUp' ||
          event.key === 'ArrowDown')
      ) {
        event.preventDefault();
        userAdjustedView.current = true;
        const step = event.shiftKey ? 64 : 28;
        const dx = event.key === 'ArrowLeft' ? step : event.key === 'ArrowRight' ? -step : 0;
        const dy = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
        commitPan({
          x: canvasPanRef.current.x + dx,
          y: canvasPanRef.current.y + dy,
        });
      }
    }

    function onKeyUp(event: KeyboardEvent): void {
      if (event.key === ' ' || event.code === 'Space') {
        spaceHeldRef.current = false;
      }
    }

    window.addEventListener('beforeunload', protectUnload);
    document.addEventListener('click', protectPortalLink);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('beforeunload', protectUnload);
      document.removeEventListener('click', protectPortalLink);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      if (panFrameRef.current !== 0) {
        window.cancelAnimationFrame(panFrameRef.current);
        panFrameRef.current = 0;
      }
      if (suppressSelectTimerRef.current !== 0) {
        window.clearTimeout(suppressSelectTimerRef.current);
        suppressSelectTimerRef.current = 0;
      }
    };
  }, [
    dirty,
    mobilePanel,
    canvasHelpOpen,
    guideOpen,
    scheduleFitCanvas,
    commitPan,
    editableDraft,
    selection,
  ]);

  function commit(next: AdminWorldManifest): void {
    if (!editableDraft) return;
    setHistory((current) => commitWorldEditorManifest(current, next));
    setActionState(INITIAL_ACTION_STATE);
    setServerValidation(null);
    setValidatedChecksum(null);
  }

  const resetCanvasView = useCallback(() => {
    userAdjustedView.current = false;
    scheduleFitCanvas({ force: true });
  }, [scheduleFitCanvas]);

  const fitCanvasMap = useCallback(() => {
    userAdjustedView.current = false;
    scheduleFitCanvas({ force: true });
  }, [scheduleFitCanvas]);

  function suppressGestureClick(): void {
    suppressNextSelectRef.current = true;
    if (suppressSelectTimerRef.current !== 0) {
      window.clearTimeout(suppressSelectTimerRef.current);
    }
    // A synthesized click follows pointerup synchronously. Clear the guard if no click arrives.
    suppressSelectTimerRef.current = window.setTimeout(() => {
      suppressNextSelectRef.current = false;
      suppressSelectTimerRef.current = 0;
    }, 0);
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
    if (!editableDraft) return;
    const candidate = approvedAssets.find(
      (asset) =>
        asset.assetKey === assetKey &&
        asset.asset.assetType === objectKindAssetType(objectKind) &&
        (!isDevelopmentAsset(asset) || showDevelopmentAssets),
    );
    if (candidate === undefined) return;
    const id = nextEditorIdentifier(manifest, objectKind);
    const next: MapObject = {
      id,
      assetId: assetKey,
      kind: objectKind,
      x: placementPreview?.x ?? manifest.width / 2,
      y: placementPreview?.y ?? manifest.height / 2,
      scale: 1,
      rotation: candidate.activeVersion.render.defaultRotation,
    };
    commit({
      ...manifest,
      assets: manifest.assets.includes(assetKey) ? manifest.assets : [...manifest.assets, assetKey],
      objects: [...manifest.objects, next],
    });
    setLayer('objects');
    setSelection({ layer: 'objects', id });
    setMobilePanel('inspector');
    setPlacementPreview(null);
  }

  function duplicateSelected(): void {
    if (!editableDraft || selectedObject === undefined) return;
    const id = nextEditorIdentifier(manifest, selectedObject.kind);
    const duplicate: MapObject = {
      ...selectedObject,
      id,
      x: Math.min(manifest.safeSaveBounds.maxX, selectedObject.x + 0.5),
      y: Math.min(manifest.safeSaveBounds.maxY, selectedObject.y + 0.5),
    };
    commit({ ...manifest, objects: [...manifest.objects, duplicate] });
    setSelection({ layer: 'objects', id });
  }

  function discardChanges(): void {
    if (!dirty || !window.confirm('Discard all unsaved changes in this Composer session?')) return;
    setHistory(createWorldEditorHistory(lastSaved));
    setSelection(undefined);
    setServerValidation(null);
    setValidatedChecksum(null);
    setPlacementPreview(null);
  }

  function chooseObjectKind(next: MapObject['kind']): void {
    setObjectKind(next);
    const compatible = approvedAssets.find(
      (candidate) =>
        candidate.asset.assetType === objectKindAssetType(next) &&
        (!isDevelopmentAsset(candidate) || showDevelopmentAssets),
    );
    setAssetKey(compatible?.assetKey ?? '');
  }

  function addCollision(shape: MapCollision['shape']): void {
    if (!editableDraft) return;
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
    setMobilePanel('inspector');
  }

  function addSpawn(): void {
    if (!editableDraft) return;
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
    setMobilePanel('inspector');
  }

  function removeSelected(): void {
    if (!editableDraft) return;
    if (selection === undefined) return;
    const object =
      selection.layer === 'objects'
        ? manifest.objects.find(({ id }) => id === selection.id)
        : undefined;
    const requiresConfirmation =
      selection.layer === 'collisions' ||
      selection.layer === 'spawns' ||
      (object !== undefined &&
        ['shop', 'cooking_station', 'crafting_station', 'home_entrance', 'farm_plot'].includes(
          object.kind,
        ));
    if (
      requiresConfirmation &&
      !window.confirm(
        'Remove this gameplay-relevant item from the draft? Validation may also require related interactions, collisions, or spawn references to be updated.',
      )
    ) {
      return;
    }
    const next = removeWorldEditorSelection(manifest, selection);
    if (next === manifest) return;
    commit(next);
    setSelection(undefined);
  }

  function saveDraft(): void {
    if (!editableDraft) return;
    const formData = new FormData();
    appendBaseFields(formData, props, currentVersionId, editVersion, checksum, saveId);
    formData.set('manifest', JSON.stringify(manifest));
    formData.set('confirmed', 'yes');
    setOperation('save');
    startTransition(async () => {
      const result = await saveWorldDraftAction(INITIAL_ACTION_STATE, formData);
      setActionState(result);
      setSaveId(requestId());
      if (result.outcome === 'success') {
        const nextVersionId = result.versionId ?? currentVersionId;
        if (nextVersionId !== currentVersionId) {
          setCurrentVersionId(nextVersionId);
          setCurrentVersionNumber((value) => value + 1);
          router.replace(`/worlds/${props.draft.map.id}/editor?version=${nextVersionId}`);
        }
        setLastSaved(manifest);
        setEditVersion(result.editVersion ?? editVersion);
        const nextChecksum = result.checksum ?? checksum;
        setChecksum(nextChecksum);
        setServerValidation(result.validation ?? null);
        // Save always requires a fresh trusted validation before Draft Preview.
        setValidatedChecksum(null);
      }
    });
  }

  function validateDraft(): void {
    const formData = new FormData();
    appendBaseFields(formData, props, currentVersionId, editVersion, checksum, validationId);
    setOperation('validate');
    startTransition(async () => {
      const result = await validateWorldDraftAction(INITIAL_ACTION_STATE, formData);
      setActionState(result);
      setValidationId(requestId());
      if (result.editVersion !== undefined) setEditVersion(result.editVersion);
      const nextChecksum = result.checksum ?? checksum;
      if (result.checksum !== undefined) setChecksum(result.checksum);
      if (result.validation !== undefined) setServerValidation(result.validation);
      if (result.outcome === 'success' && result.validation?.valid === true) {
        setRevisionLifecycle('validated');
        setValidatedChecksum(nextChecksum);
      } else {
        setValidatedChecksum(null);
      }
    });
  }

  const selectedObject =
    selection?.layer === 'objects'
      ? manifest.objects.find(({ id }) => id === selection.id)
      : undefined;
  const savedSelectedObject =
    selectedObject === undefined
      ? undefined
      : lastSaved.objects.find(({ id }) => id === selectedObject.id);
  const selectedObjectRendering =
    selectedObject === undefined
      ? undefined
      : resolveWorldObjectRendering({
          manifestAssetKeys: new Set(manifest.assets),
          object: selectedObject,
          pins: props.draft.assetPins,
          candidates: approvedAssets,
          mode: renderMode,
          allowUnpinnedActive: dirty && revisionLifecycle === 'draft',
          failedVersionIds: failedAssetVersionIds,
        });
  const selectedObjectCollisions =
    selectedObject === undefined
      ? []
      : manifest.collisions.filter(
          ({ id }) => id === `${selectedObject.id}-base` || id.startsWith(`${selectedObject.id}-`),
        );
  const selectedObjectInteractions =
    selectedObject === undefined ? [] : objectInteractionRequirements(manifest, selectedObject);
  const canvasEmphasisObjectIds = useMemo(
    () =>
      placementPreviewObject === undefined
        ? selection?.layer === 'objects'
          ? [selection.id]
          : []
        : [placementPreviewObject.id],
    [placementPreviewObject, selection],
  );
  const handleCanvasAssetMediaError = useCallback((versionId: string) => {
    setFailedAssetVersionIds((current) => {
      if (current.has(versionId)) return current;
      return new Set([...current, versionId]);
    });
  }, []);
  const handleCanvasSelect = useCallback(
    (target: WorldEditorSelection) => {
      if (target.id === placementPreviewObject?.id) return;
      setLayer(target.layer);
      setSelection(target);
      setMobilePanel('inspector');
      setInspectorCollapsedPersist(false);
    },
    [placementPreviewObject?.id, setInspectorCollapsedPersist],
  );
  const selectedAssetPin = selectedObjectRendering?.pin ?? null;
  const selectedAssetCandidate = selectedObjectRendering?.candidate ?? null;
  const selectedAssetId = selectedAssetPin?.assetId ?? selectedAssetCandidate?.asset.id ?? null;
  const selectedAssetName =
    selectedAssetPin?.friendlyName ?? selectedAssetCandidate?.asset.friendlyName ?? null;
  const selectedReferenceCount =
    selectedAssetPin?.referenceCount ?? selectedAssetCandidate?.asset.referenceCount ?? null;
  const selectedSupportedRotations = selectedAssetPin?.pinnedVersion.render.supportedRotations ??
    selectedAssetCandidate?.activeVersion.render.supportedRotations ?? [0];
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

  function layerItems(): readonly Readonly<{
    id: string;
    label: string;
    detail: string;
    title: string;
  }>[] {
    const query = objectListSearch.trim().toLowerCase();
    const matches = (label: string, detail: string, title: string) => {
      if (query === '') return true;
      return `${label} ${detail} ${title}`.toLowerCase().includes(query);
    };
    if (layer === 'objects')
      return manifest.objects
        .map((item) => {
          const rendering = resolveWorldObjectRendering({
            manifestAssetKeys: new Set(manifest.assets),
            object: item,
            pins: props.draft.assetPins,
            candidates: approvedAssets,
            mode: renderMode,
            allowUnpinnedActive: dirty && props.draft.version.lifecycleStatus === 'draft',
            failedVersionIds: failedAssetVersionIds,
          });
          return {
            id: item.id,
            label:
              rendering.pin?.friendlyName ??
              rendering.candidate?.asset.friendlyName ??
              humanizeKey(item.id),
            detail: `${item.kind.replace(/_/gu, ' ')} · X ${item.x}, Y ${item.y} · ${rendering.status === 'asset' ? `Version ${rendering.renderedVersionNumber}` : `marker: ${rendering.reason.replaceAll('_', ' ')}`}`,
            title: `${item.id} · ${item.assetId} · ${rendering.explanation}`,
          };
        })
        .filter((item) => matches(item.label, item.detail, item.title));
    if (layer === 'collisions')
      return manifest.collisions
        .map((item) => ({
          id: item.id,
          label: humanizeKey(item.id),
          detail: `${item.shape} · ${item.blocking ? 'blocking' : 'non-blocking'}`,
          title: item.id,
        }))
        .filter((item) => matches(item.label, item.detail, item.title));
    if (layer === 'spawns')
      return manifest.spawns
        .map((item) => ({
          id: item.id,
          label: humanizeKey(item.id),
          detail: `${item.purpose.replace(/-/gu, ' ')} · ${item.enabled ? 'enabled' : 'disabled'}`,
          title: item.id,
        }))
        .filter((item) => matches(item.label, item.detail, item.title));
    if (layer === 'exits')
      return manifest.exits
        .map((item) => ({
          id: item.id,
          label: item.direction,
          detail: item.enabled ? (item.transitionLabel ?? 'Enabled') : 'Disabled',
          title: item.id,
        }))
        .filter((item) => matches(item.label, item.detail, item.title));
    return [];
  }

  function selectionFor(id: string): WorldEditorSelection | undefined {
    if (!['objects', 'collisions', 'spawns', 'exits'].includes(layer)) return undefined;
    return { layer: layer as WorldEditorSelection['layer'], id };
  }

  function focusValidationTarget(path: string): void {
    const objectMatch = /objects\[(\d+)\]/u.exec(path);
    if (objectMatch) {
      const index = Number(objectMatch[1]);
      const target = manifest.objects[index];
      if (target) {
        setLayer('objects');
        setSelection({ layer: 'objects', id: target.id });
        setMobilePanel('inspector');
        return;
      }
    }
    const collisionMatch = /collisions\[(\d+)\]/u.exec(path);
    if (collisionMatch) {
      const index = Number(collisionMatch[1]);
      const target = manifest.collisions[index];
      if (target) {
        setLayer('collisions');
        setSelection({ layer: 'collisions', id: target.id });
        setMobilePanel('inspector');
        return;
      }
    }
    const spawnMatch = /spawns\[(\d+)\]/u.exec(path);
    if (spawnMatch) {
      const index = Number(spawnMatch[1]);
      const target = manifest.spawns[index];
      if (target) {
        setLayer('spawns');
        setSelection({ layer: 'spawns', id: target.id });
        setMobilePanel('inspector');
        return;
      }
    }
    const exitMatch = /exits\[(\d+)\]/u.exec(path);
    if (exitMatch) {
      const index = Number(exitMatch[1]);
      const target = manifest.exits[index];
      if (target) {
        setLayer('exits');
        setSelection({ layer: 'exits', id: target.id });
        setMobilePanel('inspector');
      }
    }
  }

  const serverErrors = serverValidation?.errors ?? [];
  const serverWarnings = serverValidation?.warnings ?? [];
  const validationTone =
    issues.length > 0 || serverErrors.length > 0
      ? 'error'
      : serverWarnings.length > 0
        ? 'warning'
        : serverValidation?.valid
          ? 'success'
          : 'neutral';

  const layerSticky = (
    <div className="world-editor-panel__sticky-inner">
      <div className="world-editor-panel__title-row">
        <h2 id="layers-title">Layers</h2>
        <button
          aria-label="Collapse layers panel"
          className="button button--quiet world-editor-panel__collapse"
          onClick={() => setLayersCollapsedPersist(true)}
          title="Hide the Layers panel to expand the canvas"
          type="button"
        >
          Hide
        </button>
      </div>
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
    </div>
  );

  const assetsPanel = (
    <EditorScrollRegion
      className="world-editor-layers__scroll"
      label="Layers and assets list"
      sticky={layerSticky}
    >
      <div className="world-editor-sidebar__section">
        <label className="editor-field">
          <span className="editor-field__label">Filter on-map items</span>
          <input
            className="editor-input"
            onChange={(event) => setObjectListSearch(event.currentTarget.value)}
            placeholder="Search objects on map"
            type="search"
            value={objectListSearch}
          />
        </label>
        {layer === 'objects' ? (
          <div className="editor-create-panel">
            <EditorField label="Asset type / object kind">
              <PremiumSelect
                aria-label="Asset type and object kind"
                onChange={(next) => chooseObjectKind(next as MapObject['kind'])}
                options={mapObjectKinds.map((kind) => ({
                  value: kind,
                  label: kind.replace(/_/gu, ' '),
                }))}
                size="compact"
                value={objectKind}
              />
            </EditorField>
            {placementPreview !== null ? (
              <div className="editor-placement-preview" role="status">
                <strong>Preview placement only</strong>
                <span>
                  X {placementPreview.x.toFixed(2)}, Y {placementPreview.y.toFixed(2)} · Drag to
                  adjust · Not saved
                </span>
                <div className="editor-create-buttons">
                  <button className="button button--primary" onClick={placeObject} type="button">
                    Confirm placement
                  </button>
                  <button
                    className="button button--quiet"
                    onClick={() => setPlacementPreview(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="button button--secondary"
                disabled={!editableDraft || assetKey === ''}
                onClick={() =>
                  setPlacementPreview({ x: manifest.width / 2, y: manifest.height / 2 })
                }
                type="button"
              >
                Preview placement at center
              </button>
            )}
          </div>
        ) : null}
        {layer === 'collisions' ? (
          <div className="editor-create-buttons" aria-label="Create collision footprint">
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={() => addCollision('rectangle')}
              type="button"
            >
              + Rectangle
            </button>
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={() => addCollision('circle')}
              type="button"
            >
              + Circle
            </button>
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={() => addCollision('capsule')}
              type="button"
            >
              + Capsule
            </button>
          </div>
        ) : null}
        {layer === 'spawns' ? (
          <button
            className="button button--secondary editor-add-button"
            disabled={!editableDraft}
            onClick={addSpawn}
            type="button"
          >
            Add transition spawn
          </button>
        ) : null}
      </div>

      <div className="world-editor-sidebar__section">
        <h3>
          On map · {layerLabel(layer)}
          <span className="world-editor-assets__count">{layerItems().length}</span>
        </h3>
        {layerItems().length === 0 ? (
          <p className="asset-palette__empty">No on-map items match this filter.</p>
        ) : (
          <ul
            aria-label={`${layerLabel(layer)} on the map`}
            className="editor-entity-list"
            role="listbox"
          >
            {layerItems().map((item) => {
              const target = selectionFor(item.id);
              const pressed =
                target !== undefined &&
                selection?.layer === target.layer &&
                selection.id === target.id;
              return (
                <li key={item.id} role="none">
                  <button
                    aria-selected={pressed}
                    className={pressed ? 'is-selected' : ''}
                    onClick={() => {
                      setSelection(target);
                      setMobilePanel('inspector');
                      setInspectorCollapsedPersist(false);
                    }}
                    title={item.title}
                    type="button"
                    role="option"
                  >
                    <strong className="editor-entity-list__label">{item.label}</strong>
                    <small className="editor-entity-list__detail">{item.detail}</small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="world-editor-sidebar__section world-editor-assets">
        <div className="world-editor-assets__heading">
          <h3 id="assets-title">Approved assets</h3>
          <span className="world-editor-assets__count">{filteredAssets.length}</span>
        </div>
        <label className="editor-field">
          <span className="editor-field__label">Search assets</span>
          <input
            className="editor-input"
            onChange={(event) => setAssetSearch(event.currentTarget.value)}
            placeholder="Search approved assets"
            type="search"
            value={assetSearch}
          />
        </label>
        <EditorField label="Category">
          <PremiumSelect
            aria-label="Asset category"
            onChange={(next) => setAssetCategory(next as AssetCategoryFilter)}
            options={['all' as const, ...ASSET_CATEGORIES].map((value) => ({
              value,
              label: value === 'all' ? 'All categories' : value.replace(/_/gu, ' '),
            }))}
            size="compact"
            value={assetCategory}
          />
        </EditorField>
        <EditorField label="Production status">
          <PremiumSelect
            aria-label="Asset production status"
            onChange={(next) => setAssetProduction(next as AssetProductionFilter)}
            options={[
              { value: 'approved', label: 'Approved production' },
              { value: 'development', label: 'Development markers' },
              { value: 'all', label: 'Approved and development' },
            ]}
            size="compact"
            value={assetProduction}
          />
        </EditorField>
        <EditorField label="Interaction compatibility">
          <PremiumSelect
            aria-label="Asset interaction compatibility"
            onChange={(next) => setAssetInteraction(next as AssetInteractionFilter)}
            options={[
              { value: 'all', label: 'All interactions' },
              ...ASSET_INTERACTION_COMPATIBILITIES.map((value) => ({
                value,
                label: value.replace(/_/gu, ' '),
              })),
            ]}
            size="compact"
            value={assetInteraction}
          />
        </EditorField>
        {(assetSearch !== '' ||
          assetCategory !== 'all' ||
          assetInteraction !== 'all' ||
          assetProduction !== 'approved' ||
          objectListSearch !== '') && (
          <button
            className="button button--quiet"
            onClick={() => {
              setAssetSearch('');
              setAssetCategory('all');
              setAssetInteraction('all');
              setAssetProduction('approved');
              setObjectListSearch('');
            }}
            type="button"
          >
            Clear filters
          </button>
        )}
        <ul className="asset-palette" aria-label="Approved asset palette">
          {filteredAssets.length === 0 ? (
            <li className="asset-palette__empty">No approved assets match this filter.</li>
          ) : (
            filteredAssets.map((asset) => {
              const selectedAsset = asset.assetKey === assetKey;
              const category = asset.asset.category;
              const development = isDevelopmentAsset(asset);
              const thumbnail = availableAdminAssetMediaPath(
                asset.asset.id,
                asset.versionId,
                'thumbnail',
                asset.activeVersion.thumbnailUrl,
              );
              return (
                <li key={asset.asset.id}>
                  <button
                    aria-pressed={selectedAsset}
                    className={`asset-card ${selectedAsset ? 'is-selected' : ''}`}
                    onClick={() => {
                      setAssetKey(asset.assetKey);
                      setLayer('objects');
                      setPlacementPreview(null);
                    }}
                    title={asset.assetKey}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={`asset-card__thumb asset-card__thumb--${category}`}
                    >
                      {/* Same-origin thumbnail proxy rechecks assets.read. */}
                      {thumbnail === null ? (
                        <span className="asset-card__procedural-marker">
                          {asset.asset.friendlyName.slice(0, 2).toUpperCase()}
                        </span>
                      ) : (
                        <img alt="" src={thumbnail} />
                      )}
                    </span>
                    <span className="asset-card__body">
                      <strong className="asset-card__name">{asset.asset.friendlyName}</strong>
                      <span className="asset-card__meta">
                        <span className="asset-card__kind">
                          {asset.asset.assetType.replace(/_/gu, ' ')} · v
                          {asset.activeVersion.versionNumber}
                        </span>
                        {development ? <span className="asset-card__badge">Dev marker</span> : null}
                      </span>
                      <small className="asset-card__detail">
                        Interactions: {asset.supportedInteractions.join(', ').replaceAll('_', ' ')}
                      </small>
                      <small className="asset-card__detail">
                        Rotations: {asset.supportedRotations.join('°, ')}°
                      </small>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
      <div className="world-editor-panel__end-spacer" aria-hidden="true" />
    </EditorScrollRegion>
  );

  const inspectorSticky = (
    <div className="world-editor-panel__sticky-inner">
      <div className="world-editor-panel__title-row">
        <h2 id="inspector-title">Inspector</h2>
        <button
          aria-label="Collapse inspector panel"
          className="button button--quiet world-editor-panel__collapse"
          onClick={() => setInspectorCollapsedPersist(true)}
          title="Hide the Inspector panel to expand the canvas"
          type="button"
        >
          Hide
        </button>
      </div>
      {selection !== undefined || layer === 'metadata' || layer === 'bounds' ? (
        <div className="world-editor-inspector__selection">
          <span className="world-editor-inspector__selection-chip">
            {selection?.layer ?? layer}
          </span>
          <strong className="world-editor-inspector__selection-name">
            {selectedObject
              ? humanizeKey(selectedObject.id)
              : selectedCollision
                ? humanizeKey(selectedCollision.id)
                : selectedSpawn
                  ? humanizeKey(selectedSpawn.id)
                  : selectedExit
                    ? selectedExit.direction
                    : layer === 'metadata'
                      ? manifest.name
                      : layer === 'bounds'
                        ? 'Map bounds'
                        : 'Selection'}
          </strong>
          {dirty ? <span className="state-chip state-chip--pending">Unsaved edits</span> : null}
        </div>
      ) : null}
      {editableDraft ? null : (
        <p className="world-editor-read-only" role="status">
          Read-only validated world version. Selection, inspection, rendering modes, pan, and zoom
          remain available; create or derive an editable draft before changing world data.
        </p>
      )}
    </div>
  );

  const inspectorPanel = (
    <EditorScrollRegion
      className="world-editor-inspector__scroll"
      label="Property inspector"
      sticky={inspectorSticky}
    >
      {layer === 'metadata' ? (
        <div className="editor-fields">
          <InspectorSection title="Identity">
            <EditorField label="Map display name">
              <input
                className="editor-input"
                maxLength={80}
                onChange={(event) => commit({ ...manifest, name: event.currentTarget.value })}
                value={manifest.name}
              />
            </EditorField>
            <EditorField label="Description">
              <textarea
                className="editor-input editor-input--area"
                maxLength={240}
                onChange={(event) =>
                  commit({ ...manifest, description: event.currentTarget.value })
                }
                rows={5}
                value={manifest.description}
              />
            </EditorField>
          </InspectorSection>
          <InspectorSection title="Advanced metadata" defaultOpen={false}>
            <EditorField
              hint="Temporary Phase 6/7 art must remain truthfully labelled."
              label="Development-art label"
            >
              <input
                className="editor-input"
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
          </InspectorSection>
        </div>
      ) : null}
      {layer === 'bounds' ? (
        <div className="editor-fields">
          <InspectorSection title="Safe save bounds">
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
          </InspectorSection>
          <InspectorSection title="Camera bounds">
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
          </InspectorSection>
        </div>
      ) : null}
      {selectedObject !== undefined ? (
        <div className="editor-fields">
          <p className="field-hint editor-selection-ref" title={selectedObject.id}>
            {selectedObject.id}
          </p>
          <InspectorSection title="World Object">
            <dl className="world-object-inspector-grid">
              <div>
                <dt>Type</dt>
                <dd>{selectedObject.kind.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Position</dt>
                <dd>
                  X {selectedObject.x} · Y {selectedObject.y}
                </dd>
              </div>
              <div>
                <dt>Scale / layer</dt>
                <dd>{selectedObject.scale} · objects</dd>
              </div>
              <div>
                <dt>Map collision</dt>
                <dd>
                  {selectedObjectCollisions.length === 0
                    ? 'No object-keyed collision region'
                    : selectedObjectCollisions.map(({ id }) => id).join(', ')}
                </dd>
              </div>
              <div>
                <dt>Managed collision</dt>
                <dd>{assetCollisionSummary(selectedAssetPin ?? selectedAssetCandidate)}</dd>
              </div>
              <div>
                <dt>Interactions</dt>
                <dd>
                  {selectedObjectInteractions.length === 0
                    ? 'Decorative / none required'
                    : selectedObjectInteractions.join(', ').replaceAll('_', ' ')}
                </dd>
              </div>
            </dl>
          </InspectorSection>
          <InspectorSection title="World Asset Binding">
            <dl className="world-object-inspector-grid">
              <div>
                <dt>Manifest asset key</dt>
                <dd>
                  <code>{selectedObject.assetId}</code>
                </dd>
              </div>
              <div>
                <dt>Binding state</dt>
                <dd>
                  {manifest.assets.includes(selectedObject.assetId)
                    ? 'Declared by this draft manifest'
                    : 'Missing from draft asset declarations'}
                </dd>
              </div>
              <div>
                <dt>World version</dt>
                <dd>
                  Version {currentVersionNumber} · {props.draft.version.lifecycleStatus}
                </dd>
              </div>
              {selectedAssetId === null || selectedAssetName === null ? (
                <div>
                  <dt>Canonical asset</dt>
                  <dd>Not available for this exact key</dd>
                </div>
              ) : (
                <>
                  <div>
                    <dt>Canonical asset</dt>
                    <dd>
                      <Link href={`/world-assets/${selectedAssetId}`}>{selectedAssetName}</Link>
                      <code>{selectedAssetId}</code>
                    </dd>
                  </div>
                  {selectedAssetPin === null ? null : (
                    <div>
                      <dt>Draft-pinned version</dt>
                      <dd>
                        <Link
                          href={`/world-assets/${selectedAssetPin.assetId}/versions/${selectedAssetPin.pinnedVersion.id}`}
                        >
                          Version {selectedAssetPin.pinnedVersion.versionNumber} ·{' '}
                          {selectedAssetPin.pinnedVersion.lifecycleStatus}
                        </Link>
                        <code>{selectedAssetPin.pinnedVersion.id}</code>
                      </dd>
                    </div>
                  )}
                  {selectedAssetCandidate === null ? null : (
                    <div>
                      <dt>Current active version</dt>
                      <dd>
                        <Link
                          href={`/world-assets/${selectedAssetCandidate.asset.id}/versions/${selectedAssetCandidate.versionId}`}
                        >
                          Version {selectedAssetCandidate.activeVersion.versionNumber} · active
                        </Link>
                        <code>{selectedAssetCandidate.versionId}</code>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt>Rendered version</dt>
                    <dd>
                      {selectedObjectRendering?.renderedVersionNumber === null
                        ? 'Fallback marker; no artwork version rendered'
                        : `Version ${selectedObjectRendering?.renderedVersionNumber}`}
                      {selectedObjectRendering?.renderedVersionId === null ? null : (
                        <code>{selectedObjectRendering?.renderedVersionId}</code>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Reference safety</dt>
                    <dd>
                      {selectedReferenceCount ?? 0} known reference(s). The stable key and retained
                      version pin were not changed by this view.
                    </dd>
                  </div>
                  {selectedAssetPin?.latestVersion === null ||
                  selectedAssetPin?.latestVersion === undefined ||
                  selectedAssetPin.latestVersion.id === selectedAssetPin.pinnedVersion.id ? null : (
                    <div>
                      <dt>Latest immutable version</dt>
                      <dd>
                        Version {selectedAssetPin.latestVersion.versionNumber} ·{' '}
                        {selectedAssetPin.latestVersion.lifecycleStatus} ·{' '}
                        {selectedAssetPin.latestVersion.validationStatus} ·{' '}
                        {selectedAssetPin.latestVersion.sourceWidth ?? 'unknown'} ×{' '}
                        {selectedAssetPin.latestVersion.sourceHeight ?? 'unknown'}. It is not the
                        retained pin and is never rendered automatically.
                        {selectedAssetPin.latestVersion.lifecycleStatus === 'validated' ? (
                          <span className="field-hint">
                            {selectedAssetName} Version{' '}
                            {selectedAssetPin.latestVersion.versionNumber} is validated but is not
                            active. The world continues to use its existing pinned or active version
                            until an authorized administrator approves and activates a replacement
                            and updates the world draft where required.
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  )}
                </>
              )}
              {selectedObjectRendering?.replacementCandidate === null ||
              selectedObjectRendering?.replacementCandidate === undefined ? null : (
                <div>
                  <dt>Replacement available</dt>
                  <dd>
                    {selectedObjectRendering.replacementCandidate.asset.friendlyName} is available,
                    but requires an explicit reviewed draft replacement.
                  </dd>
                </div>
              )}
            </dl>
          </InspectorSection>
          <InspectorSection title="Rendering Explanation">
            <p
              className={`world-object-render-status world-object-render-status--${selectedObjectRendering?.status ?? 'marker'}`}
            >
              {renderModeLabel(renderMode)} ·{' '}
              {selectedObjectRendering?.status === 'asset' ? 'managed asset' : 'fallback marker'} ·{' '}
              {selectedObjectRendering?.reason.replaceAll('_', ' ') ?? 'unresolved'}
            </p>
            <p>{selectedObjectRendering?.explanation}</p>
            <p className="field-hint">
              Only the protected processed-source route is eligible. Intake files, private storage
              paths, and validated non-active versions are never selected by the canvas.
            </p>
          </InspectorSection>
          <InspectorSection title="Next Safe Action">
            <p>{selectedObjectRendering?.nextSafeAction}</p>
            <p className="field-hint">
              Rendering modes, selection, pan, and zoom are view state only and never save or
              publish world data.
            </p>
          </InspectorSection>
          <InspectorSection title="Identity">
            <div className="editor-field world-editor-current-asset">
              <span className="editor-field__label">Current visual asset</span>
              <strong>{humanizeKey(selectedObject.assetId)}</strong>
              <code>{selectedObject.assetId}</code>
            </div>
            <WorldAssetReplacementDialog
              candidates={approvedAssets}
              lifecycleStatus={revisionLifecycle}
              manifest={manifest}
              object={selectedObject}
              onReplace={commit}
            />
            <EditorField label="Object kind">
              <PremiumSelect
                aria-label="Selected object kind"
                onChange={(next) =>
                  updateObject(selectedObject.id, {
                    kind: next as MapObject['kind'],
                  })
                }
                options={mapObjectKinds.map((kind) => ({
                  value: kind,
                  label: kind.replace(/_/gu, ' '),
                }))}
                size="compact"
                value={selectedObject.kind}
              />
            </EditorField>
          </InspectorSection>
          <InspectorSection title="Position">
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
          </InspectorSection>
          <InspectorSection title="Visual layer">
            <EditorField label="Rotation">
              <PremiumSelect
                aria-label="Selected object rotation"
                onChange={(value) =>
                  updateObject(selectedObject.id, {
                    rotation: Number(value) as MapObject['rotation'],
                  })
                }
                options={selectedSupportedRotations.map((rotation) => ({
                  value: String(rotation),
                  label: `${String(rotation)}°`,
                }))}
                size="compact"
                value={String(selectedObject.rotation ?? selectedSupportedRotations[0] ?? 0)}
              />
            </EditorField>
            <NumberEditor
              label="Scale"
              max={4}
              min={0.1}
              onCommit={(value) => updateObject(selectedObject.id, { scale: value })}
              value={selectedObject.scale}
            />
            <p className="field-hint">
              Effective placement scale: {selectedObject.scale.toFixed(2)}× the pinned asset render
              size.
            </p>
            <button
              className="button button--quiet"
              disabled={!editableDraft || selectedObject.scale === 1}
              onClick={() => updateObject(selectedObject.id, { scale: 1 })}
              type="button"
            >
              Reset scale to 1×
            </button>
          </InspectorSection>
          <div className="editor-create-buttons" aria-label="Object placement tools">
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={() =>
                updateObject(selectedObject.id, {
                  x: Math.round(selectedObject.x * 2) / 2,
                  y: Math.round(selectedObject.y * 2) / 2,
                })
              }
              type="button"
            >
              Snap to half tile
            </button>
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={() =>
                updateObject(selectedObject.id, {
                  x: manifest.width / 2,
                  y: manifest.height / 2,
                })
              }
              type="button"
            >
              Align center
            </button>
            <button
              className="button button--quiet"
              disabled={
                !editableDraft ||
                savedSelectedObject === undefined ||
                (savedSelectedObject.x === selectedObject.x &&
                  savedSelectedObject.y === selectedObject.y)
              }
              onClick={() => {
                if (savedSelectedObject === undefined) return;
                updateObject(selectedObject.id, {
                  x: savedSelectedObject.x,
                  y: savedSelectedObject.y,
                });
              }}
              type="button"
            >
              Reset saved position
            </button>
            <button
              className="button button--quiet"
              disabled={!editableDraft}
              onClick={duplicateSelected}
              type="button"
            >
              Duplicate
            </button>
          </div>
          <button
            className="button button--danger"
            disabled={!editableDraft}
            onClick={removeSelected}
            type="button"
          >
            Delete object
          </button>
          <p className="field-hint">
            Property edits update the draft only after you choose <strong>Save draft</strong>.
          </p>
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
          <InspectorSection title="Position">
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
          </InspectorSection>
          <InspectorSection title="Identity">
            <EditorField label="Facing direction">
              <PremiumSelect
                aria-label="Facing direction"
                onChange={(next) =>
                  updateSpawn(selectedSpawn.id, {
                    facingDirection: next as MapSpawn['facingDirection'],
                  })
                }
                options={FACING_DIRECTIONS.map((facing) => ({
                  value: facing,
                  label: facing,
                }))}
                size="compact"
                value={selectedSpawn.facingDirection}
              />
            </EditorField>
            <EditorField label="Purpose">
              <PremiumSelect
                aria-label="Spawn purpose"
                disabled={selectedSpawn.id === manifest.defaultSpawnId}
                onChange={(next) =>
                  updateSpawn(selectedSpawn.id, {
                    purpose: next as MapSpawn['purpose'],
                  })
                }
                options={[
                  { value: 'default', label: 'Default' },
                  { value: 'transition-entry', label: 'Transition entry' },
                ]}
                size="compact"
                value={selectedSpawn.purpose}
              />
            </EditorField>
            <label className="editor-check">
              <input
                checked={selectedSpawn.enabled}
                onChange={(event) =>
                  updateSpawn(selectedSpawn.id, { enabled: event.currentTarget.checked })
                }
                type="checkbox"
              />
              <span>Enabled</span>
            </label>
          </InspectorSection>
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
        <div className="editor-empty-inspector">
          <p className="editor-empty-inspector__title">Nothing selected</p>
          <p>
            Select an object on the canvas or from the layer list to edit coordinates, assets,
            collision, spawns, or exits.
          </p>
          <p className="field-hint">
            Choose an asset card, then place at map center, or click any rendered marker.
          </p>
        </div>
      ) : null}
      <div className="world-editor-panel__end-spacer" aria-hidden="true" />
    </EditorScrollRegion>
  );

  return (
    <main
      className="world-editor-page"
      aria-labelledby="editor-title"
      data-world-editor-shell="true"
    >
      <header className="world-editor-toolbar" aria-label="World editor toolbar">
        <div className="world-editor-toolbar__identity">
          <Link className="world-editor-back" href={`/worlds/${props.draft.map.id}`}>
            ← Back
          </Link>
          <div className="world-editor-toolbar__titles">
            <p className="eyebrow">Protected draft editor</p>
            <h1 id="editor-title">{props.draft.map.displayName}</h1>
            <p className="world-editor-toolbar__meta">
              Version {currentVersionNumber} · revision {editVersion} · {manifest.name}
            </p>
          </div>
          <button
            aria-expanded={guideOpen}
            aria-haspopup="dialog"
            className="button button--secondary world-editor-guide-trigger"
            data-editor-guide-trigger="true"
            onClick={() => setGuideOpen(true)}
            ref={guideTriggerRef}
            title="Open How to use the World Editor"
            type="button"
          >
            <span aria-hidden="true" className="world-editor-guide-trigger__icon">
              ?
            </span>
            Editor Guide
          </button>
          <span
            className={`state-chip ${dirty ? 'state-chip--pending' : 'state-chip--success'}`}
            role="status"
          >
            {dirty ? 'Unsaved' : 'Saved'}
          </span>
        </div>

        <div className="world-editor-toolbar__actions">
          <button
            className="button button--quiet"
            disabled={history.past.length === 0 || pending}
            onClick={() => setHistory(undoWorldEditorManifest)}
            title="Undo the last structured edit"
            type="button"
          >
            Undo
          </button>
          <button
            className="button button--quiet"
            disabled={history.future.length === 0 || pending}
            onClick={() => setHistory(redoWorldEditorManifest)}
            title="Redo the last undone edit"
            type="button"
          >
            Redo
          </button>
          <button
            className="button button--quiet"
            disabled={!dirty || pending}
            onClick={discardChanges}
            type="button"
          >
            Discard changes
          </button>
          <button
            aria-expanded={changesOpen}
            className="button button--quiet"
            disabled={!dirty}
            onClick={() => setChangesOpen((value) => !value)}
            type="button"
          >
            Review changes
          </button>
          <button
            className="button button--primary"
            disabled={!editableDraft || pending || issues.length > 0 || !dirty}
            onClick={saveDraft}
            title="Save Draft stores edits without changing the live world"
            type="button"
          >
            {pending && operation === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            className="button button--secondary"
            disabled={!editableDraft || pending || dirty || issues.length > 0}
            onClick={validateDraft}
            title="Validate Draft runs trusted checks on the current saved revision"
            type="button"
          >
            {pending && operation === 'validate' ? 'Validating…' : 'Validate draft'}
          </button>
          {preview.canPreview ? (
            <Link
              className="button button--secondary"
              href={`/worlds/${props.draft.map.id}/preview?version=${currentVersionId}`}
              title="Draft Preview opens an isolated staff-only view after trusted validation"
            >
              Draft preview
            </Link>
          ) : (
            <span className="world-editor-preview-disabled">
              <button
                className="button button--quiet"
                disabled
                title={preview.message ?? 'Draft preview unavailable'}
                type="button"
              >
                Draft preview
              </button>
              {preview.message ? (
                <small className="world-editor-preview-reason">{preview.message}</small>
              ) : null}
            </span>
          )}
          <WorldGameTestLauncher
            assuranceLevel={props.assuranceLevel}
            activePublishedVersionId={props.draft.map.activePublishedVersionId}
            canPreview={props.canOpenGameTest}
            checksum={checksum}
            dirty={dirty}
            editVersion={editVersion}
            environment={props.gameTestEnvironment}
            initialStatus={props.initialGameTestStatus}
            mapId={props.draft.map.id}
            mapDisplayName={props.draft.map.displayName}
            reopenUrl={props.gameTestReopenUrl}
            returnedSessionId={props.returnedGameTestSessionId}
            returnPath={`/worlds/${props.draft.map.id}/editor?version=${currentVersionId}`}
            validated={preview.canPreview}
            versionId={currentVersionId}
            versionNumber={currentVersionNumber}
          />
        </div>

        <div className="world-editor-toolbar__toggles" aria-label="Editor view toggles">
          <label className="world-editor-render-mode">
            <span>Object rendering</span>
            <PremiumSelect
              aria-label="Object rendering mode"
              onChange={(value) => setRenderMode(value as WorldObjectRenderMode)}
              options={WORLD_OBJECT_RENDER_MODES.map((mode) => ({
                value: mode,
                label: renderModeLabel(mode),
              }))}
              size="compact"
              value={renderMode}
            />
          </label>
          <ToggleChip
            disabled={!editableDraft}
            label="Move tool"
            pressed={moveToolActive && editableDraft}
            title="Require an explicit mode before pointer or touch dragging changes an object"
            onToggle={() => setMoveToolActive((value) => !value)}
          />
          <span className="world-editor-tool-status" role="status">
            Selected tool:{' '}
            {placementPreviewObject
              ? 'Placement'
              : moveToolActive && editableDraft
                ? 'Move'
                : 'Select'}
          </span>
          <ToggleChip
            label="Grid"
            pressed={showGrid}
            title="Toggle the isometric grid overlay"
            onToggle={() => setShowGrid((value) => !value)}
          />
          <ToggleChip
            label="Collision"
            pressed={showCollisions}
            title="Toggle collision footprints on the map"
            onToggle={() => setShowCollisions((value) => !value)}
          />
          <ToggleChip
            label="Spawns"
            pressed={showSpawns}
            title="Toggle spawn point markers on the map"
            onToggle={() => setShowSpawns((value) => !value)}
          />
          <ToggleChip
            label="Exits"
            pressed={showExits}
            title="Toggle exit regions and transitions on the map"
            onToggle={() => setShowExits((value) => !value)}
          />
        </div>

        <div className="world-editor-mobile-actions" aria-label="Editor panels">
          <button
            aria-pressed={mobilePanel === 'assets'}
            className={`button button--quiet ${mobilePanel === 'assets' ? 'is-active' : ''}`}
            onClick={() => setMobilePanel((current) => (current === 'assets' ? 'none' : 'assets'))}
            title="Open Layers and approved assets"
            type="button"
          >
            Layers
          </button>
          <button
            aria-pressed={mobilePanel === 'inspector'}
            className={`button button--quiet ${mobilePanel === 'inspector' ? 'is-active' : ''}`}
            onClick={() =>
              setMobilePanel((current) => (current === 'inspector' ? 'none' : 'inspector'))
            }
            title="Open the property Inspector"
            type="button"
          >
            Inspector
          </button>
          <button
            aria-expanded={guideOpen}
            className="button button--secondary"
            data-editor-guide-trigger-mobile="true"
            onClick={() => setGuideOpen(true)}
            title="Open How to use the World Editor"
            type="button"
          >
            Editor Guide
          </button>
        </div>
      </header>

      {changesOpen && dirty ? (
        <section className="world-editor-change-review" aria-live="polite">
          <strong>Unsaved structured change summary</strong>
          <span>{localChangeSummary.added} objects added</span>
          <span>{localChangeSummary.removed} objects removed</span>
          <span>{localChangeSummary.moved} objects moved</span>
          <span>{localChangeSummary.modified} objects modified</span>
          <span>
            {localChangeSummary.collisionsChanged ? 'Collision changed' : 'Collision unchanged'}
          </span>
          <span>
            {localChangeSummary.exitsChanged
              ? 'Entrances/exits changed'
              : 'Entrances/exits unchanged'}
          </span>
          <span>{localChangeSummary.terrainChanged ? 'Terrain changed' : 'Terrain unchanged'}</span>
          <small>The trusted save computes and stores the authoritative summary.</small>
        </section>
      ) : null}

      <WorldEditorGuide
        onClose={() => setGuideOpen(false)}
        open={guideOpen}
        triggerRef={guideTriggerRef}
      />

      {actionState.outcome === 'idle' ? null : (
        <p
          className={`notice world-editor-notice ${actionState.outcome === 'success' ? 'notice--success' : 'notice--warning'}`}
          role={actionState.outcome === 'error' ? 'alert' : 'status'}
        >
          {actionState.message}
        </p>
      )}

      <div
        className={`world-editor-layout ${layersCollapsed ? 'is-layers-collapsed' : ''} ${inspectorCollapsed ? 'is-inspector-collapsed' : ''}`}
        data-layers-collapsed={layersCollapsed ? 'true' : 'false'}
        data-inspector-collapsed={inspectorCollapsed ? 'true' : 'false'}
      >
        {layersCollapsed ? (
          <button
            aria-label="Show layers panel"
            className="world-editor-rail world-editor-rail--layers"
            onClick={() => setLayersCollapsedPersist(false)}
            type="button"
          >
            Layers
          </button>
        ) : (
          <aside
            className="world-editor-layers world-editor-sidebar"
            aria-labelledby="layers-title"
            data-editor-sidebar="assets"
            data-scrollable-panel="layers"
          >
            {assetsPanel}
          </aside>
        )}

        <section
          className="world-editor-stage"
          aria-labelledby="stage-title"
          data-editor-stage="true"
        >
          <div className="world-editor-stage__heading">
            <div>
              <p className="eyebrow">Isometric workspace</p>
              <h2 id="stage-title">{manifest.name}</h2>
            </div>
            <span className="world-editor-stage__size">
              {manifest.width} × {manifest.height} world units · {manifest.objects.length} objects
            </span>
          </div>
          <div
            aria-describedby="world-canvas-pan-help"
            aria-label={`Map canvas for ${manifest.name}. Hold left mouse button on empty space and drag to pan. Use plus and minus to zoom. Arrow keys pan when focused.`}
            className={`world-editor-stage__canvas-wrap ${isPanning ? 'is-panning' : ''}`}
            data-canvas-host="true"
            data-pan-threshold={CANVAS_PAN_DRAG_THRESHOLD_PX}
            onClickCapture={(event) => {
              if (!suppressNextSelectRef.current) return;
              event.preventDefault();
              event.stopPropagation();
              suppressNextSelectRef.current = false;
              if (suppressSelectTimerRef.current !== 0) {
                window.clearTimeout(suppressSelectTimerRef.current);
                suppressSelectTimerRef.current = 0;
              }
            }}
            onLostPointerCapture={() => {
              if (panSession.current !== null) {
                if (panSession.current.moved) commitPan(canvasPanRef.current);
                panSession.current = null;
                setIsPanning(false);
              }
            }}
            onPointerDown={(event) => {
              const target = event.target;
              if (
                target instanceof Element &&
                target.closest(
                  '.world-canvas-controls, .world-canvas-help, button, a, input, select, textarea',
                )
              ) {
                return;
              }
              const isMiddle = event.button === 1;
              const forcePan =
                isMiddle ||
                spaceHeldRef.current ||
                event.shiftKey ||
                event.altKey ||
                event.buttons === 4;
              const startedOnInteractiveTarget =
                target instanceof Element &&
                Boolean(
                  target.closest(
                    '[data-world-canvas-interactive], .world-canvas__exits, .world-canvas__collisions, .world-canvas__spawns',
                  ),
                );
              const gesture = beginCanvasPointerGesture({
                pointerId: event.pointerId,
                pointerType: event.pointerType,
                isPrimary: event.isPrimary,
                button: event.button,
                clientX: event.clientX,
                clientY: event.clientY,
                panX: canvasPanRef.current.x,
                panY: canvasPanRef.current.y,
                startedOnInteractiveTarget,
                forcePan,
              });
              if (gesture === null) return;
              panSession.current = gesture;
              if (forcePan) {
                event.preventDefault();
                setIsPanning(true);
                safelyCapturePointer(event.currentTarget, event.pointerId);
              }
            }}
            onPointerLeave={(event) => {
              const session = panSession.current;
              if (
                session !== null &&
                session.pointerId === event.pointerId &&
                !session.moved &&
                !event.currentTarget.hasPointerCapture(event.pointerId)
              ) {
                panSession.current = null;
              }
            }}
            onPointerMove={(event) => {
              const session = panSession.current;
              if (session === null || session.pointerId !== event.pointerId) return;
              const movement = moveCanvasPointerGesture(session, event.clientX, event.clientY);
              panSession.current = movement.gesture;
              if (!movement.shouldPan) return;
              if (movement.startedPan) {
                userAdjustedView.current = true;
                setIsPanning(true);
                safelyCapturePointer(event.currentTarget, event.pointerId);
              }
              event.preventDefault();
              scheduleLivePan({
                x: session.startPanX + movement.dx,
                y: session.startPanY + movement.dy,
              });
            }}
            onPointerUp={(event) => {
              if (panSession.current?.pointerId !== event.pointerId) return;
              const session = panSession.current;
              const outcome = finishCanvasPointerGesture(session);
              panSession.current = null;
              setIsPanning(false);
              safelyReleasePointer(event.currentTarget, event.pointerId);
              if (outcome === 'pan') {
                suppressGestureClick();
                commitPan(canvasPanRef.current);
                event.preventDefault();
              }
            }}
            onPointerCancel={(event) => {
              const session = panSession.current;
              if (session !== null && session.pointerId === event.pointerId) {
                finishCanvasPointerGesture(session, true);
                if (session.moved) commitPan(canvasPanRef.current);
                safelyReleasePointer(event.currentTarget, event.pointerId);
              }
              panSession.current = null;
              setIsPanning(false);
            }}
            onWheel={(event) => {
              // Ctrl/⌘ + wheel zooms; otherwise two-finger/trackpad scroll pans the viewport.
              if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                userAdjustedView.current = true;
                const delta = event.deltaY > 0 ? -CANVAS_ZOOM_STEP : CANVAS_ZOOM_STEP;
                const next = clampCanvasZoom(canvasZoomRef.current + delta);
                canvasZoomRef.current = next;
                setCanvasZoom(next);
                commitPan(canvasPanRef.current);
                return;
              }
              if (Math.abs(event.deltaX) < 0.5 && Math.abs(event.deltaY) < 0.5) return;
              event.preventDefault();
              userAdjustedView.current = true;
              commitPan({
                x: canvasPanRef.current.x - event.deltaX,
                y: canvasPanRef.current.y - event.deltaY,
              });
            }}
            ref={canvasHostRef}
            tabIndex={0}
          >
            <div
              className="world-editor-stage__canvas-transform"
              data-canvas-transform="true"
              ref={canvasTransformRef}
              style={{
                transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
              }}
            >
              <WorldManifestCanvas
                activeLayer={
                  layer === 'metadata' || layer === 'bounds'
                    ? 'objects'
                    : (layer as WorldEditorSelection['layer'])
                }
                assetCandidates={approvedAssets}
                assetPins={props.draft.assetPins}
                allowUnpinnedActive={
                  placementPreviewObject !== undefined || (dirty && revisionLifecycle === 'draft')
                }
                className="world-editor-stage__canvas"
                emphasisObjectIds={canvasEmphasisObjectIds}
                failedAssetVersionIds={failedAssetVersionIds}
                manifest={canvasManifest}
                onAssetMediaError={handleCanvasAssetMediaError}
                onSelect={handleCanvasSelect}
                renderMode={renderMode}
                {...(placementPreviewObject !== undefined || (editableDraft && moveToolActive)
                  ? {
                      onObjectMove: (objectId: string, x: number, y: number) => {
                        if (objectId === placementPreviewObject?.id) {
                          setPlacementPreview({ x, y });
                          return;
                        }
                        updateObject(objectId, { x, y });
                      },
                    }
                  : {})}
                {...(selection === undefined ? {} : { selection })}
                showCollisions={showCollisions || renderMode === 'collision'}
                showExits={showExits}
                showGrid={showGrid}
                showSpawns={showSpawns}
                zoom={canvasZoom}
              />
            </div>
            <p className="sr-only" id="world-canvas-pan-help">
              Hold the left mouse button on empty map space and drag to pan. Hold Space and drag, or
              use the middle mouse button. Zoom with plus and minus. Fit shows the complete map.
              Reset returns to the default fitted view. Arrow keys pan when the canvas is focused.
            </p>
            <div className="world-canvas-controls" role="toolbar" aria-label="Canvas navigation">
              <button
                aria-label="Zoom in"
                className="world-canvas-controls__button"
                disabled={canvasZoom >= CANVAS_ZOOM_MAX}
                onClick={() => {
                  userAdjustedView.current = true;
                  const next = clampCanvasZoom(canvasZoomRef.current + CANVAS_ZOOM_STEP);
                  canvasZoomRef.current = next;
                  setCanvasZoom(next);
                  commitPan(canvasPanRef.current);
                }}
                title="Zoom in (+)"
                type="button"
              >
                +
              </button>
              <button
                aria-label="Zoom out"
                className="world-canvas-controls__button"
                disabled={canvasZoom <= CANVAS_ZOOM_MIN}
                onClick={() => {
                  userAdjustedView.current = true;
                  const next = clampCanvasZoom(canvasZoomRef.current - CANVAS_ZOOM_STEP);
                  canvasZoomRef.current = next;
                  setCanvasZoom(next);
                  commitPan(canvasPanRef.current);
                }}
                title="Zoom out (−)"
                type="button"
              >
                −
              </button>
              <span aria-live="polite" className="world-canvas-controls__zoom">
                {zoomPercentage(canvasZoom)}%
              </span>
              <button
                aria-label="Fit map in view"
                className="world-canvas-controls__button"
                onClick={fitCanvasMap}
                title="Fit map to the canvas (0)"
                type="button"
              >
                Fit
              </button>
              <button
                aria-label="Reset canvas view"
                className="world-canvas-controls__button"
                onClick={resetCanvasView}
                title="Reset map view to the fitted default"
                type="button"
              >
                Reset
              </button>
              <button
                aria-expanded={canvasHelpOpen}
                aria-label="Canvas controls help"
                className="world-canvas-controls__button"
                onClick={() => setCanvasHelpOpen((value) => !value)}
                title="Canvas controls"
                type="button"
              >
                ?
              </button>
            </div>
            {canvasHelpOpen ? (
              <div className="world-canvas-help" role="dialog" aria-label="Canvas controls">
                <p>
                  <strong>Select</strong> — click an object, managed image, label, or layer-list
                  item
                </p>
                <p>
                  <strong>Pan</strong> — hold left mouse on empty map space and drag
                </p>
                <p>
                  <strong>Alternative pan</strong> — Space + drag, middle mouse, or trackpad scroll
                </p>
                <p>
                  <strong>Zoom</strong> — + / − keys, or Ctrl/⌘ + wheel
                </p>
                <p>
                  <strong>Fit</strong> — shows the complete map
                </p>
                <p>
                  <strong>Reset</strong> — returns to the default fitted view
                </p>
                <p>
                  <strong>Place</strong> — choose an asset, then Place at center
                </p>
                <p className="field-hint">Zoom and pan never mutate draft data or Undo history.</p>
              </div>
            ) : null}
          </div>
          <p className="world-editor-stage__note">
            Structured isometric data view — eligible active assets use protected processed media;
            every other object keeps an explained marker fallback. Viewing, selection, render modes,
            zooming, and panning do not mutate draft data.
          </p>
        </section>

        {inspectorCollapsed ? (
          <button
            aria-label="Show inspector panel"
            className="world-editor-rail world-editor-rail--inspector"
            onClick={() => setInspectorCollapsedPersist(false)}
            type="button"
          >
            Inspector
          </button>
        ) : (
          <aside
            className="world-editor-inspector world-editor-sidebar"
            aria-labelledby="inspector-title"
            data-editor-sidebar="inspector"
            data-scrollable-panel="inspector"
          >
            {inspectorPanel}
          </aside>
        )}
      </div>

      <section
        className={`world-validation-panel world-validation-panel--${validationTone} ${validationExpanded ? 'is-expanded' : 'is-collapsed'}`}
        aria-labelledby="validation-title"
        data-validation-panel="true"
        data-validation-expanded={validationExpanded ? 'true' : 'false'}
      >
        <div className="world-validation-panel__header">
          <div>
            <p className="eyebrow">Validation</p>
            <h2 id="validation-title">Draft status</h2>
          </div>
          <div className="world-validation-panel__chips">
            <span
              className={`state-chip ${issues.length === 0 ? 'state-chip--success' : 'state-chip--error'}`}
            >
              {issues.length === 0 ? 'Local schema clear' : `${issues.length} local issue(s)`}
            </span>
            {serverValidation === null ? (
              <span className="state-chip state-chip--pending">No trusted result yet</span>
            ) : (
              <>
                <span
                  className={`state-chip ${serverValidation.valid ? 'state-chip--success' : 'state-chip--error'}`}
                >
                  {serverValidation.valid ? 'Valid' : 'Invalid'}
                </span>
                <span className="state-chip">
                  {serverErrors.length} error{serverErrors.length === 1 ? '' : 's'}
                </span>
                <span className="state-chip">
                  {serverWarnings.length} warning{serverWarnings.length === 1 ? '' : 's'}
                </span>
              </>
            )}
            <button
              aria-expanded={validationExpanded}
              className="button button--quiet"
              onClick={() => setValidationExpandedPersist(!validationExpanded)}
              type="button"
            >
              {validationExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        {validationExpanded ? (
          <div className="world-validation-panel__body">
            <p className="world-validation-panel__summary">
              Browser checks guide fields immediately. Only the trusted server validator can mark a
              saved draft as validated for preview.
            </p>
            {issues.length > 0 ? (
              <ul className="validation-issues" role="alert">
                {issues.map((issue) => (
                  <li key={`local-${issue.path}-${issue.message}`}>
                    <code>{issue.path}</code>
                    <span>{issue.message}</span>
                    <button
                      className="button button--quiet validation-focus"
                      onClick={() => focusValidationTarget(issue.path)}
                      type="button"
                    >
                      Focus
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {serverValidation === null ? null : (
              <ul className="validation-issues">
                {[...serverErrors, ...serverWarnings].map((issue) => (
                  <li key={`${issue.code}-${issue.path}-${issue.message}`}>
                    <code>{issue.path || issue.code}</code>
                    <span>{issue.message}</span>
                    {issue.path ? (
                      <button
                        className="button button--quiet validation-focus"
                        onClick={() => focusValidationTarget(issue.path)}
                        type="button"
                      >
                        Focus
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {serverValidation?.valid === true && issues.length === 0 ? (
              <p className="world-validation-panel__ok" role="status">
                Trusted validation passed
                {preview.canPreview
                  ? ' · Draft Preview is available'
                  : preview.message
                    ? ` · ${preview.message}`
                    : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      {mobilePanel === 'none' ? null : (
        <div className="world-editor-drawer" data-mobile-panel={mobilePanel}>
          <button
            aria-label="Close panel"
            className="world-editor-drawer__backdrop"
            onClick={() => setMobilePanel('none')}
            type="button"
          />
          <div
            className="world-editor-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label={mobilePanel === 'assets' ? 'Assets and layers' : 'Property inspector'}
          >
            <div className="world-editor-drawer__header">
              <h2>{mobilePanel === 'assets' ? 'Assets & layers' : 'Inspector'}</h2>
              <button
                className="button button--quiet"
                onClick={() => setMobilePanel('none')}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="world-editor-drawer__body">
              {mobilePanel === 'assets' ? assetsPanel : inspectorPanel}
            </div>
          </div>
        </div>
      )}
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
      <p className="editor-selection-id" title={collision.id}>
        {humanizeKey(collision.id)}
      </p>
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
        />
        <span>Blocking</span>
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
        {exit.direction} · {humanizeKey(exit.id)}
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
        />
        <span>Enabled</span>
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
          className="editor-input"
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
          className="editor-input"
          disabled={!destinationEnabled}
          maxLength={64}
          onChange={(event) => onChange({ destinationSpawnId: event.currentTarget.value || null })}
          value={exit.destinationSpawnId ?? ''}
        />
      </EditorField>
      <EditorField label="Transition label">
        <input
          className="editor-input"
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
