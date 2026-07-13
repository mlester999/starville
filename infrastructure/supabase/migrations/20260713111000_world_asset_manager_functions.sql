-- Starville Phase 7.5A: trusted asset reads, upload processing, lifecycle, and review RPCs.

create or replace function private.valid_world_asset_reason(p_reason text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select p_reason is not null
    and char_length(p_reason) between 12 and 500
    and p_reason = btrim(p_reason)
    and p_reason !~ '[[:cntrl:]<>]';
$$;

create or replace function private.claim_world_asset_rate_limit(
  p_scope text,
  p_subject_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_scope not in (
       'directory_read', 'detail_read', 'review_read', 'audit_read', 'candidate_read',
       'upload_create', 'processing_write', 'draft_write', 'validation_write',
       'review_write', 'activation_write', 'deprecation_write', 'replacement_write'
     )
     or p_subject_key is null or char_length(p_subject_key) not between 1 and 128
     or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_RATE_LIMIT_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asset-rate:' || p_scope || ':' || p_subject_key, 0)
  );

  insert into public.world_asset_operation_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (scope, subject_key) do update
  set attempt_count = case
        when world_asset_operation_rate_limits.window_expires_at <= now() then 1
        else world_asset_operation_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when world_asset_operation_rate_limits.window_expires_at <= now() then now()
        else world_asset_operation_rate_limits.window_started_at
      end,
      window_expires_at = case
        when world_asset_operation_rate_limits.window_expires_at <= now()
          then now() + make_interval(secs => p_window_seconds)
        else world_asset_operation_rate_limits.window_expires_at
      end,
      updated_at = now()
  where world_asset_operation_rate_limits.window_expires_at <= now()
     or world_asset_operation_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function private.world_asset_replay(
  p_administrator_user_id uuid,
  p_operation text,
  p_request_id text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select response_body || jsonb_build_object('status', 'replayed')
  from public.world_asset_operation_idempotency
  where administrator_user_id = p_administrator_user_id
    and operation = p_operation
    and request_id = p_request_id
    and expires_at > now();
$$;

create or replace function private.store_world_asset_replay(
  p_administrator_user_id uuid,
  p_operation text,
  p_request_id text,
  p_response jsonb
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.world_asset_operation_idempotency (
    administrator_user_id, operation, request_id, response_body
  ) values (p_administrator_user_id, p_operation, p_request_id, p_response)
  on conflict (administrator_user_id, operation, request_id) do nothing;
$$;

create or replace function private.world_asset_reference_summary(p_asset_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'published', (
      select count(*)::integer
      from public.world_map_version_assets as reference
      join public.world_map_versions as version on version.id = reference.world_map_version_id
      where reference.world_asset_id = p_asset_id
        and version.lifecycle_status in ('published', 'superseded')
    ) + (
      select count(*)::integer from public.world_asset_references
      where world_asset_id = p_asset_id and reference_lifecycle = 'published'
    ),
    'draft', (
      select count(*)::integer
      from public.world_map_version_assets as reference
      join public.world_map_versions as version on version.id = reference.world_map_version_id
      where reference.world_asset_id = p_asset_id
        and version.lifecycle_status in ('draft', 'validated')
    ) + (
      select count(*)::integer from public.world_asset_references
      where world_asset_id = p_asset_id and reference_lifecycle = 'draft'
    ),
    'activeConfiguration', (
      select count(*)::integer from public.world_asset_references
      where world_asset_id = p_asset_id and reference_lifecycle = 'active'
    ),
    'total', (
      select count(*)::integer from public.world_map_version_assets where world_asset_id = p_asset_id
    ) + (
      select count(*)::integer from public.world_asset_references where world_asset_id = p_asset_id
    )
  );
$$;

create or replace function private.world_asset_version_json(p_version public.world_asset_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_version.id,
    'assetId', p_version.world_asset_id,
    'versionNumber', p_version.version_number,
    'lifecycleStatus', p_version.lifecycle_status,
    'sourceKind', p_version.source_kind,
    'checksumSha256', p_version.checksum_sha256,
    'sourceMimeType', p_version.detected_mime_type,
    'sourceWidth', p_version.source_width,
    'sourceHeight', p_version.source_height,
    'sourceSizeBytes', p_version.source_size_bytes,
    'processedSourceWidth', p_version.processed_source_width,
    'processedSourceHeight', p_version.processed_source_height,
    'processedSourceSizeBytes', p_version.processed_source_size_bytes,
    'processedPreviewWidth', p_version.processed_preview_width,
    'processedPreviewHeight', p_version.processed_preview_height,
    'processedPreviewSizeBytes', p_version.processed_preview_size_bytes,
    'processedThumbnailWidth', p_version.processed_thumbnail_width,
    'processedThumbnailHeight', p_version.processed_thumbnail_height,
    'processedThumbnailSizeBytes', p_version.processed_thumbnail_size_bytes,
    'renderWidth', p_version.render_width,
    'renderHeight', p_version.render_height,
    'scale', p_version.render_scale,
    'anchor', jsonb_build_object('x', p_version.anchor_x, 'y', p_version.anchor_y),
    'footAnchor', jsonb_build_object('x', p_version.foot_anchor_x, 'y', p_version.foot_anchor_y),
    'depthAnchor', jsonb_build_object('x', p_version.depth_anchor_x, 'y', p_version.depth_anchor_y),
    'collisionProfile', p_version.collision_profile,
    'supportedRotations', to_jsonb(p_version.supported_rotations),
    'defaultRotation', p_version.default_rotation,
    'interactionCompatibility', to_jsonb(p_version.interaction_compatibility),
    'transparentBackgroundExpected', p_version.transparent_background_expected,
    'transparencyResult', p_version.transparency_result,
    'validationStatus', p_version.automated_validation_status,
    'validationResults', p_version.validation_results,
    'internalNotes', p_version.internal_notes,
    'editVersion', p_version.edit_version,
    'sourcePreviewUrl', case when p_version.processed_source_path is null then null else
      '/api/v1/admin/world-assets/' || p_version.world_asset_id::text || '/versions/' || p_version.id::text || '/source' end,
    'previewUrl', case when p_version.processed_preview_path is null then null else
      '/api/v1/admin/world-assets/' || p_version.world_asset_id::text || '/versions/' || p_version.id::text || '/preview' end,
    'thumbnailUrl', case when p_version.processed_thumbnail_path is null then null else
      '/api/v1/admin/world-assets/' || p_version.world_asset_id::text || '/versions/' || p_version.id::text || '/thumbnail' end,
    'createdByAdminId', p_version.created_by_admin_id,
    'submittedByAdminId', p_version.submitted_by_admin_id,
    'reviewedByAdminId', p_version.reviewed_by_admin_id,
    'approvedByAdminId', p_version.approved_by_admin_id,
    'createdAt', p_version.created_at,
    'updatedAt', p_version.updated_at,
    'submittedAt', p_version.submitted_at,
    'reviewedAt', p_version.reviewed_at,
    'approvedAt', p_version.approved_at,
    'activatedAt', p_version.activated_at,
    'tags', coalesce((
      select jsonb_agg(bounded.slug order by bounded.slug)
      from (
        select tag.slug
        from public.world_asset_version_tags as mapping
        join public.world_asset_tags as tag on tag.id = mapping.world_asset_tag_id
        where mapping.world_asset_version_id = p_version.id
        order by tag.slug, tag.id
        limit 100
      ) as bounded
    ), '[]'::jsonb)
  );
$$;

create or replace function private.world_asset_json(p_asset public.world_assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_asset.id,
    'gameKey', p_asset.game_key,
    'assetKey', p_asset.asset_key,
    'slug', p_asset.asset_key,
    'friendlyName', p_asset.friendly_name,
    'assetType', p_asset.asset_type,
    'category', p_asset.category,
    'lifecycleStatus', p_asset.lifecycle_status,
    'productionStatus', p_asset.production_status,
    'activeVersionId', p_asset.active_version_id,
    'activeVersionNumber', (
      select version_number from public.world_asset_versions where id = p_asset.active_version_id
    ),
    'thumbnailUrl', case when exists (
      select 1 from public.world_asset_versions
      where id = p_asset.active_version_id and processed_thumbnail_path is not null
    ) then '/api/v1/admin/world-assets/' || p_asset.id::text || '/versions/'
      || p_asset.active_version_id::text || '/thumbnail' else null end,
    'developmentMarkerReplacementKey', p_asset.development_marker_replacement_key,
    'recordVersion', p_asset.record_version,
    'versionCount', (
      select count(*)::integer from public.world_asset_versions where world_asset_id = p_asset.id
    ),
    'referenceSummary', private.world_asset_reference_summary(p_asset.id),
    'createdAt', p_asset.created_at,
    'updatedAt', p_asset.updated_at
  );
$$;

create or replace function private.world_asset_review_json(p_review public.world_asset_reviews)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_review.id,
    'assetId', p_review.world_asset_id,
    'versionId', p_review.world_asset_version_id,
    'action', p_review.action,
    'administratorUserId', p_review.administrator_user_id,
    'reason', p_review.reason,
    'requestId', p_review.request_id,
    'createdAt', p_review.created_at
  );
$$;

create or replace function public.list_admin_game_assets(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_asset_type text,
  p_category text,
  p_lifecycle_status text,
  p_production_status text,
  p_sort text,
  p_direction text,
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
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  total_count integer;
  items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (10, 50, 100)
     or char_length(normalized_search) > 100
     or p_asset_type <> 'all' and p_asset_type not in (
       'building', 'shop', 'cooking_station', 'crafting_station', 'home_entrance',
       'decoration', 'tree', 'rock', 'fence', 'lamp', 'sign', 'terrain_tile', 'bridge',
       'farm_plot', 'crop_stage', 'furniture', 'home_interior_object', 'interaction_marker',
       'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
     )
     or p_lifecycle_status not in ('all', 'draft', 'active', 'deprecated', 'archived')
     or p_production_status not in (
       'all', 'development_marker', 'production_candidate', 'approved_production', 'deprecated'
     )
     or p_sort not in ('friendly_name', 'updated_at', 'asset_type', 'lifecycle_status', 'version_count', 'reference_count')
     or p_direction not in ('asc', 'desc')
     or char_length(coalesce(p_category, '')) > 64
     or not private.claim_world_asset_rate_limit(
       'directory_read', p_user_id::text, p_rate_limit, 60
     ) then return jsonb_build_object('status', 'rate_limited'); end if;

  select count(*)::integer into total_count
  from public.world_assets as asset
  where (normalized_search = ''
      or position(normalized_search in lower(asset.asset_key)) > 0
      or position(normalized_search in lower(asset.friendly_name)) > 0)
    and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
    and (coalesce(p_category, 'all') = 'all' or asset.category = p_category)
    and (p_lifecycle_status = 'all' or asset.lifecycle_status = p_lifecycle_status)
    and (p_production_status = 'all' or asset.production_status = p_production_status);

  select coalesce(jsonb_agg(item), '[]'::jsonb) into items
  from (
    select private.world_asset_json(asset) as item
    from public.world_assets as asset
    where (normalized_search = ''
        or position(normalized_search in lower(asset.asset_key)) > 0
        or position(normalized_search in lower(asset.friendly_name)) > 0)
      and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
      and (coalesce(p_category, 'all') = 'all' or asset.category = p_category)
      and (p_lifecycle_status = 'all' or asset.lifecycle_status = p_lifecycle_status)
      and (p_production_status = 'all' or asset.production_status = p_production_status)
    order by
      case when p_sort = 'friendly_name' and p_direction = 'asc' then asset.friendly_name end asc,
      case when p_sort = 'friendly_name' and p_direction = 'desc' then asset.friendly_name end desc,
      case when p_sort = 'updated_at' and p_direction = 'asc' then asset.updated_at end asc,
      case when p_sort = 'updated_at' and p_direction = 'desc' then asset.updated_at end desc,
      case when p_sort = 'asset_type' and p_direction = 'asc' then asset.asset_type end asc,
      case when p_sort = 'asset_type' and p_direction = 'desc' then asset.asset_type end desc,
      case when p_sort = 'lifecycle_status' and p_direction = 'asc' then asset.lifecycle_status end asc,
      case when p_sort = 'lifecycle_status' and p_direction = 'desc' then asset.lifecycle_status end desc,
      case when p_sort = 'version_count' and p_direction = 'asc' then
        (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end asc,
      case when p_sort = 'version_count' and p_direction = 'desc' then
        (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end desc,
      case when p_sort = 'reference_count' and p_direction = 'asc' then
        (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end asc,
      case when p_sort = 'reference_count' and p_direction = 'desc' then
        (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end desc,
      asset.id asc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as rows;

  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.get_admin_game_asset(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
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
  asset public.world_assets%rowtype;
  versions jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if not private.claim_world_asset_rate_limit('detail_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into asset from public.world_assets where id = p_asset_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(bounded.item order by bounded.version_number desc, bounded.id desc), '[]'::jsonb)
  into versions
  from (
    select private.world_asset_version_json(version) as item,
      version.version_number, version.id
    from public.world_asset_versions as version
    where version.world_asset_id = asset.id
    order by version.version_number desc, version.id desc
    limit 100
  ) as bounded;
  return jsonb_build_object(
    'status', 'loaded', 'asset', private.world_asset_json(asset), 'versions', versions,
    'referenceSummary', private.world_asset_reference_summary(asset.id)
  );
end;
$$;

create or replace function public.get_admin_game_asset_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
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
  asset public.world_assets%rowtype;
  version public.world_asset_versions%rowtype;
  checks jsonb;
  reviews jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if not private.claim_world_asset_rate_limit('detail_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  select coalesce(jsonb_agg(bounded.item order by bounded.created_at desc, bounded.id desc), '[]'::jsonb)
  into checks
  from (
    select check_result.id, check_result.created_at, jsonb_build_object(
      'id', check_result.id, 'runId', check_result.validation_run_id,
      'code', check_result.check_code, 'level', check_result.level,
      'message', check_result.message, 'createdAt', check_result.created_at
    ) as item
    from public.world_asset_validation_checks as check_result
    where check_result.world_asset_version_id = version.id
    order by check_result.created_at desc, check_result.id desc
    limit 100
  ) as bounded;
  select coalesce(jsonb_agg(bounded.item order by bounded.created_at desc, bounded.id desc), '[]'::jsonb)
  into reviews
  from (
    select review.id, review.created_at, private.world_asset_review_json(review) as item
    from public.world_asset_reviews as review
    where review.world_asset_version_id = version.id
    order by review.created_at desc, review.id desc
    limit 100
  ) as bounded;
  return jsonb_build_object(
    'status', 'loaded', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version),
    'validationResults', checks, 'reviews', reviews,
    'referenceSummary', private.world_asset_reference_summary(asset.id)
  );
end;
$$;

create or replace function public.list_admin_game_asset_review_queue(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_asset_type text,
  p_category text,
  p_production_status text,
  p_sort text,
  p_direction text,
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
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  total_count integer;
  items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.review'
  );
  if p_page not between 1 and 10000 or p_page_size not in (10, 50, 100)
     or char_length(normalized_search) > 100
     or p_production_status not in (
       'all', 'development_marker', 'production_candidate', 'approved_production', 'deprecated'
     )
     or p_sort not in (
       'friendly_name', 'updated_at', 'asset_type', 'lifecycle_status',
       'version_count', 'reference_count'
     )
     or p_direction not in ('asc', 'desc')
     or not private.claim_world_asset_rate_limit('review_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*)::integer into total_count
  from public.world_asset_versions as version
  join public.world_assets as asset on asset.id = version.world_asset_id
  where version.lifecycle_status = 'in_review'
    and (normalized_search = ''
      or position(normalized_search in lower(asset.asset_key)) > 0
      or position(normalized_search in lower(asset.friendly_name)) > 0)
    and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
    and (p_category = 'all' or asset.category = p_category)
    and (p_production_status = 'all' or asset.production_status = p_production_status);
  select coalesce(jsonb_agg(item order by item_order), '[]'::jsonb)
  into items from (
    select row_number() over (order by
        case when p_sort = 'friendly_name' and p_direction = 'asc' then asset.friendly_name end asc,
        case when p_sort = 'friendly_name' and p_direction = 'desc' then asset.friendly_name end desc,
        case when p_sort = 'updated_at' and p_direction = 'asc' then asset.updated_at end asc,
        case when p_sort = 'updated_at' and p_direction = 'desc' then asset.updated_at end desc,
        case when p_sort = 'asset_type' and p_direction = 'asc' then asset.asset_type end asc,
        case when p_sort = 'asset_type' and p_direction = 'desc' then asset.asset_type end desc,
        case when p_sort = 'lifecycle_status' and p_direction = 'asc' then asset.lifecycle_status end asc,
        case when p_sort = 'lifecycle_status' and p_direction = 'desc' then asset.lifecycle_status end desc,
        case when p_sort = 'version_count' and p_direction = 'asc' then
          (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end asc,
        case when p_sort = 'version_count' and p_direction = 'desc' then
          (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end desc,
        case when p_sort = 'reference_count' and p_direction = 'asc' then
          (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end asc,
        case when p_sort = 'reference_count' and p_direction = 'desc' then
          (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end desc,
        version.id asc
      ) as item_order,
      jsonb_build_object(
        'asset', private.world_asset_json(asset),
        'version', private.world_asset_version_json(version)
      ) as item
    from public.world_asset_versions as version
    join public.world_assets as asset on asset.id = version.world_asset_id
    where version.lifecycle_status = 'in_review'
      and (normalized_search = ''
        or position(normalized_search in lower(asset.asset_key)) > 0
        or position(normalized_search in lower(asset.friendly_name)) > 0)
      and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
      and (p_category = 'all' or asset.category = p_category)
      and (p_production_status = 'all' or asset.production_status = p_production_status)
    order by
      case when p_sort = 'friendly_name' and p_direction = 'asc' then asset.friendly_name end asc,
      case when p_sort = 'friendly_name' and p_direction = 'desc' then asset.friendly_name end desc,
      case when p_sort = 'updated_at' and p_direction = 'asc' then asset.updated_at end asc,
      case when p_sort = 'updated_at' and p_direction = 'desc' then asset.updated_at end desc,
      case when p_sort = 'asset_type' and p_direction = 'asc' then asset.asset_type end asc,
      case when p_sort = 'asset_type' and p_direction = 'desc' then asset.asset_type end desc,
      case when p_sort = 'lifecycle_status' and p_direction = 'asc' then asset.lifecycle_status end asc,
      case when p_sort = 'lifecycle_status' and p_direction = 'desc' then asset.lifecycle_status end desc,
      case when p_sort = 'version_count' and p_direction = 'asc' then
        (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end asc,
      case when p_sort = 'version_count' and p_direction = 'desc' then
        (select count(*) from public.world_asset_versions where world_asset_id = asset.id) end desc,
      case when p_sort = 'reference_count' and p_direction = 'asc' then
        (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end asc,
      case when p_sort = 'reference_count' and p_direction = 'desc' then
        (private.world_asset_reference_summary(asset.id) ->> 'total')::integer end desc,
      version.id asc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as rows;
  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.list_admin_game_asset_audit(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_outcome text,
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
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  total_count integer;
  items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.audit_read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (10, 50, 100)
     or char_length(normalized_search) > 100
     or p_outcome not in ('all', 'success', 'denied', 'error')
     or not private.claim_world_asset_rate_limit('audit_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select count(*)::integer into total_count
  from public.world_asset_audit_events as event
  where (p_asset_id is null or event.target_world_asset_id = p_asset_id)
    and (p_outcome = 'all' or event.outcome = p_outcome)
    and (normalized_search = ''
      or position(normalized_search in lower(event.event_key)) > 0
      or position(normalized_search in lower(coalesce(event.reason, ''))) > 0);
  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into items from (
    select event.id, event.created_at, jsonb_build_object(
      'id', event.id, 'eventKey', event.event_key, 'action', event.action,
      'permissionKey', event.permission_key, 'actorAdminUserId', event.actor_admin_user_id,
      'targetAssetId', event.target_world_asset_id,
      'targetVersionId', event.target_world_asset_version_id,
      'targetMapId', event.target_world_map_id,
      'targetMapVersionId', event.target_world_map_version_id,
      'requestId', event.request_id, 'outcome', event.outcome, 'reason', event.reason,
      'beforeState', event.before_state, 'afterState', event.after_state,
      'metadata', event.metadata, 'createdAt', event.created_at
    ) as item
    from public.world_asset_audit_events as event
    where (p_asset_id is null or event.target_world_asset_id = p_asset_id)
      and (p_outcome = 'all' or event.outcome = p_outcome)
      and (normalized_search = ''
        or position(normalized_search in lower(event.event_key)) > 0
        or position(normalized_search in lower(coalesce(event.reason, ''))) > 0)
    order by event.created_at desc, event.id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) rows;
  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.list_admin_game_asset_references(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_page integer,
  p_page_size integer,
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
  total_count integer;
  items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if p_page not between 1 and 10000 or p_page_size not in (10, 50, 100)
     or not private.claim_world_asset_rate_limit('detail_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  if not exists (select 1 from public.world_assets where id = p_asset_id) then
    return jsonb_build_object('status', 'not_found');
  end if;
  with asset_references as (
    select reference.world_asset_version_id as version_id, 'world_map'::text as reference_type,
      map.slug || ':v' || version.version_number::text as reference_key,
      case when version.lifecycle_status in ('published', 'superseded') then 'published' else 'draft' end as lifecycle
    from public.world_map_version_assets as reference
    join public.world_map_versions as version on version.id = reference.world_map_version_id
    join public.world_maps as map on map.id = version.world_map_id
    where reference.world_asset_id = p_asset_id
    union all
    select reference.world_asset_version_id, reference.reference_type,
      reference.reference_key, reference.reference_lifecycle
    from public.world_asset_references as reference where reference.world_asset_id = p_asset_id
  ) select count(*)::integer into total_count from asset_references;
  with asset_references as (
    select reference.world_asset_version_id as version_id, 'world_map'::text as reference_type,
      map.slug || ':v' || version.version_number::text as reference_key,
      case when version.lifecycle_status in ('published', 'superseded') then 'published' else 'draft' end as lifecycle
    from public.world_map_version_assets as reference
    join public.world_map_versions as version on version.id = reference.world_map_version_id
    join public.world_maps as map on map.id = version.world_map_id
    where reference.world_asset_id = p_asset_id
    union all
    select reference.world_asset_version_id, reference.reference_type,
      reference.reference_key, reference.reference_lifecycle
    from public.world_asset_references as reference where reference.world_asset_id = p_asset_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'versionId', version_id, 'referenceType', reference_type,
    'referenceKey', reference_key, 'lifecycle', lifecycle
  ) order by lifecycle, reference_type, reference_key), '[]'::jsonb)
  into items from (
    select * from asset_references order by lifecycle, reference_type, reference_key
    limit p_page_size offset (p_page - 1) * p_page_size
  ) page;
  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'summary', private.world_asset_reference_summary(p_asset_id),
    'page', p_page, 'pageSize', p_page_size, 'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function private.world_asset_transparency_required(p_asset_type text)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select p_asset_type not in (
    'terrain_tile', 'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon',
    'furniture_icon', 'shop_icon'
  );
$$;

create or replace function private.world_asset_max_source_bytes(p_asset_type text)
returns integer
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case when p_asset_type in (
    'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
  ) then 2097152 else 5242880 end;
$$;

create or replace function private.world_asset_category_allowed(
  p_asset_type text,
  p_category text
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'building' then p_category in ('structure', 'shop')
    when 'shop' then p_category = 'shop'
    when 'cooking_station' then p_category in ('structure', 'interior')
    when 'crafting_station' then p_category in ('structure', 'interior')
    when 'home_entrance' then p_category = 'structure'
    when 'decoration' then p_category in ('structure', 'nature', 'boundary', 'lighting', 'signage')
    when 'tree' then p_category = 'nature'
    when 'rock' then p_category = 'nature'
    when 'fence' then p_category = 'boundary'
    when 'lamp' then p_category = 'lighting'
    when 'sign' then p_category = 'signage'
    when 'terrain_tile' then p_category = 'terrain'
    when 'bridge' then p_category = 'structure'
    when 'farm_plot' then p_category = 'farming'
    when 'crop_stage' then p_category = 'crop'
    when 'furniture' then p_category in ('furniture', 'interior')
    when 'home_interior_object' then p_category in ('interior', 'furniture')
    when 'interaction_marker' then p_category = 'interaction'
    when 'recipe_icon' then p_category = 'recipe'
    when 'shop_icon' then p_category = 'shop'
    when 'item_icon' then p_category = 'inventory'
    when 'seed_icon' then p_category = 'inventory'
    when 'crop_icon' then p_category = 'inventory'
    when 'furniture_icon' then p_category = 'inventory'
    else false
  end;
$$;

create or replace function private.world_asset_default_interactions(p_asset_type text)
returns text[]
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'shop' then array['shop']::text[]
    when 'cooking_station' then array['cooking_station']::text[]
    when 'crafting_station' then array['crafting_station']::text[]
    when 'home_entrance' then array['home_entrance']::text[]
    when 'farm_plot' then array['farm_plot']::text[]
    when 'sign' then array['sign']::text[]
    else array['decorative']::text[]
  end;
$$;

create or replace function private.world_asset_interactions_allowed(
  p_asset_type text,
  p_interactions text[]
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_interactions) between 1 and 7
    and cardinality(p_interactions) = (
      select count(distinct interaction)::integer from unnest(p_interactions) as item(interaction)
    )
    and p_interactions <@ case p_asset_type
      when 'building' then array['decorative', 'home_entrance']::text[]
      when 'shop' then array['shop']::text[]
      when 'cooking_station' then array['cooking_station']::text[]
      when 'crafting_station' then array['crafting_station']::text[]
      when 'home_entrance' then array['home_entrance']::text[]
      when 'farm_plot' then array['farm_plot']::text[]
      when 'sign' then array['sign']::text[]
      when 'home_interior_object' then array[
        'decorative', 'cooking_station', 'crafting_station'
      ]::text[]
      when 'interaction_marker' then array[
        'decorative', 'shop', 'cooking_station', 'crafting_station',
        'home_entrance', 'farm_plot', 'sign'
      ]::text[]
      else array['decorative']::text[]
    end;
$$;

create or replace function public.create_admin_game_asset_upload(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_friendly_name text,
  p_slug text,
  p_asset_type text,
  p_category text,
  p_development_marker_replacement_key text,
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
  asset_id uuid := gen_random_uuid();
  version_id uuid := gen_random_uuid();
  upload_id uuid := gen_random_uuid();
  extension text;
  intake_path text;
  result jsonb;
  replay jsonb;
  replay_asset public.world_assets%rowtype;
  replay_upload public.world_asset_uploads%rowtype;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_world_asset_rate_limit('upload_create', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  replay := private.world_asset_replay(p_user_id, 'create_asset_upload', p_request_id);
  if replay is not null then
    select * into replay_asset from public.world_assets
    where id = (replay ->> 'assetId')::uuid;
    select * into replay_upload from public.world_asset_uploads
    where id = (replay ->> 'uploadId')::uuid;
    if replay_asset.id = (replay ->> 'assetId')::uuid
       and replay_asset.created_by_admin_id = p_user_id
       and replay_asset.asset_key = p_slug
       and replay_asset.friendly_name = p_friendly_name
       and replay_asset.asset_type = p_asset_type
       and replay_asset.category = p_category
       and replay_asset.development_marker_replacement_key
         is not distinct from p_development_marker_replacement_key
       and replay_upload.world_asset_id = replay_asset.id
       and replay_upload.world_asset_version_id = (replay ->> 'versionId')::uuid
       and replay_upload.original_file_name = p_original_file_name
       and replay_upload.declared_mime_type = p_declared_mime_type
       and replay_upload.declared_size_bytes = p_declared_size_bytes then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if p_slug !~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
     or char_length(p_slug) not between 3 and 80
     or p_declared_mime_type not in ('image/png', 'image/webp')
     or p_declared_size_bytes not between 1 and private.world_asset_max_source_bytes(p_asset_type)
     or not private.world_asset_category_allowed(p_asset_type, p_category) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_UPLOAD_INPUT';
  end if;
  if exists (select 1 from public.world_assets where asset_key = p_slug) then
    return jsonb_build_object('status', 'slug_conflict');
  end if;
  if p_development_marker_replacement_key is not null and not exists (
    select 1 from public.world_assets
    where asset_key = p_development_marker_replacement_key
      and production_status = 'development_marker'
  ) then
    return jsonb_build_object('status', 'replacement_target_not_found');
  end if;

  extension := case when p_declared_mime_type = 'image/png' then 'png' else 'webp' end;
  intake_path := 'starville/' || asset_id::text || '/' || upload_id::text || '/original.' || extension;

  insert into public.world_assets (
    id, asset_key, content_hash, storage_path, source_type, media_type,
    approval_status, repository_owned, game_key, friendly_name, asset_type, category,
    lifecycle_status, production_status, development_marker_replacement_key,
    created_by_admin_id
  ) values (
    asset_id, p_slug, null, null, null, null, 'draft', false, 'starville',
    p_friendly_name, p_asset_type, p_category, 'draft', 'production_candidate',
    p_development_marker_replacement_key, p_user_id
  );

  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    render_width, render_height, interaction_compatibility,
    transparent_background_expected, created_by_admin_id
  ) values (
    version_id, asset_id, 1, 'draft', 'storage_raster',
    512, 512, private.world_asset_default_interactions(p_asset_type),
    private.world_asset_transparency_required(p_asset_type), p_user_id
  );

  insert into public.world_asset_uploads (
    id, world_asset_id, world_asset_version_id, intake_storage_path,
    original_file_name, declared_mime_type, declared_size_bytes, created_by_admin_id
  ) values (
    upload_id, asset_id, version_id, intake_path,
    p_original_file_name, p_declared_mime_type, p_declared_size_bytes, p_user_id
  );
  insert into public.world_asset_processing_jobs (upload_id) values (upload_id);

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, after_state, metadata
  ) values (
    'asset.upload.created', 'upload_created', 'assets.upload', p_user_id, admin_session_id,
    asset_id, version_id, upload_id, p_request_id, 'success',
    jsonb_build_object('assetKey', p_slug, 'versionNumber', 1, 'status', 'draft'),
    jsonb_build_object('declaredMimeType', p_declared_mime_type, 'declaredSizeBytes', p_declared_size_bytes)
  );

  result := jsonb_build_object(
    'status', 'created', 'assetId', asset_id, 'assetRevision', 1,
    'versionId', version_id, 'versionNumber', 1, 'versionEditVersion', 1,
    'uploadId', upload_id, 'uploadRevision', 1, 'intakePath', intake_path
  );
  perform private.store_world_asset_replay(p_user_id, 'create_asset_upload', p_request_id, result);
  return result;
end;
$$;

create or replace function public.create_admin_game_asset_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
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
  ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;
  replay := private.world_asset_replay(p_user_id, 'create_asset_version', p_request_id);
  if replay is not null then
    select * into replay_upload from public.world_asset_uploads
    where id = (replay ->> 'uploadId')::uuid;
    if replay ->> 'assetId' = p_asset_id::text
       and p_expected_asset_revision is not null
       and (replay ->> 'assetRevision')::integer = p_expected_asset_revision + 1
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
           and event.target_world_asset_version_id = (replay ->> 'versionId')::uuid
           and event.target_upload_id = replay_upload.id
           and event.reason = p_reason
       ) then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if not private.valid_world_asset_reason(p_reason)
     or p_declared_mime_type not in ('image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('asset-version:' || p_asset_id::text, 0));
  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object('status', 'asset_version_conflict', 'assetRevision', asset.record_version);
  end if;
  if asset.lifecycle_status = 'archived' then return jsonb_build_object('status', 'asset_archived'); end if;
  if p_declared_size_bytes not between 1 and private.world_asset_max_source_bytes(asset.asset_type) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_VERSION_UPLOAD_INPUT';
  end if;
  if exists (
    select 1 from public.world_asset_versions
    where world_asset_id = asset.id and lifecycle_status in (
      'draft', 'processing', 'validation_failed', 'validated', 'in_review',
      'changes_requested', 'approved'
    )
  ) then return jsonb_build_object('status', 'open_version_exists'); end if;

  select * into source_version from public.world_asset_versions where id = asset.active_version_id;
  select coalesce(max(version_number), 0) + 1 into next_version
  from public.world_asset_versions where world_asset_id = asset.id;
  extension := case when p_declared_mime_type = 'image/png' then 'png' else 'webp' end;
  intake_path := 'starville/' || asset.id::text || '/' || upload_id::text || '/original.' || extension;

  insert into public.world_asset_versions (
    id, world_asset_id, version_number, lifecycle_status, source_kind,
    render_width, render_height, render_scale, anchor_x, anchor_y,
    foot_anchor_x, foot_anchor_y,
    depth_anchor_x, depth_anchor_y, collision_profile, supported_rotations,
    default_rotation, interaction_compatibility, transparent_background_expected,
    internal_notes, created_by_admin_id
  ) values (
    version_id, asset.id, next_version, 'draft', 'storage_raster',
    source_version.render_width, source_version.render_height, source_version.render_scale,
    source_version.anchor_x, source_version.anchor_y,
    source_version.foot_anchor_x, source_version.foot_anchor_y,
    source_version.depth_anchor_x, source_version.depth_anchor_y,
    source_version.collision_profile, source_version.supported_rotations,
    source_version.default_rotation, source_version.interaction_compatibility,
    private.world_asset_transparency_required(asset.asset_type),
    source_version.internal_notes, p_user_id
  );

  insert into public.world_asset_version_tags (world_asset_version_id, world_asset_tag_id)
  select version_id, world_asset_tag_id from public.world_asset_version_tags
  where world_asset_version_id = source_version.id on conflict do nothing;

  insert into public.world_asset_uploads (
    id, world_asset_id, world_asset_version_id, intake_storage_path,
    original_file_name, declared_mime_type, declared_size_bytes, created_by_admin_id
  ) values (
    upload_id, asset.id, version_id, intake_path,
    p_original_file_name, p_declared_mime_type, p_declared_size_bytes, p_user_id
  );
  insert into public.world_asset_processing_jobs (upload_id) values (upload_id);
  update public.world_assets set record_version = record_version + 1 where id = asset.id
  returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, reason, after_state
  ) values (
    'asset.version.created', 'version_created', 'assets.upload', p_user_id, admin_session_id,
    asset.id, version_id, upload_id, p_request_id, 'success', p_reason,
    jsonb_build_object('versionNumber', next_version, 'status', 'draft')
  );

  result := jsonb_build_object(
    'status', 'created', 'assetId', asset.id, 'assetRevision', asset.record_version,
    'versionId', version_id, 'versionNumber', next_version, 'versionEditVersion', 1,
    'uploadId', upload_id, 'uploadRevision', 1, 'intakePath', intake_path
  );
  perform private.store_world_asset_replay(p_user_id, 'create_asset_version', p_request_id, result);
  return result;
end;
$$;

create or replace function public.complete_admin_game_asset_processing(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_upload_id uuid,
  p_expected_revision integer,
  p_original_checksum_sha256 text,
  p_processed_source_checksum_sha256 text,
  p_detected_mime_type text,
  p_source_width integer,
  p_source_height integer,
  p_source_size_bytes integer,
  p_processed_source_path text,
  p_processed_source_width integer,
  p_processed_source_height integer,
  p_processed_source_size_bytes integer,
  p_processed_preview_path text,
  p_processed_preview_width integer,
  p_processed_preview_height integer,
  p_processed_preview_size_bytes integer,
  p_processed_thumbnail_path text,
  p_processed_thumbnail_width integer,
  p_processed_thumbnail_height integer,
  p_processed_thumbnail_size_bytes integer,
  p_transparency_result text,
  p_validation_results jsonb,
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
  version public.world_asset_versions%rowtype;
  upload public.world_asset_uploads%rowtype;
  validation_run_id uuid := gen_random_uuid();
  duplicate_found boolean;
  valid_result boolean;
  expected_prefix text;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if not private.valid_world_asset_validation_results(p_validation_results)
     or p_original_checksum_sha256 !~ '^[0-9a-f]{64}$'
     or p_processed_source_checksum_sha256 !~ '^[0-9a-f]{64}$'
     or p_detected_mime_type not in ('image/png', 'image/webp')
     or p_transparency_result not in ('opaque', 'transparent', 'partial')
     or p_source_width not between 1 and 4096
     or p_source_height not between 1 and 4096
     or p_source_size_bytes not between 1 and 10485760
     or p_processed_source_width not between 1 and 4096
     or p_processed_source_height not between 1 and 4096
     or p_processed_source_size_bytes not between 1 and 8388608
     or p_processed_preview_width not between 1 and 2048
     or p_processed_preview_height not between 1 and 2048
     or p_processed_preview_size_bytes not between 1 and 8388608
     or p_processed_thumbnail_width not between 1 and 512
     or p_processed_thumbnail_height not between 1 and 512
     or p_processed_thumbnail_size_bytes not between 1 and 8388608
     or not private.claim_world_asset_rate_limit('processing_write', p_user_id::text, p_rate_limit, 60) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_PROCESSING_RESULT';
  end if;
  replay := private.world_asset_replay(p_user_id, 'complete_asset_processing', p_request_id);

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
    where id = p_version_id and world_asset_id = p_asset_id for update;
  select * into upload from public.world_asset_uploads
    where id = p_upload_id and world_asset_id = p_asset_id
      and world_asset_version_id = p_version_id for update;
  if asset.id is null or version.id is null or upload.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if p_source_size_bytes > private.world_asset_max_source_bytes(asset.asset_type) then
    raise exception using errcode = '22023', message = 'ASSET_SOURCE_TOO_LARGE';
  end if;

  expected_prefix := 'starville/' || asset.id::text || '/' || version.id::text || '/processed/';
  if p_processed_source_path <> (expected_prefix || 'source.webp')
     or p_processed_preview_path <> (expected_prefix || 'preview.webp')
     or p_processed_thumbnail_path <> (expected_prefix || 'thumbnail.webp') then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_STORAGE_PATH';
  end if;

  select exists (
    select 1 from public.world_asset_uploads as other
    where other.id <> upload.id and other.checksum_sha256 = p_original_checksum_sha256
      and other.status = 'validated'
  ) into duplicate_found;

  if duplicate_found then
    p_validation_results := jsonb_set(
      p_validation_results,
      '{issues}',
      (p_validation_results -> 'issues') || jsonb_build_array(jsonb_build_object(
        'code', 'DUPLICATE_CONTENT', 'level', 'blocking_error', 'path', 'source',
        'message', 'An identical uploaded image already exists.'
      ))
    );
  end if;

  if version.transparent_background_expected and p_transparency_result = 'opaque' then
    p_validation_results := jsonb_set(
      p_validation_results,
      '{issues}',
      (p_validation_results -> 'issues') || jsonb_build_array(jsonb_build_object(
        'code', 'TRANSPARENCY_REQUIRED', 'level', 'blocking_error', 'path', 'source.alpha',
        'message', 'This asset type requires a transparent background.'
      ))
    );
  end if;

  valid_result := not exists (
    select 1 from jsonb_array_elements(p_validation_results -> 'issues') issue
    where issue ->> 'level' = 'blocking_error'
  );
  p_validation_results := jsonb_set(
    p_validation_results, '{valid}', to_jsonb(valid_result), true
  );

  if replay is not null then
    if upload.status = 'validated'
       and upload.revision = p_expected_revision + 1
       and upload.checksum_sha256 = p_original_checksum_sha256
       and upload.detected_mime_type = p_detected_mime_type
       and upload.detected_width = p_source_width
       and upload.detected_height = p_source_height
       and upload.detected_size_bytes = p_source_size_bytes
       and upload.validation_results = p_validation_results
       and version.lifecycle_status = (
         case when valid_result then 'validated' else 'validation_failed' end
       )
       and version.checksum_sha256 = p_processed_source_checksum_sha256
       and version.detected_mime_type = p_detected_mime_type
       and version.source_width = p_source_width
       and version.source_height = p_source_height
       and version.source_size_bytes = p_source_size_bytes
       and version.processed_source_path = p_processed_source_path
       and version.processed_source_width = p_processed_source_width
       and version.processed_source_height = p_processed_source_height
       and version.processed_source_size_bytes = p_processed_source_size_bytes
       and version.processed_preview_path = p_processed_preview_path
       and version.processed_preview_width = p_processed_preview_width
       and version.processed_preview_height = p_processed_preview_height
       and version.processed_preview_size_bytes = p_processed_preview_size_bytes
       and version.processed_thumbnail_path = p_processed_thumbnail_path
       and version.processed_thumbnail_width = p_processed_thumbnail_width
       and version.processed_thumbnail_height = p_processed_thumbnail_height
       and version.processed_thumbnail_size_bytes = p_processed_thumbnail_size_bytes
       and version.transparency_result = p_transparency_result
       and version.validation_results = p_validation_results then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if upload.revision <> p_expected_revision then
    return jsonb_build_object('status', 'upload_version_conflict', 'uploadRevision', upload.revision);
  end if;
  if upload.status in ('validated', 'failed', 'cancelled', 'expired') then
    return jsonb_build_object('status', 'processing_not_available');
  end if;

  update public.world_asset_uploads
  set status = 'validated', checksum_sha256 = p_original_checksum_sha256,
      detected_mime_type = p_detected_mime_type, detected_width = p_source_width,
      detected_height = p_source_height, detected_size_bytes = p_source_size_bytes,
      validation_results = p_validation_results, revision = revision + 1,
      completed_at = now()
  where id = upload.id returning * into upload;

  update public.world_asset_versions
  set lifecycle_status = case when valid_result then 'validated' else 'validation_failed' end,
      checksum_sha256 = p_processed_source_checksum_sha256,
      detected_mime_type = p_detected_mime_type,
      source_width = p_source_width, source_height = p_source_height,
      source_size_bytes = p_source_size_bytes,
      processed_source_path = p_processed_source_path,
      processed_source_width = p_processed_source_width,
      processed_source_height = p_processed_source_height,
      processed_source_size_bytes = p_processed_source_size_bytes,
      processed_preview_path = p_processed_preview_path,
      processed_preview_width = p_processed_preview_width,
      processed_preview_height = p_processed_preview_height,
      processed_preview_size_bytes = p_processed_preview_size_bytes,
      processed_thumbnail_path = p_processed_thumbnail_path,
      processed_thumbnail_width = p_processed_thumbnail_width,
      processed_thumbnail_height = p_processed_thumbnail_height,
      processed_thumbnail_size_bytes = p_processed_thumbnail_size_bytes,
      transparency_result = p_transparency_result,
      automated_validation_status = case when valid_result then 'valid' else 'invalid' end,
      validation_results = p_validation_results,
      edit_version = edit_version + 1
  where id = version.id returning * into version;

  insert into public.world_asset_validation_checks (
    world_asset_version_id, validation_run_id, check_code, level, message
  )
  select version.id, validation_run_id, issue ->> 'code', issue ->> 'level', issue ->> 'message'
  from jsonb_array_elements(p_validation_results -> 'issues') issue
  on conflict do nothing;

  update public.world_asset_processing_jobs
  set status = case when valid_result then 'completed' else 'failed' end,
      attempt_count = attempt_count + 1,
      safe_error_code = case when valid_result then null else
        case when duplicate_found then 'DUPLICATE_CONTENT' else 'VALIDATION_FAILED' end end,
      completed_at = now()
  where upload_id = upload.id;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, after_state, metadata
  ) values (
    case when valid_result then 'asset.processing.validated' else 'asset.processing.validation_failed' end,
    case when valid_result then 'processing_validated' else 'processing_validation_failed' end,
    'assets.upload', p_user_id, admin_session_id, asset.id, version.id, upload.id,
    p_request_id, 'success',
    jsonb_build_object('lifecycleStatus', version.lifecycle_status, 'editVersion', version.edit_version),
    jsonb_build_object('validationRunId', validation_run_id, 'sourceMimeType', p_detected_mime_type)
  );

  result := jsonb_build_object(
    'status', case when valid_result then 'validated' else 'validation_failed' end,
    'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version),
    'validationResults', p_validation_results,
    'uploadRevision', upload.revision
  );
  perform private.store_world_asset_replay(p_user_id, 'complete_asset_processing', p_request_id, result);
  return result;
end;
$$;

create or replace function public.fail_admin_game_asset_processing(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_upload_id uuid,
  p_expected_revision integer,
  p_error_code text,
  p_validation_results jsonb,
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
  version public.world_asset_versions%rowtype;
  upload public.world_asset_uploads%rowtype;
  safe_results jsonb := p_validation_results;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.upload'
  );
  if p_error_code not in (
       'UNSUPPORTED_IMAGE', 'MIME_MISMATCH', 'MALFORMED_IMAGE', 'ANIMATED_IMAGE',
       'IMAGE_TOO_LARGE', 'DIMENSIONS_TOO_LARGE', 'DECOMPRESSION_LIMIT',
       'DUPLICATE_CONTENT', 'PROCESSING_FAILED', 'STORAGE_FAILED'
     )
     or not private.valid_world_asset_validation_results(p_validation_results)
     or not private.claim_world_asset_rate_limit('processing_write', p_user_id::text, p_rate_limit, 60) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_PROCESSING_FAILURE';
  end if;
  if jsonb_array_length(safe_results -> 'issues') = 0 then
    safe_results := jsonb_set(
      safe_results,
      '{issues}',
      jsonb_build_array(jsonb_build_object(
        'code', p_error_code, 'level', 'blocking_error', 'path', 'source',
        'message', 'The image could not be processed safely.'
      ))
    );
  end if;
  safe_results := jsonb_set(safe_results, '{valid}', 'false'::jsonb, true);

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
    where id = p_version_id and world_asset_id = p_asset_id for update;
  select * into upload from public.world_asset_uploads
    where id = p_upload_id and world_asset_id = p_asset_id
      and world_asset_version_id = p_version_id for update;
  if asset.id is null or version.id is null or upload.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  replay := private.world_asset_replay(p_user_id, 'fail_asset_processing', p_request_id);
  if replay is not null then
    if upload.status = 'failed'
       and upload.revision = p_expected_revision + 1
       and upload.safe_error_code = p_error_code
       and upload.validation_results = safe_results then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if upload.revision <> p_expected_revision then
    return jsonb_build_object('status', 'upload_version_conflict', 'uploadRevision', upload.revision);
  end if;
  if upload.status in ('validated', 'failed', 'cancelled', 'expired') then
    return jsonb_build_object('status', 'processing_not_available');
  end if;

  update public.world_asset_uploads
  set status = 'failed', safe_error_code = p_error_code,
      validation_results = safe_results, revision = revision + 1, completed_at = now()
  where id = upload.id returning * into upload;
  update public.world_asset_versions
  set lifecycle_status = 'validation_failed', automated_validation_status = 'invalid',
      validation_results = safe_results, edit_version = edit_version + 1
  where id = version.id returning * into version;
  update public.world_asset_processing_jobs
  set status = 'failed', attempt_count = attempt_count + 1,
      safe_error_code = p_error_code, completed_at = now()
  where upload_id = upload.id;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, target_upload_id,
    request_id, outcome, after_state, metadata
  ) values (
    'asset.processing.failed', 'processing_failed', 'assets.upload',
    p_user_id, admin_session_id, asset.id, version.id, upload.id,
    p_request_id, 'error', jsonb_build_object('lifecycleStatus', 'validation_failed'),
    jsonb_build_object('safeErrorCode', p_error_code)
  );
  result := jsonb_build_object(
    'status', 'validation_failed', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version),
    'validationResults', safe_results, 'uploadRevision', upload.revision
  );
  perform private.store_world_asset_replay(p_user_id, 'fail_asset_processing', p_request_id, result);
  return result;
end;
$$;

create or replace function public.get_admin_game_asset_preview_material(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
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
  version public.world_asset_versions%rowtype;
  original_path text;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if not private.claim_world_asset_rate_limit('detail_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id;
  if not found or version.processed_source_path is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  select upload.intake_storage_path into original_path
  from public.world_asset_uploads as upload
  where upload.world_asset_id = p_asset_id
    and upload.world_asset_version_id = p_version_id
    and upload.status = 'validated'
    and upload.checksum_sha256 is not null
  order by upload.created_at desc, upload.id desc
  limit 1;
  return jsonb_build_object(
    'status', 'loaded', 'assetId', p_asset_id, 'versionId', version.id,
    'lifecycleStatus', version.lifecycle_status,
    'originalPath', original_path,
    'processedSourcePath', version.processed_source_path,
    'processedPreviewPath', version.processed_preview_path,
    'processedThumbnailPath', version.processed_thumbnail_path
  );
end;
$$;

create or replace function public.get_admin_game_asset_activation_material(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_asset_revision integer,
  p_expected_edit_version integer,
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
  asset public.world_assets%rowtype;
  version public.world_asset_versions%rowtype;
  activation_replay jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.activate'
  );
  if not private.claim_world_asset_rate_limit('detail_read', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id;
  if asset.id is null or version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  activation_replay := private.world_asset_replay(
    p_user_id, 'activate_asset_version', p_request_id
  );
  if version.lifecycle_status = 'approved' then
    if p_expected_asset_revision is null or p_expected_edit_version is null
       or asset.record_version <> p_expected_asset_revision
       or version.edit_version <> p_expected_edit_version then
      return jsonb_build_object(
        'status', 'asset_version_conflict',
        'assetRevision', asset.record_version,
        'versionEditVersion', version.edit_version
      );
    end if;
  elsif version.lifecycle_status = 'active' then
    if activation_replay is null
       or activation_replay #>> '{asset,id}' <> asset.id::text
       or activation_replay #>> '{version,id}' <> version.id::text
       or p_expected_asset_revision is null or p_expected_edit_version is null
       or asset.record_version <> p_expected_asset_revision + 1
       or version.edit_version <> p_expected_edit_version + 1
       or asset.active_version_id is distinct from version.id
       or version.delivery_source_path is null
       or version.delivery_preview_path is null
       or version.delivery_thumbnail_path is null then
      return jsonb_build_object('status', 'not_found');
    end if;
  else
    return jsonb_build_object('status', 'not_found');
  end if;
  if version.processed_source_path is null
     or version.processed_preview_path is null
     or version.processed_thumbnail_path is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'loaded', 'assetId', asset.id, 'versionId', version.id,
    'slug', asset.asset_key, 'versionNumber', version.version_number,
    'checksumSha256', version.checksum_sha256,
    'processedSourcePath', version.processed_source_path,
    'processedPreviewPath', version.processed_preview_path,
    'processedThumbnailPath', version.processed_thumbnail_path
  );
end;
$$;

create or replace function public.update_admin_game_asset_version_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_friendly_name text,
  p_category text,
  p_tags text[],
  p_internal_notes text,
  p_render_width integer,
  p_render_height integer,
  p_render_scale numeric,
  p_anchor_x numeric,
  p_anchor_y numeric,
  p_foot_anchor_x numeric,
  p_foot_anchor_y numeric,
  p_depth_anchor_x numeric,
  p_depth_anchor_y numeric,
  p_collision_profile jsonb,
  p_supported_rotations smallint[],
  p_default_rotation smallint,
  p_interaction_compatibility text[],
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
  version public.world_asset_versions%rowtype;
  before_state jsonb;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.edit'
  );
  if char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.claim_world_asset_rate_limit('draft_write', p_user_id::text, p_rate_limit, 60) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  replay := private.world_asset_replay(p_user_id, 'update_asset_draft', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id for update;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id for update;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if version.edit_version <> p_expected_edit_version then
    return jsonb_build_object(
      'status', 'version_conflict', 'versionEditVersion', version.edit_version
    );
  end if;
  if version.lifecycle_status not in (
    'draft', 'validation_failed', 'validated', 'changes_requested'
  ) then return jsonb_build_object('status', 'version_not_editable'); end if;
  if char_length(coalesce(p_friendly_name, '')) not between 1 and 100
     or p_friendly_name <> btrim(p_friendly_name)
     or p_friendly_name ~ '[[:cntrl:]<>]'
     or char_length(coalesce(p_internal_notes, '')) > 2000
     or p_internal_notes <> btrim(p_internal_notes)
     or p_internal_notes ~ '[[:cntrl:]<>]'
     or p_render_width not between 1 and 4096
     or p_render_height not between 1 and 4096
     or p_render_scale not between 0.05 and 8
     or p_anchor_x not between 0 and 1 or p_anchor_y not between 0 and 1
     or p_foot_anchor_x not between 0 and 1 or p_foot_anchor_y not between 0 and 1
     or p_depth_anchor_x not between 0 and 1 or p_depth_anchor_y not between 0 and 1
     or not private.valid_world_asset_collision_profile(p_collision_profile)
     or not private.valid_world_asset_rotations(p_supported_rotations)
     or p_default_rotation <> all(p_supported_rotations)
     or not private.world_asset_category_allowed(asset.asset_type, p_category)
     or not private.world_asset_interactions_allowed(
       asset.asset_type, p_interaction_compatibility
     )
     or cardinality(p_tags) > 24
     or cardinality(p_tags) <> (
       select count(distinct tag)::integer from unnest(p_tags) as item(tag)
     )
     or exists (
       select 1 from unnest(p_tags) as item(tag)
       where char_length(tag) not between 2 and 48
         or tag !~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_DRAFT_INPUT';
  end if;
  if asset.asset_type in (
       'terrain_tile', 'crop_stage', 'interaction_marker', 'item_icon', 'seed_icon',
       'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
     ) and p_collision_profile ->> 'shape' <> 'none' then
    raise exception using errcode = '22023', message = 'ASSET_COLLISION_NOT_SUPPORTED';
  end if;

  before_state := jsonb_build_object(
    'friendlyName', asset.friendly_name,
    'category', asset.category,
    'versionEditVersion', version.edit_version,
    'lifecycleStatus', version.lifecycle_status
  );

  update public.world_assets
  set friendly_name = p_friendly_name,
      category = p_category,
      record_version = record_version + 1
  where id = asset.id
  returning * into asset;

  update public.world_asset_versions
  set lifecycle_status = 'draft',
      render_width = p_render_width,
      render_height = p_render_height,
      render_scale = p_render_scale,
      anchor_x = p_anchor_x,
      anchor_y = p_anchor_y,
      foot_anchor_x = p_foot_anchor_x,
      foot_anchor_y = p_foot_anchor_y,
      depth_anchor_x = p_depth_anchor_x,
      depth_anchor_y = p_depth_anchor_y,
      collision_profile = p_collision_profile,
      supported_rotations = p_supported_rotations,
      default_rotation = p_default_rotation,
      interaction_compatibility = p_interaction_compatibility,
      internal_notes = p_internal_notes,
      automated_validation_status = 'pending',
      validation_results = null,
      submitted_by_admin_id = null,
      submitted_at = null,
      reviewed_by_admin_id = null,
      reviewed_at = null,
      edit_version = edit_version + 1
  where id = version.id
  returning * into version;

  insert into public.world_asset_tags (game_key, slug, display_name)
  select asset.game_key, tag, initcap(replace(tag, '-', ' '))
  from unnest(p_tags) as item(tag)
  on conflict (game_key, slug) do nothing;

  delete from public.world_asset_version_tags where world_asset_version_id = version.id;
  insert into public.world_asset_version_tags (world_asset_version_id, world_asset_tag_id)
  select version.id, tag.id
  from public.world_asset_tags as tag
  where tag.game_key = asset.game_key and tag.slug = any(p_tags)
  on conflict do nothing;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, before_state, after_state
  ) values (
    'asset.metadata.updated', 'metadata_updated', 'assets.edit', p_user_id, admin_session_id,
    asset.id, version.id, p_request_id, 'success', before_state,
    jsonb_build_object(
      'friendlyName', asset.friendly_name,
      'category', asset.category,
      'versionEditVersion', version.edit_version,
      'lifecycleStatus', version.lifecycle_status
    )
  );

  result := jsonb_build_object(
    'status', 'updated', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(p_user_id, 'update_asset_draft', p_request_id, result);
  return result;
end;
$$;

create or replace function public.validate_admin_game_asset_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
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
  version public.world_asset_versions%rowtype;
  validation_run_id uuid := gen_random_uuid();
  issues jsonb := '[]'::jsonb;
  validation_result jsonb;
  valid_result boolean;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.validate'
  );
  if not private.claim_world_asset_rate_limit(
    'validation_write', p_user_id::text, p_rate_limit, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  replay := private.world_asset_replay(p_user_id, 'validate_asset_version', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id for update;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if version.edit_version <> p_expected_edit_version then
    return jsonb_build_object(
      'status', 'version_conflict', 'versionEditVersion', version.edit_version
    );
  end if;
  if version.lifecycle_status not in (
    'draft', 'validation_failed', 'validated', 'changes_requested'
  ) then return jsonb_build_object('status', 'version_not_validatable'); end if;

  if version.source_kind = 'storage_raster' and (
    version.checksum_sha256 is null
    or version.detected_mime_type not in ('image/png', 'image/webp')
    or version.source_width is null or version.source_height is null
    or version.source_size_bytes is null
    or version.processed_source_path is null
    or version.processed_preview_path is null
    or version.processed_thumbnail_path is null
  ) then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code', 'FILE_PROCESSING_REQUIRED', 'level', 'blocking_error', 'path', 'source',
      'message', 'The source image and its sanitized derivatives must finish processing.'
    ));
  end if;
  if not private.world_asset_category_allowed(asset.asset_type, asset.category) then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code', 'CATEGORY_NOT_SUPPORTED', 'level', 'blocking_error', 'path', 'category',
      'message', 'The selected category is not supported for this asset type.'
    ));
  end if;
  if not private.world_asset_interactions_allowed(
    asset.asset_type, version.interaction_compatibility
  ) then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code', 'INTERACTION_NOT_SUPPORTED', 'level', 'blocking_error',
      'path', 'interactionCompatibility',
      'message', 'One or more interactions are not supported for this asset type.'
    ));
  end if;
  if asset.asset_type in (
       'terrain_tile', 'crop_stage', 'interaction_marker', 'item_icon', 'seed_icon',
       'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
     ) and version.collision_profile ->> 'shape' <> 'none' then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code', 'COLLISION_NOT_SUPPORTED', 'level', 'blocking_error', 'path', 'collision',
      'message', 'Collision geometry is not supported for this asset type.'
    ));
  end if;
  if version.transparent_background_expected and version.transparency_result = 'opaque' then
    issues := issues || jsonb_build_array(jsonb_build_object(
      'code', 'TRANSPARENCY_REQUIRED', 'level', 'blocking_error', 'path', 'source.alpha',
      'message', 'This asset type requires a transparent background.'
    ));
  end if;
  if jsonb_array_length(issues) = 0 then
    issues := jsonb_build_array(jsonb_build_object(
      'code', 'ASSET_CONFIGURATION_VALID', 'level', 'passed', 'path', '',
      'message', 'File and configuration validation passed.'
    ));
  end if;

  valid_result := not exists (
    select 1 from jsonb_array_elements(issues) as issue
    where issue ->> 'level' = 'blocking_error'
  );
  validation_result := jsonb_build_object(
    'valid', valid_result,
    'checkedAt', to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'issues', issues
  );

  update public.world_asset_versions
  set lifecycle_status = case when valid_result then 'validated' else 'validation_failed' end,
      automated_validation_status = case when valid_result then 'valid' else 'invalid' end,
      validation_results = validation_result,
      edit_version = edit_version + 1
  where id = version.id
  returning * into version;

  insert into public.world_asset_validation_checks (
    world_asset_version_id, validation_run_id, check_code, level, message
  )
  select version.id, validation_run_id, issue ->> 'code', issue ->> 'level', issue ->> 'message'
  from jsonb_array_elements(issues) as issue;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, after_state, metadata
  ) values (
    case when valid_result then 'asset.validation.passed' else 'asset.validation.failed' end,
    case when valid_result then 'validation_passed' else 'validation_failed' end,
    'assets.validate', p_user_id, admin_session_id, asset.id, version.id,
    p_request_id, 'success',
    jsonb_build_object(
      'lifecycleStatus', version.lifecycle_status,
      'validationStatus', version.automated_validation_status,
      'editVersion', version.edit_version
    ),
    jsonb_build_object('validationRunId', validation_run_id)
  );

  result := jsonb_build_object(
    'status', case when valid_result then 'validated' else 'validation_failed' end,
    'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version),
    'validationResults', validation_result
  );
  perform private.store_world_asset_replay(p_user_id, 'validate_asset_version', p_request_id, result);
  return result;
end;
$$;

create or replace function public.submit_admin_game_asset_review(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
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
  version public.world_asset_versions%rowtype;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.edit'
  );
  if not private.valid_world_asset_reason(p_reason)
     or not private.claim_world_asset_rate_limit(
       'review_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_REVIEW_SUBMISSION';
  end if;
  replay := private.world_asset_replay(p_user_id, 'submit_asset_review', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id for update;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if version.edit_version <> p_expected_edit_version then
    return jsonb_build_object(
      'status', 'version_conflict', 'versionEditVersion', version.edit_version
    );
  end if;
  if version.lifecycle_status <> 'validated'
     or version.automated_validation_status <> 'valid'
     or coalesce((version.validation_results ->> 'valid')::boolean, false) is not true then
    return jsonb_build_object('status', 'version_not_submittable');
  end if;

  update public.world_asset_versions
  set lifecycle_status = 'in_review',
      submitted_by_admin_id = p_user_id,
      submitted_at = now(),
      edit_version = edit_version + 1
  where id = version.id
  returning * into version;

  insert into public.world_asset_reviews (
    world_asset_id, world_asset_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (
    asset.id, version.id, 'submitted', p_user_id, admin_session_id, p_reason, p_request_id
  );
  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, after_state
  ) values (
    'asset.review.submitted', 'review_submitted', 'assets.edit', p_user_id, admin_session_id,
    asset.id, version.id, p_request_id, 'success', p_reason,
    jsonb_build_object(
      'lifecycleStatus', version.lifecycle_status, 'editVersion', version.edit_version
    )
  );

  result := jsonb_build_object(
    'status', 'submitted', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(p_user_id, 'submit_asset_review', p_request_id, result);
  return result;
end;
$$;

create or replace function public.review_admin_game_asset_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_action text,
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
  version public.world_asset_versions%rowtype;
  review_action text;
  next_status text;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.review'
  );
  if p_action = 'approve' then
    perform private.assert_verified_admin_permission(
      p_user_id, p_auth_session_id, p_assurance_level, 'assets.approve'
    );
  end if;
  if p_action not in ('request_changes', 'reject', 'approve')
     or not private.valid_world_asset_reason(p_reason)
     or not private.claim_world_asset_rate_limit(
       'review_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_REVIEW_ACTION';
  end if;
  replay := private.world_asset_replay(p_user_id, 'review_asset_version', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id for update;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if version.edit_version <> p_expected_edit_version then
    return jsonb_build_object(
      'status', 'version_conflict', 'versionEditVersion', version.edit_version
    );
  end if;
  if version.lifecycle_status <> 'in_review' then
    return jsonb_build_object('status', 'version_not_reviewable');
  end if;
  if p_action = 'approve' and (
    version.automated_validation_status <> 'valid'
    or coalesce((version.validation_results ->> 'valid')::boolean, false) is not true
  ) then return jsonb_build_object('status', 'version_not_approvable'); end if;

  review_action := case p_action
    when 'request_changes' then 'changes_requested'
    when 'reject' then 'rejected'
    else 'approved'
  end;
  next_status := case
    when p_action = 'request_changes' then 'changes_requested'
    when p_action = 'reject' then 'rejected'
    else 'approved'
  end;

  update public.world_asset_versions
  set lifecycle_status = next_status,
      reviewed_by_admin_id = p_user_id,
      reviewed_at = now(),
      approved_by_admin_id = case when p_action = 'approve' then p_user_id else null end,
      approved_at = case when p_action = 'approve' then now() else null end,
      edit_version = edit_version + 1
  where id = version.id
  returning * into version;

  insert into public.world_asset_reviews (
    world_asset_id, world_asset_version_id, action, administrator_user_id,
    admin_session_id, reason, request_id
  ) values (
    asset.id, version.id, review_action, p_user_id, admin_session_id, p_reason, p_request_id
  );
  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, after_state
  ) values (
    'asset.review.' || review_action,
    review_action,
    case when p_action = 'approve' then 'assets.approve' else 'assets.review' end,
    p_user_id, admin_session_id, asset.id, version.id, p_request_id,
    'success', p_reason,
    jsonb_build_object(
      'lifecycleStatus', version.lifecycle_status, 'editVersion', version.edit_version
    )
  );

  result := jsonb_build_object(
    'status', next_status, 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(p_user_id, 'review_asset_version', p_request_id, result);
  return result;
end;
$$;

create or replace function public.activate_admin_game_asset_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_expected_asset_revision integer,
  p_expected_edit_version integer,
  p_delivery_source_path text,
  p_delivery_preview_path text,
  p_delivery_thumbnail_path text,
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
  version public.world_asset_versions%rowtype;
  previous_version public.world_asset_versions%rowtype;
  before_state jsonb;
  expected_prefix text;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.activate'
  );
  if not private.valid_world_asset_reason(p_reason)
     or not private.claim_world_asset_rate_limit(
       'activation_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_ACTIVATION';
  end if;
  replay := private.world_asset_replay(p_user_id, 'activate_asset_version', p_request_id);

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asset-activation:' || p_asset_id::text, 0)
  );
  select * into asset from public.world_assets where id = p_asset_id for update;
  select * into version from public.world_asset_versions
  where id = p_version_id and world_asset_id = p_asset_id for update;
  if asset.id is null or version.id is null then return jsonb_build_object('status', 'not_found'); end if;
  if replay is not null then
    if replay #>> '{asset,id}' = p_asset_id::text
       and replay #>> '{version,id}' = p_version_id::text
       and asset.active_version_id = version.id
       and asset.record_version = p_expected_asset_revision + 1
       and version.edit_version = p_expected_edit_version + 1
       and version.delivery_source_path = p_delivery_source_path
       and version.delivery_preview_path = p_delivery_preview_path
       and version.delivery_thumbnail_path = p_delivery_thumbnail_path then
      return replay;
    end if;
    return jsonb_build_object('status', 'state_conflict');
  end if;
  if asset.record_version <> p_expected_asset_revision
     or version.edit_version <> p_expected_edit_version then
    return jsonb_build_object(
      'status', 'asset_version_conflict',
      'assetRevision', asset.record_version,
      'versionEditVersion', version.edit_version
    );
  end if;
  if version.lifecycle_status <> 'approved'
     or version.automated_validation_status <> 'valid'
     or version.checksum_sha256 is null
     or version.processed_source_path is null
     or version.processed_preview_path is null
     or version.processed_thumbnail_path is null then
    return jsonb_build_object('status', 'version_not_activatable');
  end if;

  expected_prefix := 'starville/' || asset.asset_key || '/v' || version.version_number::text || '/';
  if p_delivery_source_path <> (expected_prefix || 'source.webp')
     or p_delivery_preview_path <> (expected_prefix || 'preview.webp')
     or p_delivery_thumbnail_path <> (expected_prefix || 'thumbnail.webp') then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_DELIVERY_PATH';
  end if;
  if exists (
    select 1 from public.world_assets as other
    where other.id <> asset.id and other.content_hash = version.checksum_sha256
  ) then return jsonb_build_object('status', 'duplicate_content'); end if;

  before_state := jsonb_build_object(
    'activeVersionId', asset.active_version_id,
    'assetRevision', asset.record_version,
    'lifecycleStatus', asset.lifecycle_status,
    'productionStatus', asset.production_status
  );

  if asset.active_version_id is not null and asset.active_version_id <> version.id then
    select * into previous_version from public.world_asset_versions
    where id = asset.active_version_id for update;
  end if;

  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  if previous_version.id is not null then
    update public.world_asset_versions
    set lifecycle_status = 'deprecated', edit_version = edit_version + 1
    where id = previous_version.id;
  end if;
  update public.world_asset_versions
  set lifecycle_status = 'active',
      delivery_source_path = p_delivery_source_path,
      delivery_preview_path = p_delivery_preview_path,
      delivery_thumbnail_path = p_delivery_thumbnail_path,
      activated_at = now(),
      edit_version = edit_version + 1
  where id = version.id
  returning * into version;

  update public.world_assets
  set active_version_id = version.id,
      lifecycle_status = 'active',
      production_status = 'approved_production',
      content_hash = version.checksum_sha256,
      source_type = 'storage_raster',
      media_type = 'image/webp',
      width = version.processed_source_width,
      height = version.processed_source_height,
      file_size_bytes = version.processed_source_size_bytes,
      approval_status = 'approved',
      approved_by_admin_id = p_user_id,
      approved_at = coalesce(asset.approved_at, now()),
      deprecated_at = null,
      record_version = record_version + 1
  where id = asset.id
  returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, before_state, after_state
  ) values (
    'asset.version.activated', 'activated', 'assets.activate', p_user_id, admin_session_id,
    asset.id, version.id, p_request_id, 'success', p_reason,
    before_state,
    jsonb_build_object(
      'activeVersionId', version.id,
      'versionNumber', version.version_number,
      'assetRevision', asset.record_version,
      'versionEditVersion', version.edit_version
    )
  );

  result := jsonb_build_object(
    'status', 'activated', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(p_user_id, 'activate_asset_version', p_request_id, result);
  return result;
end;
$$;

create or replace function public.deprecate_admin_game_asset(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
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
  version public.world_asset_versions%rowtype;
  result jsonb;
  replay jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.deprecate'
  );
  if not private.valid_world_asset_reason(p_reason)
     or not private.claim_world_asset_rate_limit(
       'deprecation_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_DEPRECATION';
  end if;
  replay := private.world_asset_replay(p_user_id, 'deprecate_asset', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object(
      'status', 'asset_version_conflict', 'assetRevision', asset.record_version
    );
  end if;
  if asset.lifecycle_status <> 'active' or asset.active_version_id is null then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  select * into version from public.world_asset_versions
  where id = asset.active_version_id for update;

  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  update public.world_asset_versions
  set lifecycle_status = 'deprecated', edit_version = edit_version + 1
  where id = version.id
  returning * into version;
  update public.world_assets
  set lifecycle_status = 'deprecated',
      production_status = 'deprecated',
      approval_status = 'deprecated',
      deprecated_at = now(),
      record_version = record_version + 1
  where id = asset.id
  returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, before_state, after_state
  ) values (
    'asset.deprecated', 'deprecated', 'assets.deprecate', p_user_id, admin_session_id,
    asset.id, version.id, p_request_id, 'success', p_reason,
    jsonb_build_object('lifecycleStatus', 'active', 'assetRevision', p_expected_asset_revision),
    jsonb_build_object(
      'lifecycleStatus', asset.lifecycle_status,
      'assetRevision', asset.record_version,
      'publishedReferences', private.world_asset_reference_summary(asset.id) -> 'published'
    )
  );

  result := jsonb_build_object(
    'status', 'deprecated', 'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(version)
  );
  perform private.store_world_asset_replay(p_user_id, 'deprecate_asset', p_request_id, result);
  return result;
end;
$$;

create or replace function public.archive_admin_game_asset(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
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
  active_version public.world_asset_versions%rowtype;
  reference_summary jsonb;
  replay jsonb;
  result jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.deprecate'
  );
  if not private.valid_world_asset_reason(p_reason)
     or not private.claim_world_asset_rate_limit(
       'deprecation_write', p_user_id::text, p_rate_limit, 60
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_ARCHIVAL';
  end if;
  replay := private.world_asset_replay(p_user_id, 'archive_asset', p_request_id);
  if replay is not null then return replay; end if;

  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object(
      'status', 'asset_version_conflict', 'assetRevision', asset.record_version
    );
  end if;
  if asset.lifecycle_status not in ('draft', 'deprecated') then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  -- Repair the narrow Phase 7 content-reference projection before deciding
  -- whether archival is safe. The helper only registers concrete managed keys.
  perform private.sync_world_asset_content_references_for_asset(asset.id);
  reference_summary := private.world_asset_reference_summary(asset.id);
  if (reference_summary ->> 'total')::integer > 0 then
    insert into public.world_asset_audit_events (
      event_key, action, permission_key, actor_admin_user_id, admin_session_id,
      target_world_asset_id, target_world_asset_version_id, request_id,
      outcome, reason, metadata
    ) values (
      'asset.reference.blocked', 'reference_blocked', 'assets.deprecate',
      p_user_id, admin_session_id, asset.id, asset.active_version_id,
      p_request_id, 'denied', p_reason,
      jsonb_build_object('referenceSummary', reference_summary)
    );
    result := jsonb_build_object('status', 'referenced');
    perform private.store_world_asset_replay(p_user_id, 'archive_asset', p_request_id, result);
    return result;
  end if;

  if asset.active_version_id is not null then
    select * into active_version from public.world_asset_versions
    where id = asset.active_version_id for update;
  end if;
  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  update public.world_asset_versions
  set lifecycle_status = 'archived'
  where world_asset_id = asset.id
    and lifecycle_status in ('draft', 'validation_failed', 'validated', 'changes_requested',
      'rejected', 'approved', 'deprecated');
  if active_version.id is not null then
    select * into active_version from public.world_asset_versions
    where id = active_version.id;
  end if;
  update public.world_assets
  set lifecycle_status = 'archived', record_version = record_version + 1
  where id = asset.id
  returning * into asset;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, after_state
  ) values (
    'asset.archived', 'archived', 'assets.deprecate', p_user_id, admin_session_id,
    asset.id, asset.active_version_id, p_request_id, 'success', p_reason,
    jsonb_build_object('lifecycleStatus', 'archived', 'assetRevision', asset.record_version)
  );
  result := jsonb_build_object(
    'status', 'archived', 'asset', private.world_asset_json(asset),
    'version', case when active_version.id is null then null
      else private.world_asset_version_json(active_version) end
  );
  perform private.store_world_asset_replay(p_user_id, 'archive_asset', p_request_id, result);
  return result;
end;
$$;

create or replace function public.list_admin_world_editor_asset_candidates(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_asset_type text,
  p_category text,
  p_interaction text,
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
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  total_count integer;
  items jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.read'
  );
  if p_page not between 1 and 10000
     or p_page_size not in (10, 50, 100)
     or char_length(normalized_search) > 100
     or p_interaction not in (
       'all', 'decorative', 'shop', 'cooking_station', 'crafting_station',
       'home_entrance', 'farm_plot', 'sign'
     )
     or not private.claim_world_asset_rate_limit(
       'candidate_read', p_user_id::text, p_rate_limit, 60
     ) then return jsonb_build_object('status', 'rate_limited'); end if;

  select count(*)::integer into total_count
  from public.world_assets as asset
  join public.world_asset_versions as version on version.id = asset.active_version_id
  where asset.lifecycle_status = 'active'
    and asset.approval_status = 'approved'
    and version.lifecycle_status = 'active'
    and (
      (
        asset.production_status = 'approved_production'
        and version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null
      ) or (
        asset.production_status = 'development_marker'
        and asset.repository_owned
        and version.source_kind = 'repository_procedural'
        and version.delivery_source_path is null
      )
    )
    and (normalized_search = ''
      or position(normalized_search in lower(asset.asset_key)) > 0
      or position(normalized_search in lower(asset.friendly_name)) > 0)
    and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
    and (p_category = 'all' or asset.category = p_category)
    and (p_interaction = 'all' or p_interaction = any(version.interaction_compatibility));

  select coalesce(jsonb_agg(item order by friendly_name, id), '[]'::jsonb) into items
  from (
    select asset.id, asset.friendly_name,
      jsonb_build_object(
        'asset', private.world_asset_json(asset),
        'version', private.world_asset_version_json(version)
      ) as item
    from public.world_assets as asset
    join public.world_asset_versions as version on version.id = asset.active_version_id
    where asset.lifecycle_status = 'active'
      and asset.approval_status = 'approved'
      and version.lifecycle_status = 'active'
      and (
        (
          asset.production_status = 'approved_production'
          and version.source_kind = 'storage_raster'
          and version.delivery_source_path is not null
        ) or (
          asset.production_status = 'development_marker'
          and asset.repository_owned
          and version.source_kind = 'repository_procedural'
          and version.delivery_source_path is null
        )
      )
      and (normalized_search = ''
        or position(normalized_search in lower(asset.asset_key)) > 0
        or position(normalized_search in lower(asset.friendly_name)) > 0)
      and (p_asset_type = 'all' or asset.asset_type = p_asset_type)
      and (p_category = 'all' or asset.category = p_category)
      and (p_interaction = 'all' or p_interaction = any(version.interaction_compatibility))
    order by asset.friendly_name, asset.id
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as rows;

  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0
      else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

revoke all on function private.valid_world_asset_reason(text)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_world_asset_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_replay(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.store_world_asset_replay(uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_reference_summary(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_version_json(public.world_asset_versions)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_json(public.world_assets)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_review_json(public.world_asset_reviews)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_transparency_required(text)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_max_source_bytes(text)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_category_allowed(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_default_interactions(text)
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_interactions_allowed(text, text[])
  from public, anon, authenticated, service_role;

revoke all on function public.list_admin_game_assets(
  uuid, uuid, text, integer, integer, text, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_game_asset(uuid, uuid, text, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_game_asset_version(uuid, uuid, text, uuid, uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_admin_game_asset_review_queue(
  uuid, uuid, text, integer, integer, text, text, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.list_admin_game_asset_audit(
  uuid, uuid, text, uuid, integer, integer, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.list_admin_game_asset_references(
  uuid, uuid, text, uuid, integer, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_game_asset_upload(
  uuid, uuid, text, text, text, text, text, text, text, text, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_game_asset_version(
  uuid, uuid, text, uuid, integer, text, text, text, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.complete_admin_game_asset_processing(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, text, text,
  integer, integer, integer, text, integer, integer, integer, text,
  integer, integer, integer, text, integer, integer, integer, text, jsonb, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.fail_admin_game_asset_processing(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, jsonb, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_game_asset_preview_material(
  uuid, uuid, text, uuid, uuid, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_game_asset_activation_material(
  uuid, uuid, text, uuid, uuid, integer, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.update_admin_game_asset_version_draft(
  uuid, uuid, text, uuid, uuid, integer, text, text, text[], text,
  integer, integer, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, jsonb, smallint[], smallint, text[], text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.validate_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.submit_admin_game_asset_review(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.review_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.activate_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, integer, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.deprecate_admin_game_asset(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.archive_admin_game_asset(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
revoke all on function public.list_admin_world_editor_asset_candidates(
  uuid, uuid, text, integer, integer, text, text, text, text, text, integer
) from public, anon, authenticated, service_role;

grant execute on function public.list_admin_game_assets(
  uuid, uuid, text, integer, integer, text, text, text, text, text, text, text, text, integer
) to service_role;
grant execute on function public.get_admin_game_asset(uuid, uuid, text, uuid, text, integer)
  to service_role;
grant execute on function public.get_admin_game_asset_version(uuid, uuid, text, uuid, uuid, text, integer)
  to service_role;
grant execute on function public.list_admin_game_asset_review_queue(
  uuid, uuid, text, integer, integer, text, text, text, text, text, text, text, integer
) to service_role;
grant execute on function public.list_admin_game_asset_audit(
  uuid, uuid, text, uuid, integer, integer, text, text, text, integer
) to service_role;
grant execute on function public.list_admin_game_asset_references(
  uuid, uuid, text, uuid, integer, integer, text, integer
) to service_role;
grant execute on function public.create_admin_game_asset_upload(
  uuid, uuid, text, text, text, text, text, text, text, text, integer, text, integer
) to service_role;
grant execute on function public.create_admin_game_asset_version(
  uuid, uuid, text, uuid, integer, text, text, text, integer, text, integer
) to service_role;
grant execute on function public.complete_admin_game_asset_processing(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, text, text,
  integer, integer, integer, text, integer, integer, integer, text,
  integer, integer, integer, text, integer, integer, integer, text, jsonb, text, integer
) to service_role;
grant execute on function public.fail_admin_game_asset_processing(
  uuid, uuid, text, uuid, uuid, uuid, integer, text, jsonb, text, integer
) to service_role;
grant execute on function public.get_admin_game_asset_preview_material(
  uuid, uuid, text, uuid, uuid, text, integer
) to service_role;
grant execute on function public.get_admin_game_asset_activation_material(
  uuid, uuid, text, uuid, uuid, integer, integer, text, integer
) to service_role;
grant execute on function public.update_admin_game_asset_version_draft(
  uuid, uuid, text, uuid, uuid, integer, text, text, text[], text,
  integer, integer, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, jsonb, smallint[], smallint, text[], text, integer
) to service_role;
grant execute on function public.validate_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, text, integer
) to service_role;
grant execute on function public.submit_admin_game_asset_review(
  uuid, uuid, text, uuid, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.review_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, text, text, text, integer
) to service_role;
grant execute on function public.activate_admin_game_asset_version(
  uuid, uuid, text, uuid, uuid, integer, integer, text, text, text, text, text, integer
) to service_role;
grant execute on function public.deprecate_admin_game_asset(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.archive_admin_game_asset(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
grant execute on function public.list_admin_world_editor_asset_candidates(
  uuid, uuid, text, integer, integer, text, text, text, text, text, integer
) to service_role;
