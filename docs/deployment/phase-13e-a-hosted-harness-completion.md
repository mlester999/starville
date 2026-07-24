# Phase 13E-A hosted harness completion

Date: 2026-07-24  
Status: repository harness coverage implemented; hosted retry and behavioral proof pending  
Hosted writes during this task: **none**

## Owner-configured target state

Before this repository-only task, the owner verified in the active Terminal session that the target
is the development `starville-dev` project, Realtime is enabled, public channel access is disabled,
and private-only mode is proven through the Management API. The hosted-test gate was enabled, while
remote writes remained disabled. This task did not repeat that remote check or change any Dashboard
setting.

The owner-provided configuration state is not behavioral success. Presence still requires a
two-client hosted proof, the controlled public-channel rejection still requires execution, and all
three Phase 13E migrations remain pending.

## Implemented harness coverage

The dry-run-by-default Realtime harness now plans and its gated execution implements:

- one controlled channel subscription without private mode, with no payload sent, a 10-second bound,
  mandatory channel removal, `PUBLIC_CHANNEL_REJECTED` on proof, and
  `PUBLIC_CHANNEL_UNEXPECTEDLY_ALLOWED` plus critical failure if public subscription succeeds;
- normal Starville subscriptions with `config.private=true` and no public fallback;
- wallet-bound, non-anonymous Player A and Player B sessions and private authorization;
- fail-closed unbound-authenticated, wrong-player, suspended-player, anonymous, missing-token,
  malformed-token, corrupted-token, deterministic expired Starville wallet-access-session, one-use
  magic-link replay, and cross-environment cases;
- the existing two-client Presence sync/join/leave/untrack/reconnect/channel-switch checks;
- strict, throttled, scoped, non-authoritative movement Broadcast checks.

Supabase Auth access tokens are verified with Auth, and anonymous identities are rejected before
database authorization. The deterministic expiration case expires only the isolated Starville
wallet-access session and restores it in `finally`; it does not weaken production expiry rules or
wait for a provider JWT to age. Supabase remains responsible for rejecting an expired provider JWT.
The one-use claim is limited to the generated magic-link token: its first verification succeeds and
its second verification must fail. No one-use claim is made for an ordinary signed Auth access
token.

## Fixture and cleanup guarantees

Every run uses a UUID-derived tag. Generated Auth users carry the exact tag in server-created
metadata. Player rows use fresh deterministic fixture wallets and a display name derived from the
same tag; cleanup first proves that each tracked player ID still has the expected wallet and display
name. This ownership check prevents a real player row from matching the fixture selector.

The harness tracks Realtime channels, Presence, Auth user IDs, player IDs, wallet challenge/session
IDs, bindings, memberships, authorization audit evidence, party memberships and invitations, home
invitations, moderation state, avatar shells, and starter cosmetic/emote rows. It removes channels
first, verifies Auth metadata before deleting an Auth user, deletes database rows only by exact
tracked IDs, and then queries both Auth and PostgreSQL to prove zero tagged/tracked fixtures remain.
Suspension and expiration mutations have their own restoration `finally` blocks. The outer cleanup
runs after validation failure, and any cleanup failure is itself a critical harness failure.

The cleanup-function harness continues to isolate all database fixtures inside transactions and roll
them back in `finally`. It neither enables Cron nor calls `cron.schedule`.

## Execution safeguards

Dry-run returns before environment loading or network client creation and reports `remoteCalls: 0`
and `remoteWrites: 0`. Actual fixture execution has no bypass and requires:

- the exact linked development project reference and matching Supabase URL/database URL;
- `SUPABASE_ENVIRONMENT=development` and `STARVILLE_DEPLOYMENT_TARGET=starville-dev`;
- valid, distinct development and production project references, with production rejected;
- `RUN_HOSTED_SUPABASE_TESTS=true`, `SUPABASE_REMOTE_WRITES_APPROVED=true`, and
  `ADMIN_BOOTSTRAP_ENABLED=false`;
- branch `phase-13e-supabase-first`, a clean worktree, and the four reviewed checksums;
- enabled Realtime with Management API proof that public access is disabled.

Migration state is deliberately split across the retry sequence. The read-only pre-application
review must find exactly 85 applied migrations, the three reviewed Phase 13E migrations pending in
order, Phase 13B present, and zero remote-only migrations. The behavioral `--execute` harnesses run
only after the separately authorized migration application and therefore require exactly 88 matching
migrations, zero pending, and zero remote-only. Requiring 85/3 inside a behavioral harness would
make the new Phase 13E functions unavailable; allowing any other post-application state would hide
drift.

The reviewed hashes remain:

| Artifact                                                            | SHA-256                                                            |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `20260724100000_phase13e_supabase_realtime_authorization.sql`       | `20532eb6c659da4d3d93a6f3183ed4a8719921e26efb0822049fae065bb51b84` |
| `20260724100500_phase13e_realtime_authorization_permission_fix.sql` | `4fd80b511879c62c70a5fe9e89c452bd025ca1ac9bcc9da6011131d493e16723` |
| `20260724101000_phase13e_social_cleanup_cron_foundation.sql`        | `147cccccf7930dab7d17557746b28422059ace1550f23d2ddd626fe2865dae97` |
| `infrastructure/deployment/manifests/migrations.v1.json`            | `54b2136ea9e06755a7452e308611d283bb9b32429142c77ffb8a2dd487322bce` |

## Remaining validation boundary

Both repository dry runs completed with `remoteCalls: 0` and `remoteWrites: 0`. The Realtime plan
reported the public denial, authorized private channel, Auth negative cases, fixture cleanup,
Presence, Broadcast, and companion cleanup-function checks. The cleanup plan reported its
eligibility, boundary, replay, advisory-lock, rollback, no-Cron, and no-other-job checks.

This completion task performed repository tests and those dry runs only. It did not apply
migrations, create a hosted Auth user, insert a hosted row, open a hosted Realtime channel, execute
the hosted cleanup function, or contact `starville-prod`.

The next task is **Phase 13E-A Hosted starville-dev Migration and Behavioral Validation Retry**. It
must re-prove the 85/3 pre-application state, obtain explicit hosted-write approval, apply only the
three reviewed migrations to `starville-dev`, prove the 88/0 post-application state, and run the
allowlisted pgTAP, Realtime, and cleanup harnesses. Production remains `custom/custom`, Cron remains
disabled, and the custom Realtime server and Worker remain rollback references. Phase 13E-B remains
blocked until that hosted retry passes.
