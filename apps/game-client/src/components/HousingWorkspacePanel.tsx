import { useEffect, useMemo, useState } from 'react';
import {
  createHousingLocalDraft,
  createHousingRestorationDraft,
  filterPlaceables,
  housingDraftDirty,
  redoHousingDraft,
  simulateGameTestLayout,
  simulateGameTestStorageTransfer,
  simulateGameTestUpgrade,
  undoHousingDraft,
  updateHousingDraft,
  type HousingDraftPlacement,
  type HousingGameTestWorkspace,
  type HousingLocalDraft,
  type HousingLayoutRevisionInspection,
  type HousingRestorationOmission,
  type HousingWorkspace,
} from '@starville/housing';
import {
  inspectHousingRevision,
  loadHousing,
  loadHousingGameTest,
  loadHousingHistory,
  openDecorationSession,
  openHomeStorage,
  purchaseHomeUpgrade,
  saveHousingLayout,
  transferHomeStorage,
  validateHousingLayout,
} from '../app/housing-client';
import { PlayerRequestError } from '../app/player-client';
import { BundledAssetImage } from './BundledAssetImage';
import { HomeVisitsPanel } from './HomeVisitsPanel';

type HousingTab = 'decorate' | 'storage' | 'upgrades' | 'history' | 'visits' | 'game_test';
const errorMessages: Readonly<Record<string, string>> = {
  HOUSING_CONFLICT: 'Your home changed elsewhere. The latest saved layout has been restored.',
  HOUSING_LAYOUT_INVALID: 'The server found a placement that needs attention before saving.',
  HOUSING_FURNITURE_RETURN_BLOCKED:
    'Make room in inventory or Home Storage before packing furniture.',
  HOUSING_STORAGE_FULL: 'Home Storage is full.',
  INVENTORY_FULL: 'Inventory is full.',
  INSUFFICIENT_DUST: 'You do not have enough DUST for this upgrade.',
  UNLOCK_REQUIREMENT_NOT_MET: 'Complete the listed progression requirements first.',
  HOUSING_DISABLED: 'This housing action is temporarily paused.',
};

function message(cause: unknown): string {
  if (cause instanceof PlayerRequestError)
    return errorMessages[cause.code] ?? 'Housing could not complete that request safely.';
  return cause instanceof Error ? cause.message : 'Housing could not complete that request safely.';
}
function draftPlacement(
  workspace: HousingWorkspace,
  x: number,
  y: number,
  placeable: HousingWorkspace['ownedPlaceables'][number],
): HousingDraftPlacement {
  const zone = workspace.zones.find(
    (candidate) =>
      candidate.enabled &&
      candidate.requiredTier <= workspace.home.homeTier &&
      candidate.allowedCategories.includes(placeable.furniture.category),
  );
  if (zone === undefined) throw new Error('No unlocked zone accepts this furniture.');
  return {
    instanceId: null,
    inventoryStackId: placeable.inventoryStackId,
    furnitureDefinitionId: placeable.furniture.id,
    furnitureKey: placeable.furniture.key,
    zoneId: zone.id,
    zoneKey: zone.key,
    x,
    y,
    layer: 0,
    rotation: 0,
  };
}

function furnitureAssetRef(workspace: HousingWorkspace, furnitureKey: string): string | null {
  return (
    workspace.ownedPlaceables.find((entry) => entry.furniture.key === furnitureKey)?.furniture
      .worldAssetRef ?? null
  );
}

