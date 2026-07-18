import { useEffect, useMemo, useState } from 'react';

import type { CosmeticWardrobe } from '@starville/cosmetics';

import { loadOwnAvatar, type ResolvedAvatarProfile } from '../app/avatar-client';
import {
  applyCosmeticLoadout,
  claimCosmeticCollection,
  deleteCosmeticLoadout,
  loadCosmeticWardrobe,
  renameCosmeticLoadout,
  saveCosmeticLoadout,
  updateCosmeticEmoteWheel,
} from '../app/cosmetics-client';
import { CharacterWardrobeEditor } from './CharacterCustomization';
import { GameEmptyState, GameModalShell, StatusIndicator } from './game-ui';

type WardrobeTab = 'closet' | 'outfits' | 'emotes' | 'collections' | 'shop';

const TABS: readonly [WardrobeTab, string][] = [
  ['closet', 'Closet'],
  ['outfits', 'Saved outfits'],
  ['emotes', 'Emotes'],
  ['collections', 'Collections'],
  ['shop', 'Shop preview'],
];

function selectionDifference(
  saved: ResolvedAvatarProfile['selection'],
  current: ResolvedAvatarProfile['selection'],
): number {
  return (Object.keys(current) as (keyof typeof current)[]).filter(
    (key) => JSON.stringify(saved[key]) !== JSON.stringify(current[key]),
  ).length;
}

