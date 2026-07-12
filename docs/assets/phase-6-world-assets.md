# Phase 6 world asset boundary

The runtime references 15 stable repository-owned procedural development keys covering cottages,
trees, rock, fence, lamp, notice/route signs, flowers, bush, moonstone, orchard sign, forest gate,
and closed-route markers. Manifest objects contain a key only; they contain no URL, storage
credential, filesystem path, script, or binary payload.

Database catalog records truthfully use:

- source type `repository_procedural`;
- media type `application/x-starville-procedural`;
- deterministic SHA-256 content identity;
- repository-relative generated path;
- null raster width, height, and file size;
- approved status and repository-owned provenance.

Only approved keys pass publication validation. Deprecated/draft keys fail validation for new
publications. Historical version references are retained and protected from deletion.

No upload endpoint or storage bucket is added in Phase 6. Before uploads can be enabled, a trusted
server pipeline must allow only PNG/WebP/AVIF, verify magic bytes and MIME, enforce 5 MiB and
4096×4096 limits, decode and safely re-encode, remove metadata, hash/deduplicate content, generate
an immutable storage path, scan/approve the result, and preserve every referenced historical asset.
SVG, HTML, JavaScript, archives, arbitrary URLs, and browser service-role access remain forbidden.
