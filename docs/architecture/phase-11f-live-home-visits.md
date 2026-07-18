# Phase 11F live home visits

Phase 11F adds owner-present, server-authoritative visits to the canonical Phase 11E personal home.
It reuses the existing player profiles, friendships, parties, player blocks, social notifications,
personal homes, immutable layouts, crops, private realtime tickets, administrator authorization,
audit, reconciliation, and worker foundations. It does not create a second social graph, home,
inventory, crop, currency, or world-publication model.

## Lifecycle and definitions

Configure Home → Start Hosting → Invite or Admit Visitors → Socialize → Allow Bounded Help →
Moderate Safely → End Visit → Preserve Privacy and Progress

- **Public** means eligible players may discover the live hosted home.
- **Friends Only** means accepted friends and explicit eligible invites only.
- **Invite Only** means a current invitation is required.
- **Private** means no visitor entry.
- **View Only** means exploration and inspection only.
- **Social Interactions** means emotes, seating, photo areas, guestbook, and appreciation.
- **Allow Helpers** means social interactions plus tightly limited approved assistance.
- **Live Home Visit** means an owner-present realtime multiplayer session.
- **Game Test Visit** means temporary preview participants and data only.

## Settings, policy, and permissions

Each canonical `player_home` has one `home_social_settings` row. Settings hold visibility,
interaction mode, discovery and invitation toggles, guestbook and appreciation toggles, helper
access, join/leave notifications, default visitor mute, admissions, capacity, and an optimistic
configuration revision. Settings default to private, view-only, and no public discovery or helper
access. A lazy settings insert is deliberately `VOLATILE` because loading the owner workspace may
create that private default row.

Global limits are immutable, successor-only `home_visit_policy_versions` selected by an active
pointer. The initial policy permits at most ten visitors, a 60-second owner disconnect grace, a
30-second visitor reconnect grace, 24-hour invitations, a 10-minute guestbook cooldown, five
guestbook messages per day, persistent appreciation selection, and one helper watering per visitor
per game day. Policy activation is versioned and audited; administrators cannot edit an active
version in place.

| Mode                | Enter/walk/inspect | Emote | Sit/photo | Guestbook/appreciation | Water crop               |
| ------------------- | ------------------ | ----- | --------- | ---------------------- | ------------------------ |
| View Only           | Yes                | No    | No        | No                     | No                       |
| Social Interactions | Yes                | Yes   | Yes       | Yes, when enabled      | No                       |
| Allow Helpers       | Yes                | Yes   | Yes       | Yes, when enabled      | Once daily, when enabled |

Player capabilities are snapshotted on each participant and recalculated when the owner changes the
interaction mode. The API, database functions, and realtime service all fail closed if a capability
is absent. Owner and administrator operations have separate scoped functions and permissions.
Administrator writes require an AAL2 session and explicit mutation permissions.

## Session and admission model

Starting hosting requires the owner to be inside the canonical home, connected through an active
private realtime presence, outside Decoration Mode, and using the current settings revision. A
partial unique index and owner advisory lock enforce one live session per home/owner. The session
snapshots visibility, mode, capacity, return destinations, and configuration revision.

Admission is a locked transaction. It rechecks the active policy, owner presence, admissions flag,
visibility, current friendship or invitation, both directions of player blocks, party-snapshot
membership, capacity, and the caller's expected session revision. Public discovery only projects
open Public homes whose owners are connected and discovery is enabled. Friends Only accepts a
current friendship or eligible explicit invitation; Invite Only requires a non-expired, non-revoked
invitation; Private rejects new entry. Invitations are individual, expiring authority records. Party
invitations snapshot a shared active party at issuance and still identify each invited player; they
do not grant an unbounded party bearer token.

The owner is a participant but does not consume one of the ten visitor slots. Each visitor has one
participant row with a safe public profile, role, capabilities, position, movement sequence, social
state, reconnect state, return destination, and optimistic state version. Admission picks a bounded
spawn offset. Two concurrent requests for the final slot serialize on the session row, so exactly
one can succeed. There is no waiting queue.

