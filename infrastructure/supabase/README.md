# Hosted Supabase development

This is Starville's only canonical Supabase CLI workdir. Phases 2 and 3 use the approved hosted
development project; Docker and a local Supabase stack are not used.

All remote commands must go through the gated root scripts or include both
`--workdir infrastructure` and `--linked`. Generated `.temp` link metadata is ignored and must never
be committed.

```bash
pnpm db:verify-target
pnpm db:migrations:list
pnpm db:migrations:dry-run
```

Migration push, hosted tests, and bootstrap each require their documented explicit gates. Never run
reset, migration-down, truncate, schema-drop, or broad cleanup against the hosted project. See the
[hosted development runbook](../../docs/deployment/hosted-supabase-development.md).

## Layout

- `config.toml` is the canonical CLI configuration.
- `migrations/` contains immutable ordered schema changes.
- `tests/` contains pgTAP assertions executed only against the verified linked project.
- `.temp/` contains ignored machine-local link metadata.

Phase 2 creates administrator authorization tables. Phase 3 adds only token-gate configuration,
wallet challenge, durable wallet-auth rate-limit, access-session, and access-event tables. No player
profile, gameplay, map, item, economy, reward, or Phase 4 table is present.
