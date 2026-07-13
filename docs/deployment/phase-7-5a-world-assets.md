# Phase 7.5A World Asset Deployment

Phase 7.5A is delivered as forward-only application and Supabase migrations. No hosted changes are
performed automatically by repository validation.

## Local prerequisites

- Supported Node.js and pnpm versions from the root `package.json`.
- The declared native `sharp` dependency installed through pnpm. Sharp 0.34 uses supported prebuilt
  libvips packages for common macOS and Linux x64/arm64 targets; install dependencies on the same
  architecture used to run the API.
- Local Supabase/Docker only for database integration tests.
- Safe non-production Supabase values when exercising actual Storage locally.

## Deployment order

1. Review all new migrations and generated SQL tests.
2. Run the complete local repository suite and local world/asset database suite.
3. Build and deploy the API/admin/game artifacts with no production credentials in browser bundles.
4. With explicit owner approval only, apply the forward migrations to the intended Supabase project.
5. Inspect bucket privacy, MIME/size limits, RLS, grants, and RPC signatures.
6. Run hosted lint/tests only after separately enabling the documented hosted test gate.
7. Smoke-test upload with non-sensitive test art, review, activation, immutable delivery, editor
   selection, and unauthorized denial.
8. Leave map and asset publication manual.

Do not run a remote reset, use a production database for tests, bulk upload unreviewed art, or
backfill active production art through client code.

## Configuration

The API continues to use server-only Supabase URL/service-role configuration. Browser applications
use only public configuration. Exact public delivery and Supabase origins must be reflected in
deployed CSP/connect/image policy; wildcard origins are prohibited.

Bucket identifiers are fixed by the migration (`asset-intake` and `game-assets`). Object identifiers
are server-generated and are not environment configuration. Per-type limits live in the reviewed
asset-profile package.

## Verification

Run the commands in the task's validation section, then execute the owner manual checklist in
`docs/assets/world-asset-manager.md`. Verify that:

- intake cannot be read/listed/written by anon/authenticated browser roles;
- public delivery contains only sanitized WebP derivatives;
- every active production version has immutable delivery descriptors;
- unauthorized lifecycle calls return safe `403` responses;
- an existing published map retains its pre-deployment bindings; and
- safety gates return to `false` after any explicitly approved hosted session.
