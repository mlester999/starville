# Phase 10B cosmetic trust boundaries

Status: local security and database execution review complete; hosted validation pending.

## Protected outcomes

Ownership, revocation, saved outfits, active avatar selection, emote entitlements, collection
completion, cosmetic rewards, settings, public content, and audit evidence are server-authoritative.
Cosmetics must never become an authority path for DUST, inventory, token claims, wallet access,
movement, moderation, content publication, or administrator authorization.

## Threats and controls

| Threat                                                    | Control                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Browser invents ownership or reward                       | Forced RLS, no direct table grants, narrow service-role RPCs and closed definition foreign keys                |
| Browser equips an unowned, revoked or inactive cosmetic   | Canonical Phase 10A selection resolution inside the database transaction                                       |
| Stale tabs overwrite outfit or wheel state                | Expected revisions, row locks and compare-and-set responses                                                    |
| Same request is retried or changed                        | Advisory request lock plus exact hash/response replay; changed intent conflicts                                |
| Concurrent grants or collection claims duplicate a reward | Global request lock, state lock, unique ownership and receipt constraints                                      |
| Revocation leaves an invalid equipped reference           | Transactional canonical profile repair and reviewed fallback chain                                             |
| Realtime client broadcasts an arbitrary emote             | Server checks current admitted session/channel, entitlement, lifecycle and duration before event creation      |
| Public payload leaks private evidence                     | Dedicated wardrobe/admin/public-appearance envelopes; public appearance omits ownership, reasons and admin IDs |
| Cosmetic media triggers script execution                  | HTTP(S) or safe same-origin relative media schema; no SVG/script/data/file/JavaScript URL mutation             |
| Disabled preview becomes a real shop                      | No purchase RPC, no offers outside draft, false-only database constraints and false-only platform validation   |
| Support role gains broad economy authority                | Explicit one-player grant/revoke only; no bulk, publish, approve, settings, DUST or token permission           |

## Database review

The fresh local database gate queries `information_schema`, `pg_class`, function privileges and
table privileges. It proves required Phase 10A/10B columns exist, every authority table forces RLS,
browser roles cannot read or mutate ownership, and the service role cannot update immutable
receipts. The fixture executes the actual player, administrator, collection, emote and public
appearance functions and rolls the transaction back.

The fixture also runs conflicting replays, stale revisions, duplicate wheel keys, unavailable
content, disabled modules, exact grant/revoke replays, immutable receipt mutation, 81-character
keys, repeated Wardrobe reads and bounded administrator audit pages. Separate connections race two
grants, two loadout saves, two collection claims, and two wheel updates, then assert one coherent
state.

All security-definer functions set an empty `search_path`. Private helpers receive no public,
anonymous, authenticated, or service-role execution grants. Player/admin public functions are
granted only to `service_role`, and the API remains responsible for deriving authenticated context.

## Privacy and logging

Player Wardrobe data is private to the authenticated player. Other players receive only the resolved
public avatar required to render the entity and bounded channel emote events. Do not log cookies,
session hashes, authorization headers, wallet signatures, full private Wardrobe payloads, grant
explanations, private World Asset intake paths, raw SQL errors, or token data.

The public appearance envelope is explicitly tested to exclude owned-item lists, acquisition history
and grant reasons. Cosmetic media validation rejects protocol-relative paths and `javascript:`,
`data:`, and `file:` schemes.

## Migration incident addressed

The hosted `20260716100000` Phase 10A schema predates local definition fields used by Phase 10B, and
the hosted avatar version table has no `public_name`. The original `20260716111000` transaction
failed at `version.public_name` and was absent from hosted migration history. Read-only queries
confirmed zero hosted avatar definitions/versions and no Phase 10B function residue.

The repair is forward-only: `20260716110500` adds/backfills the missing definition/settings fields,
while cosmetic names remain owned by `avatar_content_definitions.display_name`. `20260716110700`
installs the canonical avatar mutation functions and removes the quoted JSON-to-UUID cast. Already
applied migration files were not edited.
