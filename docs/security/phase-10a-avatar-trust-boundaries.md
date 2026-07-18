# Phase 10A avatar trust boundaries

Status: local security review complete for implementation; hosted RLS and owner acceptance pending.

## Protected outcomes

The avatar system must preserve one canonical player identity, one authoritative appearance
revision, closed compatible catalog references, immutable active content, approved asset versions,
safe public profile resolution, and accurate world/channel presence. Cosmetic presentation must
never become an authority path for movement, currency, inventory, rewards, wallet access,
moderation, or administration.

## Threats and controls

| Threat                                                                 | Control                                                                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser submits an unpublished or invented key                         | Strict shared schema plus database closed-registry and active-version validation                                                                       |
| Browser submits raw URL, data URL, asset path, render order, or script | Closed request objects, no general-purpose URL mutation, static security scan, approved asset-version references                                       |
| Player selects protected administrator content                         | Trusted catalog filtering and server-side protected-content rejection; wallet eligibility grants no admin permission                                   |
| Two first-time creates or stale updates race                           | Unique canonical profile, idempotent request record, expected revisions and row locking                                                                |
| Content is disabled while a profile saves                              | Mutation and compatibility checks execute transactionally against the current module/content state                                                     |
| Active content changes or is deleted                                   | Active versions and published children are immutable; deletion fails; controlled superseding preserves history                                         |
| Appearance update resets or duplicates a player                        | Realtime updates carry compact revision references and reconcile the existing entity in place                                                          |
| Public appearance leaks identity or private operations                 | Dedicated resolved-public response omits wallet, email, sessions, private inventory, locked catalog, DUST, token holdings, moderation and intake paths |
| Asset pipeline is bypassed                                             | Avatar versions pin approved World Asset and exact asset-version references; no separate upload bucket                                                 |
| Admin workflow collapses separation of duties                          | Narrow permissions, structured forms, explicit validation/review/approval/activation and append-only audit                                             |
| A runtime asset triggers code execution                                | PNG/WebP asset contract, SVG script rejection, no `eval`, `Function`, JavaScript URLs or configuration-driven imports                                  |

## Database boundary

Avatar tables use forced Row Level Security and no browser grants. Security-definer functions are
service-role-only, pin `search_path`, validate the authenticated session hash, enforce bounded
identifiers and payload sizes, and return bounded envelopes instead of raw database errors. Player
operations are bound to the canonical player resolved from the trusted wallet session; a browser
does not submit a trusted player identifier.

Completed player request identities are replay-safe. Reusing an identifier for a different operation
fails. Mutations require the current profile revision except first creation, which uses the absence
of a profile as its concurrency boundary. Active definition references, preset references, mappings,
reviews, validation evidence, and audits preserve foreign-key integrity.

## API and realtime boundary

Player endpoints authenticate first, parse strict bodies, derive the request identity at the trusted
edge, rate-limit by the safe authenticated context, and call narrow RPCs. They never use direct
authenticated table writes. Safe error messages distinguish unavailable content, a stale profile,
temporary maintenance, and rate limiting without returning SQL details.

Public resolution takes a player identity only at a trusted boundary and returns visual information
required to draw that player. Realtime persistence hydrates the compact appearance reference from
the admitted session. A client can request refresh but cannot choose the appearance identifier or
revision that is broadcast. Appearance URLs never enter join, movement, stop, channel, or appearance
event payloads.

## Administrator boundary

The dedicated Avatar Content routes require both the `avatar_customization` module and narrow
backend permissions. The permissions separate read, audit read, edit, review, approve, activate,
settings read, settings edit, and limited support profile read. Navigation visibility is a
presentation convenience and never substitutes for route or API authorization.

The editor exposes bounded fields, compatibility selection, approved asset references, anchors,
offsets, render order, sprite-grid metadata, frame timing, directions, states, and preview scale. It
does not expose raw JSON, arbitrary URLs, SVG markup, scripts, or source file mutation. Reviewers
cannot silently edit submitted versions. Activation and preset publication are explicit and
revision-checked.

## Static security scan

`scripts/avatar-security-boundary.ts` extends the repository scan with high-signal rules for:

- raw external avatar asset fields;
- data URLs in avatar runtime source;
- SVG script or load/error handler content;
- `eval`, `Function`, and JavaScript animation configuration;
- browser-controlled render order or asset paths;
- private asset-intake references in public contracts;
- wallet, email, inventory, token, or session fields in public appearance contracts;
- direct avatar-table mutations outside trusted RPCs;
- player-exposed administrator cosmetic bypasses; and
- configuration-driven dynamic imports.

The scan supplements, rather than replaces, content security policy, image decoding controls,
storage review, API schemas, RLS, SQL constraints, and runtime catalog validation. Its fixtures are
isolated tests and are not executable feature code.

## Logging and incident response

Log stable request, operation, result, appearance revision, and safe definition identifiers where
operationally necessary. Do not log access tokens, authorization headers, cookies, wallet addresses
in public appearance context, email, full profile selections at high volume, asset-intake locations,
or raw SQL errors.

If protected content appears publicly, disable the affected definition or avatar module through the
reviewed local/hosted operational process, preserve audit evidence, invalidate affected resolved
caches, and verify that existing players resolve through a compatible fallback. Do not delete active
evidence or directly rewrite player rows. Hosted changes remain owner-authorized operations and are
outside this local implementation run.
