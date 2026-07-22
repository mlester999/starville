import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cropStageAssetKey, farmPlotAssetKey } from '@starville/asset-management';
import type { PrivateHomeRealtimeEvent } from '@starville/cozy-gameplay';
import type { WorldInteraction } from '@starville/game-core';

import {
  bootstrapCozyGameplay,
  acceptStarterFarmingQuest,
  changeHomeAccess,
  collectWorkstationJob,
  deliverStarterFarmingQuest,
  loadCozyInventory,
  loadDustLedger,
  loadFarmPlots,
  loadItemCatalog,
  loadPlayerHome,
  loadPlayableVerticalSlice,
  loadWorkstationWorkspace,
  mutateFarm,
  mutateHomeFarm,
  startWorkstationJob,
  acceptWorkstationTutorial,
  turnInWorkstationTutorial,
  updateQuickbar,
  type CozyBootstrap,
  type FarmPlot,
  type FarmView,
  type HomeView,
  type ItemCatalog,
  type PlayableVerticalSlice,
  type CraftingJob,
  type WorkstationWorkspace,
} from '../app/cozy-gameplay-client';
import { PlayerRequestError } from '../app/player-client';
import {
  acceptGeneralStoreTutorial,
  loadGeneralStore,
  loadGeneralStoreEvents,
  loadGeneralStoreReceipt,
  loadPlayerEconomy,
  transactGeneralStore,
  turnInGeneralStoreTutorial,
  type GeneralStoreWorkspace,
  type PlayerEconomyView,
} from '../app/economy-client';
import { isTextEntryElement } from '../game/input/focus';
import { usePrivateHomeRealtime } from '../app/use-private-home-realtime';
import { DustHistoryPanel } from './EconomyPanels';
import { GeneralStorePanel } from './GeneralStorePanel';
import { HousingWorkspacePanel } from './HousingWorkspacePanel';
import { BundledAssetImage } from './BundledAssetImage';
import { GameModalPortal } from './game-ui';

type CozyInteraction = Exclude<WorldInteraction, { readonly type: 'notice' }>;
type CozyPanel =
  'inventory' | 'dust' | 'farm' | 'shop' | 'cooking' | 'crafting' | 'home' | 'starter_quest';

interface CozyGameplayProps {
  readonly apiUrl: string;
  readonly realtimeUrl?: string | undefined;
  readonly interaction: CozyInteraction | null;
  readonly onInteractionClose: () => void;
  readonly onAccessInvalid: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly externalInventoryRequest?: number;
  readonly externalDustRequest?: number;
  readonly externalDustRefreshRequest?: number;
  readonly showStandaloneHud?: boolean;
  readonly portalPanels?: boolean;
  readonly onDustBalanceChange?: (balance: number) => void;
  readonly onDustLoadState?: (state: 'loading' | 'ready' | 'unavailable') => void;
  readonly onAuthoritativeMutation?: () => void;
  readonly onHomeAccessChange?: (
    location: 'public_world' | 'personal_home',
    view: PlayableVerticalSlice,
  ) => void;
}

interface CozyState {
  readonly bootstrap: CozyBootstrap;
  readonly farm: FarmView;
  readonly items: ItemCatalog;
  readonly home: HomeView;
  readonly verticalSlice: PlayableVerticalSlice;
}

const friendlyErrors: Readonly<Record<string, string>> = {
  COZY_GAMEPLAY_UNAVAILABLE: 'The village ledger is temporarily unavailable.',
  GAMEPLAY_STATE_CONFLICT:
    'Your inventory changed in another session. The latest inventory has been loaded.',
  INSUFFICIENT_DUST: 'You do not have enough DUST for that purchase.',
  INVENTORY_FULL: 'Your inventory is full.',
  ITEM_UNAVAILABLE: 'That item cannot be used that way right now.',
  PLOT_OCCUPIED: 'That plot is already planted.',
  PLOT_NOT_READY: 'That crop is not ready yet.',
  PLOT_DOES_NOT_NEED_WATER: 'That plot does not need water.',
  RECIPE_UNAVAILABLE: 'That recipe is not available at this station.',
  MISSING_INGREDIENTS: 'You do not have all required ingredients.',
  SHOP_OFFER_UNAVAILABLE: 'That shop offer is no longer available.',
  ECONOMY_SHOP_UNAVAILABLE: 'This offer is no longer available. The shop has been refreshed.',
  ECONOMY_SHOP_CHANGED: 'This offer changed. Review the refreshed price and try again.',
  ECONOMY_ITEM_PROTECTED: 'That item is not eligible for an ordinary shop purchase.',
  ECONOMY_DAILY_LIMIT: 'You reached today’s purchase limit for that item.',
  ECONOMY_COOLDOWN: 'That item is available again after a short cooldown.',
  ECONOMY_MAINTENANCE: 'The Village Supply Shop is temporarily closed.',
  ECONOMY_UNAVAILABLE: 'The Village Supply Shop is temporarily unavailable.',
  INVALID_ECONOMY_QUANTITY: 'Choose a quantity within the approved offer limit.',
  REQUEST_ALREADY_PROCESSED: 'That purchase request changed. Close it and review the offer again.',
  RATE_LIMITED: 'The village counter is busy. Please wait a moment and try again.',
  INVALID_FURNITURE_PLACEMENT: 'Furniture cannot be placed on that cell.',
  HOME_ACCESS_DENIED: 'Your private home could not be opened from here.',
  PLOT_PROVISIONING_FAILED: 'Your home plot could not be prepared yet. Please try again shortly.',
  PLOT_WORLD_MISMATCH: 'Enter your private home plot before farming.',
  FARMING_SYSTEM_DISABLED: 'Home-plot farming is temporarily paused.',
  FARMING_TILE_NOT_ELIGIBLE: 'That garden tile cannot use the selected action.',
  FARMING_TILE_CONFLICT: 'That garden tile changed. Its latest state has been loaded.',
  TOOL_NOT_OWNED: 'The required starter tool is not in your inventory.',
  TOOL_ACTION_TOO_FAR: 'Move closer to the target and try again.',
  TOOL_ACTION_COOLDOWN: 'Give that action a moment before trying again.',
  SEED_NOT_OWNED: 'You do not have that seed in your inventory.',
  CROP_NOT_WATERABLE: 'That crop is already watered or cannot be watered now.',
  CROP_NOT_MATURE: 'That crop needs more server time before harvest.',
  QUEST_OBJECTIVE_INCOMPLETE: 'Finish the remaining tutorial steps before delivery.',
  TUTORIAL_DELIVERY_INSUFFICIENT: 'Harvest enough Moonbeans before making the delivery.',
  ECONOMY_SETTLEMENT_FAILED:
    'The delivery was not consumed. Reward settlement can be retried safely.',
  WORKSTATION_UNAVAILABLE: 'This home workstation is temporarily unavailable.',
  WORKSTATION_NOT_FOUND: 'That workstation is no longer part of this home.',
  WORKSTATION_DISABLED: 'New jobs are paused here. Existing ready jobs remain collectable.',
  WORKSTATION_WORLD_MISMATCH: 'Enter your private home before using its workstation.',
  WORKSTATION_TOO_FAR: 'Move closer to the workstation and try again.',
  RECIPE_NOT_UNLOCKED: 'Complete the tutorial step that unlocks this recipe.',
  RECIPE_BATCH_INVALID: 'Choose a smaller recipe quantity.',
  CRAFTING_QUEUE_FULL: 'This queue is full. Collect a ready job before starting another.',
  INVENTORY_STATE_CONFLICT: 'Your inventory changed. The workstation has been refreshed.',
  CRAFTING_JOB_NOT_READY: 'This job is still running according to server time.',
  CRAFTING_JOB_CONFLICT: 'This job changed elsewhere. The workstation has been refreshed.',
  CRAFTING_JOB_ALREADY_COLLECTED: 'This output was already collected.',
  COLLECTION_DISABLED: 'Job collection is temporarily paused.',
};

/** Authoritative quickbar eligibility matches update_player_quickbar in Phase 7 SQL. */
const QUICKBAR_ELIGIBLE_CATEGORIES = new Set(['seed', 'permanent_tool'] as const);

function isQuickbarEligible(category: string): boolean {
  return QUICKBAR_ELIGIBLE_CATEGORIES.has(category as 'seed' | 'permanent_tool');
}

