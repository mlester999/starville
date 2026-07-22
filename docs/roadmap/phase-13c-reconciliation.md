# Phase 13C roadmap reconciliation

## Current roadmap

| Phase | Scope                                                                                                | Truthful status                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 12E   | Closed-beta visual and audio candidate                                                               | Locally ready; owner acceptance pending                                                              |
| 13A   | Gameplay Completion Audit and Integration Repair                                                     | Gameplay integration candidate locally ready; hosted validation and owner acceptance pending         |
| 13B   | Closed-Beta Security, RLS, Authorization, Concurrency, Multiplayer, Abuse, and Operational Hardening | Closed-beta hardening candidate locally ready; hosted validation and owner acceptance pending        |
| 13C   | Live Operations Completion and Production Configuration Preparation                                  | Production-preparation candidate locally ready; Phase 13D commissioning and owner acceptance pending |
| 13D   | Production Supabase Commissioning and Release Candidate                                              | Pending; exact hosted configuration, deployment, recovery rehearsal, and owner acceptance            |
| 14    | Public Launch and Post-Launch Operations                                                             | Planned; not authorized by Phase 13C                                                                 |

## Phase 13C completion boundary

Phase 13C completes repository-owned configuration contracts, drift validation, seed/reference
policy, release evidence structure, operational capability traceability, production build hardening,
the Admin Release and Live Ops read-only surface, and operator/commissioning runbooks. No database
migration is required because existing authorization, audit, versioning, correction, reconciliation,
publication, and live-operations structures already cover the preparation scope.

Phase 13C does not connect to `starville-prod`; create a production administrator; insert production
seeds; push migrations; deploy services; publish a world; activate an asset; mutate hosted player,
inventory, DUST, world, or asset data; or record owner acceptance. Those remain explicit Phase 13D
owner-controlled gates.

## Known Phase 13D inputs

- Resolve Phase 12E visual/audio owner review and Phase 13A gameplay owner review.
- Complete Phase 13B hosted security/RLS/concurrency/multiplayer validation and owner review.
- Select provider/domains, separate production Supabase and Reown projects, mainnet RPC/mint,
  secrets, monitoring/paging, incident/support systems, and backup/PITR objectives.
- Bind the 85-migration manifest to an approved commit and complete starville-dev clean-chain/drift
  evidence.
- Bootstrap the first administrator under two-owner target verification, AAL2, narrow gate, typed
  confirmation, and audit.
- Select and accept the production world/asset versions; retain V1 fallback and keep V2/V3 inactive
  unless accepted.
- Complete production smoke, responsive/accessibility, rollback, isolated restore, observability,
  and launch/admission evidence.

Animal Care remains disabled and unreleased. No animal/livestock phase, Fablesol, Pokentara,
Sailana, AIvanza, or other unrelated-project system is introduced.
