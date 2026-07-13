'use client';

import {
  ASSET_CATEGORIES,
  ASSET_INTERACTION_COMPATIBILITIES,
  type AssetCategory,
  type AssetInteractionCompatibility,
} from '@starville/asset-management';
import { mapObjectKinds } from '@starville/game-core';
import Link from 'next/link';
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
  WorldDraftLoad,
  WorldValidationResult,
} from '../lib/worlds/contracts';
import type { WorldEditorAssetCandidate } from '../lib/world-assets/contracts';
import { availableAdminAssetMediaPath } from '../lib/world-assets/media';
import { objectKindAssetType } from '../lib/worlds/asset-replacement';
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
  exceedsPanDragThreshold,
  isWorldEditorGuideCompleted,
  readLocalBoolean,
  WORLD_EDITOR_STORAGE_KEYS,
  writeLocalBoolean,
  zoomPercentage,
} from '../lib/worlds/editor-usability';
import { EditorScrollRegion } from './editor-scroll-region';
import { PremiumSelect } from './premium-select';
import { WorldEditorGuide } from './world-editor-guide';
import { WorldAssetReplacementDialog } from './world-asset-replacement-dialog';
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
type AssetCategoryFilter = 'all' | AssetCategory;
type AssetInteractionFilter = 'all' | AssetInteractionCompatibility;
type AssetProductionFilter = 'approved' | 'development' | 'all';
type MobilePanel = 'none' | 'assets' | 'inspector';

