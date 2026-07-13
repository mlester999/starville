# Supabase Storage plan

Phase 1 selected Supabase Storage without speculative buckets. Phase 7.5A now adds the first two
purpose-specific buckets: private `asset-intake` and public, immutable, sanitized `game-assets`
delivery. Player-owned content and creator submission buckets remain future work and must not reuse
the official-art intake boundary.

Every upload flow must validate media type, byte size, decoded dimensions, hashes, animation
metadata, and ownership before publication. Uploaded files are data and must never be executed as
code. Bucket policies and database RLS tests ship with the feature that creates each bucket.

See [the Phase 7.5A storage security model](../security/world-asset-storage.md) for current bucket,
processing, grant, delivery, and retention rules.
