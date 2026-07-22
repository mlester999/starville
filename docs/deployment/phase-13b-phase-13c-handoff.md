# Phase 13B to Phase 13C handoff

## Phase 13B candidate boundary

Local hardening adds applied-catalog security assertions, one forward-only grant/RLS migration,
truthful readiness probes, safe response headers/telemetry, a larger realtime load matrix, and a
read-only Closed-Beta Readiness view. No hosted validation, owner acceptance, production
commissioning, deployment, migration push, world publication, or asset activation occurred.

## Remaining findings by class

| Class                                                                                            | Remaining item                                                                                | Owner / next phase                      |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| Security blocker                                                                                 | None confirmed by local automated evidence                                                    | Reopen if hosted catalog differs        |
| RLS blocker                                                                                      | None confirmed locally; hosted parity unknown                                                 | Owner Phase 13B hosted validation       |
| Concurrency blocker                                                                              | None confirmed locally; hosted contention/lock behavior unknown                               | Owner hosted validation                 |
| Multiplayer blocker                                                                              | None at bounded local protocol target; real-browser/hosted scale unknown                      | Owner hosted beta drill                 |
| Abuse blocker                                                                                    | No confirmed local bypass; false positives and distributed hosted behavior unreviewed         | Owner abuse drills / Phase 13C runbooks |
| Moderation blocker                                                                               | No confirmed local authority gap; operator workflow/appeal/runbook not owner-reviewed         | Phase 13C                               |
| Observability blocker                                                                            | Continuous worker dependency/job-age alerts and hosted dashboards absent                      | Phase 13C                               |
| Hosted-validation blocker                                                                        | starville-dev migration, lint, pgTAP, RLS, service and catalog validation not run             | Owner only                              |
| Owner-acceptance blocker                                                                         | All manual checklists intentionally unchecked                                                 | Owner deferral                          |
| Phase 13C task                                                                                   | Hosting headers/Game Client boundary, exact Landing/Reown CSP, monitoring, alerting,          |
| incident/support/moderation/economy/maintenance/announcement runbooks, deployment/env manifests, |
| governance and production preparation                                                            | Phase 13C                                                                                     |
| Phase 13D task                                                                                   | starville-prod Supabase commissioning, backup/PITR commissioning, production admin bootstrap, |
| production migration/deployment, release candidate                                               | Phase 13D                                                                                     |
| Optional post-beta                                                                               | More realistic browser/device soak, event-loop profiling, longer distributed load,            |
| automated restore rehearsal                                                                      | Post-beta planning                                                                            |

## Phase 13C authorized scope

Phase 13C may complete Live Operations and production-configuration preparation: separated
deployment manifests, hosting/security policy,
maintenance/announcement/support/moderation/economy/incident runbooks, release governance,
data/reference seeding policy, production admin bootstrap plan, alerts, dashboards, escalation, and
a production commissioning checklist. It must not commission starville-prod; that remains Phase 13D.

## Required evidence carried forward

- `docs/security/phase-13b-closed-beta-trust-boundaries.md`
- `docs/security/phase-13b-database-object-inventory.md`
- `docs/deployment/phase-13b-operational-readiness.md`
- `docs/deployment/phase-13b-local-validation-report.md`
- the Phase 13B migration and deterministic applied-catalog fixture
- the exact hosted commands and intentionally unchecked owner checklist

V1 remains the immutable published default. V2 remains inactive and unpublished. Animal Care remains
disabled and unreleased.