interface WorldEditorProps {
  readonly draft: WorldDraftLoad;
  readonly approvedAssets: readonly WorldEditorAssetCandidate[];
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

function ToggleChip(props: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onToggle: () => void;
  readonly title?: string;
}) {
  return (
    <button
      aria-pressed={props.pressed}
      className={`world-editor-toggle ${props.pressed ? 'is-active' : ''}`}
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
  const [history, setHistory] = useState(() => createWorldEditorHistory(props.draft.manifest));
  const [lastSaved, setLastSaved] = useState(props.draft.manifest);
  const [selection, setSelection] = useState<WorldEditorSelection>();
  const [layer, setLayer] = useState<WorldEditorLayer>('objects');
  const [showGrid, setShowGrid] = useState(true);
  const [showCollisions, setShowCollisions] = useState(true);
  const [showSpawns, setShowSpawns] = useState(true);
  const [showExits, setShowExits] = useState(true);
  const [assetKey, setAssetKey] = useState(
    props.approvedAssets.find(({ asset }) => asset.assetType === 'building')?.assetKey ?? '',
  );
  const [objectKind, setObjectKind] = useState<MapObject['kind']>('building');
  const [assetSearch, setAssetSearch] = useState('');
  const [assetCategory, setAssetCategory] = useState<AssetCategoryFilter>('all');
  const [assetInteraction, setAssetInteraction] = useState<AssetInteractionFilter>('all');
  const [assetProduction, setAssetProduction] = useState<AssetProductionFilter>('approved');
  const showDevelopmentAssets = assetProduction !== 'approved';
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('none');
  const [layersCollapsed, setLayersCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [validationExpanded, setValidationExpanded] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1.45);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [canvasHelpOpen, setCanvasHelpOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [objectListSearch, setObjectListSearch] = useState('');
  const guideTriggerRef = useRef<HTMLButtonElement>(null);
  const panSession = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
    /** Left-button pan may start on an object; only pan after threshold. */
    allowWithoutThreshold: boolean;
  } | null>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const canvasTransformRef = useRef<HTMLDivElement>(null);
  const canvasZoomRef = useRef(canvasZoom);
  const canvasPanRef = useRef(canvasPan);
  const spaceHeldRef = useRef(false);
  const panFrameRef = useRef(0);
  /** Suppress the click-select that follows a completed pan gesture. */
  const suppressNextSelectRef = useRef(false);
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
  const issues = useMemo(() => browserManifestIssues(manifest), [manifest]);
  const dirty = manifestHasUnsavedChanges(manifest, lastSaved);
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
    };
  }, [dirty, mobilePanel, canvasHelpOpen, guideOpen, scheduleFitCanvas, commitPan]);

  function commit(next: AdminWorldManifest): void {
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
    setMobilePanel('inspector');
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
    appendBaseFields(formData, props, editVersion, checksum, validationId);
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
        .map((item) => ({
          id: item.id,
          label: humanizeKey(item.id),
          detail: item.kind.replace(/_/gu, ' '),
          title: `${item.id} · ${item.assetId}`,
        }))
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
            <button
              className="button button--secondary"
              disabled={assetKey === ''}
              onClick={placeObject}
              type="button"
            >
              Place selected asset at center
            </button>
          </div>
        ) : null}
        {layer === 'collisions' ? (
          <div className="editor-create-buttons" aria-label="Create collision footprint">
            <button
              className="button button--quiet"
              onClick={() => addCollision('rectangle')}
              type="button"
            >
              + Rectangle
            </button>
            <button
              className="button button--quiet"
              onClick={() => addCollision('circle')}
              type="button"
            >
              + Circle
            </button>
            <button
              className="button button--quiet"
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
          <ul className="editor-entity-list">
            {layerItems().map((item) => {
              const target = selectionFor(item.id);
              const pressed =
                target !== undefined &&
                selection?.layer === target.layer &&
                selection.id === target.id;
              return (
                <li key={item.id}>
                  <button
                    aria-pressed={pressed}
                    className={pressed ? 'is-selected' : ''}
                    onClick={() => {
                      setSelection(target);
                      setMobilePanel('inspector');
                      setInspectorCollapsedPersist(false);
                    }}
                    title={item.title}
                    type="button"
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
          <InspectorSection title="Identity">
            <div className="editor-field world-editor-current-asset">
              <span className="editor-field__label">Current visual asset</span>
              <strong>{humanizeKey(selectedObject.assetId)}</strong>
              <code>{selectedObject.assetId}</code>
            </div>
            <WorldAssetReplacementDialog
              candidates={approvedAssets}
              lifecycleStatus={props.draft.version.lifecycleStatus}
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
            <NumberEditor
              label="Scale"
              max={4}
              min={0.1}
              onCommit={(value) => updateObject(selectedObject.id, { scale: value })}
              value={selectedObject.scale}
            />
          </InspectorSection>
          <button className="button button--danger" onClick={removeSelected} type="button">
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
              Version {props.draft.version.versionNumber} · revision {editVersion} · {manifest.name}
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
            className="button button--primary"
            disabled={pending || issues.length > 0 || !dirty}
            onClick={saveDraft}
            title="Save Draft stores edits without changing the live world"
            type="button"
          >
            {pending && operation === 'save' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            className="button button--secondary"
            disabled={pending || dirty || issues.length > 0}
            onClick={validateDraft}
            title="Validate Draft runs trusted checks on the current saved revision"
            type="button"
          >
            {pending && operation === 'validate' ? 'Validating…' : 'Validate draft'}
          </button>
          {preview.canPreview ? (
            <Link
              className="button button--secondary"
              href={`/worlds/${props.draft.map.id}/preview?version=${props.draft.version.id}`}
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
        </div>

        <div className="world-editor-toolbar__toggles" aria-label="Editor view toggles">
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
            onLostPointerCapture={() => {
              if (panSession.current !== null) {
                commitPan(canvasPanRef.current);
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
              // Primary: left-drag empty canvas. Also middle button, Space+left, Shift/Alt modifiers.
              const isLeft = event.button === 0;
              const isMiddle = event.button === 1;
              const forcePan =
                isMiddle ||
                spaceHeldRef.current ||
                event.shiftKey ||
                event.altKey ||
                event.buttons === 4;
              if (!isLeft && !isMiddle) return;

              const onObject =
                target instanceof Element &&
                Boolean(
                  target.closest(
                    '.world-canvas__object, .world-canvas__exits, .world-canvas__collisions, .world-canvas__spawns',
                  ),
                );
              // Left-drag on empty space pans immediately after threshold; Space/middle always pan.
              if (isLeft && onObject && !forcePan) {
                // Still track the press so a drag can convert into pan and suppress accidental selection.
                panSession.current = {
                  pointerId: event.pointerId,
                  originX: event.clientX,
                  originY: event.clientY,
                  startPanX: canvasPanRef.current.x,
                  startPanY: canvasPanRef.current.y,
                  moved: false,
                  allowWithoutThreshold: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                return;
              }

              event.preventDefault();
              panSession.current = {
                pointerId: event.pointerId,
                originX: event.clientX,
                originY: event.clientY,
                startPanX: canvasPanRef.current.x,
                startPanY: canvasPanRef.current.y,
                moved: false,
                allowWithoutThreshold: forcePan,
              };
              setIsPanning(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const session = panSession.current;
              if (session === null || session.pointerId !== event.pointerId) return;
              const dx = event.clientX - session.originX;
              const dy = event.clientY - session.originY;
              const pastThreshold =
                session.allowWithoutThreshold || exceedsPanDragThreshold(dx, dy);
              if (!pastThreshold) return;
              if (!session.moved) {
                session.moved = true;
                userAdjustedView.current = true;
                setIsPanning(true);
              }
              event.preventDefault();
              scheduleLivePan({
                x: session.startPanX + dx,
                y: session.startPanY + dy,
              });
            }}
            onPointerUp={(event) => {
              if (panSession.current?.pointerId !== event.pointerId) return;
              const session = panSession.current;
              panSession.current = null;
              setIsPanning(false);
              if (session.moved) {
                suppressNextSelectRef.current = true;
                commitPan(canvasPanRef.current);
                event.preventDefault();
              }
            }}
            onPointerCancel={() => {
              if (panSession.current !== null) {
                if (panSession.current.moved) suppressNextSelectRef.current = true;
                commitPan(canvasPanRef.current);
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
                className="world-editor-stage__canvas"
                emphasisObjectIds={selection?.layer === 'objects' ? [selection.id] : []}
                manifest={manifest}
                onSelect={(target) => {
                  if (panSession.current?.moved || suppressNextSelectRef.current) {
                    suppressNextSelectRef.current = false;
                    return;
                  }
                  setLayer(target.layer);
                  setSelection(target);
                  setMobilePanel('inspector');
                  setInspectorCollapsedPersist(false);
                }}
                {...(selection === undefined ? {} : { selection })}
                showCollisions={showCollisions}
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
                  <strong>Select</strong> — click a marker
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
            Structured isometric data view — terrain, objects, Phase 7 markers, collisions, spawns,
            and exits. Viewing, zooming, and panning do not mutate draft data.
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