Visit requests are represented by discovery eligibility and explicit direct, friend, or party
invitations. Phase 11F does not add unsolicited inbox-style entry requests. Join and leave events
can create owner notifications according to the home settings. Recent closed participation is
exposed as bounded visit history without private home contents.

## Realtime authority and transitions

The API issues a short-lived single-purpose ticket bound to the wallet-authenticated participant,
visit session, home, and random token hash. The realtime service admits that ticket once, creates a
server-side realtime session, and isolates traffic in `/home-visit` by visit-session identity. Raw
database or service credentials are never sent to clients.

Snapshots and ordered events carry participant presence, movement, emotes, seating, photo-area
membership, inspection results, removals, blocks, reconnects, policy changes, and closure. Movement
requires finite in-bounds coordinates and a strictly increasing sequence; authoritative checkpoints
are persisted before acknowledgement. Revalidation detects a closed session, revoked participant, or
new player block. Collision remains bounded to the existing home walkability/occupancy model; seats
and photo areas additionally use locked capacity records.

When an owner disconnects, admissions close and the session enters owner reconnect grace. A valid
reconnect restores hosting. Grace expiry closes the session and returns visitors safely. Visitors
receive their own reconnect deadline and retain the slot/last authoritative position during grace;
expiry releases the slot. Owner stop, administrator close, a move to Private that requires closure,
or leaving the home closes the session, revokes realtime authority, clears social occupancy, and
marks active participants returned using their recorded destination.

Decoration Mode and live hosting are mutually exclusive. A database trigger blocks decoration while
a session is starting/open/closing, and starting a visit checks decoration state. Layout revisions
remain immutable and active pinning/reference safety is unchanged.

## Social interactions and safety

Emotes only change bounded social state. Sitting requires guest-enabled furniture and an available
seat; standing releases it. Photo areas use capacity-bound participant records. Furniture inspection
returns guest-safe metadata only. Player inspection exposes only the safe visit profile: presence
identity, display name, level, appearance preset, title, and badge. It never exposes wallets,
inventory, storage, currencies, private moderation data, or raw identifiers beyond visit-safe UUIDs.

Guestbook entries are plain trimmed text of at most 300 characters, subject to policy, per-home
cooldown, daily limit, idempotency, reporting, and owner/admin moderation. Images, links, HTML, and
rich embeds are unsupported. An owner may hide or restore their entries; administrators can hide,
remove, or restore moderator-hidden entries with AAL2, evidence, revision checks, and audit.
Appreciation is one persistent selection per visitor/home (`cozy`, `beautiful`, `creative`, or
`welcoming`), updated with optimistic concurrency and displayed as aggregate counts.

The only helper action is watering one eligible, planted, unwatered owner crop when Allow Helpers,
home settings, and live policy all permit it. The transaction locks the visit, participant, crop,
and daily uniqueness record; checks the crop state revision and home ownership; applies watering
exactly once; and records append-only evidence. The visitor receives no crop output, harvest rights,
DUST, inventory item, repeatable farming XP, quest progress, achievement progress, title, badge, or
other reward. The canonical owner retains harvest and reward ownership. The daily evidence model is
the safe foundation for later explicitly approved cooperative tasks, not a generic mutation grant.

Owners can remove a visitor, block them, hide/restore guestbook entries, close admissions, or end
hosting. A block applies immediately in both directions, removes the participant, revokes their
channel, hides discovery, and denies future admission. Visitors can submit bounded categories and
plain-text reasons; reports retain only safe visit/session/participant/guestbook evidence.
Administrator report transitions, session closure, guestbook moderation, and reconciliation are
audited correction workflows, not arbitrary player-state editors.

## Persistence and protected systems

Normal visits persist settings, session history, invitations, participants, ordered events,
guestbook entries, appreciation, helper evidence, reports, notifications, audit, rate limits,
idempotency results, and reconciliation work. They do not grant visitors direct table access. Tables
use enabled and forced RLS, revoked default grants, security-invoker behavior by default, and narrow
`SECURITY DEFINER` entry points with fixed `search_path` only where authority is required.

