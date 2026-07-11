# Administrator token-access configuration

## Scope

Phase 3 adds one focused protected page at `/token-access`. It displays real trusted configuration
or an explicit unavailable state; it does not show placeholder data, charts, players, wallets,
economy metrics, or Phase 5 operational tools.

The migration creates the development row as `unconfigured`. Its non-authoritative display defaults
are `STAR`, `1000`, `confirmed`, a 900-second session TTL, and a 300-second recheck interval. It has
no mint, token program, decimals, raw requirement, or validation slot until an authorized admin
validates and saves a real mint on the selected network.

The hosted Mainnet row currently contains a validated temporary Token-2022 mint for Phase 3 live
testing. It is not the official `$STAR` mint and must be replaced before production.

## Authorization

Reading and changing token access use separate Phase 2 permissions:

- `token_gate.read` allows the protected page and `GET /api/v1/admin/token-gate`;
- `token_gate.configure` allows mint validation and configuration updates.

The admin portal obtains a verified Supabase access token server-side and calls the API without
caching. The API authenticates the Supabase user, loads the active trusted administrator session,
checks its assurance level and permission snapshot, and denies inactive or unauthorized callers.

PostgreSQL repeats the active-admin and required-permission check inside the trusted configuration
functions. Direct table privileges are revoked even from `service_role`; the API can mutate config
only through the narrow functions. Player wallet access never grants admin access.

## Page fields

The page exposes only reviewed configuration fields:

- enabled state; disabled remains fail-closed;
- environment-selected `solana:devnet` or `solana:mainnet-beta` network;
- server-validated mint address;
- display symbol;
- decimal display requirement;
- `confirmed` or `finalized` commitment;
- session TTL from 60 to 3,600 seconds;
- recheck interval from 30 to 1,800 seconds and no greater than the TTL;
- an operator reason; and
- an explicit acknowledgement that sessions may be invalidated.

Read-only administrators see the trusted values and cannot submit mutation controls. RPC URL,
provider credentials, service-role key, cookie secret, signatures, and raw cookies are never form
fields.

## Validate proposed mint

`POST /api/v1/admin/token-gate/validate` accepts only the fixed network, a canonical mint address,
and the selected `confirmed` or `finalized` commitment. It requires `token_gate.configure`, claims
an audited per-admin rate-limit slot, and calls the server-owned RPC at that exact commitment.

A successful result reports:

- canonical mint address;
- SPL Token or Token-2022 program;
- mint decimals; and
- observed slot.

It does not persist the configuration. Validation proves only that the mint metadata existed on the
configured network RPC at that moment. Operators must still verify that it is the owner-approved
Starville mint through an independent source.

## Save configuration

`PATCH /api/v1/admin/token-gate` requires the full proposed configuration, the last observed
`expectedConfigVersion`, and a reason. The portal additionally requires a reason of at least 12
characters and a confirmation checkbox.

The API validates the mint again rather than trusting a prior browser result. It converts the
display requirement to raw units using the RPC-observed decimals. The trusted database function
then:

1. re-evaluates `token_gate.configure`;
2. locks the environment/network row;
3. rejects an unexpected configuration version;
4. writes the validated mint/program/decimals/raw amount and current slot;
5. increments `config_version`;
6. marks active sessions on the prior version `configuration_changed`;
7. appends a before/after administrator audit entry with the reason; and
8. appends a token-gate configuration event.

A conflict means another administrator changed the row. Refresh, review the newer values, validate
again, and never blindly resubmit an old version.

## Safe activation runbook

Use this runbook only against the verified development project and an owner-approved mint on the
selected network.

1. Confirm the administrator is permanent/active, has the intended role, and holds `token_gate.read`
   plus `token_gate.configure`.
2. Confirm the selected environment is development and the network matches the server-owned RPC.
3. Obtain the mint address from an approved owner source. Do not copy it from a user, screenshot, or
   untrusted chat message without independent confirmation.
4. Open `/token-access` and confirm it shows the real current configuration version.
5. Enter the mint and select **Validate proposed mint**. Verify program, decimals, and slot against
   the expected token design.
6. Enter the intended display symbol and amount. Independently calculate the expected raw threshold
   and compare it with the page after saving.
7. Review TTL, recheck interval, commitment, and enabled state.
8. Write a specific change reason, acknowledge session invalidation, and save.
9. Confirm the version increased, validation timestamp/slot are present, and the trusted runtime
   config reports `available` only when enabled.
10. Test sufficient, exact-threshold, insufficient, and no-account wallets. Test configuration
    change invalidation before considering the gate ready.

For an emergency with an already valid configuration, an authorized update can disable the gate.
Disabled is a maintenance-style denial of all new access, not a bypass. It increments the version
and invalidates existing sessions. Record a clear reason and restoration plan.

## Audit and rollback discipline

Configuration updates are access-affecting and append audited before/after values. Restoration is a
new forward update after validating the intended mint; do not roll back database migrations or edit
the table directly. The previous row version is not an alternate active configuration.

Never use the service-role key in a browser or SQL console as a convenience bypass. Never weaken the
permission checks to unblock a mint-validation problem. An invalid/nonexistent mint is an external
configuration blocker and should remain fail-closed.

Deployment and live-test commands are documented in
[Phase 3 wallet operations](../deployment/phase-3-wallet-operations.md).
