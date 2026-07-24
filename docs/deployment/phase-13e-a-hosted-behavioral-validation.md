# Phase 13E-A hosted behavioral validation

## Scope and safety

This validation targeted only the masked `starville-dev` Supabase project. Production stayed on the
custom Realtime and custom Worker providers. Cron remained disabled, no Dashboard policy or manual
SQL changes were made, and no Phase 13E-B work was started.

All hosted commands used the repository target guard after privately reloading `.env.local`. Logs
contained only masked target identity, stable stage names, allowlisted error categories, HTTP or
channel status where safe, and aggregate fixture counts.

## Realtime/Auth diagnostic correction

The earlier harness could throw a generic top-level error after a nested Auth, Realtime, timeout, or
cleanup failure. The original behavioral stage and cleanup outcome were not reliably
distinguishable. The harness now:

- assigns stable stage identifiers to target checks, fixture creation, Auth, subscription, Presence,
  Broadcast, and cleanup;
- converts failures through an explicit safe-field allowlist instead of serializing arbitrary error
  objects;
- preserves the primary behavioral failure separately from cleanup failures;
- reports whether cleanup began and completed;
- handles strings, non-`Error` values, nested causes, Auth/PostgREST statuses, Realtime statuses,
  and timeouts;
- lets the top-level runner set the exit status only after the sanitized evidence is written; and
- closes every Supabase client channel during cleanup so a completed run exits deterministically.

The first diagnostic run classified the failure at `magic-link-first-use-player-a` as a
non-retryable Auth error with HTTP status 403 while cleanup completed. Supabase's generated-link
response provides the authoritative verification type. New users may require `signup`, but the
harness, API gateway, and game client had hardcoded `magiclink`. The shared response contract now
permits only `signup` or `magiclink`, propagates the returned type, and verifies the OTP with that
exact value.

The next run reached `anonymous-user-denial` and returned the provider's explicit
`anonymous_provider_disabled` status. That is an expected secure configuration outcome, not a failed
negative test. The harness accepts only that exact code/status combination; unrelated Auth failures
cannot be converted into success.

## Forward-only cleanup correction

The hosted cleanup harness then proved a database defect in the already-applied cleanup foundation:
the PL/pgSQL variable `started_at` conflicted with `public.scheduled_job_runs.started_at` inside the
wrapper's `UPDATE`. The failing fixture transaction rolled back and an aggregate follow-up query
found zero tagged cleanup fixtures.

Applied migrations were left immutable. The forward-only
`20260724101500_phase13e_cleanup_started_at_ambiguity_fix.sql` migration replaces the same function
definition while renaming only the local variable to `run_started_at`. It preserves:

- the exact function signature and `service_role`-only execution ACL;
- `SECURITY DEFINER` with an empty fixed `search_path`;
- the 1–1,000 batch bound and request-key validation;
- request-key idempotency and run evidence;
- the transaction-scoped advisory lock; and
- the disabled Cron definition with no `cron.schedule` call.

The guarded preflight found 88 matching migrations, this one pending migration, and zero remote-only
entries. The dry-run named only the correction. After the repository-controlled push, hosted history
was 89 matching migrations with zero pending and zero remote-only.

## Behavioral evidence

The allowlisted hosted pgTAP suite passed 52/52, including the added non-mutating
function-definition assertion. The finalized harnesses emitted:

- `PUBLIC_CHANNEL_REJECTED`
- `auth-negative-cases-ok`
- `private-channel-authorization-ok`
- `presence-behavior-ok`
- `realtime-behavior-ok`
- `realtime-fixture-cleanup-ok`
- `cleanup-behavior-ok`
- `cleanup-fixture-cleanup-ok`

The Realtime/Auth run covered two valid non-anonymous users, exact player binding, unbound and
wrong-player denial, suspension, anonymous-provider denial, missing/malformed/corrupted tokens,
expired wallet access, one-use verification replay, cross-environment denial, private-topic
authorization, Presence lifecycle, strict movement Broadcast validation, 100 ms throttling,
cross-topic isolation, and movement non-persistence/non-authority.

The cleanup run covered eligible-only changes, the exact timestamp boundary, deterministic
summaries, the 1,000-row maximum, idempotent replay, advisory-lock contention, forced transactional
rollback, no unrelated Worker job, and no Cron schedule. Both harnesses completed exact cleanup. The
final aggregate audit found zero Phase 13E-tagged Auth users, players, bindings, memberships,
authorization evidence, interactions, or cleanup runs.

## Migration boundary

Phase 13E-A establishes only Supabase Presence and non-authoritative movement Broadcast parity plus
a disabled cleanup-function proof. Authoritative gameplay, remaining custom Realtime
responsibilities, and remaining custom Worker jobs are unchanged. Supabase provider mode must
continue returning `503 SUPABASE_MIGRATION_PARITY_INCOMPLETE` until the later parity phases are
separately authorized and completed.
