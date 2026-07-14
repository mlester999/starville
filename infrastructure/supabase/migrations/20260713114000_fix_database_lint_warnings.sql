-- Starville hosted database lint repair.
-- Replaces affected routines in place so OIDs, owners, ACLs, comments,
-- PostgREST signatures, SECURITY DEFINER boundaries, and search paths remain stable.

begin;

create or replace function private.assert_valid_request_id(p_request_id text)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9._:-]{1,128}$' then
    raise exception using errcode = '22023', message = 'INVALID_REQUEST_ID';
  end if;
end;
$$;

create or replace function private.valid_world_asset_validation_results(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  issue jsonb;
  checked_at text := p_value ->> 'checkedAt';
begin
  if jsonb_typeof(p_value) <> 'object'
     or jsonb_typeof(p_value -> 'valid') <> 'boolean'
     or jsonb_typeof(p_value -> 'checkedAt') <> 'string'
     or jsonb_typeof(p_value -> 'issues') <> 'array'
     or jsonb_array_length(p_value -> 'issues') > 100
     or pg_column_size(p_value) > 65536
     or checked_at !~ '^[0-9]{4}-(0[1-9]|1[0-2])-([0-2][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,9})?(Z|[+-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))$'
     then return false; end if;

  perform pg_catalog.make_date(
    substring(checked_at from 1 for 4)::integer,
    substring(checked_at from 6 for 2)::integer,
    substring(checked_at from 9 for 2)::integer
  );
  if exists (
    select 1 from jsonb_object_keys(p_value) as item(key)
    where item.key not in ('valid', 'checkedAt', 'issues')
  ) then return false; end if;

  for issue in select value from jsonb_array_elements(p_value -> 'issues') loop
    if jsonb_typeof(issue) <> 'object'
       or issue ->> 'level' not in ('blocking_error', 'warning', 'recommendation', 'passed')
       or coalesce(issue ->> 'code', '') !~ '^[A-Z][A-Z0-9_]{1,79}$'
       or char_length(coalesce(issue ->> 'path', '')) > 160
       or char_length(coalesce(issue ->> 'message', '')) not between 1 and 300
       or issue ->> 'message' ~ '[[:cntrl:]<>]'
       or exists (
         select 1 from jsonb_object_keys(issue) as item(key)
         where item.key not in ('code', 'level', 'path', 'message')
       ) then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.get_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
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
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id
    and lifecycle_status in ('draft', 'validated');
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest
  );
end;
$$;

