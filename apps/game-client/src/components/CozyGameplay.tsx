import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorldInteraction } from '@starville/game-core';

import {
  bootstrapCozyGameplay,
  changeHomeAccess,
  executeRecipe,
  executeShopTransaction,
  loadCozyInventory,
  loadDustLedger,
  loadFarmPlots,
  loadItemCatalog,
  loadPlayerHome,
  loadRecipeCatalog,
  loadShopCatalog,
  mutateFarm,
  placeFurniture,
  updateFurniture,
  updateQuickbar,
  type CozyBootstrap,
  type FarmPlot,
  type FarmView,
  type HomeView,
  type ItemCatalog,
  type RecipeCatalog,
  type ShopCatalog,
} from '../app/cozy-gameplay-client';
import { PlayerRequestError } from '../app/player-client';
import { isTextEntryElement } from '../game/input/focus';

type CozyInteraction = Exclude<WorldInteraction, { readonly type: 'notice' }>;
type CozyPanel = 'inventory' | 'farm' | 'shop' | 'cooking' | 'crafting' | 'home';

interface CozyGameplayProps {
  readonly apiUrl: string;
  readonly interaction: CozyInteraction | null;
  readonly onInteractionClose: () => void;
  readonly onAccessInvalid: () => void;
  readonly onOpenChange: (open: boolean) => void;
}

interface CozyState {
  readonly bootstrap: CozyBootstrap;
  readonly farm: FarmView;
  readonly items: ItemCatalog;
  readonly home: HomeView;
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
  INVALID_FURNITURE_PLACEMENT: 'Furniture cannot be placed on that cell.',
  HOME_ACCESS_DENIED: 'Your private home could not be opened from here.',
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
  if (interaction.type === 'farm_plot') return 'farm';
  if (interaction.type === 'shop') return 'shop';
  if (interaction.type === 'cooking_station') return 'cooking';
  if (interaction.type === 'crafting_station') return 'crafting';
  return 'home';
}

