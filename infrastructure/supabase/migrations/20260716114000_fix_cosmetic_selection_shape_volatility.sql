-- Forward-only repair for the Phase 10B cosmetic selection validator lint warning.
-- pg_catalog.pg_column_size(any) is STABLE, so its caller cannot truthfully be IMMUTABLE.

alter function private.valid_cosmetic_selection_shape(jsonb) stable;
