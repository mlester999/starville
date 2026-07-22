# Phase 13A → Phase 13B handoff

Phase 13A has no confirmed local integration blocker after its automated matrix. The following items
remain deliberately classified for Phase 13B or owner review.

| Classification         | Remaining item                                                             | Why it is not closed in Phase 13A                                                       |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| integration blocker    | None confirmed locally                                                     | Focused/full automated evidence must remain green; new failures would reopen this class |
| security blocker       | Hosted RLS and role-boundary validation                                    | Phase 13A made no schema/grant change and did not connect to production                 |
| concurrency blocker    | Database/worker/social/economy contention                                  | Requires targeted hosted-development contention harnesses                               |
| abuse risk             | Chat, gift, trade, home-visit, economy, invitation, and party abuse        | Rate, collusion, spam, moderation, and evasion testing is Phase 13B scope               |
| hosted-validation gate | Development Supabase API/RLS/realtime/worker integration                   | Local validation cannot make a hosted claim                                             |
| performance gate       | Approximately 40-player channel and real owner-plus-ten visit              | Phase 13A has deterministic counts, not production load certification                   |
| owner acceptance gate  | 26-step new-player, returning-player, 27-step Game Test, Admin, devices    | Owner intentionally deferred the larger manual session                                  |
| optional enhancement   | Richer support visualization/export of the shared audit matrix             | Not required for gameplay correctness                                                   |
| Phase 13B task         | Network interruption, observability, backups, recovery, operational drills | Explicit next-phase ownership                                                           |

## Required Phase 13B evidence

- Hosted development RLS/authorization matrix with role-boundary negative tests.
- Concurrency harnesses for farming, workstation collection, shop/DUST, objectives/rewards, housing,
  helper watering/appreciation, gifts, and trades.
- Abuse/rate/moderation coverage for chat and all social entry points.
- Approximately 40-player channel load and owner-plus-ten real visit validation.
- Realtime interruption/reconnect, database contention, and worker contention evidence.
- Browser, screen-reader, and physical-device sessions.
- Observability, backup/restore, incident, rollback, and closed-beta operational readiness.

Phase 13B must preserve the Phase 13A authority map and exact-once contract. It must not turn client
caches or realtime projections into durable authority, and it must not treat a retry as a new
settlement.
