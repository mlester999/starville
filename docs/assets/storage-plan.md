# Supabase Storage plan

Phase 1 selects Supabase Storage and defines its trust boundary but creates no speculative buckets.
Future migrations/configuration should separate official game assets, public previews, player-owned
content, and approved creator submissions. Official assets must be writable only by authorized
server or administrator flows, with metadata kept in PostgreSQL.

Every upload flow must validate media type, byte size, decoded dimensions, hashes, animation
metadata, and ownership before publication. Uploaded files are data and must never be executed as
code. Bucket policies and database RLS tests ship with the feature that creates each bucket.
