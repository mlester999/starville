-- Permit an authorized administrator to create a new editable successor from an
-- immutable version without mutating the source version, active pin, or world
-- references. Immutable private derivatives may be shared because neither the
-- version history nor storage objects are updated in place.

create or replace function public.create_admin_game_asset_version_from_existing(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_source_version_id uuid,
  p_configuration_mode text,
  p_expected_asset_revision integer,
  p_reason text,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  asset public.world_assets%rowtype;
  source_version public.world_asset_versions%rowtype;
  version public.world_asset_versions%rowtype;
  version_id uuid := gen_random_uuid();
  next_version integer;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if not private.claim_world_asset_rate_limit(
    'replacement_write', p_user_id::text, p_rate_limit, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;

  replay := private.world_asset_replay(
    p_user_id, 'create_asset_version_from_existing', p_request_id
  );
  if replay is not null then
    if replay #>> '{asset,id}' = p_asset_id::text
       and exists (
         select 1
         from public.world_asset_audit_events as event
         where event.request_id = p_request_id
           and event.event_key = 'asset.version.created_from_existing'
           and event.target_world_asset_id = p_asset_id
           and event.metadata ->> 'sourceVersionId' = p_source_version_id::text
           and event.metadata ->> 'configurationMode' = p_configuration_mode
           and event.reason = p_reason
       ) then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;

  if p_configuration_mode not in ('copy', 'defaults')
     or not private.valid_world_asset_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_CREATE_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asset-version:' || p_asset_id::text, 0)
  );
  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object(
      'status', 'asset_version_conflict', 'assetRevision', asset.record_version
    );
  end if;
  if asset.lifecycle_status = 'archived' then
    return jsonb_build_object('status', 'asset_archived');
  end if;

  select * into source_version
  from public.world_asset_versions
  where id = p_source_version_id and world_asset_id = asset.id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if source_version.lifecycle_status not in (
       'validated', 'in_review', 'approved', 'active', 'rejected', 'deprecated', 'archived'
     ) then return jsonb_build_object('status', 'version_not_copyable'); end if;
  if source_version.source_kind <> 'storage_raster'
     or source_version.checksum_sha256 is null
     or source_version.detected_mime_type not in ('image/png', 'image/webp')
     or source_version.source_width is null
     or source_version.source_height is null
     or source_version.source_size_bytes is null
     or source_version.processed_source_path is null
     or source_version.processed_preview_path is null
     or source_version.processed_thumbnail_path is null then
    return jsonb_build_object('status', 'version_source_not_copyable');
  end if;
  if exists (
    select 1 from public.world_asset_versions
    where world_asset_id = asset.id
      and lifecycle_status in ('draft', 'processing', 'validation_failed', 'changes_requested')
  ) then return jsonb_build_object('status', 'open_version_exists'); end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.world_asset_versions where world_asset_id = asset.id;

  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    checksum_sha256, detected_mime_type, source_width, source_height, source_size_bytes,
    processed_source_width, processed_source_height, processed_source_size_bytes,
    processed_preview_width, processed_preview_height, processed_preview_size_bytes,
    processed_thumbnail_width, processed_thumbnail_height, processed_thumbnail_size_bytes,
    processed_source_path, processed_preview_path, processed_thumbnail_path,
    render_width, render_height, render_scale, anchor_x, anchor_y,
    foot_anchor_x, foot_anchor_y, depth_anchor_x, depth_anchor_y,
    collision_profile, supported_rotations, default_rotation,
    interaction_compatibility, transparent_background_expected,
    transparency_result, automated_validation_status, validation_results,
    internal_notes, created_by_admin_id
  ) values (
    version_id, asset.id, next_version, 'draft', 'storage_raster',
    source_version.checksum_sha256, source_version.detected_mime_type,
    source_version.source_width, source_version.source_height, source_version.source_size_bytes,
    source_version.processed_source_width, source_version.processed_source_height,
    source_version.processed_source_size_bytes, source_version.processed_preview_width,
    source_version.processed_preview_height, source_version.processed_preview_size_bytes,
    source_version.processed_thumbnail_width, source_version.processed_thumbnail_height,
    source_version.processed_thumbnail_size_bytes, source_version.processed_source_path,
    source_version.processed_preview_path, source_version.processed_thumbnail_path,
    case when p_configuration_mode = 'copy' then source_version.render_width
      else coalesce(source_version.source_width, 128) end,
    case when p_configuration_mode = 'copy' then source_version.render_height
      else coalesce(source_version.source_height, 128) end,
    case when p_configuration_mode = 'copy' then source_version.render_scale else 1 end,
    case when p_configuration_mode = 'copy' then source_version.anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.foot_anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.foot_anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.depth_anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.depth_anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.collision_profile
      else '{"shape":"none","blocking":false}'::jsonb end,
    case when p_configuration_mode = 'copy' then source_version.supported_rotations
      else array[0]::smallint[] end,
    case when p_configuration_mode = 'copy' then source_version.default_rotation else 0 end,
    case when p_configuration_mode = 'copy' then source_version.interaction_compatibility
      else case asset.asset_type
        when 'shop' then array['shop']::text[]
        when 'cooking_station' then array['cooking_station']::text[]
        when 'crafting_station' then array['crafting_station']::text[]
        when 'home_entrance' then array['home_entrance']::text[]
        when 'farm_plot' then array['farm_plot']::text[]
        when 'sign' then array['sign']::text[]
        else array['decorative']::text[] end
      end,
    private.world_asset_transparency_required(asset.asset_type),
    source_version.transparency_result, 'pending', null,
    case when p_configuration_mode = 'copy' then source_version.internal_notes else '' end,
    p_user_id
  ) returning * into version;

  if p_configuration_mode = 'copy' then
    insert into public.world_asset_version_tags (world_asset_version_id, world_asset_tag_id)
    select version.id, world_asset_tag_id
    from public.world_asset_version_tags
    where world_asset_version_id = source_version.id
    on conflict do nothing;
  end if;

  update public.world_assets set record_version = record_version + 1
  where id = asset.id returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, after_state, metadata
  ) values (
    'asset.version.created_from_existing', 'version_created', 'assets.upload',
    p_user_id, admin_session_id, asset.id, version.id, p_request_id,
    'success', p_reason,
    jsonb_build_object('versionNumber', next_version, 'status', 'draft'),
    jsonb_build_object(
      'sourceVersionId', source_version.id,
      'configurationMode', p_configuration_mode,
      'activeVersionUnchanged', true,
      'publishedReferencesUnchanged', true
    )
  );

  result := jsonb_build_object(
    'status', 'created',
    'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(
    p_user_id, 'create_asset_version_from_existing', p_request_id, result
  );
  return result;
