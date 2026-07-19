# Phase 12D visual trust boundaries

Phase 12D changes local presentation assets, delivery classification, and visual review surfaces. It
does not move world, player, inventory, DUST, progression, farming, housing, social, realtime,
authentication, authorization, collision, or publication authority into the browser.

## Authority remains server-side

- The immutable world manifest owns stable asset identities, coordinates, terrain, safe bounds,
  collision, spawns, exits, interactions, and version identity.
- Asset images are presentation. Missing, candidate, or replaced media cannot remove logical
  collision or create an interaction.
- Character pose selection renders an already-authorized movement state. It does not set position,
  speed, collision, presence membership, or persistence.
- Local visual settings and Reduced Motion affect presentation only.
- World Composer and Visual Readiness findings remain advisory. They cannot approve, activate,
  publish, save acceptance, or rewrite a draft automatically.
- Game Test continues to require its protected grant and remains no-progression.

## Exact version and path boundary

V1 technical material and V2 candidate material have separate immutable roots and manifest
identities. Runtime resolution follows exact pins before any fallback. An unpinned V2 preference is
limited to draft, Game Test, and Admin preview contexts; published gameplay cannot silently select
it.

The Game Client Vite boundary:

- serves only WebP paths present in the typed V1 or V2 manifest allowlist;
- requires exactly one `manifest` query whose value matches the requested path version;
- decodes and normalizes the URL before lookup;
- resolves both root and candidate through the filesystem and rejects symlink escape;
- emits only manifest-listed runtime and thumbnail files; and
- returns a safe missing response rather than exposing a filesystem path.

The Admin bundled-media route resolves a validated stable key, variant, and manifest version. User
input never becomes an arbitrary local path. The comparison component is read-only.

## Material classification boundary

New deliveries explicitly distinguish:

- `bundled_development` for V1 technical material;
- `bundled_candidate` for V2 production-candidate material; and
- `uploaded` for complete immutable storage-backed media.

V2 rejects a missing material class. Candidate material must identify manifest `2.0.0`, retain the
development marker used for nondelivered repository media, and expose no storage URL. Uploaded
material must provide complete delivery metadata and cannot claim a bundled manifest identity.
Legacy V1 input remains parseable only for compatibility.

This classification prevents a candidate from appearing as uploaded production media. It is not an
art-approval mechanism.

## Database and activation boundary

The local forward-only Phase 12D migration creates immutable bundled-manifest and per-key registry
tables with forced RLS and no grants to `public`, `anon`, `authenticated`, or `service_role`. The
tables reject normal update and delete operations. Registry insertion validates game identity,
stable key, repository ownership, source kind, checksum, readiness, version row, and path roots.

A manifest may claim `final` only with:

- repository-authored source provenance;
- an authorized accepting administrator;
- acceptance timestamp; and
- nonempty evidence.

A trigger rejects activation of repository-authored material unless both manifest and entry are
registered final. Candidate registration alone cannot activate art. The migration does not change an
active pointer, upload history, world pin, or published revision and was not pushed or applied to a
hosted target.

## Terrain and fallback boundary

The server derives bounded terrain dependencies from the immutable map composition. New draft
normalization records those keys, while reads accept historical revisions. Player and Game Test
delivery projection rejects unexpected material outside the derived dependency set.

The renderer tries exact selected texture, same-key bundled texture, stable missing material, then
procedural drawing. A visual fallback does not claim that the exact media loaded and does not mutate
the pin. Safe logs and UI diagnostics identify the stable key and resolution class, not private
storage credentials or internal paths.

## Local Game Test boundary

The Phase 12D local review source:

- is available only after an authorized Lantern Square Game Test grant;
- must be chosen explicitly;
- is labeled local, unpublished, in-memory, and production-candidate;
- binds exact V2 candidate deliveries without a storage URL;
- cannot be substituted for another map;
- cannot publish, activate, grant items, alter DUST, progress farming, save housing, write visits,
  join public realtime, or persist acceptance; and
- leaves the exact authorized revision as the default.

Admin comparison, character matrices, and visual-acceptance fixtures are evidence surfaces only.

## Local normal-client candidate boundary

The normal Game Client has one nonpersistent local review switch: `?visual-candidate=v2`. It
requires `import.meta.env.DEV` and a loopback hostname (`localhost`, `127.0.0.1`, or `[::1]`).
Production builds, non-loopback hosts, absent/invalid values, and normal published sessions fail
closed to `published_v1`. The switch is not stored in local storage, session storage, cookies, a
database, or a world revision.

When enabled, the browser constructs exact in-memory `bundled_candidate` deliveries only for stable
keys present in the V2 manifest. It disables active-upload substitution for that selection and
verifies the exact V2 identity through the existing resolver. An invalid or missing candidate keeps
the selected published delivery or ordinary V1 fallback. World/version/checksum identity, object
coordinates, collisions, interactions, movement, player state, and persistence authority are not
changed.

## Provenance and content safety

No external marketplace or commercial-game art may be introduced without explicit approval and
source review. Similarity to a protected character, map, silhouette, UI, or asset family remains a
blocking issue even if no source file was copied.

The Phase 12D PNG is task-generated concept reference only and is outside runtime. Generated V2 SVG
and WebP files remain candidates until originality and owner review pass. User-owned uploaded art
and uploaded-version history must not be overwritten by repository generation.

The disabled Animal Care metadata remains disabled and unreleased. Phase 12D adds no animals,
livestock, NFTs, marketplace, crypto reward, or mechanic from Fablesol, Pokentara, Sailana, or
AIvanza.

## Operational boundary

This phase authorizes local repository work only. It does not authorize:

- a hosted database or storage write;
- migration push;
- V2 registry insertion on a hosted target;
- uploaded or repository asset activation;
- hosted production-asset replacement;
- world publication;
- deployment;
- player/gameplay/economy/realtime record mutation;
- commit; or
- Git push.

No secret, service-role key, private credential, or signed storage path belongs in checked-in visual
metadata or documentation.