create or replace function public.list_admin_world_audit(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_page integer,
  p_page_size integer,
  p_search text,
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
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.audit_read'
  );
  perform private.assert_valid_request_id(p_request_id);
  if p_page not between 1 and 10000 or p_page_size not between 1 and 100
     or char_length(normalized_search) > 100
     or not private.claim_admin_world_limit(p_user_id, 'admin_audit_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*)::integer into total_count
  from public.world_audit_events as event
  where (p_world_map_id is null or event.target_world_map_id = p_world_map_id)
    and (
      normalized_search = ''
      or position(normalized_search in lower(event.event_key)) > 0
      or position(normalized_search in lower(coalesce(event.reason, ''))) > 0
    );

  select coalesce(jsonb_agg(item order by created_at desc, id desc), '[]'::jsonb)
  into items
  from (
    select
      event.id,
      event.created_at,
      jsonb_build_object(
        'id', event.id,
        'eventKey', event.event_key,
        'actorType', event.actor_type,
        'actorAdminUserId', event.actor_admin_user_id,
        'targetMapId', event.target_world_map_id,
        'targetVersionId', event.target_world_map_version_id,
        'targetAssetId', event.target_world_asset_id,
        'requestId', event.request_id,
        'outcome', event.outcome,
        'reason', event.reason,
        'beforeState', event.before_state,
        'afterState', event.after_state,
        'metadata', event.metadata,
        'createdAt', event.created_at
      ) as item
    from public.world_audit_events as event
    where (p_world_map_id is null or event.target_world_map_id = p_world_map_id)
      and (
        normalized_search = ''
        or position(normalized_search in lower(event.event_key)) > 0
        or position(normalized_search in lower(coalesce(event.reason, ''))) > 0
      )
    order by event.created_at desc, event.id desc
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as audit_rows;

  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.list_admin_world_assets(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer,
  p_search text,
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
  perform private.assert_valid_request_id(p_request_id);
  if p_page not between 1 and 10000 or p_page_size not between 1 and 100
     or char_length(normalized_search) > 100
     or not private.claim_admin_world_limit(p_user_id, 'admin_asset_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*)::integer into total_count
  from public.world_assets as asset
  where normalized_search = '' or position(normalized_search in lower(asset.asset_key)) > 0;

  select coalesce(jsonb_agg(item order by asset_key), '[]'::jsonb)
  into items
  from (
    select
      asset.asset_key,
      jsonb_build_object(
        'id', asset.id,
        'assetKey', asset.asset_key,
        'contentHash', asset.content_hash,
        'storagePath', asset.storage_path,
        'sourceType', asset.source_type,
        'mediaType', asset.media_type,
        'width', asset.width,
        'height', asset.height,
        'fileSizeBytes', asset.file_size_bytes,
        'approvalStatus', asset.approval_status,
        'repositoryOwned', asset.repository_owned,
        'createdAt', asset.created_at,
        'deprecatedAt', asset.deprecated_at
      ) as item
    from public.world_assets as asset
    where normalized_search = '' or position(normalized_search in lower(asset.asset_key)) > 0
    order by asset.asset_key
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as asset_rows;

  return jsonb_build_object(
    'status', 'loaded', 'items', items, 'page', p_page, 'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
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
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.audit.read'
  );
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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
  perform private.assert_valid_request_id(p_request_id);
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

create or replace function private.cozy_remove_item(
  p_player_profile_id uuid, p_item_definition_id uuid, p_quantity integer,
  p_reason text, p_reference_id text, p_idempotency_key text, p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare item public.cozy_item_definitions%rowtype;
  stack public.player_inventory_stacks%rowtype; remaining integer := p_quantity;
  removed integer; recorded_stack_id uuid; resulting integer; quickbar_affected boolean := false;
begin
  if p_quantity is null or p_quantity < 1
     or private.cozy_owned_quantity(p_player_profile_id, p_item_definition_id) < p_quantity then return false; end if;
  select * into strict item from public.cozy_item_definitions where id = p_item_definition_id;
  if item.category = 'permanent_tool' then return false; end if;
  perform 1 from public.player_inventory_state
  where player_profile_id = p_player_profile_id for update;
  if not found then raise no_data_found; end if;
  if private.cozy_owned_quantity(p_player_profile_id, p_item_definition_id) < p_quantity then return false; end if;
  for stack in select * from public.player_inventory_stacks
    where player_profile_id = p_player_profile_id and item_definition_id = item.id
    order by slot_index desc for update
  loop
    removed := least(remaining, stack.quantity); recorded_stack_id := stack.id;
    if removed = stack.quantity then
      if exists (select 1 from public.player_quickbar_assignments where player_profile_id = p_player_profile_id and inventory_stack_id = stack.id) then quickbar_affected := true; end if;
      delete from public.player_inventory_stacks where id = stack.id;
    else
      update public.player_inventory_stacks set quantity = quantity - removed, state_version = state_version + 1 where id = stack.id;
    end if;
    remaining := remaining - removed; exit when remaining = 0;
  end loop;
  if remaining <> 0 then
    raise exception using errcode = '40001', message = 'INVENTORY_CONCURRENT_CONSUMPTION';
  end if;
  update public.player_inventory_state
  set state_version = state_version + 1,
      quickbar_state_version = quickbar_state_version + case when quickbar_affected then 1 else 0 end
  where player_profile_id = p_player_profile_id;
  if not found then raise no_data_found; end if;
  resulting := private.cozy_owned_quantity(p_player_profile_id, item.id);
  insert into public.player_inventory_history (
    player_profile_id, inventory_stack_id, item_definition_id, delta, resulting_quantity,
    reason, reference_id, idempotency_key, request_id
  ) values (p_player_profile_id, recorded_stack_id, item.id, -p_quantity, resulting,
    p_reason, p_reference_id, p_idempotency_key, p_request_id);
  return true;
end;
$$;

create or replace function private.cozy_furniture_mutation(
  p_wallet_address text,
  p_operation text,
  p_home_id uuid,
  p_placement_id uuid,
  p_inventory_stack_id uuid,
  p_furniture_slug text,
  p_x integer,
  p_y integer,
  p_rotation integer,
  p_expected_home_state_version integer,
  p_expected_placement_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; furniture public.cozy_furniture_definitions%rowtype;
  placement public.player_home_furniture%rowtype;
  inventory_state public.player_inventory_state%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  config public.cozy_gameplay_config%rowtype; request_hash text; response jsonb;
begin
  if p_operation not in ('furniture_place','furniture_move','furniture_rotate','furniture_remove')
     or p_home_id is null or p_expected_home_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_FURNITURE_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into home from public.player_homes
  where id=p_home_id and player_profile_id=profile.id for update;
  if not found or not home.inside_home then return jsonb_build_object('status','home_access_denied'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',
    p_operation,p_home_id,p_placement_id,p_inventory_stack_id,p_furniture_slug,
    p_x,p_y,p_rotation,p_expected_home_state_version,p_expected_placement_state_version
  ),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':'||p_operation||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation=p_operation and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  if home.state_version<>p_expected_home_state_version then return jsonb_build_object('status','state_conflict'); end if;

  if p_operation='furniture_place' then
    if p_inventory_stack_id is null or p_furniture_slug is null or p_x is null or p_y is null
       or p_rotation not in (0,90,180,270) then return jsonb_build_object('status','invalid_placement'); end if;
    select * into furniture from public.cozy_furniture_definitions
    where slug=p_furniture_slug and active;
    if not found then return jsonb_build_object('status','item_unavailable'); end if;
    perform 1 from public.player_inventory_stacks
    where id=p_inventory_stack_id and player_profile_id=profile.id
      and item_definition_id=furniture.item_definition_id for update;
    if not found then return jsonb_build_object('status','item_unavailable'); end if;
    if not private.cozy_furniture_placement_valid(home.id,null,furniture.id,p_x,p_y,p_rotation)
      then return jsonb_build_object('status','invalid_placement'); end if;
    if not private.cozy_remove_item(profile.id,furniture.item_definition_id,1,
      'furniture_placement',home.id::text,p_operation||':'||p_idempotency_key,p_request_id)
      then return jsonb_build_object('status','item_unavailable'); end if;
    insert into public.player_home_furniture(
      player_home_id,furniture_definition_id,grid_x,grid_y,rotation
    ) values(home.id,furniture.id,p_x,p_y,p_rotation) returning * into placement;
  else
    if p_placement_id is null or p_expected_placement_state_version is null
      then return jsonb_build_object('status','invalid_placement'); end if;
    select * into placement from public.player_home_furniture
    where id=p_placement_id and player_home_id=home.id for update;
    if not found then return jsonb_build_object('status','invalid_placement'); end if;
    if placement.state_version<>p_expected_placement_state_version
      then return jsonb_build_object('status','state_conflict'); end if;
    select * into strict furniture from public.cozy_furniture_definitions
    where id=placement.furniture_definition_id;
    if p_operation='furniture_move' then
      if p_x is null or p_y is null or not private.cozy_furniture_placement_valid(
        home.id,placement.id,furniture.id,p_x,p_y,placement.rotation
      ) then return jsonb_build_object('status','invalid_placement'); end if;
      update public.player_home_furniture
      set grid_x=p_x,grid_y=p_y,state_version=state_version+1
      where id=placement.id returning * into placement;
    elsif p_operation='furniture_rotate' then
      if p_rotation not in (0,90,180,270) or not private.cozy_furniture_placement_valid(
        home.id,placement.id,furniture.id,placement.grid_x,placement.grid_y,p_rotation
      ) then return jsonb_build_object('status','invalid_placement'); end if;
      update public.player_home_furniture
      set rotation=p_rotation,state_version=state_version+1
      where id=placement.id returning * into placement;
    else
      if not private.cozy_can_add_item(profile.id,furniture.item_definition_id,1)
        then return jsonb_build_object('status','inventory_full'); end if;
      delete from public.player_home_furniture where id=placement.id;
      if not private.cozy_add_item(profile.id,furniture.item_definition_id,1,
        'furniture_removal',home.id::text,p_operation||':'||p_idempotency_key,p_request_id)
        then raise exception 'FURNITURE_RETURN_FAILED'; end if;
    end if;
  end if;
  update public.player_homes set state_version=state_version+1
  where id=home.id returning * into home;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id=profile.id;
  response:=jsonb_build_object(
    'status','updated','home',private.cozy_player_home_json(home),
    'inventoryStateVersion',inventory_state.state_version,'replayed',false
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,p_operation,p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function private.phase6_get_published_world_manifest(
  p_wallet_address text,
  p_map_slug text,
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
  moderation public.player_moderation_states%rowtype;
  selected_rows record;
  selected_world record;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
begin
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_map_slug is null
     or char_length(p_map_slug) not between 3 and 64
     or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_LOAD_REQUEST';
  end if;

  if not private.claim_world_rate_limit(
    'player_manifest_read', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select m as moderation_row
  into selected_rows
  from public.player_profiles as p
  join public.player_moderation_states as m on m.player_profile_id = p.id
  where p.wallet_address = p_wallet_address;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  moderation := selected_rows.moderation_row;
  if moderation.status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if moderation.rename_required then
    return jsonb_build_object('status', 'rename_required');
  end if;

  select map as map_row, version as version_row
  into selected_world
  from public.world_maps as map
  join public.world_map_versions as version on version.id = map.active_published_version_id
  where map.slug = p_map_slug
    and map.status = 'active'
    and version.lifecycle_status = 'published';
  if not found then
    return jsonb_build_object('status', 'map_not_found');
  end if;

  selected_map := selected_world.map_row;
  selected_version := selected_world.version_row;

  return jsonb_build_object(
    'status', 'loaded',
    'map', private.world_map_json(selected_map),
    'version', private.world_version_json(selected_version),
    'manifest', selected_version.manifest
  );
end;
$$;

revoke all on function private.assert_valid_request_id(text)
  from public, anon, authenticated, service_role;

commit;
