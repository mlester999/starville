# Phase 13B deterministic database object inventory

## Source and scope

This inventory was emitted from a fresh PostgreSQL 18.1 database after the repository's complete
ordered migration chain and seed fixtures. The source is
`packages/database/test/fixtures/phase13b-security-postgres-execution.sql`, executed by
`pnpm db:test:local:world`. It queries `pg_catalog`, `information_schema`, storage, and publication
catalogs; it does not infer schema state from migration text alone.

## Applied inventory

| Object                                                   | Count / result |
| -------------------------------------------------------- | -------------: |
| Audited schemas (`public`, `private`, `auth`, `storage`) |              4 |
| Public/private tables                                    |            318 |
| Views                                                    |              0 |
| Materialized views                                       |              0 |
| Functions                                                |            785 |
| Procedures                                               |              0 |
| SECURITY DEFINER functions                               |            742 |
| Non-internal triggers                                    |            255 |
| Explicit public policies                                 |              6 |
| Sequences                                                |             14 |
| Public tables with enabled + forced RLS                  |            318 |
| Authenticated direct table grants                        |              6 |
| Service-role direct table grants                         |              0 |
| PUBLIC function-execute findings                         |              0 |
| `supabase_realtime` publication relations                |              0 |
| Storage buckets                                          |              2 |
| System admin roles / permissions                         |       12 / 186 |

The absence of publication membership is intentional: Starville realtime authority is the dedicated
Realtime Server, not unrestricted Supabase Realtime table publication.

## Security-sensitive object classes

| Class                                | Owner / security         | Browser                                             | API/realtime/worker                   | Purpose and coverage                                           |
| ------------------------------------ | ------------------------ | --------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------- |
| Player/token/profile/session tables  | Trusted owner; RLS+FORCE | No direct anon/service-role table grants            | Exact service RPCs                    | Identity, access, position; wallet/player/RLS tests            |
| Inventory/DUST/economy tables        | Trusted owner; RLS+FORCE | No settlement table writes                          | Exact transactional RPCs              | Ledger, balance, inventory, shop, correction; contention/pgTAP |
| Farming/cooking/crafting/progression | Trusted owner; RLS+FORCE | Intent through API only                             | Exact gameplay/worker RPCs            | State/rewards/reconciliation; replay/concurrency tests         |
| Social/chat/party/gift/trade         | Trusted owner; RLS+FORCE | Realtime/API intent only                            | Admission and atomic settlement RPCs  | Isolation, abuse, cleanup, atomicity tests                     |
| Housing/home visits                  | Trusted owner; RLS+FORCE | Visibility-authorized API/realtime                  | Exact housing/visit RPCs              | Revisions, invitations, cap, cleanup tests                     |
| Admin/moderation/audit               | Trusted owner; RLS+FORCE | Six protected SELECT grants under RLS/admin session | Admin-auth/AAL-aware RPCs             | RBAC, denial, moderation, immutable audit tests                |
| World/asset/version tables           | Trusted owner; RLS+FORCE | Protected Admin/API only                            | Draft/publish/activation/restore RPCs | Revision, separation, AAL2, immutable-version tests            |
| Worker/reconciliation/risk           | Trusted owner; RLS+FORCE | None                                                | Worker-only exact RPCs                | Claim/retry/reconcile/retention tests                          |

## Applied assertions

The fixture fails the chain if it finds any of the following:

- a public table without RLS or FORCE RLS;
- PUBLIC execution on a public/private Starville function;
- a SECURITY DEFINER function without the established empty search path;
- any PUBLIC, anon, or service-role public-table grant;
- any authenticated table privilege outside six protected admin SELECT grants;
- an untrusted object owner;
- authenticated access to representative economy purchase, trade confirmation, or correction review
  settlement functions;
- missing narrow Player Experience API/worker RPC execution;
- role-catalog drift or specialist-role privilege crossover;
- absence of trigger/policy infrastructure.

## Findings and repair

| Finding                        | Scope                                 | Repair                                                                        |
| ------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------- |
| RLS enabled but not forced     | 20 early public tables                | `ALTER TABLE ... FORCE ROW LEVEL SECURITY`                                    |
| Broad direct service-role CRUD | 19 Phase 12A Player Experience tables | Exact table CRUD revocation; narrow RPC execution retained                    |
| Inherited PUBLIC execution     | 19 private progression helpers        | Exact-signature revocation from PUBLIC, anon, authenticated, and service_role |

No function, policy, table, index, constraint, procedure, storage bucket, or publication was created
or replaced by the hardening migration. No permissive fallback policy was added.

## Limitations

`plpgsql_check` was unavailable in the isolated local runner. Hosted catalog parity, extensions,
storage policies, database lint, and RLS behavior remain owner-controlled starville-dev gates. The
owner must compare this deterministic inventory with the hosted post-migration inventory; local
counts are not evidence of production or hosted state.