export function HousingWorkspacePanel({
  apiUrl,
  realtimeUrl,
}: Readonly<{ apiUrl: string; realtimeUrl?: string | undefined }>) {
  const [workspace, setWorkspace] = useState<HousingWorkspace>();
  const [draft, setDraft] = useState<HousingLocalDraft>();
  const [tab, setTab] = useState<HousingTab>('decorate');
  const [decorationMode, setDecorationMode] = useState(false);
  const [selectedCell, setSelectedCell] = useState({ x: 2, y: 2 });
  const [selectedPlacementIndex, setSelectedPlacementIndex] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<'all' | 'indoor' | 'outdoor' | 'recent'>('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof validateHousingLayout>>>();
  const [gameTest, setGameTest] = useState<HousingGameTestWorkspace>();
  const [upgradeConfirm, setUpgradeConfirm] = useState<string>();
  const [inspectedRevision, setInspectedRevision] = useState<HousingLayoutRevisionInspection>();
  const [restorationOmissions, setRestorationOmissions] = useState<
    readonly HousingRestorationOmission[]
  >([]);
  const [exitPrompt, setExitPrompt] = useState(false);

  useEffect(() => {
    let active = true;
    void loadHousing(apiUrl)
      .then((value) => {
        if (active) {
          setWorkspace(value);
          setDraft(createHousingLocalDraft(value));
        }
      })
      .catch((cause) => active && setError(message(cause)));
    return () => {
      active = false;
    };
  }, [apiUrl]);
  const dirty =
    workspace !== undefined && draft !== undefined && housingDraftDirty(draft, workspace);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const placeables = useMemo(
    () => (workspace === undefined ? [] : filterPlaceables(workspace, search, category)),
    [workspace, search, category],
  );
  const activeZone = workspace?.zones.find(
    (zone) =>
      zone.enabled &&
      zone.requiredTier <= workspace.home.homeTier &&
      zone.type === 'outdoor_ground',
  );
  const selectedPlacement =
    selectedPlacementIndex === null ? undefined : draft?.placements[selectedPlacementIndex];
  const cells = useMemo(
    () =>
      activeZone === undefined
        ? []
        : Array.from(
            {
              length:
                (activeZone.bounds.maxX - activeZone.bounds.minX) *
                (activeZone.bounds.maxY - activeZone.bounds.minY),
            },
            (_, index) => ({
              x:
                activeZone.bounds.minX +
                (index % (activeZone.bounds.maxX - activeZone.bounds.minX)),
              y:
                activeZone.bounds.minY +
                Math.floor(index / (activeZone.bounds.maxX - activeZone.bounds.minX)),
            }),
          ),
    [activeZone],
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (cause) {
      setError(message(cause));
      if (cause instanceof PlayerRequestError && cause.code.includes('CONFLICT')) {
        const latest = await loadHousing(apiUrl).catch(() => undefined);
        if (latest !== undefined) {
          setWorkspace(latest);
          setDraft(createHousingLocalDraft(latest));
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function enterDecoration() {
    if (workspace === undefined) return;
    await run(async () => {
      const opened = await openDecorationSession(apiUrl, workspace);
      setWorkspace(opened.workspace);
      setDraft(createHousingLocalDraft(opened.workspace));
      setDecorationMode(true);
      setNotice('Decoration Mode opened. Changes stay local until Save layout.');
    });
  }
  function change(placements: readonly HousingDraftPlacement[]) {
    if (draft !== undefined) setDraft(updateHousingDraft(draft, placements));
    setValidation(undefined);
  }
  function place(entry: HousingWorkspace['ownedPlaceables'][number]) {
    if (draft === undefined || workspace === undefined) return;
    const placements = [
      ...draft.placements,
      draftPlacement(workspace, selectedCell.x, selectedCell.y, entry),
    ];
    change(placements);
    setSelectedPlacementIndex(placements.length - 1);
  }
  function updateSelected(operation: 'move' | 'rotate' | 'remove') {
    if (draft === undefined || selectedPlacementIndex === null) return;
    const selected = draft.placements[selectedPlacementIndex];
    if (selected === undefined) return;
    if (operation === 'remove') {
      change(draft.placements.filter((_, index) => index !== selectedPlacementIndex));
      setSelectedPlacementIndex(null);
      return;
    }
    change(
      draft.placements.map((entry, index) =>
        index === selectedPlacementIndex
          ? {
              ...entry,
              ...(operation === 'move'
                ? selectedCell
                : { rotation: ((entry.rotation + 90) % 360) as 0 | 90 | 180 | 270 }),
            }
          : entry,
      ),
    );
  }
  async function save() {
    if (workspace === undefined || draft === undefined) return;
    await run(async () => {
      const checked = await validateHousingLayout(apiUrl, workspace, [...draft.placements]);
      setValidation(checked);
      if (!checked.valid) {
        setError('Resolve the highlighted placement issues before saving.');
        return;
      }
      const result = await saveHousingLayout(
        apiUrl,
        workspace,
        [...draft.placements],
        draft.restorationSourceRevisionId,
      );
      setWorkspace(result.workspace);
      setDraft(createHousingLocalDraft(result.workspace));
      setDecorationMode(false);
      setExitPrompt(false);
      setRestorationOmissions([]);
      setNotice(result.announcement);
    });
  }
  function discard() {
    if (workspace === undefined) return;
    setDraft(createHousingLocalDraft(workspace));
    setDecorationMode(false);
    setExitPrompt(false);
    setRestorationOmissions([]);
    setValidation(undefined);
    setNotice('Unsaved decoration changes were discarded.');
  }
  async function restoreRevision(inspection: HousingLayoutRevisionInspection) {
    if (workspace === undefined) return;
    await run(async () => {
      const opened = await openDecorationSession(apiUrl, workspace);
      const restoration = createHousingRestorationDraft(opened.workspace, inspection);
      setWorkspace(opened.workspace);
      setDraft(restoration.draft);
      setRestorationOmissions(restoration.omissions);
      setSelectedPlacementIndex(null);
      setDecorationMode(true);
      setTab('decorate');
      setNotice(
        restoration.omissions.length === 0
          ? 'Historical layout loaded as an unsaved draft. Review it, then Save layout.'
          : `${restoration.omissions.length} unavailable historical placement${restoration.omissions.length === 1 ? ' was' : 's were'} omitted. Review the draft before saving.`,
      );
    });
  }

  if (workspace === undefined)
    return (
      <section className="housing-workspace housing-workspace--loading" aria-live="polite">
        <strong>Preparing your home…</strong>
        {error === undefined ? null : <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section className="housing-workspace" aria-labelledby="housing-title">
      <header className="housing-workspace__header">
        <div>
          <p className="game-kicker">Personal housing</p>
          <h3 id="housing-title">{workspace.home.templateSlug.replaceAll('-', ' ')}</h3>
          <p>
            Tier {workspace.home.homeTier} · layout revision{' '}
            {workspace.layout.activeRevision.revisionNumber} · {workspace.layout.placements.length}/
            {workspace.home.furnitureCapacity} furniture
          </p>
        </div>
        <div className="housing-workspace__header-actions">
          <span>{workspace.dust.balance.toLocaleString()} DUST</span>
          {decorationMode ? (
            <>
              <button type="button" disabled={busy || !dirty} onClick={() => void save()}>
                Save layout
              </button>
              <button type="button" disabled={busy} onClick={discard}>
                Discard
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => (dirty ? setExitPrompt(true) : setDecorationMode(false))}
              >
                Exit mode
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy || !workspace.liveOps.decorationStartsEnabled}
              onClick={() => void enterDecoration()}
            >
              Decoration Mode
            </button>
          )}
        </div>
      </header>
      {notice === undefined ? null : (
        <p className="housing-workspace__notice" role="status">
          {notice}
        </p>
      )}
      {error === undefined ? null : (
        <p className="housing-workspace__error" role="alert">
          {error}
        </p>
      )}
      {exitPrompt ? (
        <div className="housing-unsaved-prompt" role="alert">
          <strong>Unsaved home changes</strong>
          <p>Save Layout, discard the draft, or continue editing.</p>
          <button type="button" disabled={busy || !dirty} onClick={() => void save()}>
            Save Layout
          </button>
          <button type="button" disabled={busy} onClick={discard}>
            Discard Changes
          </button>
          <button type="button" onClick={() => setExitPrompt(false)}>
            Continue Editing
          </button>
        </div>
      ) : null}
      <nav className="housing-workspace__tabs" aria-label="Housing tools">
        {(
          [
            ['decorate', 'Decorate'],
            ['storage', 'Storage'],
            ['upgrades', 'Upgrades'],
            ['history', 'Layout history'],
            ['visits', 'Live visits'],
            ['game_test', 'Game Test'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-current={tab === key ? 'page' : undefined}
            onClick={() => {
              if (dirty && key !== 'decorate') {
                setNotice(
                  'Save or discard unsaved home changes before opening another housing tool.',
                );
                return;
              }
              setTab(key);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <aside className="housing-tutorial" aria-label="Home Sweet Home tutorial">
        <div>
          <strong>Home Sweet Home · {workspace.tutorial.status.replaceAll('_', ' ')}</strong>
          {workspace.tutorial.status === 'available' ? (
            <p>Accept this guided housing quest from My Starville Journey when eligible.</p>
          ) : null}
        </div>
        {workspace.tutorial.objectives.length === 0 ? (
          <small>No active housing objectives.</small>
        ) : (
          <ol>
            {workspace.tutorial.objectives.map((objective) => (
              <li key={objective.key}>
                {objective.complete ? 'Complete: ' : ''}
                {objective.label} ({objective.current}/{objective.required})
              </li>
            ))}
          </ol>
        )}
      </aside>
      {tab === 'decorate' ? (
        <div className="housing-decorate">
          <aside className="housing-palette" aria-label="Owned furniture">
            <div className="housing-palette__filters">
              <label>
                Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} />
              </label>
              <label>
                Filter
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as typeof category)}
                >
                  <option value="all">All</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="indoor">Indoor</option>
                  <option value="recent">Recent</option>
                </select>
              </label>
            </div>
            {placeables.map((entry) => (
              <article key={entry.inventoryStackId}>
                <BundledAssetImage
                  assetKey={entry.furniture.worldAssetRef}
                  alt={`${entry.furniture.displayName} preview`}
                  className="housing-palette__thumbnail"
                />
                <div>
                  <strong>{entry.furniture.displayName}</strong>
                  <small>
                    {entry.availableQuantity} available · {entry.furniture.category}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={
                    !decorationMode ||
                    busy ||
                    entry.availableQuantity < 1 ||
                    entry.unavailableReason !== null
                  }
                  onClick={() => place(entry)}
                >
                  Place
                </button>
              </article>
            ))}
            {placeables.length === 0 ? <p>No owned furniture matches this filter.</p> : null}
          </aside>
          <div className="housing-canvas">
            <div
              className="housing-canvas__toolbar"
              role="toolbar"
              aria-label="Decoration draft controls"
            >
              <button
                type="button"
                disabled={!decorationMode || draft?.undo.length === 0}
                onClick={() => draft !== undefined && setDraft(undoHousingDraft(draft))}
              >
                Undo
              </button>
              <button
                type="button"
                disabled={!decorationMode || draft?.redo.length === 0}
                onClick={() => draft !== undefined && setDraft(redoHousingDraft(draft))}
              >
                Redo
              </button>
              <button
                type="button"
                disabled={!decorationMode || selectedPlacementIndex === null}
                onClick={() => updateSelected('move')}
              >
                Move here
              </button>
              <button
                type="button"
                disabled={!decorationMode || selectedPlacementIndex === null}
                onClick={() => updateSelected('rotate')}
              >
                Rotate
              </button>
              <button
                type="button"
                disabled={!decorationMode || selectedPlacementIndex === null}
                onClick={() => updateSelected('remove')}
              >
                Pack up
              </button>
            </div>
            {activeZone === undefined ? (
              <p>No outdoor decoration zone is available.</p>
            ) : (
              <div
                className="housing-grid"
                style={{
                  gridTemplateColumns: `repeat(${activeZone.bounds.maxX - activeZone.bounds.minX}, minmax(2.25rem,1fr))`,
                }}
                aria-label="Outdoor decoration grid"
              >
                {cells.map((cell) => {
                  const placementIndex =
                    draft?.placements.findIndex(
                      (candidate) => candidate.x === cell.x && candidate.y === cell.y,
                    ) ?? -1;
                  const placement =
                    placementIndex < 0 ? undefined : draft?.placements[placementIndex];
                  const placementAssetRef =
                    placement === undefined
                      ? null
                      : furnitureAssetRef(workspace, placement.furnitureKey);
                  const selected = selectedCell.x === cell.x && selectedCell.y === cell.y;
                  return (
                    <button
                      key={`${cell.x}:${cell.y}`}
                      type="button"
                      className={`${selected ? 'is-cell-selected ' : ''}${placement !== undefined ? 'is-occupied' : ''}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setSelectedCell(cell);
                        setSelectedPlacementIndex(placementIndex < 0 ? null : placementIndex);
                      }}
                    >
                      <span>
                        {placement === undefined ? (
                          '·'
                        ) : (
                          <BundledAssetImage
                            assetKey={placementAssetRef}
                            alt=""
                            className="housing-grid__furniture"
                            rotation={placement.rotation}
                          />
                        )}
                      </span>
                      <small>
                        {cell.x},{cell.y}
                      </small>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedPlacement === undefined ? (
              <p className="housing-workspace__hint">
                Select a grid cell or owned furniture. Placement validity is confirmed by the server
                before Save Layout.
              </p>
            ) : (
              <aside className="housing-selection" aria-label="Selected furniture inspector">
                <BundledAssetImage
                  assetKey={furnitureAssetRef(workspace, selectedPlacement.furnitureKey)}
                  alt={`${selectedPlacement.furnitureKey.replaceAll('-', ' ')} placement preview`}
                  className="housing-selection__preview"
                  rotation={selectedPlacement.rotation}
                />
                <strong>{selectedPlacement.furnitureKey.replaceAll('-', ' ')}</strong>
                <span>
                  Coordinates {selectedPlacement.x}, {selectedPlacement.y}
                </span>
                <span>Rotation {selectedPlacement.rotation} degrees</span>
                <span>Zone {selectedPlacement.zoneKey.replaceAll('-', ' ')}</span>
              </aside>
            )}
            {restorationOmissions.length === 0 ? null : (
              <ul
                className="housing-validation"
                aria-label="Historical placements requiring review"
              >
                {restorationOmissions.map((omission, index) => (
                  <li key={`${omission.furnitureDefinitionId}-${index}`} className="is-warning">
                    A historical furniture item was omitted: {omission.reason.replaceAll('_', ' ')}.
                  </li>
                ))}
              </ul>
            )}
            <p className="housing-workspace__hint">
              Outdoor placement is fully supported. Indoor floor and wall zones remain disabled
              until an actual indoor renderer ships.
            </p>
            {validation === undefined ? null : (
              <ul className="housing-validation" aria-label="Layout validation">
                {validation.issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={`is-${issue.severity}`}>
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      {tab === 'storage' ? (
        <div className="housing-storage">
          <header>
            <div>
              <h4>Home Storage</h4>
              <p>
                {workspace.storage.usedSlots}/{workspace.storage.capacity} slots · version{' '}
                {workspace.storage.stateVersion}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => setWorkspace(await openHomeStorage(apiUrl, workspace)))
              }
            >
              Refresh storage
            </button>
          </header>
          <div className="housing-storage__columns">
            <section>
              <h5>Stored items</h5>
              {workspace.storage.stacks.map((stack) => (
                <article key={stack.id}>
                  <span>
                    <strong>{stack.itemName}</strong>
                    <small>{stack.quantity} stored</small>
                  </span>
                  <button
                    type="button"
                    disabled={busy || !workspace.liveOps.storageWithdrawalsEnabled}
                    onClick={() =>
                      void run(async () => {
                        const result = await transferHomeStorage(
                          apiUrl,
                          workspace,
                          'withdrawal',
                          stack.itemDefinitionId,
                        );
                        setWorkspace(result.workspace);
                        setNotice(result.announcement);
                      })
                    }
                  >
                    Withdraw one
                  </button>
                </article>
              ))}
            </section>
            <section>
              <h5>Eligible furniture inventory</h5>
              {workspace.ownedPlaceables
                .filter((entry) => entry.availableQuantity > 0)
                .map((entry) => (
                  <article key={entry.inventoryStackId}>
                    <span>
                      <strong>{entry.furniture.displayName}</strong>
                      <small>{entry.availableQuantity} in inventory</small>
                    </span>
                    <button
                      type="button"
                      disabled={busy || !workspace.liveOps.storageDepositsEnabled}
                      onClick={() =>
                        void run(async () => {
                          const result = await transferHomeStorage(
                            apiUrl,
                            workspace,
                            'deposit',
                            entry.furniture.itemDefinitionId,
                          );
                          setWorkspace(result.workspace);
                          setNotice(result.announcement);
                        })
                      }
                    >
                      Store one
                    </button>
                  </article>
                ))}
            </section>
          </div>
        </div>
      ) : null}
      {tab === 'upgrades' ? (
        <div className="housing-upgrades">
          <p>Permanent upgrades consume DUST exactly once and never rewrite immutable layouts.</p>
          {workspace.upgrades.map((upgrade) => (
            <article key={upgrade.versionId}>
              <div>
                <strong>{upgrade.displayName}</strong>
                <p>{upgrade.description}</p>
                <small>
                  {upgrade.dustCost} DUST · furniture {upgrade.furnitureCapacity} · storage{' '}
                  {upgrade.storageCapacity}
                </small>
                {upgrade.unavailableReasons.length === 0 ? null : (
                  <small>Requires: {upgrade.unavailableReasons.join(', ')}</small>
                )}
              </div>
              {upgradeConfirm === upgrade.versionId ? (
                <div>
                  <p>Confirm this permanent Tier {upgrade.targetTier} upgrade?</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await purchaseHomeUpgrade(
                          apiUrl,
                          workspace,
                          upgrade.versionId,
                        );
                        setWorkspace(result.workspace);
                        setUpgradeConfirm(undefined);
                        setNotice(result.announcement);
                      })
                    }
                  >
                    Confirm {upgrade.dustCost} DUST
                  </button>
                  <button type="button" onClick={() => setUpgradeConfirm(undefined)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={
                    busy ||
                    dirty ||
                    upgrade.owned ||
                    !upgrade.eligible ||
                    !workspace.liveOps.upgradesEnabled
                  }
                  onClick={() => setUpgradeConfirm(upgrade.versionId)}
                >
                  {upgrade.owned ? 'Owned' : 'Review upgrade'}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : null}
      {tab === 'history' ? (
        <div className="housing-history">
          <header>
            <div>
              <h4>Immutable layout history</h4>
              <p>Restoring a revision creates a new revision; history is never edited.</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const history = await loadHousingHistory(apiUrl, workspace.home.id);
                  setWorkspace({
                    ...workspace,
                    layout: { ...workspace.layout, history: history.revisions },
                  });
                })
              }
            >
              Refresh
            </button>
          </header>
          {workspace.layout.history.map((revision) => (
            <article key={revision.id}>
              <div>
                <strong>
                  Revision {revision.revisionNumber}
                  {revision.current ? ' · Current' : ''}
                </strong>
                <small>{revision.changeSummary.join(' · ')}</small>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const value = await inspectHousingRevision(
                      apiUrl,
                      workspace.home.id,
                      revision.id,
                    );
                    setInspectedRevision(value);
                  })
                }
              >
                Inspect
              </button>
            </article>
          ))}
          {inspectedRevision === undefined ? null : (
            <section
              className="housing-history__inspection"
              aria-label="Read-only revision snapshot"
            >
              <strong>
                Revision {inspectedRevision.revision.revisionNumber} ·{' '}
                {inspectedRevision.revision.furnitureCount} furniture
              </strong>
              <p>{inspectedRevision.revision.changeSummary.join(' · ')}</p>
              <ul>
                {inspectedRevision.placements.map((placement) => (
                  <li key={placement.instanceId}>
                    Furniture {placement.furnitureDefinitionId} at {placement.x}, {placement.y} ·{' '}
                    {placement.rotation}°
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={busy || inspectedRevision.revision.current}
                onClick={() => void restoreRevision(inspectedRevision)}
              >
                Restore as New Layout Draft
              </button>
            </section>
          )}
        </div>
      ) : null}
      {tab === 'visits' ? <HomeVisitsPanel apiUrl={apiUrl} realtimeUrl={realtimeUrl} /> : null}
      {tab === 'game_test' ? (
        <div className="housing-game-test">
          <strong>Game Test Housing</strong>
          <p>Housing uses temporary preview data. Nothing will be saved.</p>
          {gameTest === undefined ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(async () => setGameTest(await loadHousingGameTest(apiUrl)))}
            >
              Open isolated fixture
            </button>
          ) : (
            <>
              <p>
                Fixture revision {gameTest.layout.activeRevision.revisionNumber} ·{' '}
                {gameTest.layout.placements.length} temporary placements · Tier{' '}
                {gameTest.home.homeTier} · {gameTest.dust.balance} preview DUST
              </p>
              <div className="housing-game-test__actions">
                <button
                  type="button"
                  onClick={() => {
                    const projected = simulateGameTestLayout(
                      gameTest,
                      createHousingLocalDraft(gameTest as unknown as HousingWorkspace).placements,
                    );
                    setGameTest(projected.workspace);
                    setNotice(projected.announcement);
                  }}
                >
                  Simulate local layout
                </button>
                <button
                  type="button"
                  disabled={
                    gameTest.ownedPlaceables[0] === undefined ||
                    gameTest.ownedPlaceables[0].availableQuantity < 1
                  }
                  onClick={() => {
                    const placeable = gameTest.ownedPlaceables[0];
                    if (placeable === undefined) return;
                    const projected = simulateGameTestStorageTransfer(
                      gameTest,
                      'deposit',
                      placeable.furniture.itemDefinitionId,
                    );
                    setGameTest(projected.workspace);
                    setNotice(projected.announcement);
                  }}
                >
                  Simulate storage deposit
                </button>
                <button
                  type="button"
                  disabled={gameTest.storage.stacks[0] === undefined}
                  onClick={() => {
                    const stack = gameTest.storage.stacks[0];
                    if (stack === undefined) return;
                    const projected = simulateGameTestStorageTransfer(
                      gameTest,
                      'withdrawal',
                      stack.itemDefinitionId,
                    );
                    setGameTest(projected.workspace);
                    setNotice(projected.announcement);
                  }}
                >
                  Simulate storage withdrawal
                </button>
                <button
                  type="button"
                  disabled={gameTest.upgrades.every(
                    (upgrade) => !upgrade.eligible || upgrade.owned,
                  )}
                  onClick={() => {
                    const upgrade = gameTest.upgrades.find(
                      (entry) => entry.eligible && !entry.owned,
                    );
                    if (upgrade === undefined) return;
                    const projected = simulateGameTestUpgrade(gameTest, upgrade.versionId);
                    setGameTest(projected.workspace);
                    setNotice(projected.announcement);
                  }}
                >
                  Simulate home upgrade
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