Private storage, inventory, DUST, workstations, recipes, jobs, furniture placement, home upgrades,
active layout selection, and crop ownership remain owner-only. No visit function can withdraw,
deposit, buy, sell, craft, collect, decorate, upgrade, publish, approve, or activate. Player blocks,
friendships, and party membership are reused and never silently rewritten by visit admission.

Game Test uses a deterministic owner-plus-ten preview fixture and never calls normal persistence,
realtime admission, notification, friendship, block, guestbook, appreciation, helper, crop, history,
inventory, storage, DUST, progression, or report functions. It is visibly identified as preview
data.

## Administration, workers, and operations

The Admin Portal projects active sessions and participants, invitations, guestbook evidence,
appreciation aggregates, helper activity, reports, reconciliation, telemetry, and append-only audit
history. Scoped forms create and transition policy successors, close a session, moderate a guestbook
entry, transition a report, and request a bounded reconciliation. Read-only roles cannot mutate.
Policy flags pause visits, admissions, social actions, guestbook, appreciation, or helpers without
changing player inventory/economy state.

The maintenance worker closes owner-grace-expired sessions, expires reconnecting visitors, repairs
visitor counts, and consumes bounded reconciliation requests with `FOR UPDATE SKIP LOCKED`. It is
idempotent and safe to retry. Structured request IDs and append-only audit/telemetry records support
diagnosis without tokens, messages beyond their intended moderation projection, or secrets in logs.

Player mutations use scoped fixed-window rate limits, 16–128 character idempotency keys with request
hashes, row/advisory locks, and expected configuration/state revisions. Administrator mutations have
separate rate limits and AAL2 checks. Stale state returns an explicit conflict instead of
overwriting newer authority.

## Fixtures, testing, and responsive behavior

The shared package contains a deterministic Game Test workspace. PostgreSQL execution fixtures use
transaction-owned identities to exercise RLS-facing functions, friendship/invitation/block
admission, guestbook limits, appreciation, helper watering, moderation, closure, replay, and preview
exclusion. A committed local-only concurrency fixture races two joins for the final visitor slot.
Application tests cover contracts, routes, realtime isolation, worker wiring, administrator scope,
and the responsive player panel.

The player and administrator workspaces use native labels, status regions, keyboard-operable forms,
scrollable tables, narrow-screen grids, reduced-motion handling, and explicit loading/empty/error
copy. Movement and social controls remain separate from owner settings to avoid overlapping the
existing gameplay surface.

## Troubleshooting

- `HOME_VISIT_OWNER_ABSENT`: enter the owned home and establish private realtime presence.
- `HOME_VISIT_FULL`: wait for a visitor slot; there is no queue or capacity bypass.
- `HOME_VISIT_FRIEND_REQUIRED` or `HOME_VISIT_INVITATION_REQUIRED`: recheck current visibility and
  authority; do not reuse an expired/revoked invitation.
- `HOME_VISIT_BLOCKED`: a player block applies and cannot be bypassed by an invitation.
- `HOME_VISIT_TRANSITION_CONFLICT`: reload the workspace and retry with the current revision.
- `HOME_VISIT_DECORATION_CONFLICT`: exit Decoration Mode before hosting.
- Realtime `ACCESS_REVOKED` or `HOME_VISIT_CLOSED`: refresh the workspace and use the recorded safe
  return path; do not reconnect with the old ticket.

## Known limitations

Phase 11F has no offline tours, waiting queue, unsolicited visit-request inbox, voice/video, rich
guestbook media, co-owned homes/storage, visitor trading, visitor workstation use, generic helper
actions, helper rewards, paid visits, NFT access, marketplace, or production deployment. Party
invitations are per-player snapshots rather than a broadcast party join. Owner acceptance and any
hosted migration/lint validation remain explicitly pending until separately authorized.
