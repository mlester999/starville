# Phase 9A.1 public documentation maintenance

This contributor runbook covers the public Starville field guide in `apps/landing`. It is not a
player-facing page and does not authorize deployment, publication, configuration changes, or hosted
writes.

## Source layout

- `src/content/docs/types.ts` defines the closed content, block, audience, section, and
  public-status types. Add a new block type only when the existing paragraph, list, steps, keys,
  table, links, and callout types cannot express the player need safely.
- `src/content/docs/status.ts` is the single source for public feature status and its presentation
  labels. The docs index, Game Status page, roadmap summaries, search results, and guide badges must
  not maintain competing status tables.
- `src/content/docs/pages-*.ts` contains the focused public guides. `pages.ts` owns ordering, route
  registration, related-page resolution, neighbors, and the typed search index.
- `src/content/docs/how-to-play.ts` contains the long-form practical player guide. `index-page.ts`
  contains the substantive documentation home.
- `src/components/docs` contains the renderer, shell, status badge, local search, responsive
  navigation, mobile drawer, table of contents, breadcrumbs, related guides, and previous/next
  navigation.
- `src/app/docs/[slug]/page.tsx` renders the closed route registry. Do not add arbitrary executable
  MDX or dynamic content evaluation for public guides.

## Add or revise a guide

1. Confirm the system in the repository and its current owner-acceptance and deployment evidence. Do
   not write from the long-term master specification alone.
2. Define the page through `defineDocumentationPage`. Include a unique slug, existing route, useful
   title and description, section, audience, public status, keywords, related slugs, and ordered
   content sections.
3. Give every content section a unique, stable, URL-safe ID. Its table-of-contents anchor is derived
   from that ID.
4. Register a new focused page once in `DOCUMENTATION_PAGES`. This creates its static route, desktop
   and mobile navigation, search entry, and previous/next position.
5. Add related links as registered slugs. Add inline guide cards only with safe internal routes or
   intentionally reviewed public HTTPS destinations.
6. Update `DOCUMENTATION_REVIEW_DATE` only when the content or evidence was actually reviewed. Do
   not generate a fake live timestamp.
7. Add or update tests for route coverage, links, headings, content depth, search terms, metadata,
   status consistency, and prohibited claims.

## Update feature status

Use one of the closed status values:

| Status         | Public meaning                                                    | Evidence needed                                                    |
| -------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `available`    | Available in the current public experience                        | Confirmed deployed behavior or intentionally public static content |
| `owner_tested` | The owner manually tested the named core behavior                 | Recorded owner confirmation scoped to that behavior                |
| `testing`      | Implemented; full signed-in owner acceptance remains open         | Implementation and local tests, with acceptance explicitly tracked |
| `local_only`   | Implemented locally; hosted deployment and validation remain open | Local implementation and validation only                           |
| `planned`      | Approved direction, not currently available                       | Product direction without an availability claim                    |
| `deferred`     | Outside the current delivery scope                                | Explicit phase deferral                                            |
| `disabled`     | Guarded foundation not active for players                         | Code may exist, but activation is intentionally off                |
| `admin_only`   | Restricted to authorized operations staff                         | Server and database authorization, never navigation alone          |

Change the matching `PUBLIC_FEATURE_STATUSES` record and review every guide that discusses the
feature. A local test does not justify `available`. A hosted migration does not by itself justify
owner acceptance. A passing owner test for one core behavior does not automatically promote adjacent
edge cases.

## Controls and runtime values

Before changing controls, inspect the current game input and Settings components. The public
reference currently documents WASD movement, Shift jogging, E interaction, 1–8 quickbar, Enter chat,
and Escape close/back. Do not add a binding because it appears in a concept document.

Before changing wallet copy, inspect the current public wallet configuration and access flow. The
Phase 9A.1 content describes Solana Mainnet Beta and an expected threshold of 10,000 configured
STAR, while clearly stating that the live reviewed access screen is authoritative. Never hardcode or
expose a private RPC, secret, or unpublished mint.

Before changing rewards, limits, prices, or cooldowns:

1. Confirm the value in the current published or development configuration.
2. Label a value as development configuration when hosted publication is not proven.
3. Update the focused guide, How to Play summary, status source when relevant, and tests in one
   change.
4. Never infer a reward from a simulation report or automatically present a recommended tuning
   candidate as active.

Moonpetal’s current guide labels 15 DUST, 2 Moonbeans, two rewarded completions per UTC day, an
entry cooldown around 60 seconds, and a reward cooldown around 300 seconds as development values.
Remove that qualifier only after the deployed published configuration and owner acceptance support
the change.

## Public-information safety

Public guides may explain responsibility and safe behavior. They must not reveal local filesystem
paths, hosted project identifiers, credentials, private database locations, raw access policies,
internal recovery procedures, staff-only controls, private evidence, exact anti-abuse thresholds,
wallet signatures, authorization data, or user information.

Always preserve these clarifications:

- DUST is off-chain game currency, is not withdrawable, and cannot currently convert to STAR or SOL.
- DUST is not currently transferable through gifts or trades.
- Ordinary access does not ask the player to send or approve tokens.
- Starville never asks for a seed phrase, recovery phrase, private key, or wallet password.
- Token rewards, on-chain claims, Play-to-Earn, staking, withdrawals, swaps, marketplace, auctions,
  and NFTs are not active.
- Locally implemented Phase 9A economy work is not described as hosted.
- Deferred Phase 8 owner acceptance remains open until evidence changes.

Avoid operational detail that would help abuse. Player troubleshooting needs friendly checks, not
exact rate-limit or risk-scoring thresholds.

## Roadmap maintenance

The public roadmap uses Complete, Testing, In Development, Planned, and Deferred as player-readable
project states. Do not add dates until the owner approves them for publication. A roadmap move must
agree with the typed feature-status source and Game Status page.

Keep current functionality separate from future research. Cosmetic utility, more cooperative
activities, more worlds, and additional cozy systems can be described as direction. Token economics
cannot be described as active until a later explicitly authorized phase passes its security, legal,
hosted, and owner-acceptance gates.

## Validation

Run the landing package checks after every documentation change:

```sh
pnpm --filter @starville/landing format:check
pnpm --filter @starville/landing lint
pnpm --filter @starville/landing typecheck
pnpm --filter @starville/landing test
pnpm --filter @starville/landing build
```

The documentation test suite checks the 18 required nested routes, internal links, stable anchors,
one-H1 rendering, heading hierarchy, unique feature keys, status routes, local search, mobile drawer
keyboard behavior, metadata, forbidden internal language, truthful economy and token claims,
owner-tested status, deferred status, current controls, and non-placeholder content depth.

For manual responsive acceptance, inspect 360×800, 390×844, 768×1024, 820×1180, 1024×768, 1280×800,
1440×900, and 1920×1080. Confirm no horizontal page overflow; drawer, search, tables, keyboard keys,
callouts, headings, previous/next links, and footer remain reachable. Test keyboard-only navigation,
visible focus, Escape drawer close, focus restoration, reduced motion, and screen-reader landmarks.

Do not run hosted write commands from this documentation workflow. Do not commit or push unless the
owner separately requests those actions.
