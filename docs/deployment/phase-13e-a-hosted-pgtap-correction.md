# Phase 13E-A hosted pgTAP correction

Date: 2026-07-24  
Correction path: test-only; no database migration

## Classification

The three reviewed Phase 13E migrations are applied on `starville-dev`, with 88 matching migrations,
zero pending migrations, and zero remote-only migrations. The first hosted pgTAP execution passed 48
of 50 assertions. The two failures were catalog-model mismatches, not authorization defects.

Assertion 18 required `authenticated` `SELECT`/`INSERT` on `realtime.messages` and incorrectly
required `anon` to lack `SELECT`. Hosted catalog evidence shows that Supabase manages effective
`SELECT`/`INSERT` grants for both API roles. RLS remains enabled; neither role owns the table or has
`BYPASSRLS`; every Starville policy targets only `authenticated`; and `anon` has no private schema
usage, helper execution, or direct Starville authorization-table access. The corrected assertion
tests the RLS, ownership, bypass, and policy boundaries without treating a provider-managed table
grant as row authority.

Assertion 31 required every rendered policy expression to contain the literal text
`realtime.messages.extension`. PostgreSQL renders the same provider-owned column as `extension` in
`pg_policies`. Hosted `pg_depend` evidence proves every policy references:

- `auth.uid()`;
- `realtime.topic()`;
- `private.supabase_realtime_topic_authorized(uuid,text,text)`; and
- the actual `realtime.messages.extension` attribute.

The corrected assertion defines the four expected policy rows and verifies each command, role,
USING/WITH CHECK slot, exact helper argument order, dependency set, provider column, and expected
`broadcast` or `presence` literal.

The original SQL file declared `plan(50)` but emitted 51 assertions. The two original failures
caused the hosted runner to stop before its assertion-count check, masking that independent plan
mismatch. The corrected suite declares `plan(51)` without adding or removing an assertion, and all
51 assertions are required to pass.

## Official model

Supabase Realtime Authorization uses RLS policies on `realtime.messages` and requires private
clients to set `config.private=true`. Realtime evaluates channel access by performing rolled-back
read/write checks. Broadcast receive/send use SELECT/INSERT with the `broadcast` extension, while
Presence receive/publish use SELECT/INSERT with the `presence` extension. Supabase also documents
security-definer helpers as valid policy components when they are kept outside exposed schemas and
reviewed carefully.

## Preserved boundaries

- No applied migration was edited.
- No correction migration was added.
- No provider-owned ACL, owner, RLS state, trigger, column, or schema object was changed.
- `anon` and `PUBLIC` cannot execute the helper.
- `authenticated` retains only the exact helper execution required by policy evaluation.
- Payload values remain outside the authorization decision.
- Realtime remains private-only.
- Cron remains disabled.
- Production remains `custom/custom`.
- The custom Realtime Server and Worker remain intact.

## Validation outcome

The corrected allowlisted hosted pgTAP suite passed all 51 planned assertions. Repository tests,
typechecking, linting, building, formatting, and security scanning also passed.

The required hosted Realtime/Auth harness proved `PUBLIC_CHANNEL_REJECTED` and reached the one-use
magic-link replay denial, then exited nonzero without emitting its internal validation-error label.
Its critical `finally` cleanup completed: a subsequent read-only integrity query found zero tagged
Auth users, players, challenges, sessions, bindings, memberships, invitations, moderation rows, or
authorization evidence. The cleanup-function harness was not started after that failure, as required
by the hosted stop policy.

The pgTAP mismatch correction is valid, but Phase 13E-A remains blocked until the Realtime/Auth
harness failure is diagnosed and the complete behavioral sequence passes.