function categoryLabel(category: string): string {
  switch (category) {
    case 'permanent_tool':
      return 'Permanent tool';
    case 'seed':
      return 'Seed';
    case 'crop':
      return 'Crop';
    case 'ingredient':
      return 'Ingredient';
    case 'cooked_food':
      return 'Cooked food';
    case 'crafted_material':
      return 'Crafted material';
    case 'furniture':
      return 'Furniture';
    case 'special':
      return 'Special item';
    default:
      return category.replaceAll('_', ' ');
  }
}

function quickbarIneligibleReason(category: string): string {
  if (category === 'furniture') {
    return 'Furniture is placed from inside your home and cannot be assigned to the quickbar.';
  }
  return 'Only permanent tools and seeds can be assigned to the quickbar.';
}

function panelFor(interaction: CozyInteraction): CozyPanel {
  if (interaction.type === 'starter_npc') return 'starter_quest';
  if (interaction.type === 'home_farm_tile') return 'home';
  if (interaction.type === 'farm_plot') return 'farm';
  if (interaction.type === 'shop') return 'shop';
  if (interaction.type === 'cooking_station') return 'cooking';
  if (interaction.type === 'crafting_station') return 'crafting';
  return 'home';
}

function itemName(items: ItemCatalog | undefined, slug: string): string {
  return items?.items.find((item) => item.slug === slug)?.name ?? slug.replaceAll('-', ' ');
}

function itemAssetRef(items: ItemCatalog | undefined, slug: string | null): string | null {
  if (slug === null) return null;
  return items?.items.find((item) => item.slug === slug)?.assetRef ?? null;
}

function legacyCropStageAssetKey(plot: FarmPlot): string | null {
  if (plot.cropSlug === null) return null;
  const stageCount = plot.cropSlug === 'cloudberry' ? 5 : 4;
  const growthStage = Math.max(
    1,
    Math.min(stageCount, Math.ceil(plot.growthProgress * stageCount)),
  );
  return cropStageAssetKey(
    plot.cropSlug,
    growthStage,
    stageCount,
    plot.state === 'ready_to_harvest',
  );
}

function workstationVisualKey(workspace: WorkstationWorkspace): string | null {
  const prefix =
    workspace.workstation.definition.type === 'cooking_hearth'
      ? 'world.station.cooking-hearth'
      : 'world.station.crafting-workbench';
  if (workspace.workstation.queue.ready > 0) return `${prefix}.ready`;
  if (workspace.workstation.queue.running > 0) return `${prefix}.active`;
  return workspace.workstation.definition.assetRef;
}

function requestFailure(error: unknown): { readonly message: string } {
  if (error instanceof PlayerRequestError) {
    return {
      message:
        friendlyErrors[error.code] ??
        'That village action could not be completed. Please try again.',
    };
  }
  return { message: 'That village action could not be completed. Please try again.' };
}

function plotAction(plot: FarmPlot): 'plant' | 'water' | 'harvest' | null {
  if (plot.state === 'empty') return 'plant';
  if (plot.state === 'planted' || plot.state === 'needs_water') return 'water';
  if (plot.state === 'ready_to_harvest') return 'harvest';
  return null;
}

