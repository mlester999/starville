# STARVILLE CODEBASE INSTRUCTIONS

Read `docs/STARVILLE_MASTER_SPEC.md` before planning or implementing any feature.

STARVILLE is a separate project from SolTower and all previous projects.

## Core rules

- Use the master specification as the product source of truth.
- Use a pnpm and Turborepo monorepo.
- Use Supabase for PostgreSQL, authentication, and storage.
- Use Reown AppKit for Solana wallet connection.
- Keep wallet verification, token gating, currencies, inventory, and rewards server-authoritative.
- Never expose Supabase service-role keys or private credentials.
- Never use pixel art.
- Never build the world as one flattened background image.
- Use modular isometric tilemaps, tilesets, structures, and object layers.
- The admin portal is only for authorized administrators.
- Do not allow public admin registration.
- Enforce admin access through backend authorization and Supabase RLS.
- Do not use fake production data or claim unfinished features are complete.
- Work in phases and maintain a working repository after every phase.
- Run relevant tests, linting, and type checking before completing a task.
- Do not implement future phases unless explicitly requested.