end;
$$;

-- The replacement-upload variant records the immutable version whose
-- configuration should seed the new candidate. It retains the existing trusted
-- upload and image-processing pipeline.
create or replace function public.create_admin_game_asset_version_upload_v2(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_source_version_id uuid,
  p_configuration_mode text,
  p_expected_asset_revision integer,
  p_reason text,
  p_original_file_name text,
  p_declared_mime_type text,
  p_declared_size_bytes integer,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  asset public.world_assets%rowtype;
  source_version public.world_asset_versions%rowtype;
  version_id uuid := gen_random_uuid();
  upload_id uuid := gen_random_uuid();
  next_version integer;
  extension text;
  intake_path text;
  result jsonb;
  replay jsonb;
  replay_upload public.world_asset_uploads%rowtype;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if not private.claim_world_asset_rate_limit(
    'upload_create', p_user_id::text, p_rate_limit, 60
  ) then raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;
  replay := private.world_asset_replay(p_user_id, 'create_asset_version_upload_v2', p_request_id);
  if replay is not null then
    select * into replay_upload from public.world_asset_uploads
    where id = (replay ->> 'uploadId')::uuid;
    if replay ->> 'assetId' = p_asset_id::text
       and replay_upload.world_asset_id = p_asset_id
       and replay_upload.world_asset_version_id = (replay ->> 'versionId')::uuid
       and replay_upload.original_file_name = p_original_file_name
       and replay_upload.declared_mime_type = p_declared_mime_type
       and replay_upload.declared_size_bytes = p_declared_size_bytes
       and exists (
         select 1 from public.world_asset_audit_events as event
         where event.request_id = p_request_id
           and event.event_key = 'asset.version.created'
           and event.target_world_asset_id = p_asset_id
           and event.metadata ->> 'sourceVersionId' = p_source_version_id::text
           and event.metadata ->> 'configurationMode' = p_configuration_mode
           and event.reason = p_reason
       ) then return replay; end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if p_configuration_mode not in ('copy', 'defaults')
     or not private.valid_world_asset_reason(p_reason)
     or p_declared_mime_type not in ('image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asset-version:' || p_asset_id::text, 0)
  );
  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object(
      'status', 'asset_version_conflict', 'assetRevision', asset.record_version
    );
  end if;
  if asset.lifecycle_status = 'archived' then
    return jsonb_build_object('status', 'asset_archived');
  end if;
  if p_declared_size_bytes not between 1 and private.world_asset_max_source_bytes(asset.asset_type) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;
  select * into source_version from public.world_asset_versions
  where id = p_source_version_id and world_asset_id = asset.id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if source_version.lifecycle_status not in (
       'validated', 'in_review', 'approved', 'active', 'rejected', 'deprecated', 'archived'
     ) then return jsonb_build_object('status', 'version_not_copyable'); end if;
  if exists (
    select 1 from public.world_asset_versions
    where world_asset_id = asset.id
      and lifecycle_status in ('draft', 'processing', 'validation_failed', 'changes_requested')
  ) then return jsonb_build_object('status', 'open_version_exists'); end if;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.world_asset_versions where world_asset_id = asset.id;
  extension := case when p_declared_mime_type = 'image/png' then 'png' else 'webp' end;
  intake_path := 'starville/' || asset.id::text || '/' || upload_id::text || '/original.' || extension;

  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    render_width, render_height, render_scale, anchor_x, anchor_y,
    foot_anchor_x, foot_anchor_y, depth_anchor_x, depth_anchor_y,
    collision_profile, supported_rotations, default_rotation,
    interaction_compatibility, transparent_background_expected,
    internal_notes, created_by_admin_id
  ) values (
    version_id, asset.id, next_version, 'draft', 'storage_raster',
    case when p_configuration_mode = 'copy' then source_version.render_width else null end,
    case when p_configuration_mode = 'copy' then source_version.render_height else null end,
    case when p_configuration_mode = 'copy' then source_version.render_scale else 1 end,
    case when p_configuration_mode = 'copy' then source_version.anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.foot_anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.foot_anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.depth_anchor_x else 0.5 end,
    case when p_configuration_mode = 'copy' then source_version.depth_anchor_y else 1 end,
    case when p_configuration_mode = 'copy' then source_version.collision_profile
      else '{"shape":"none","blocking":false}'::jsonb end,
    case when p_configuration_mode = 'copy' then source_version.supported_rotations
      else array[0]::smallint[] end,
    case when p_configuration_mode = 'copy' then source_version.default_rotation else 0 end,
    case when p_configuration_mode = 'copy' then source_version.interaction_compatibility
      else array['decorative']::text[] end,
    private.world_asset_transparency_required(asset.asset_type),
    case when p_configuration_mode = 'copy' then source_version.internal_notes else '' end,
    p_user_id
  );
  if p_configuration_mode = 'copy' then
    insert into public.world_asset_version_tags (world_asset_version_id, world_asset_tag_id)
    select version_id, world_asset_tag_id from public.world_asset_version_tags
    where world_asset_version_id = source_version.id on conflict do nothing;
  end if;
  insert into public.world_asset_uploads (
    id, world_asset_id, world_asset_version_id, intake_storage_path,
    original_file_name, declared_mime_type, declared_size_bytes, created_by_admin_id
  ) values (
    upload_id, asset.id, version_id, intake_path,
    p_original_file_name, p_declared_mime_type, p_declared_size_bytes, p_user_id
  );
  insert into public.world_asset_processing_jobs (upload_id) values (upload_id);
  update public.world_assets set record_version = record_version + 1
  where id = asset.id returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, reason, after_state, metadata
  ) values (
    'asset.version.created', 'version_created', 'assets.upload', p_user_id, admin_session_id,
    asset.id, version_id, upload_id, p_request_id, 'success', p_reason,
    jsonb_build_object('versionNumber', next_version, 'status', 'draft'),
    jsonb_build_object(
      'sourceVersionId', source_version.id,
      'configurationMode', p_configuration_mode,
      'activeVersionUnchanged', true,
      'publishedReferencesUnchanged', true
    )
  );
  result := jsonb_build_object(
    'status', 'created', 'assetId', asset.id, 'assetRevision', asset.record_version,
    'versionId', version_id, 'versionNumber', next_version, 'versionEditVersion', 1,
    'uploadId', upload_id, 'uploadRevision', 1, 'intakePath', intake_path
  );
  perform private.store_world_asset_replay(
    p_user_id, 'create_asset_version_upload_v2', p_request_id, result
  );
  return result;
end;
$$;

revoke all on function public.create_admin_game_asset_version_from_existing(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_game_asset_version_upload_v2(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, text, integer, text, integer
) from public, anon, authenticated, service_role;

grant execute on function public.create_admin_game_asset_version_from_existing(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, integer
) to service_role;
grant execute on function public.create_admin_game_asset_version_upload_v2(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, text, integer, text, integer
) to service_role;

comment on function public.create_admin_game_asset_version_from_existing(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, integer
) is 'Creates an explicit editable successor that reuses immutable private artwork while preserving the source version, active pin, and world references.';
comment on function public.create_admin_game_asset_version_upload_v2(
  uuid, uuid, text, uuid, uuid, text, integer, text, text, text, integer, text, integer
) is 'Reserves a replacement-artwork successor using the explicitly selected immutable version as its configuration source.';