export function CozyGameplay({
  apiUrl,
  realtimeUrl,
  interaction,
  onInteractionClose,
  onAccessInvalid,
  onOpenChange,
  externalInventoryRequest = 0,
  externalDustRequest = 0,
  externalDustRefreshRequest = 0,
  showStandaloneHud = true,
  portalPanels = false,
  onDustBalanceChange,
  onDustLoadState,
  onAuthoritativeMutation,
  onHomeAccessChange,
}: CozyGameplayProps) {
  const [state, setState] = useState<CozyState>();
  const [dustLoadState, setDustLoadState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  const [dustHudBalance, setDustHudBalance] = useState<number>();
  const [panel, setPanel] = useState<CozyPanel | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [selectedFarmingItem, setSelectedFarmingItem] = useState<
    'starter-hoe' | 'starter-watering-can' | 'moonbean-seed' | null
  >(null);
  const [workstationWorkspace, setWorkstationWorkspace] = useState<WorkstationWorkspace>();
  const [generalStore, setGeneralStore] = useState<GeneralStoreWorkspace>();
  const [economyHistory, setEconomyHistory] = useState<PlayerEconomyView>();
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>();
  const [error, setError] = useState<{ readonly message: string }>();
  const [status, setStatus] = useState<{ readonly title: string; readonly detail: string }>();
  const [workstationReadyNotice, setWorkstationReadyNotice] = useState<string>();
  const operationLockRef = useRef(false);
  const generalStoreEventNumberRef = useRef(0);
  const reportedHomeLocationRef = useRef<'public_world' | 'personal_home' | undefined>(undefined);
  const announcedReadyEventRef = useRef<string | undefined>(undefined);
  const activeWorkstationIdRef = useRef<string | undefined>(undefined);
  const reconcilePrivateHomeSnapshot = useCallback(
    (view: PlayableVerticalSlice, events: readonly PrivateHomeRealtimeEvent[]) => {
      setState((current) =>
        current === undefined
          ? current
          : {
              ...current,
              bootstrap: {
                ...current.bootstrap,
                inventory: view.inventory,
                quickbar: view.quickbar,
              },
              verticalSlice: view,
            },
      );
      const readyEvent = [...events]
        .reverse()
        .find((event) => event.eventKey === 'crafting_job_ready');
      if (readyEvent === undefined || readyEvent.id === announcedReadyEventRef.current) return;
      announcedReadyEventRef.current = readyEvent.id;
      const recipeKey = readyEvent.payload['recipeKey'];
      const recipeName =
        typeof recipeKey === 'string'
          ? recipeKey
              .split('-')
              .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
              .join(' ')
          : 'Your workstation job';
      setWorkstationReadyNotice(`${recipeName} is ready to collect at your home workstation.`);

      const workstationInstanceId = readyEvent.payload['workstationInstanceId'];
      if (
        typeof workstationInstanceId === 'string' &&
        workstationInstanceId === activeWorkstationIdRef.current
      ) {
        void loadWorkstationWorkspace(apiUrl, workstationInstanceId)
          .then(setWorkstationWorkspace)
          .catch(() => undefined);
      }
    },
    [apiUrl],
  );
  const privateHomeRealtime = usePrivateHomeRealtime({
    apiUrl,
    realtimeUrl,
    homeId: state?.verticalSlice.plot.id,
    enabled: state?.verticalSlice.plot.location === 'personal_home',
    onSnapshot: reconcilePrivateHomeSnapshot,
    onAccessInvalid,
  });

  useEffect(() => {
    activeWorkstationIdRef.current = workstationWorkspace?.workstation.id;
  }, [workstationWorkspace?.workstation.id]);

  useEffect(() => {
    if (workstationReadyNotice === undefined) return;
    const timer = window.setTimeout(() => setWorkstationReadyNotice(undefined), 8_000);
    return () => window.clearTimeout(timer);
  }, [workstationReadyNotice]);

  const loadFoundation = useCallback(async () => {
    setDustLoadState('loading');
    let bootstrap: CozyBootstrap;
    try {
      bootstrap = await bootstrapCozyGameplay(apiUrl);
    } catch (cause) {
      setDustLoadState('unavailable');
      throw cause;
    }
    setDustHudBalance(bootstrap.dust.balance);
    setDustLoadState('ready');
    const [inventory, farm, items, home, verticalSlice] = await Promise.all([
      loadCozyInventory(apiUrl),
      loadFarmPlots(apiUrl),
      loadItemCatalog(apiUrl),
      loadPlayerHome(apiUrl),
      loadPlayableVerticalSlice(apiUrl),
    ]);
    setState({
      bootstrap: { ...bootstrap, inventory: inventory.inventory, quickbar: inventory.quickbar },
      farm,
      items,
      home,
      verticalSlice,
    });
  }, [apiUrl]);

  const refreshDustBalance = useCallback(async () => {
    setDustLoadState('loading');
    try {
      const dust = await loadDustLedger(apiUrl);
      setDustHudBalance(dust.account.balance);
      setState((current) =>
        current === undefined
          ? current
          : {
              ...current,
              bootstrap: { ...current.bootstrap, dust: dust.account },
            },
      );
      setDustLoadState('ready');
    } catch (cause) {
      setDustLoadState('unavailable');
      throw cause;
    }
  }, [apiUrl]);

  const refreshMutableState = useCallback(async () => {
    const [inventory, dust, farm, home, verticalSlice] = await Promise.all([
      loadCozyInventory(apiUrl),
      loadDustLedger(apiUrl),
      loadFarmPlots(apiUrl),
      loadPlayerHome(apiUrl),
      loadPlayableVerticalSlice(apiUrl),
    ]);
    setState((current) =>
      current === undefined
        ? current
        : {
            ...current,
            bootstrap: {
              ...current.bootstrap,
              dust: dust.account,
              inventory: inventory.inventory,
              quickbar: inventory.quickbar,
            },
            farm,
            home,
            verticalSlice,
          },
    );
  }, [apiUrl]);

  const setErrorFromCause = useCallback(
    (cause: unknown) => {
      if (cause instanceof PlayerRequestError && cause.status === 401) onAccessInvalid();
      else setError(requestFailure(cause));
    },
    [onAccessInvalid],
  );

  useEffect(() => {
    let active = true;
    void loadFoundation().catch((cause: unknown) => {
      if (!active) return;
      if (cause instanceof PlayerRequestError && cause.status === 401) onAccessInvalid();
      else setError(requestFailure(cause));
    });
    return () => {
      active = false;
    };
  }, [loadFoundation, onAccessInvalid]);

  useEffect(() => {
    function reconcileWhenVisible() {
      if (document.visibilityState !== 'visible' || busy || state === undefined) return;
      void refreshMutableState().catch(setErrorFromCause);
    }
    window.addEventListener('focus', reconcileWhenVisible);
    document.addEventListener('visibilitychange', reconcileWhenVisible);
    return () => {
      window.removeEventListener('focus', reconcileWhenVisible);
      document.removeEventListener('visibilitychange', reconcileWhenVisible);
    };
  }, [busy, refreshMutableState, setErrorFromCause, state]);

  useEffect(() => {
    if (interaction === null) return;
    setPanel(panelFor(interaction));
    setError(undefined);
    setStatus(undefined);
  }, [interaction]);

  useEffect(() => onOpenChange(panel !== null), [onOpenChange, panel]);

  const authoritativeDustBalance = state?.bootstrap.dust.balance;
  useEffect(() => {
    if (authoritativeDustBalance !== undefined) setDustHudBalance(authoritativeDustBalance);
  }, [authoritativeDustBalance]);

  useEffect(() => {
    if (dustHudBalance !== undefined) onDustBalanceChange?.(dustHudBalance);
  }, [dustHudBalance, onDustBalanceChange]);

  useEffect(() => onDustLoadState?.(dustLoadState), [dustLoadState, onDustLoadState]);

  useEffect(() => {
    if (state === undefined || onHomeAccessChange === undefined) return;
    const location =
      state.verticalSlice.plot.location === 'personal_home' ? 'personal_home' : 'public_world';
    if (reportedHomeLocationRef.current === location) return;
    reportedHomeLocationRef.current = location;
    onHomeAccessChange(location, state.verticalSlice);
  }, [onHomeAccessChange, state]);

  useEffect(() => {
    if (externalInventoryRequest <= 0) return;
    setPanel('inventory');
    setError(undefined);
    setStatus(undefined);
  }, [externalInventoryRequest]);

  useEffect(() => {
    if (externalDustRequest <= 0) return;
    setPanel('dust');
    setError(undefined);
    setStatus(undefined);
  }, [externalDustRequest]);

  useEffect(() => {
    if (externalDustRefreshRequest <= 0) return;
    void refreshDustBalance().catch(setErrorFromCause);
  }, [externalDustRefreshRequest, refreshDustBalance, setErrorFromCause]);

  useEffect(() => {
    if (panel !== 'cooking' && panel !== 'crafting') return;
    setWorkstationWorkspace(undefined);
    if (interaction?.type !== 'cooking_station' && interaction?.type !== 'crafting_station') return;
    if (interaction.workstationInstanceId === undefined) return;
    void loadWorkstationWorkspace(apiUrl, interaction.workstationInstanceId)
      .then(setWorkstationWorkspace)
      .catch(setErrorFromCause);
  }, [apiUrl, interaction, panel, setErrorFromCause]);

  useEffect(() => {
    if (panel !== 'shop' || interaction?.type !== 'shop') return;
    setGeneralStore(undefined);
    void loadGeneralStore(apiUrl, interaction.id)
      .then((workspace) => {
        generalStoreEventNumberRef.current = workspace.lastEventNumber;
        setGeneralStore(workspace);
      })
      .catch(setErrorFromCause);
  }, [apiUrl, interaction, panel, setErrorFromCause]);

  useEffect(() => {
    if (panel !== 'shop' || interaction?.type !== 'shop') return;
    let cancelled = false;
    let polling = false;
    const poll = async () => {
      if (polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const page = await loadGeneralStoreEvents(
          apiUrl,
          interaction.id,
          generalStoreEventNumberRef.current,
        );
        generalStoreEventNumberRef.current = page.lastEventNumber;
        if (page.requiresRehydrate && !cancelled) {
          const workspace = await loadGeneralStore(apiUrl, interaction.id);
          generalStoreEventNumberRef.current = Math.max(
            generalStoreEventNumberRef.current,
            workspace.lastEventNumber,
          );
          if (!cancelled) setGeneralStore(workspace);
        }
      } catch {
        // The next bounded poll or a normal transaction refresh rehydrates safely.
      } finally {
        polling = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiUrl, interaction, panel]);

  useEffect(() => {
    if (panel !== 'dust') return;
    setEconomyHistory(undefined);
    setHistoryLoadingMore(false);
    void loadPlayerEconomy(apiUrl).then(setEconomyHistory).catch(setErrorFromCause);
  }, [apiUrl, panel, setErrorFromCause]);

  useEffect(() => {
    function selectQuickbar(event: KeyboardEvent) {
      if (panel !== null || isTextEntryElement(document.activeElement)) return;
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 8) setSelectedSlot(slot);
      if (event.key === '1') setSelectedFarmingItem('starter-hoe');
      if (event.key === '2') setSelectedFarmingItem('starter-watering-can');
      if (event.key === '3') setSelectedFarmingItem('moonbean-seed');
      if (event.key === '0') setSelectedFarmingItem(null);
    }
    window.addEventListener('keydown', selectQuickbar);
    return () => window.removeEventListener('keydown', selectQuickbar);
  }, [panel]);

  const perform = useCallback(
    async (
      operation: () => Promise<unknown>,
      success: { readonly title: string; readonly detail: string },
      loadingLabel?: string,
    ) => {
      if (operationLockRef.current) return;
      operationLockRef.current = true;
      setBusy(true);
      setBusyLabel(loadingLabel);
      setError(undefined);
      setStatus(undefined);
      try {
        await operation();
        await refreshMutableState();
        setStatus(success);
        onAuthoritativeMutation?.();
      } catch (cause) {
        if (cause instanceof PlayerRequestError && cause.code === 'GAMEPLAY_STATE_CONFLICT') {
          await refreshMutableState().catch(() => undefined);
        }
        setErrorFromCause(cause);
      } finally {
        operationLockRef.current = false;
        setBusy(false);
        setBusyLabel(undefined);
      }
    },
    [onAuthoritativeMutation, refreshMutableState, setErrorFromCause],
  );

  function closePanel() {
    setPanel(null);
    setError(undefined);
    setStatus(undefined);
    if (interaction !== null) onInteractionClose();
  }

  async function loadEarlierEconomyHistory() {
    if (economyHistory === undefined || economyHistory.nextCursor === null || historyLoadingMore) {
      return;
    }
    setHistoryLoadingMore(true);
    try {
      const page = await loadPlayerEconomy(apiUrl, economyHistory.nextCursor);
      setEconomyHistory((current) => {
        if (current === undefined) return page;
        const entries = new Map(
          [...current.history, ...page.history].map((entry) => [entry.publicReceiptId, entry]),
        );
        return { ...page, history: [...entries.values()] };
      });
    } catch (cause) {
      setErrorFromCause(cause);
    } finally {
      setHistoryLoadingMore(false);
    }
  }

  const targetPlots = useMemo(() => {
    if (state === undefined) return [];
    if (interaction?.type !== 'farm_plot') return state.farm.plots;
    const matches = state.farm.plots.filter(
      (plot) => plot.slot === interaction.slot || plot.anchorId === interaction.farmPlotKey,
    );
    return matches.length === 0 ? state.farm.plots : matches;
  }, [interaction, state]);

  const seedStack = state?.bootstrap.inventory.stacks.find(
    (stack) => stack.item.category === 'seed',
  );
  const starterQuestActive = state?.verticalSlice.quest.status === 'active';

  const performVerticalSlice = useCallback(
    async (
      operation: () => Promise<{
        readonly view: PlayableVerticalSlice;
        readonly announcement: string;
      }>,
      loadingLabel: string,
    ) => {
      if (operationLockRef.current) return;
      operationLockRef.current = true;
      setBusy(true);
      setBusyLabel(loadingLabel);
      setError(undefined);
      setStatus(undefined);
      try {
        const result = await operation();
        setState((current) =>
          current === undefined ? current : { ...current, verticalSlice: result.view },
        );
        await refreshMutableState();
        setStatus({ title: 'Progress saved', detail: result.announcement });
        onAuthoritativeMutation?.();
      } catch (cause) {
        if (
          cause instanceof PlayerRequestError &&
          ['GAMEPLAY_STATE_CONFLICT', 'FARMING_TILE_CONFLICT', 'CROP_STATE_CONFLICT'].includes(
            cause.code,
          )
        ) {
          await refreshMutableState().catch(() => undefined);
        }
        setErrorFromCause(cause);
      } finally {
        operationLockRef.current = false;
        setBusy(false);
        setBusyLabel(undefined);
      }
    },
    [onAuthoritativeMutation, refreshMutableState, setErrorFromCause],
  );

  return (
    <>
      {workstationReadyNotice === undefined ? null : (
        <aside className="game-soft-status" role="status" aria-live="polite" aria-atomic="true">
          {workstationReadyNotice}
        </aside>
      )}

      {showStandaloneHud ? (
        <aside className="cozy-hud" aria-label="Cozy game status">
          <div>
            <span>DUST</span>
            <strong aria-live="polite">
              {state?.bootstrap.dust.balance.toLocaleString() ?? '—'} DUST
            </strong>
          </div>
          <button type="button" onClick={() => setPanel('inventory')}>
            Inventory
          </button>
        </aside>
      ) : null}

      <div className="cozy-quickbar" role="toolbar" aria-label="Quickbar">
        {(
          state?.bootstrap.quickbar.assignments ??
          Array.from({ length: 8 }, (_, index) => ({
            slot: index + 1,
            inventoryStackId: null,
            assignedItemSlug: null,
          }))
        ).map((assignment) => (
          <button
            key={assignment.slot}
            className={
              assignment.slot === selectedSlot ? 'cozy-quickbar__slot--selected' : undefined
            }
            type="button"
            aria-label={`Quickbar Slot ${assignment.slot}${assignment.assignedItemSlug === null ? ', empty' : `, ${itemName(state?.items, assignment.assignedItemSlug)}`}`}
            aria-keyshortcuts={String(assignment.slot)}
            onClick={() => setSelectedSlot(assignment.slot)}
          >
            <kbd>{assignment.slot}</kbd>
            {assignment.assignedItemSlug === null ? null : (
              <BundledAssetImage
                assetKey={itemAssetRef(state?.items, assignment.assignedItemSlug)}
                alt=""
                className="cozy-quickbar__art"
              />
            )}
            <span>
              {assignment.assignedItemSlug === null
                ? 'Empty'
                : itemName(state?.items, assignment.assignedItemSlug)}
            </span>
          </button>
        ))}
      </div>

      {starterQuestActive ? (
        <aside className="cozy-farming-hud" aria-label="Starter farming tools">
          <div className="cozy-farming-hotbar" role="toolbar" aria-label="Farming hotbar">
            {(
              [
                ['starter-hoe', 'Hoe', '1'],
                ['starter-watering-can', 'Watering can', '2'],
                ['moonbean-seed', 'Moonbean seed', '3'],
              ] as const
            ).map(([slug, label, shortcut]) => {
              const stack = state?.bootstrap.inventory.stacks.find(
                (candidate) => candidate.item.slug === slug,
              );
              return (
                <button
                  key={slug}
                  type="button"
                  aria-keyshortcuts={shortcut}
                  aria-pressed={selectedFarmingItem === slug}
                  disabled={stack === undefined}
                  className={selectedFarmingItem === slug ? 'is-selected' : undefined}
                  onClick={() => setSelectedFarmingItem(slug)}
                >
                  <BundledAssetImage
                    assetKey={stack?.item.assetRef}
                    alt=""
                    className="cozy-farming-hotbar__art"
                  />
                  <kbd>{shortcut}</kbd>
                  <span>{label}</span>
                  {slug === 'moonbean-seed' ? <small>{stack?.quantity ?? 0}</small> : null}
                </button>
              );
            })}
            <button
              type="button"
              aria-keyshortcuts="0"
              aria-pressed={selectedFarmingItem === null}
              onClick={() => setSelectedFarmingItem(null)}
            >
              <kbd>0</kbd>
              <span>Clear</span>
            </button>
          </div>
          <p aria-live="polite">
            Selected:{' '}
            {selectedFarmingItem === null ? 'none' : itemName(state?.items, selectedFarmingItem)}
          </p>
        </aside>
      ) : null}

      {state === undefined ? null : (
        <aside className="cozy-quest-tracker" aria-label="Starter quest progress">
          <button type="button" onClick={() => setPanel('starter_quest')}>
            <strong>{state.verticalSlice.quest.name}</strong>
            <span>
              {state.verticalSlice.quest.status === 'reward_claimed'
                ? 'Complete'
                : `${state.verticalSlice.quest.objectives.filter((objective) => objective.completed).length} / 9 steps`}
            </span>
          </button>
        </aside>
      )}

      {panel === null ? null : (
        <GameModalPortal portal={portalPanels} onClose={closePanel}>
          <div className="world-overlay cozy-overlay" role="presentation">
            <section
              className="cozy-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cozy-panel-title"
            >
              <header className="cozy-panel__header">
                <div>
                  <p className="game-kicker">
                    {panel === 'shop'
                      ? 'Village shopping'
                      : panel === 'dust'
                        ? 'Your DUST journal'
                        : 'Your village bag'}
                  </p>
                  <h2 id="cozy-panel-title">
                    {panel === 'inventory'
                      ? 'Inventory & Quickbar'
                      : panel === 'dust'
                        ? 'DUST history'
                        : panel === 'shop'
                          ? (generalStore?.shop.name ?? interaction?.title ?? 'General Store')
                          : panel === 'starter_quest'
                            ? (state?.verticalSlice.quest.name ?? 'Starter farming quest')
                            : (interaction?.title ?? 'Cozy journal')}
                  </h2>
                </div>
                <button autoFocus type="button" aria-label="Close cozy panel" onClick={closePanel}>
                  ×
                </button>
              </header>

              {state === undefined ? (
                <div className="cozy-panel__loading" role="status">
                  <span className="game-loader" />
                  <p>Opening your inventory…</p>
                </div>
              ) : null}

              {busy && busyLabel !== undefined ? (
                <div
                  className="cozy-feedback cozy-feedback--loading"
                  role="status"
                  aria-live="polite"
                >
                  <strong>{busyLabel}</strong>
                </div>
              ) : null}

              {error === undefined ? null : (
                <div className="cozy-feedback" role="alert">
                  <strong>Could not update</strong>
                  <span>{error.message}</span>
                </div>
              )}

              {status === undefined ? null : (
                <div
                  className="cozy-feedback cozy-feedback--success"
                  role="status"
                  aria-live="polite"
                >
                  <strong>{status.title}</strong>
                  <span>{status.detail}</span>
                </div>
              )}

              {state !== undefined && panel === 'inventory' ? (
                <InventoryPanel
                  state={state}
                  selectedSlot={selectedSlot}
                  busy={busy}
                  onSelectSlot={setSelectedSlot}
                  onAssign={(stackId, itemName, replacing) =>
                    void perform(
                      () =>
                        updateQuickbar(apiUrl, selectedSlot, {
                          inventoryStackId: stackId,
                          expectedStateVersion: state.bootstrap.quickbar.stateVersion,
                        }),
                      stackId === null
                        ? {
                            title: 'Quickbar updated',
                            detail: `Slot ${selectedSlot} is now empty.`,
                          }
                        : {
                            title: 'Quickbar updated',
                            detail: replacing
                              ? `${itemName} replaced the previous item in Slot ${selectedSlot}.`
                              : `${itemName} is now available in Slot ${selectedSlot}.`,
                          },
                      `Updating Slot ${selectedSlot}…`,
                    )
                  }
                />
              ) : null}

              {state !== undefined && panel === 'dust' ? (
                <DustHistoryPanel
                  economy={economyHistory}
                  loadingMore={historyLoadingMore}
                  {...(economyHistory?.nextCursor === null
                    ? {}
                    : { onLoadMore: () => void loadEarlierEconomyHistory() })}
                />
              ) : null}

              {state !== undefined && panel === 'farm' ? (
                <FarmPanel
                  plots={targetPlots}
                  seedName={seedStack?.item.name}
                  busy={busy}
                  onAction={(plot, action) =>
                    void perform(
                      () =>
                        mutateFarm(
                          apiUrl,
                          action,
                          plot,
                          action === 'plant' ? seedStack?.item.slug : undefined,
                        ),
                      {
                        title:
                          action === 'plant'
                            ? 'Seed planted'
                            : action === 'water'
                              ? 'Crop watered'
                              : 'Crop harvested',
                        detail:
                          action === 'plant'
                            ? 'Your seed is growing in this garden plot.'
                            : action === 'water'
                              ? 'Growth continues on its own from here.'
                              : 'The harvest was added to your inventory.',
                      },
                    )
                  }
                />
              ) : null}

              {state !== undefined && panel === 'shop' ? (
                <GeneralStorePanel
                  workspace={generalStore}
                  busy={busy}
                  onTransaction={async (entry, direction, quantity) => {
                    if (interaction?.type !== 'shop' || generalStore === undefined) {
                      throw new Error('The General Store catalog changed. Reload and try again.');
                    }
                    if (operationLockRef.current)
                      throw new Error('That transaction is already being checked.');
                    operationLockRef.current = true;
                    setBusy(true);
                    setBusyLabel(`Checking this ${direction} with the village server…`);
                    setError(undefined);
                    try {
                      const expectedUnitPrice =
                        direction === 'buy' ? entry.buyPrice : entry.sellPrice;
                      if (expectedUnitPrice === null)
                        throw new Error('That catalog direction is unavailable.');
                      const result = await transactGeneralStore(apiUrl, interaction.id, {
                        entryId: entry.entryId,
                        direction,
                        quantity,
                        expectedUnitPrice,
                        expectedCatalogVersionId: generalStore.catalog.versionId,
                        expectedCatalogRevision: generalStore.catalog.revision,
                        expectedEntryRevision: entry.entryRevision,
                        expectedStockRevision: entry.stock === null ? null : entry.stockRevision,
                        expectedDustStateVersion: generalStore.dust.stateVersion,
                        expectedInventoryStateVersion: generalStore.inventory.stateVersion,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      await refreshMutableState();
                      const latest = await loadGeneralStore(apiUrl, interaction.id).catch(
                        () => undefined,
                      );
                      if (latest !== undefined) setGeneralStore(latest);
                      setStatus({
                        title: direction === 'buy' ? 'Purchase complete' : 'Sale complete',
                        detail: `${quantity.toLocaleString()} × ${entry.itemName}. Receipt ${result.receipt.receiptId}.`,
                      });
                      onAuthoritativeMutation?.();
                      return result;
                    } catch (cause) {
                      if (cause instanceof PlayerRequestError && cause.status === 401)
                        onAccessInvalid();
                      const latest = await loadGeneralStore(apiUrl, interaction.id).catch(
                        () => undefined,
                      );
                      if (latest !== undefined) setGeneralStore(latest);
                      throw new Error(requestFailure(cause).message, { cause });
                    } finally {
                      operationLockRef.current = false;
                      setBusy(false);
                      setBusyLabel(undefined);
                    }
                  }}
                  onInspectReceipt={async (receiptId) => {
                    await loadGeneralStoreReceipt(apiUrl, receiptId);
                    if (interaction?.type === 'shop') {
                      setGeneralStore(await loadGeneralStore(apiUrl, interaction.id));
                    }
                    setStatus({
                      title: 'Receipt verified',
                      detail: `${receiptId} belongs to this player.`,
                    });
                  }}
                  onAcceptTutorial={async () => {
                    if (interaction?.type !== 'shop') return;
                    await acceptGeneralStoreTutorial(apiUrl, interaction.id);
                    setGeneralStore(await loadGeneralStore(apiUrl, interaction.id));
                    onAuthoritativeMutation?.();
                  }}
                  onTurnInTutorial={async (stateVersion) => {
                    if (interaction?.type !== 'shop') return;
                    await turnInGeneralStoreTutorial(apiUrl, interaction.id, stateVersion);
                    await refreshMutableState();
                    setGeneralStore(await loadGeneralStore(apiUrl, interaction.id));
                    onAuthoritativeMutation?.();
                  }}
                />
              ) : null}

              {state !== undefined && (panel === 'cooking' || panel === 'crafting') ? (
                <WorkstationPanel
                  workspace={workstationWorkspace}
                  legacyStation={
                    (interaction?.type === 'cooking_station' ||
                      interaction?.type === 'crafting_station') &&
                    interaction.workstationInstanceId === undefined
                  }
                  busy={busy}
                  onStart={(recipeVersionId, quantity) => {
                    if (workstationWorkspace === undefined) return;
                    void perform(
                      async () => {
                        const result = await startWorkstationJob(
                          apiUrl,
                          workstationWorkspace,
                          recipeVersionId,
                          quantity,
                        );
                        setWorkstationWorkspace(result.workspace);
                      },
                      {
                        title: panel === 'cooking' ? 'Cooking started' : 'Crafting started',
                        detail:
                          'Ingredients were consumed once. Return here when the job is ready.',
                      },
                      'Starting the server-authoritative workstation job…',
                    );
                  }}
                  onCollect={(job) => {
                    if (workstationWorkspace === undefined) return;
                    void perform(
                      async () => {
                        const result = await collectWorkstationJob(
                          apiUrl,
                          workstationWorkspace,
                          job,
                        );
                        setWorkstationWorkspace(result.workspace);
                      },
                      {
                        title: 'Output collected',
                        detail: `${job.output.quantity} ${job.output.itemName} added to your inventory.`,
                      },
                      'Checking the completed job and inventory capacity…',
                    );
                  }}
                />
              ) : null}

              {state !== undefined && panel === 'home' ? (
                <HomePanel
                  apiUrl={apiUrl}
                  realtimeUrl={realtimeUrl}
                  onAuthoritativeMutation={onAuthoritativeMutation}
                  state={state}
                  busy={busy}
                  selectedFarmingItem={selectedFarmingItem}
                  realtimeStatus={privateHomeRealtime.state.status}
                  onAccess={(operation) =>
                    void perform(
                      async () => {
                        const access = await changeHomeAccess(apiUrl, operation, state.home.home);
                        const latestView = await loadPlayableVerticalSlice(apiUrl);
                        setState((current) =>
                          current === undefined
                            ? current
                            : { ...current, verticalSlice: latestView },
                        );
                        reportedHomeLocationRef.current = access.location;
                        onHomeAccessChange?.(access.location, latestView);
                        return access;
                      },
                      {
                        title: operation === 'enter' ? 'Welcome home' : 'Back in the village',
                        detail:
                          operation === 'enter'
                            ? 'You entered your private starter home.'
                            : 'You returned to the public village.',
                      },
                    )
                  }
                  onFarmAction={(tile, operation) =>
                    void performVerticalSlice(
                      () =>
                        mutateHomeFarm(
                          apiUrl,
                          operation,
                          tile,
                          operation === 'plant' ? 'moonbean-seed' : undefined,
                        ),
                      operation === 'prepare'
                        ? 'Preparing soil…'
                        : operation === 'plant'
                          ? 'Planting seed…'
                          : operation === 'water'
                            ? 'Watering crop…'
                            : 'Harvesting crop…',
                    )
                  }
                />
              ) : null}

              {state !== undefined && panel === 'starter_quest' ? (
                <StarterQuestPanel
                  view={state.verticalSlice}
                  busy={busy}
                  onAccept={() =>
                    void performVerticalSlice(
                      () => acceptStarterFarmingQuest(apiUrl),
                      'Preparing your starter farming kit…',
                    )
                  }
                  onDeliver={() =>
                    void performVerticalSlice(
                      () => deliverStarterFarmingQuest(apiUrl, state.verticalSlice.quest),
                      'Settling your one-time delivery…',
                    )
                  }
                  onAcceptWorkstation={() =>
                    void perform(() => acceptWorkstationTutorial(apiUrl), {
                      title: 'Hearth and Hands started',
                      detail: 'Garden Soup is unlocked at your home Cooking Hearth.',
                    })
                  }
                  onTurnInWorkstation={() => {
                    const tutorial = state.verticalSlice.workstationTutorial;
                    if (tutorial === undefined) return;
                    void perform(() => turnInWorkstationTutorial(apiUrl, tutorial), {
                      title: 'Hearth and Hands complete',
                      detail: '20 DUST was settled exactly once by the server.',
                    });
                  }}
                />
              ) : null}
            </section>
          </div>
        </GameModalPortal>
      )}
    </>
  );
}

function InventoryPanel({
  state,
  selectedSlot,
  busy,
  onSelectSlot,
  onAssign,
}: {
  readonly state: CozyState;
  readonly selectedSlot: number;
  readonly busy: boolean;
  readonly onSelectSlot: (slot: number) => void;
  readonly onAssign: (stackId: string | null, itemName: string, replacing: boolean) => void;
}) {
  const selectedAssignment = state.bootstrap.quickbar.assignments.find(
    (assignment) => assignment.slot === selectedSlot,
  );
  const selectedItemName =
    selectedAssignment?.assignedItemSlug === null || selectedAssignment === undefined
      ? null
      : itemName(state.items, selectedAssignment.assignedItemSlug);
  const slotOccupied = selectedAssignment?.inventoryStackId !== null;

  return (
    <div className="cozy-panel__body">
      <section className="cozy-quickbar-editor" aria-label="Quickbar slots">
        <div className="cozy-quickbar-editor__header">
          <div>
            <p className="cozy-quickbar-editor__editing" aria-live="polite">
              Editing Slot {selectedSlot}
            </p>
            <p className="cozy-quickbar-editor__help">
              Press {selectedSlot} during gameplay to select this quickbar slot.
            </p>
          </div>
          <p className="cozy-quickbar-editor__capacity">
            Bag: {state.bootstrap.inventory.capacity.usedSlots} of{' '}
            {state.bootstrap.inventory.capacity.capacity} items
          </p>
        </div>
        <div
          className="cozy-quickbar-editor__slots"
          role="toolbar"
          aria-label="Choose a quickbar slot to edit"
        >
          {state.bootstrap.quickbar.assignments.map((assignment) => {
            const assignedLabel =
              assignment.assignedItemSlug === null
                ? 'empty'
                : itemName(state.items, assignment.assignedItemSlug);
            const selected = assignment.slot === selectedSlot;
            return (
              <button
                key={assignment.slot}
                type="button"
                className={
                  selected
                    ? 'cozy-quickbar-editor__slot cozy-quickbar-editor__slot--selected'
                    : 'cozy-quickbar-editor__slot'
                }
                aria-pressed={selected}
                aria-label={`Quickbar Slot ${assignment.slot}, ${assignedLabel}`}
                onClick={() => onSelectSlot(assignment.slot)}
              >
                <kbd aria-hidden="true">{assignment.slot}</kbd>
                {assignment.assignedItemSlug === null ? null : (
                  <BundledAssetImage
                    assetKey={itemAssetRef(state.items, assignment.assignedItemSlug)}
                    alt=""
                    className="cozy-quickbar-editor__art"
                  />
                )}
                <span>
                  {assignment.assignedItemSlug === null
                    ? 'Empty'
                    : itemName(state.items, assignment.assignedItemSlug)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="cozy-quickbar-editor__status">
          {selectedItemName === null
            ? `Slot ${selectedSlot} is currently empty.`
            : `Slot ${selectedSlot} currently holds ${selectedItemName}.`}
        </p>
        <p className="cozy-quickbar-editor__hint">
          Quickbar items are shortcuts. Assigning an item does not duplicate or remove it from your
          inventory. Use number keys 1–8 during gameplay to select a quickbar slot.
        </p>
      </section>

      <p className="cozy-inventory-intro">Choose an item for Quickbar Slot {selectedSlot}</p>

      <div className="cozy-inventory-grid">
        {state.bootstrap.inventory.stacks.map((stack) => {
          const eligible = isQuickbarEligible(stack.item.category);
          const assignedSlot = state.bootstrap.quickbar.assignments.find(
            (assignment) => assignment.inventoryStackId === stack.id,
          )?.slot;
          const alreadyOnSelected =
            assignedSlot === selectedSlot && selectedAssignment?.inventoryStackId === stack.id;
          const replacing = slotOccupied && !alreadyOnSelected;

          return (
            <article key={stack.id}>
              <BundledAssetImage
                assetKey={stack.item.assetRef}
                alt={`${stack.item.name} inventory art`}
                className="cozy-inventory-art"
              />
              <strong>{stack.item.name}</strong>
              <span>Quantity: {stack.quantity}</span>
              <small>{categoryLabel(stack.item.category)}</small>
              {assignedSlot === undefined ? null : (
                <span className="cozy-inventory-assignment">
                  Currently assigned to Slot {assignedSlot}
                </span>
              )}
              {eligible ? (
                <button
                  disabled={busy || alreadyOnSelected}
                  type="button"
                  onClick={() => {
                    if (
                      replacing &&
                      !window.confirm(
                        `Replace the item currently assigned to Slot ${selectedSlot}? Your inventory items stay with you — only the shortcut changes.`,
                      )
                    ) {
                      return;
                    }
                    onAssign(stack.id, stack.item.name, replacing);
                  }}
                >
                  {alreadyOnSelected
                    ? `Already on Slot ${selectedSlot}`
                    : assignedSlot === undefined
                      ? `Add to Slot ${selectedSlot}`
                      : `Move shortcut to Slot ${selectedSlot}`}
                </button>
              ) : (
                <p className="cozy-inventory-ineligible">
                  {quickbarIneligibleReason(stack.item.category)}
                </p>
              )}
            </article>
          );
        })}
      </div>

      <button
        className="cozy-inventory-clear"
        disabled={busy || !slotOccupied}
        type="button"
        onClick={() => onAssign(null, '', false)}
      >
        Remove item from Slot {selectedSlot}
      </button>
    </div>
  );
}

function FarmPanel({
  plots,
  seedName,
  busy,
  onAction,
}: {
  readonly plots: readonly FarmPlot[];
  readonly seedName: string | undefined;
  readonly busy: boolean;
  readonly onAction: (plot: FarmPlot, action: 'plant' | 'water' | 'harvest') => void;
}) {
  return (
    <div className="cozy-panel__body cozy-farm-grid">
      {plots.map((plot) => {
        const action = plotAction(plot);
        const cropAssetKey = legacyCropStageAssetKey(plot);
        const plotAssetKey = farmPlotAssetKey({
          state: plot.state === 'needs_water' ? 'dry' : plot.state,
          watered: plot.state === 'growing' || plot.state === 'ready_to_harvest',
        });
        return (
          <article key={plot.id}>
            <span className={`cozy-plot cozy-plot--${plot.state}`} aria-hidden="true">
              <BundledAssetImage assetKey={plotAssetKey} alt="" className="cozy-plot__soil" />
              {cropAssetKey === null ? null : (
                <BundledAssetImage assetKey={cropAssetKey} alt="" className="cozy-plot__crop" />
              )}
            </span>
            <strong>Garden plot {plot.slot}</strong>
            <span>{plot.state.replaceAll('_', ' ')}</span>
            <progress
              value={plot.growthProgress}
              max={1}
              aria-label="Authoritative growth progress"
            />
            {action === null ? (
              <small>Growth continues using server time.</small>
            ) : (
              <button
                disabled={busy || (action === 'plant' && seedName === undefined)}
                type="button"
                onClick={() => onAction(plot, action)}
              >
                {action === 'plant' ? `Plant ${seedName ?? 'a seed'}` : action}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

function WorkstationPanel({
  workspace,
  legacyStation,
  busy,
  onStart,
  onCollect,
}: {
  readonly workspace: WorkstationWorkspace | undefined;
  readonly legacyStation: boolean;
  readonly busy: boolean;
  readonly onStart: (recipeVersionId: string, quantity: number) => void;
  readonly onCollect: (job: CraftingJob) => void;
}) {
  const [tab, setTab] = useState<'recipes' | 'jobs'>('recipes');
  const [query, setQuery] = useState('');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>();
  const [quantity, setQuantity] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  const activeJobs = workspace?.jobs.filter(
    (job) => job.status === 'pending' || job.status === 'running' || job.status === 'ready',
  );
  const hasRunningJobs = activeJobs?.some((job) => job.status !== 'ready') === true;

  useEffect(() => {
    if (!hasRunningJobs) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const synchronize = () => {
      if (document.visibilityState !== 'visible') {
        if (interval !== undefined) clearInterval(interval);
        interval = undefined;
        return;
      }
      setNow(Date.now());
      interval ??= setInterval(() => setNow(Date.now()), 1_000);
    };
    synchronize();
    document.addEventListener('visibilitychange', synchronize);
    window.addEventListener('focus', synchronize);
    return () => {
      if (interval !== undefined) clearInterval(interval);
      document.removeEventListener('visibilitychange', synchronize);
      window.removeEventListener('focus', synchronize);
    };
  }, [hasRunningJobs]);

  const recipes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (workspace === undefined || needle === '') return workspace?.recipes ?? [];
    return workspace.recipes.filter((recipe) =>
      `${recipe.name} ${recipe.description} ${recipe.output.itemName}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query, workspace]);
  const selected = recipes.find((recipe) => recipe.versionId === selectedRecipeId) ?? recipes[0];

  useEffect(() => {
    if (selected === undefined) return;
    setSelectedRecipeId(selected.versionId);
    setQuantity((current) => Math.max(1, Math.min(current, selected.maximumStartable || 1)));
  }, [selected]);

  if (legacyStation) {
    return (
      <div className="cozy-panel__body cozy-workstation-empty" role="status">
        <strong>Use your personal-home workstation</strong>
        <p>
          Persistent cooking and crafting now run through owner-only job queues. Enter your home and
          interact with its Cooking Hearth or Crafting Workbench.
        </p>
      </div>
    );
  }
  if (workspace === undefined) return <p role="status">Reading the workstation ledger…</p>;

  return (
    <div className="cozy-panel__body cozy-workstation">
      <section className="cozy-workstation__summary" aria-label="Workstation queue summary">
        <BundledAssetImage
          assetKey={workstationVisualKey(workspace)}
          alt={`${workspace.workstation.definition.name} ${workspace.workstation.queue.ready > 0 ? 'ready' : workspace.workstation.queue.running > 0 ? 'active' : 'idle'} art`}
          className="cozy-workstation__art"
          eager
        />
        <div>
          <p className="game-kicker">Owner-only workstation</p>
          <strong>{workspace.workstation.definition.name}</strong>
          <span>{workspace.workstation.definition.description}</span>
        </div>
        <div>
          <strong>
            {workspace.workstation.queue.occupied} / {workspace.workstation.queue.capacity}
          </strong>
          <span>queue slots used</span>
        </div>
      </section>

      <div className="cozy-workstation__tabs" role="tablist" aria-label="Workstation views">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'recipes'}
          onClick={() => setTab('recipes')}
        >
          Recipes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'jobs'}
          onClick={() => setTab('jobs')}
        >
          Jobs ({activeJobs?.length ?? 0})
        </button>
      </div>

      {tab === 'recipes' ? (
        <section role="tabpanel" className="cozy-workstation__recipes">
          <label>
            <span>Search recipes</span>
            <input
              type="search"
              value={query}
              placeholder="Recipe or output"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="cozy-workstation__recipe-layout">
            <div className="cozy-workstation__recipe-list" aria-label="Recipes">
              {recipes.map((recipe) => (
                <button
                  key={recipe.versionId}
                  type="button"
                  className={recipe.versionId === selected?.versionId ? 'is-selected' : undefined}
                  aria-pressed={recipe.versionId === selected?.versionId}
                  onClick={() => {
                    setSelectedRecipeId(recipe.versionId);
                    setQuantity(1);
                  }}
                >
                  <BundledAssetImage
                    assetKey={recipe.output.assetRef}
                    alt=""
                    className="cozy-workstation__recipe-art"
                  />
                  <strong>{recipe.name}</strong>
                  <span>{recipe.unlocked ? recipe.output.itemName : recipe.lockedReason}</span>
                </button>
              ))}
              {recipes.length === 0 ? <p>No recipes match that search.</p> : null}
            </div>
            {selected === undefined ? null : (
              <article className="cozy-workstation__recipe-detail">
                <BundledAssetImage
                  assetKey={selected.output.assetRef}
                  alt={`${selected.output.itemName} recipe art`}
                  className="cozy-workstation__recipe-detail-art"
                />
                <p className="game-kicker">Immutable recipe v{selected.versionNumber}</p>
                <h3>{selected.name}</h3>
                <p>{selected.description}</p>
                <dl>
                  <div>
                    <dt>Produces</dt>
                    <dd>
                      {selected.output.quantityPerBatch * quantity} {selected.output.itemName}
                    </dd>
                  </div>
                  <div>
                    <dt>Server time</dt>
                    <dd>{selected.productionDurationSeconds * quantity}s</dd>
                  </div>
                  <div>
                    <dt>DUST fee</dt>
                    <dd>{selected.dustFee * quantity}</dd>
                  </div>
                </dl>
                <ul>
                  {selected.ingredients.map((ingredient) => (
                    <li key={ingredient.itemId}>
                      <span>{ingredient.itemName}</span>
                      <strong>
                        {ingredient.ownedQuantity} owned / {ingredient.quantityPerBatch * quantity}{' '}
                        required
                      </strong>
                    </li>
                  ))}
                </ul>
                <label>
                  <span>Quantity</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, selected.maximumStartable)}
                    value={quantity}
                    onChange={(event) =>
                      setQuantity(
                        Math.max(
                          1,
                          Math.min(
                            selected.maximumStartable || 1,
                            Math.trunc(Number(event.target.value) || 1),
                          ),
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    busy ||
                    !selected.enabled ||
                    !selected.unlocked ||
                    selected.maximumStartable < quantity ||
                    workspace.workstation.queue.remainingSlots === 0
                  }
                  onClick={() => onStart(selected.versionId, quantity)}
                >
                  Start {quantity === 1 ? selected.name : `${quantity} batches`}
                </button>
                {!selected.unlocked && selected.lockedReason !== null ? (
                  <p role="status">{selected.lockedReason}</p>
                ) : null}
              </article>
            )}
          </div>
        </section>
      ) : (
        <section role="tabpanel" className="cozy-workstation__jobs" aria-live="polite">
          {workspace.jobs.length === 0 ? <p>No jobs have been started here yet.</p> : null}
          {workspace.jobs.map((job) => {
            const started = Date.parse(job.startedAt);
            const completes = Date.parse(job.completesAt);
            const serverReady = job.status === 'ready' || now >= completes;
            const progress =
              job.status === 'collected'
                ? 1
                : Math.max(0, Math.min(1, (now - started) / Math.max(1, completes - started)));
            const remaining = Math.max(0, Math.ceil((completes - now) / 1_000));
            return (
              <article key={job.id} className={serverReady ? 'is-ready' : undefined}>
                <BundledAssetImage
                  assetKey={`phase7-dev-${job.output.itemSlug}`}
                  alt=""
                  className="cozy-workstation__job-art"
                />
                <div>
                  <strong>{job.recipeName}</strong>
                  <span>
                    {job.quantity} batch{job.quantity === 1 ? '' : 'es'} · {job.output.quantity}{' '}
                    {job.output.itemName}
                  </span>
                </div>
                <progress value={progress} max={1} aria-label={`${job.recipeName} progress`} />
                <span>
                  {job.status === 'collected'
                    ? 'Collected'
                    : serverReady
                      ? 'Ready to collect'
                      : `${remaining}s remaining`}
                </span>
                {job.status === 'collected' ? null : (
                  <small>
                    Expected{' '}
                    {new Date(completes).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    · {workspace.workstation.definition.name}
                  </small>
                )}
                {job.status !== 'collected' ? (
                  <button
                    type="button"
                    disabled={busy || !serverReady}
                    onClick={() => onCollect(job)}
                  >
                    Collect output
                  </button>
                ) : null}
              </article>
            );
          })}
        </section>
      )}

      <section className="cozy-workstation__tutorial" aria-label="Hearth and Hands progress">
        <strong>{workspace.tutorial.name}</strong>
        <span>{workspace.tutorial.description}</span>
        <progress
          max={workspace.tutorial.objectives.length}
          value={workspace.tutorial.objectives.filter((objective) => objective.completed).length}
          aria-label="Hearth and Hands tutorial progress"
        />
        <small>Speak with Willow Guide to accept or turn in this tutorial.</small>
      </section>
    </div>
  );
}

function HomePanel({
  apiUrl,
  realtimeUrl,
  onAuthoritativeMutation,
  state,
  busy,
  selectedFarmingItem,
  realtimeStatus,
  onAccess,
  onFarmAction,
}: {
  readonly apiUrl: string;
  readonly realtimeUrl?: string | undefined;
  readonly onAuthoritativeMutation?: (() => void) | undefined;
  readonly state: CozyState;
  readonly busy: boolean;
  readonly selectedFarmingItem: 'starter-hoe' | 'starter-watering-can' | 'moonbean-seed' | null;
  readonly realtimeStatus:
    'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'blocked' | 'unavailable';
  readonly onAccess: (operation: 'enter' | 'exit') => void;
  readonly onFarmAction: (
    tile: PlayableVerticalSlice['plot']['tiles'][number],
    operation: 'prepare' | 'plant' | 'water' | 'harvest',
  ) => void;
}) {
  const { home, location } = state.home;
  return (
    <div className="cozy-panel__body cozy-home">
      <div className="cozy-home__summary">
        <div>
          <strong>{home.template.name}</strong>
          <span>
            {location === 'personal_home' ? 'Inside your private home' : 'At the public entrance'}
          </span>
        </div>
        <button
          disabled={busy}
          type="button"
          onClick={() => onAccess(location === 'personal_home' ? 'exit' : 'enter')}
        >
          {location === 'personal_home' ? 'Return to village' : 'Enter private home'}
        </button>
      </div>
      {location === 'personal_home' ? (
        <>
          <section className="cozy-home-farm" aria-labelledby="home-farm-title">
            <div>
              <p className="game-kicker">Private home plot</p>
              <h3 id="home-farm-title">Moonbean garden</h3>
              <p>
                Growth is derived from server timestamps and continues safely while you are away.
              </p>
              <p className="card-note" role="status">
                Private plot updates: {realtimeStatus.replaceAll('_', ' ')}
              </p>
            </div>
            <div className="cozy-home-farm__grid" aria-label="Owner-only farming tiles">
              {state.verticalSlice.plot.tiles.map((tile) => {
                const operation =
                  tile.state === 'empty' && selectedFarmingItem === 'starter-hoe'
                    ? 'prepare'
                    : tile.state === 'prepared' && selectedFarmingItem === 'moonbean-seed'
                      ? 'plant'
                      : tile.state === 'planted' && selectedFarmingItem === 'starter-watering-can'
                        ? 'water'
                        : tile.state === 'mature'
                          ? 'harvest'
                          : null;
                const prompt =
                  operation === 'prepare'
                    ? 'Prepare soil'
                    : operation === 'plant'
                      ? 'Plant Moonbean seed'
                      : operation === 'water'
                        ? 'Water crop'
                        : operation === 'harvest'
                          ? 'Harvest crop'
                          : tile.state === 'growing'
                            ? 'Crop needs more time'
                            : tile.state === 'planted'
                              ? 'Select watering can'
                              : tile.state === 'prepared'
                                ? 'Select Moonbean seed'
                                : 'Select hoe';
                const plotAssetKey = farmPlotAssetKey({
                  state: tile.state,
                  watered: tile.crop?.wateredAt !== null && tile.crop?.wateredAt !== undefined,
                });
                const cropAssetKey =
                  tile.crop === null
                    ? null
                    : cropStageAssetKey(
                        tile.crop.snapshot.cropSlug,
                        tile.crop.growthStage,
                        tile.crop.snapshot.growthStageCount,
                        tile.crop.state === 'mature',
                      );
                return (
                  <article key={tile.id} className={`cozy-home-farm__tile is-${tile.state}`}>
                    <span className="cozy-home-farm__art" aria-hidden="true">
                      <BundledAssetImage
                        assetKey={plotAssetKey}
                        alt=""
                        className="cozy-home-farm__soil"
                      />
                      {cropAssetKey === null ? null : (
                        <BundledAssetImage
                          assetKey={cropAssetKey}
                          alt=""
                          className="cozy-home-farm__crop"
                        />
                      )}
                    </span>
                    <strong>Garden {tile.slot}</strong>
                    <small>{tile.state.replaceAll('_', ' ')}</small>
                    {tile.crop === null ? null : (
                      <>
                        <progress
                          max={1}
                          value={tile.crop.growthProgress}
                          aria-label={`${tile.crop.snapshot.cropName} growth progress`}
                        />
                        <small>
                          Stage {tile.crop.growthStage} of {tile.crop.snapshot.growthStageCount}
                        </small>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={busy || operation === null}
                      onClick={() => operation === null || onFarmAction(tile, operation)}
                    >
                      {prompt}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
          <HousingWorkspacePanel
            apiUrl={apiUrl}
            realtimeUrl={realtimeUrl}
            onAuthoritativeMutation={onAuthoritativeMutation}
          />
        </>
      ) : null}
    </div>
  );
}

function StarterQuestPanel({
  view,
  busy,
  onAccept,
  onDeliver,
  onAcceptWorkstation,
  onTurnInWorkstation,
}: {
  readonly view: PlayableVerticalSlice;
  readonly busy: boolean;
  readonly onAccept: () => void;
  readonly onDeliver: () => void;
  readonly onAcceptWorkstation: () => void;
  readonly onTurnInWorkstation: () => void;
}) {
  const quest = view.quest;
  const workstationTutorial = view.workstationTutorial;
  const readyToDeliver = quest.objectives
    .filter((objective) => !['deliver_produce', 'receive_reward'].includes(objective.key))
    .every((objective) => objective.completed);
  return (
    <div className="cozy-panel__body cozy-starter-quest">
      <section className="cozy-starter-quest__guide">
        <span className="cozy-dev-marker" aria-label="Willow Guide emblem">
          ✦
        </span>
        <div>
          <p className="game-kicker">{view.npc.name}</p>
          <p>{view.npc.introduction}</p>
        </div>
      </section>
      <p>{quest.description}</p>
      <ol className="cozy-starter-quest__objectives">
        {quest.objectives.map((objective) => (
          <li key={objective.key} className={objective.completed ? 'is-complete' : undefined}>
            <span aria-hidden="true">{objective.completed ? '✓' : '○'}</span>
            <span>{objective.label}</span>
            <strong>
              {objective.current} / {objective.required}
            </strong>
          </li>
        ))}
      </ol>
      {quest.status === 'available' ? (
        <button
          disabled={busy || !view.liveOps.starterQuestEnabled}
          type="button"
          onClick={onAccept}
        >
          Accept quest and receive starter kit
        </button>
      ) : quest.status === 'active' ? (
        <button disabled={busy || !readyToDeliver} type="button" onClick={onDeliver}>
          Deliver {quest.deliveryQuantity} Moonbeans · Receive {quest.rewardDust} DUST
        </button>
      ) : (
        <div className="cozy-feedback cozy-feedback--success" role="status">
          <strong>Tutorial complete</strong>
          <span>Reward receipt {quest.rewardReceiptId ?? 'recorded in your DUST history'}</span>
        </div>
      )}
      {!view.liveOps.starterQuestEnabled && view.liveOps.maintenanceMessage !== null ? (
        <p role="status">{view.liveOps.maintenanceMessage}</p>
      ) : null}
      {workstationTutorial === undefined ? null : (
        <section className="cozy-starter-quest__continuation" aria-labelledby="hearth-hands-title">
          <p className="game-kicker">Next village chapter</p>
          <h3 id="hearth-hands-title">{workstationTutorial.name}</h3>
          <p>{workstationTutorial.description}</p>
          <ol className="cozy-starter-quest__objectives">
            {workstationTutorial.objectives.map((objective) => (
              <li key={objective.key} className={objective.completed ? 'is-complete' : undefined}>
                <span aria-hidden="true">{objective.completed ? '✓' : '○'}</span>
                <span>{objective.label}</span>
                <strong>
                  {objective.current} / {objective.required}
                </strong>
              </li>
            ))}
          </ol>
          {workstationTutorial.status === 'available' ? (
            <button
              disabled={busy || !workstationTutorial.eligible}
              type="button"
              onClick={onAcceptWorkstation}
            >
              Accept Hearth and Hands
            </button>
          ) : workstationTutorial.status === 'active' ? (
            <button
              disabled={
                busy ||
                !workstationTutorial.objectives
                  .filter((objective) => objective.key !== 'receive_reward')
                  .every((objective) => objective.completed)
              }
              type="button"
              onClick={onTurnInWorkstation}
            >
              Turn in tutorial · Receive {workstationTutorial.rewardDust} DUST
            </button>
          ) : workstationTutorial.status === 'reward_claimed' ? (
            <div className="cozy-feedback cozy-feedback--success" role="status">
              <strong>Hearth and Hands complete</strong>
              <span>
                Reward receipt {workstationTutorial.rewardReceiptId ?? 'recorded in DUST history'}
              </span>
            </div>
          ) : (
            <p role="status">Complete A Place to Grow to unlock cooking and crafting.</p>
          )}
        </section>
      )}
    </div>
  );
}