export function PremiumWardrobe({
  apiUrl,
  current,
  onClose,
  onSaved,
  onActivateEmote,
}: {
  readonly apiUrl: string;
  readonly current: ResolvedAvatarProfile;
  readonly onClose: () => void;
  readonly onSaved: (profile: ResolvedAvatarProfile) => void;
  readonly onActivateEmote: (emoteKey: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<WardrobeTab>('closet');
  const [wardrobe, setWardrobe] = useState<CosmeticWardrobe>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [names, setNames] = useState<Readonly<Record<number, string>>>({});
  const [wheel, setWheel] = useState<readonly string[]>([]);

  const refresh = () =>
    loadCosmeticWardrobe(apiUrl).then((next) => {
      setWardrobe(next);
      setWheel(next.emoteWheel);
      setNames(
        Object.fromEntries(next.loadouts.map((loadout) => [loadout.slot, loadout.name])) as Record<
          number,
          string
        >,
      );
    });

  useEffect(() => {
    let active = true;
    void loadCosmeticWardrobe(apiUrl)
      .then((next) => {
        if (!active) return;
        setWardrobe(next);
        setWheel(next.emoteWheel);
        setNames(Object.fromEntries(next.loadouts.map((loadout) => [loadout.slot, loadout.name])));
      })
      .catch(() => {
        if (active) setNotice('Your authoritative wardrobe could not be loaded. Nothing changed.');
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const categories = useMemo(
    () => [...new Set(wardrobe?.ownedItems.map((item) => item.category) ?? [])].sort(),
    [wardrobe],
  );
  const owned = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (wardrobe?.ownedItems ?? []).filter(
      (item) =>
        (category === 'all' || item.category === category) &&
        (query === '' || item.name.toLowerCase().includes(query) || item.key.includes(query)),
    );
  }, [category, search, wardrobe]);

  async function mutate(action: () => Promise<void>, message: string): Promise<void> {
    setBusy(true);
    setNotice(undefined);
    try {
      await action();
      await refresh();
      setNotice(message);
    } catch {
      setNotice('That wardrobe action could not be completed. Reload the latest state and retry.');
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <CharacterWardrobeEditor
        apiUrl={apiUrl}
        current={current}
        onClose={() => setEditing(false)}
        onSaved={(profile) => {
          onSaved(profile);
          setEditing(false);
          void refresh();
        }}
      />
    );
  }

  return (
    <GameModalShell
      className="premium-wardrobe"
      closeLabel="Close Wardrobe"
      eyebrow="Your private collection"
      size="wide"
      subtitle="Owned cosmetics and outfit changes are verified by the village server."
      title="Wardrobe"
      onClose={onClose}
    >
      <nav aria-label="Wardrobe sections" className="premium-wardrobe__tabs">
        {TABS.map(([key, label]) => (
          <button
            aria-current={tab === key ? 'page' : undefined}
            className={tab === key ? 'is-active' : ''}
            key={key}
            type="button"
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice === undefined ? null : (
        <p aria-live="polite" className="premium-wardrobe__notice" role="status">
          {notice}
        </p>
      )}
      {wardrobe === undefined ? (
        <div className="avatar-editor-loading" role="status">
          <span className="game-loader" />
          <p>Checking your owned collection…</p>
        </div>
      ) : tab === 'closet' ? (
        <section aria-labelledby="wardrobe-closet-title">
          <div className="premium-wardrobe__section-heading">
            <div>
              <h3 id="wardrobe-closet-title">Your cosmetic ownership</h3>
              <p>
                Search and filter owned, equipped, unavailable, and revoked records. Equip only
                available cosmetics through the canonical appearance editor.
              </p>
            </div>
            <button
              className="game-button game-button--primary"
              type="button"
              onClick={() => setEditing(true)}
            >
              Edit appearance
            </button>
          </div>
          <div className="premium-wardrobe__filters">
            <label>
              Search owned cosmetics
              <input
                value={search}
                type="search"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          {owned.length === 0 ? (
            <GameEmptyState
              title="No matching cosmetic records"
              message="Try a broader search or another category."
            />
          ) : (
            <div className="premium-wardrobe__cards">
              {owned.map((item) => (
                <article key={item.ownershipId}>
                  <span aria-hidden="true">✦</span>
                  <div>
                    <h4>{item.name}</h4>
                    <p>
                      {item.category} · {item.layer}
                    </p>
                  </div>
                  <small>
                    {item.state === 'revoked'
                      ? 'Revoked — this cosmetic can no longer be equipped.'
                      : !item.available
                        ? 'Unavailable — ownership is retained, but this version cannot be equipped.'
                        : item.equipped
                          ? 'Equipped · server verified'
                          : 'Available to equip'}
                  </small>
                  <small>Source: {item.sourceLabel}</small>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : tab === 'outfits' ? (
        <section aria-labelledby="wardrobe-outfits-title">
          <div className="premium-wardrobe__section-heading">
            <div>
              <h3 id="wardrobe-outfits-title">Saved outfits</h3>
              <p>Five revision-safe slots, stored on the server.</p>
            </div>
          </div>
          <div className="premium-wardrobe__loadouts">
            {[1, 2, 3, 4, 5].map((slot) => {
              const loadout = wardrobe.loadouts.find((entry) => entry.slot === slot);
              return (
                <article key={slot}>
                  <div className="premium-wardrobe__loadout-title">
                    <strong>Slot {slot}</strong>
                    {loadout?.active === true ? (
                      <StatusIndicator tone="success">Equipped</StatusIndicator>
                    ) : null}
                  </div>
                  <label>
                    Outfit name
                    <input
                      maxLength={40}
                      value={names[slot] ?? `Outfit ${slot}`}
                      onChange={(event) =>
                        setNames((currentNames) => ({
                          ...currentNames,
                          [slot]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <p>
                    {loadout === undefined
                      ? 'Empty slot'
                      : `${selectionDifference(loadout.selection, current.selection)} choices differ from your current look.`}
                  </p>
                  <div className="premium-wardrobe__actions">
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void mutate(
                          () =>
                            saveCosmeticLoadout(apiUrl, {
                              slot,
                              name: names[slot] ?? `Outfit ${slot}`,
                              selection: current.selection,
                              expectedRevision: loadout?.revision ?? 0,
                            }),
                          `Saved your current appearance to slot ${slot}.`,
                        )
                      }
                    >
                      Save current
                    </button>
                    {loadout === undefined ? null : (
                      <>
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            void mutate(async () => {
                              await applyCosmeticLoadout(
                                apiUrl,
                                loadout.loadoutId,
                                loadout.revision,
                                current.revision,
                              );
                              const profile = await loadOwnAvatar(apiUrl);
                              if (profile !== null) onSaved(profile);
                            }, `Equipped ${loadout.name}.`)
                          }
                        >
                          Equip
                        </button>
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            void mutate(
                              () =>
                                renameCosmeticLoadout(
                                  apiUrl,
                                  loadout.loadoutId,
                                  names[slot] ?? loadout.name,
                                  loadout.revision,
                                ),
                              'Outfit renamed.',
                            )
                          }
                        >
                          Rename
                        </button>
                        <button
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            void mutate(
                              () =>
                                deleteCosmeticLoadout(apiUrl, loadout.loadoutId, loadout.revision),
                              'Outfit slot cleared.',
                            )
                          }
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : tab === 'emotes' ? (
        <section aria-labelledby="wardrobe-emotes-title">
          <div className="premium-wardrobe__section-heading">
            <div>
              <h3 id="wardrobe-emotes-title">Emotes</h3>
              <p>Nearby players see only the compact approved emote event.</p>
            </div>
          </div>
          <div className="premium-wardrobe__cards">
            {wardrobe.emotes.map((emote) => (
              <article key={emote.key}>
                <span aria-hidden="true">☺</span>
                <div>
                  <h4>{emote.name}</h4>
                  <p>
                    {emote.interruptible
                      ? 'Movement interrupts this emote.'
                      : 'Plays to completion.'}
                  </p>
                </div>
                <div className="premium-wardrobe__actions">
                  <button
                    disabled={!emote.owned}
                    type="button"
                    onClick={() => onActivateEmote(emote.key)}
                  >
                    Play
                  </button>
                  <label>
                    <input
                      checked={wheel.includes(emote.key)}
                      disabled={!emote.owned}
                      type="checkbox"
                      onChange={() =>
                        setWheel((currentWheel) =>
                          currentWheel.includes(emote.key)
                            ? currentWheel.filter((key) => key !== emote.key)
                            : currentWheel.length < 8
                              ? [...currentWheel, emote.key]
                              : currentWheel,
                        )
                      }
                    />{' '}
                    Wheel
                  </label>
                </div>
              </article>
            ))}
          </div>
          <button
            disabled={busy}
            type="button"
            onClick={() =>
              void mutate(
                () => updateCosmeticEmoteWheel(apiUrl, wheel, wardrobe.emoteWheelRevision),
                'Emote wheel saved.',
              )
            }
          >
            Save emote wheel
          </button>
        </section>
      ) : tab === 'collections' ? (
        <section aria-labelledby="wardrobe-collections-title">
          <div className="premium-wardrobe__section-heading">
            <div>
              <h3 id="wardrobe-collections-title">Collections</h3>
              <p>Completion rewards are cosmetic-only and issued exactly once.</p>
            </div>
          </div>
          {wardrobe.collections.length === 0 ? (
            <GameEmptyState
              title="No published collections"
              message="Draft collections remain private until reviewed and activated."
            />
          ) : (
            <div className="premium-wardrobe__cards">
              {wardrobe.collections.map((collection) => (
                <article key={collection.key}>
                  <span aria-hidden="true">❖</span>
                  <div>
                    <h4>{collection.name}</h4>
                    <p>{collection.description}</p>
                    <progress
                      aria-label={`${collection.name} progress`}
                      max={collection.requiredCount}
                      value={collection.ownedCount}
                    />
                  </div>
                  <small>
                    {collection.ownedCount}/{collection.requiredCount}
                  </small>
                  {collection.completed && !collection.rewardClaimed ? (
                    <button
                      disabled={busy}
                      type="button"
                      onClick={() =>
                        void mutate(
                          () => claimCosmeticCollection(apiUrl, collection.key),
                          'Collection reward added to your wardrobe.',
                        )
                      }
                    >
                      Claim reward
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="wardrobe-shop-title" className="premium-wardrobe__shop-disabled">
          <p className="game-kicker">Preview only · Purchases disabled</p>
          <h3 id="wardrobe-shop-title">Future DUST cosmetic shop</h3>
          <StatusIndicator tone="warning">Not available</StatusIndicator>
          <p>{wardrobe.shop.message}</p>
          <p>
            No offers, Buy controls, wallet prompts, token claims, or payment actions are present.
          </p>
        </section>
      )}
    </GameModalShell>
  );
}

export function QuickEmoteWheel({
  apiUrl,
  onClose,
  onActivate,
}: {
  readonly apiUrl: string;
  readonly onClose: () => void;
  readonly onActivate: (emoteKey: string) => void;
}) {
  const [wardrobe, setWardrobe] = useState<CosmeticWardrobe>();
  useEffect(() => {
    let active = true;
    void loadCosmeticWardrobe(apiUrl).then((next) => {
      if (active) setWardrobe(next);
    });
    return () => {
      active = false;
    };
  }, [apiUrl]);
  const emotes = (wardrobe?.emoteWheel ?? []).flatMap((key) => {
    const emote = wardrobe?.emotes.find((candidate) => candidate.key === key && candidate.owned);
    return emote === undefined ? [] : [emote];
  });
  return (
    <GameModalShell
      className="emote-wheel"
      closeLabel="Close emote wheel"
      eyebrow="Quick expression"
      size="compact"
      title="Emote wheel"
      onClose={onClose}
    >
      {wardrobe === undefined ? (
        <p role="status">Loading your server-approved emotes…</p>
      ) : emotes.length === 0 ? (
        <GameEmptyState
          title="Your wheel is empty"
          message="Open the Wardrobe Emotes tab to choose up to eight emotes."
        />
      ) : (
        <div className="emote-wheel__grid">
          {emotes.map((emote, index) => (
            <button
              key={emote.key}
              type="button"
              onClick={() => {
                onActivate(emote.key);
                onClose();
              }}
            >
              <span aria-hidden="true">{index + 1}</span>
              {emote.name}
            </button>
          ))}
        </div>
      )}
    </GameModalShell>
  );
}
