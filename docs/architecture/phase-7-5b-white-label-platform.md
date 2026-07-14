# Phase 7.5B white-label platform architecture

Phase 7.5B makes presentation reusable without making Starville a tenant-provisioning service.
Starville is the only registered game platform. The stable `starville` key scopes every version,
active pointer, audit event, API request, and approved asset reference.

## Authority flow

```text
Compiled Starville defaults
          │
          ▼
Published immutable version ──► active pointer ──► trusted API ──► public runtime API
          │                                           │
          └── create draft ─► validate ─► review ─► publish
                                  │                    │
                                  └── staff preview    └── cache revision changes
```

The shared `@starville/platform-configuration` package owns strict schemas, allowlisted fonts,
icons, routes, modules, semantic theme tokens, Starville defaults, contrast checks, and safe URL
rules. SQL independently enforces bounded JSON and critical registries. The API parses both sides of
every trusted persistence boundary.

Published configuration JSON is immutable. Publication atomically changes lifecycle metadata and the
active pointer using expected version and active revisions. Rollback reactivates an exact previously
published version and creates an audit event; it does not edit historical JSON.

Draft preview is an authenticated administrator API operation. It identifies one exact version, uses
only approved active asset versions, emits `noindex`, and never changes the active pointer. Public
applications receive only the active version through a bounded ETag response. If delivery is
unavailable, each application uses the compiled Starville configuration instead of failing
authentication, token access, gameplay, or player persistence.

The database returns approved delivery paths only to the service role. The API converts those paths
through the secured asset-storage boundary, removes every path, validates the resulting public URLs,
and then supplies the exact logo, favicon, login background, landing visual, or social image to
browser applications. Direct anonymous execution of the database runtime function is revoked.

Module configuration controls presentation and a strict enabled registry. It never creates routes,
adds permissions, or changes the administrator's authorization context. The fixed route registry
continues to require server-authoritative permissions even when a navigation label is hidden.

## Security boundaries

- No raw HTML, CSS, JavaScript, SVG icon, iframe, external font URL, or arbitrary route is accepted.
- Branding images are immutable approved versions from the Phase 7.5A asset authority.
- Direct table access is revoked; forced RLS and narrow SECURITY DEFINER RPCs are used.
- Audit before/after state is bounded and excludes secrets and binary data.
- Public delivery contains presentation configuration, approved version identifiers, and validated
  public asset URLs only; private intake and delivery paths never cross the API boundary.
- Lifecycle mutations use per-administrator atomic database rate limits after idempotency lookup.
- Wallet rules, token configuration, authentication controls, database connections, and secrets are
  outside this model.

## Phase 7.5C boundary

Phase 7.5C may design secure infrastructure configuration for deployments. It is intentionally not
implemented here. Supabase URLs, service-role keys, database credentials, RPC endpoints, wallet
networks, storage credentials, environment variables, deployment automation, tenant signup, billing,
and provisioning cannot be viewed or changed through Platform Settings.
