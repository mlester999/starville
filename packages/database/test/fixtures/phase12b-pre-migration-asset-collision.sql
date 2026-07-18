-- Hosted-upgrade regression: a user-owned storage key may already occupy a
-- stable key introduced by the bundled manifest. Phase 12B must preserve this
-- immutable v1 and append a separate repository default.

begin;

insert into public.world_assets (
  id, asset_key, content_hash, storage_path, source_type, media_type,
  width, height, file_size_bytes, approval_status, repository_owned,
  approved_at, game_key, friendly_name, asset_type, category,
  lifecycle_status, production_status
) values (
  '12b00000-0000-4000-8000-000000000001',
  'ui.warning',
  encode(extensions.digest(convert_to('phase12b:preexisting:ui-warning', 'UTF8'), 'sha256'), 'hex'),
  'world/phase12b-preexisting-ui-warning.webp',
  'storage_raster', 'image/webp', 128, 128, 1024,
  'approved', false, now(), 'starville', 'Pre-existing Warning',
  'interaction_marker', 'interaction', 'draft', 'production_candidate'
);

insert into public.world_asset_versions (
  id, world_asset_id, version_number, lifecycle_status, source_kind,
  checksum_sha256, detected_mime_type, source_width, source_height,
  source_size_bytes, render_width, render_height,
  automated_validation_status, validation_results, reviewed_at, approved_at,
  activated_at
) values (
  '12b00000-0000-4000-8000-000000000002',
  '12b00000-0000-4000-8000-000000000001',
  1, 'active', 'legacy_storage_raster',
  encode(extensions.digest(convert_to('phase12b:preexisting:ui-warning', 'UTF8'), 'sha256'), 'hex'),
  'image/webp', 128, 128, 1024, 128, 128, 'valid',
  '{"valid":true,"checkedAt":"2026-07-18T08:00:00.000Z","issues":[]}'::jsonb,
  now(), now(), now()
);

select set_config('starville.asset_lifecycle_transition', 'true', true);

update public.world_assets
set active_version_id = '12b00000-0000-4000-8000-000000000002',
    lifecycle_status = 'active',
    production_status = 'approved_production'
where id = '12b00000-0000-4000-8000-000000000001';

select set_config('starville.asset_lifecycle_transition', 'false', true);

commit;