function itemName(items: ItemCatalog | undefined, slug: string): string {
  return items?.items.find((item) => item.slug === slug)?.name ?? slug.replaceAll('-', ' ');
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
  interaction,
  onInteractionClose,
  onAccessInvalid,
  onOpenChange,
}: CozyGameplayProps) {
  const [state, setState] = useState<CozyState>();
  const [panel, setPanel] = useState<CozyPanel | null>(null);
  const [selectedSlot, setSelectedSlot] = useState(1);
  const [recipeCatalog, setRecipeCatalog] = useState<RecipeCatalog>();
  const [shopCatalog, setShopCatalog] = useState<ShopCatalog>();
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string>();
  const [error, setError] = useState<{ readonly message: string }>();
  const [status, setStatus] = useState<{ readonly title: string; readonly detail: string }>();
  const [placementCell, setPlacementCell] = useState({ x: 2, y: 2 });
  const panelRef = useRef<HTMLElement>(null);

  const loadFoundation = useCallback(async () => {
    const bootstrap = await bootstrapCozyGameplay(apiUrl);
    const [inventory, farm, items, home] = await Promise.all([
      loadCozyInventory(apiUrl),
      loadFarmPlots(apiUrl),
      loadItemCatalog(apiUrl),
      loadPlayerHome(apiUrl),
    ]);
    setState({
      bootstrap: { ...bootstrap, inventory: inventory.inventory, quickbar: inventory.quickbar },
      farm,
      items,
      home,
    });
  }, [apiUrl]);

  const refreshMutableState = useCallback(async () => {
    const [inventory, dust, farm, home] = await Promise.all([
      loadCozyInventory(apiUrl),
      loadDustLedger(apiUrl),
      loadFarmPlots(apiUrl),
      loadPlayerHome(apiUrl),
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

  useEffect(() => {
    if (panel === null) return;
    const returnTarget =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab' || panelRef.current === null) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', trapFocus);
    return () => {
      document.removeEventListener('keydown', trapFocus);
      returnTarget?.focus();
    };
  }, [panel]);

  useEffect(() => {
    if (panel !== 'cooking' && panel !== 'crafting') return;
    setRecipeCatalog(undefined);
    void loadRecipeCatalog(apiUrl, panel).then(setRecipeCatalog).catch(setErrorFromCause);
  }, [apiUrl, panel, setErrorFromCause]);

  useEffect(() => {
    if (panel !== 'shop' || interaction?.type !== 'shop') return;
    setShopCatalog(undefined);
    void loadShopCatalog(apiUrl, interaction.shopSlug)
      .then(setShopCatalog)
      .catch(setErrorFromCause);
  }, [apiUrl, interaction, panel, setErrorFromCause]);

  useEffect(() => {
    function selectQuickbar(event: KeyboardEvent) {
      if (panel !== null || isTextEntryElement(document.activeElement)) return;
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= 8) setSelectedSlot(slot);
    }
    window.addEventListener('keydown', selectQuickbar);
    return () => window.removeEventListener('keydown', selectQuickbar);
  }, [panel]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape' || panel === null) return;
      setPanel(null);
      setError(undefined);
      setStatus(undefined);
      if (interaction !== null) onInteractionClose();
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [interaction, onInteractionClose, panel]);

  const perform = useCallback(
    async (
      operation: () => Promise<unknown>,
      success: { readonly title: string; readonly detail: string },
      loadingLabel?: string,
    ) => {
      if (busy) return;
      setBusy(true);
      setBusyLabel(loadingLabel);
      setError(undefined);
      setStatus(undefined);
      try {
        await operation();
        await refreshMutableState();
        setStatus(success);
      } catch (cause) {
        if (cause instanceof PlayerRequestError && cause.code === 'GAMEPLAY_STATE_CONFLICT') {
          await refreshMutableState().catch(() => undefined);
        }
        setErrorFromCause(cause);
      } finally {
        setBusy(false);
        setBusyLabel(undefined);
      }
    },
    [busy, refreshMutableState, setErrorFromCause],
  );

  function closePanel() {
    setPanel(null);
    setError(undefined);
    setStatus(undefined);
    if (interaction !== null) onInteractionClose();
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
  const furnitureStack = state?.bootstrap.inventory.stacks.find(
    (stack) => stack.item.category === 'furniture',
  );

  return (
    <>
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
            <span>
              {assignment.assignedItemSlug === null
                ? 'Empty'
                : itemName(state?.items, assignment.assignedItemSlug)}
            </span>
          </button>
        ))}
      </div>

      {panel === null ? null : (
        <div className="world-overlay cozy-overlay" role="presentation">
          <section
            ref={panelRef}
            className="cozy-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cozy-panel-title"
          >
            <header className="cozy-panel__header">
              <div>
                <p className="game-kicker">Your village bag</p>
                <h2 id="cozy-panel-title">
                  {panel === 'inventory'
                    ? 'Inventory & Quickbar'
                    : (interaction?.title ?? 'Cozy journal')}
                </h2>
              </div>
              <button autoFocus type="button" aria-label="Close inventory" onClick={closePanel}>
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
              <ShopPanel
                catalog={shopCatalog}
                items={state.items}
                busy={busy}
                onTransaction={(operation, offerId) => {
                  if (interaction?.type !== 'shop') return;
                  void perform(
                    () =>
                      executeShopTransaction(apiUrl, interaction.shopSlug, operation, offerId, {
                        inventory: state.bootstrap.inventory.capacity.stateVersion,
                        dust: state.bootstrap.dust.stateVersion,
                      }),
                    {
                      title: operation === 'buy' ? 'Purchase complete' : 'Sale complete',
                      detail:
                        operation === 'buy'
                          ? 'The item was added to your inventory.'
                          : 'You received DUST for the sale.',
                    },
                  );
                }}
              />
            ) : null}

            {state !== undefined && (panel === 'cooking' || panel === 'crafting') ? (
              <RecipePanel
                catalog={recipeCatalog}
                items={state.items}
                busy={busy}
                onMake={(recipeSlug) => {
                  if (
                    interaction?.type !== 'cooking_station' &&
                    interaction?.type !== 'crafting_station'
                  )
                    return;
                  void perform(
                    () =>
                      executeRecipe(apiUrl, panel, recipeSlug, interaction.id, {
                        inventory: state.bootstrap.inventory.capacity.stateVersion,
                        dust: state.bootstrap.dust.stateVersion,
                      }),
                    {
                      title: panel === 'cooking' ? 'Recipe cooked' : 'Item crafted',
                      detail: 'The result was added to your inventory.',
                    },
                  );
                }}
              />
            ) : null}

            {state !== undefined && panel === 'home' ? (
              <HomePanel
                state={state}
                furnitureStack={furnitureStack}
                cell={placementCell}
                busy={busy}
                onCellChange={setPlacementCell}
                onAccess={(operation) =>
                  void perform(() => changeHomeAccess(apiUrl, operation, state.home.home), {
                    title: operation === 'enter' ? 'Welcome home' : 'Back in the village',
                    detail:
                      operation === 'enter'
                        ? 'You entered your private starter home.'
                        : 'You returned to the public village.',
                  })
                }
                onPlace={() => {
                  if (furnitureStack === undefined) return;
                  void perform(
                    () =>
                      placeFurniture(apiUrl, state.home.home, {
                        inventoryStackId: furnitureStack.id,
                        furnitureSlug:
                          furnitureStack.item.metadata.kind === 'furniture'
                            ? furnitureStack.item.metadata.furnitureSlug
                            : furnitureStack.item.slug,
                        ...placementCell,
                      }),
                    {
                      title: 'Furniture placed',
                      detail: `${furnitureStack.item.name} is now in your home.`,
                    },
                  );
                }}
                onFurniture={(operation, placement) =>
                  void perform(
                    () =>
                      updateFurniture(apiUrl, operation, state.home.home, placement, {
                        ...(operation === 'move' ? { x: placementCell.x, y: placementCell.y } : {}),
                        ...(operation === 'rotate'
                          ? {
                              rotation: ((placement.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                            }
                          : {}),
                      }),
                    {
                      title:
                        operation === 'move'
                          ? 'Furniture moved'
                          : operation === 'rotate'
                            ? 'Furniture rotated'
                            : 'Furniture packed up',
                      detail:
                        operation === 'remove'
                          ? 'The furniture returned to your inventory.'
                          : 'Your home layout was updated.',
                    },
                  )
                }
              />
            ) : null}
          </section>
        </div>
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
              <span className="cozy-dev-marker" aria-label="Item art placeholder">
                ✦
              </span>
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
        return (
          <article key={plot.id}>
            <span className={`cozy-plot cozy-plot--${plot.state}`} aria-hidden="true">
              {plot.cropSlug === null ? '·' : '♧'}
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

function ShopPanel({
  catalog,
  items,
  busy,
  onTransaction,
}: {
  readonly catalog: ShopCatalog | undefined;
  readonly items: ItemCatalog;
  readonly busy: boolean;
  readonly onTransaction: (operation: 'buy' | 'sell', offerId: string) => void;
}) {
  if (catalog === undefined) return <p role="status">Loading trusted shop offers…</p>;
  return (
    <div className="cozy-panel__body cozy-offer-list">
      <p>All prices below were returned by the server. Transactions use a quantity of one.</p>
      {catalog.offers.map((offer) => (
        <article key={offer.id}>
          <strong>{itemName(items, offer.itemSlug)}</strong>
          <div>
            {offer.buyPrice === null ? null : (
              <button disabled={busy} type="button" onClick={() => onTransaction('buy', offer.id)}>
                Buy · {offer.buyPrice} DUST
              </button>
            )}
            {offer.sellPrice === null ? null : (
              <button disabled={busy} type="button" onClick={() => onTransaction('sell', offer.id)}>
                Sell · {offer.sellPrice} DUST
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function RecipePanel({
  catalog,
  items,
  busy,
  onMake,
}: {
  readonly catalog: RecipeCatalog | undefined;
  readonly items: ItemCatalog;
  readonly busy: boolean;
  readonly onMake: (recipeSlug: string) => void;
}) {
  if (catalog === undefined) return <p role="status">Reading the station recipe book…</p>;
  return (
    <div className="cozy-panel__body cozy-recipe-list">
      {catalog.recipes.map(({ recipe, maximumCraftable, disabledReason }) => (
        <article key={recipe.id}>
          <div>
            <strong>{recipe.name}</strong>
            <p>{recipe.description}</p>
            <small>
              {recipe.ingredients
                .map(
                  (ingredient) => `${ingredient.quantity} ${itemName(items, ingredient.itemSlug)}`,
                )
                .join(' · ')}
            </small>
          </div>
          <button
            disabled={busy || maximumCraftable === 0}
            type="button"
            title={disabledReason ?? undefined}
            onClick={() => onMake(recipe.slug)}
          >
            Make 1{recipe.dustFee === 0 ? '' : ` · ${recipe.dustFee} DUST`}
          </button>
        </article>
      ))}
    </div>
  );
}

function HomePanel({
  state,
  furnitureStack,
  cell,
  busy,
  onCellChange,
  onAccess,
  onPlace,
  onFurniture,
}: {
  readonly state: CozyState;
  readonly furnitureStack: CozyState['bootstrap']['inventory']['stacks'][number] | undefined;
  readonly cell: { readonly x: number; readonly y: number };
  readonly busy: boolean;
  readonly onCellChange: (cell: { readonly x: number; readonly y: number }) => void;
  readonly onAccess: (operation: 'enter' | 'exit') => void;
  readonly onPlace: () => void;
  readonly onFurniture: (
    operation: 'move' | 'rotate' | 'remove',
    placement: HomeView['home']['placements'][number],
  ) => void;
}) {
  const { home, location } = state.home;
  const { bounds } = home.template;
  const cells = Array.from(
    { length: (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY) },
    (_, index) => ({
      x: bounds.minX + (index % (bounds.maxX - bounds.minX)),
      y: bounds.minY + Math.floor(index / (bounds.maxX - bounds.minX)),
    }),
  );
  const blocked = new Set(home.template.blockedCells.map((point) => `${point.x}:${point.y}`));
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
          <div
            className="cozy-home-grid"
            style={{ gridTemplateColumns: `repeat(${bounds.maxX - bounds.minX}, 1fr)` }}
            aria-label="Starter home development grid"
          >
            {cells.map((point) => {
              const placement = home.placements.find(
                (candidate) => candidate.x === point.x && candidate.y === point.y,
              );
              const isBlocked = blocked.has(`${point.x}:${point.y}`);
              const isSelected = cell.x === point.x && cell.y === point.y;
              const unavailable = isBlocked || placement !== undefined;
              return (
                <button
                  key={`${point.x}:${point.y}`}
                  className={[
                    unavailable ? 'cozy-home-grid__blocked' : '',
                    isSelected ? 'cozy-home-grid__selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={isBlocked}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`Home cell ${point.x}, ${point.y}${isBlocked ? ', blocked' : ''}${placement === undefined ? '' : `, occupied by ${placement.furnitureSlug}`}`}
                  onClick={() => onCellChange(point)}
                >
                  {placement === undefined
                    ? home.template.spawn.x === point.x && home.template.spawn.y === point.y
                      ? '⌂'
                      : ''
                    : '✦'}
                </button>
              );
            })}
          </div>
          <p className="cozy-development-note">
            Development marker art · grid placement is validated by the server.
          </p>
          <div className="cozy-home__place">
            <span>
              Selected cell: {cell.x}, {cell.y}
            </span>
            <button disabled={busy || furnitureStack === undefined} type="button" onClick={onPlace}>
              Place {furnitureStack?.item.name ?? 'furniture from inventory'}
            </button>
          </div>
          <div className="cozy-placement-list">
            {home.placements.map((placement) => (
              <article key={placement.id}>
                <strong>{itemName(state.items, placement.furnitureSlug)}</strong>
                <span>
                  Cell {placement.x}, {placement.y} · {placement.rotation}°
                </span>
                <div>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => onFurniture('move', placement)}
                  >
                    Move to selected cell
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => onFurniture('rotate', placement)}
                  >
                    Rotate
                  </button>
                  <button
                    disabled={busy}
                    type="button"
                    onClick={() => onFurniture('remove', placement)}
                  >
                    Store
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
