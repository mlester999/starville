# Phase 13C to Phase 13D handoff

Phase 13C hands off a local production-preparation candidate, not a commissioned system. Phase 13D
owns exact hosted configuration and human acceptance.

## Inputs

- Environment contract `production-environment.v1.json` with owner placeholders and prohibited
  settings.
- 85-entry ordered migration manifest with content hashes.
- Reference-source manifest that keeps V2/V3 candidates inactive and excludes player/test/secret
  data.
- Evidence manifest with hosted, recovery, domains, Reown, prior-phase, and owner blockers intact.
- Operational capability matrix and protected read-only Admin dashboard.
- Operations handbook covering commissioning, live operations, world/assets, support, moderation,
  economy, incidents/outages, backup/restore, observability, and governance.
- Local validation report and the Phase 12E/13A/13B evidence referenced by it.

## Phase 13D required work

Follow `docs/operations/phase-13d-commissioning.md` in order. Supply exact domains/provider,
separate Supabase/Reown projects and secrets, production mainnet configuration, monitoring/paging,
backup/PITR and restore access, hosted clean-chain evidence, first-admin identity/roles/AAL2,
accepted world/assets, and all owner sign-offs. Bind every result to the exact approved commit and
artifact hashes.

Do not replace placeholders in tracked manifests with secrets. Record safe configuration evidence
and store values in provider secret systems. Keep safety gates false except for the single verified
command they protect, then disable them immediately.

## Known blockers and limitations

- No Phase 13C production connection, deploy, migration push, seed, administrator, world publish,
  asset activation, or hosted player/economy mutation occurred.
- Production provider/domains, Reown project, Supabase project, backup policy, restore rehearsal,
  monitors/page destinations, support/incident providers, and owner acceptances are pending.
- Incident and support case management use future owner-approved external systems; no in-product
  queue was added.
- Inventory correction remains domain-specific; there is no unrestricted generic editor.
- Animal Care remains disabled/unreleased. No future animal or unrelated-project work is authorized.

Phase 13D must stop on target ambiguity, manifest drift, missing backups, unexpected security state,
owner rejection, or failed smoke/invariant/recovery evidence.
