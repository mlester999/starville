-- Starville Phase 6: protected administrator world lifecycle and narrow RPC grants.

create or replace function private.admin_world_map_json(p_map public.world_maps)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_map.id,
    'slug', p_map.slug,
    'displayName', p_map.display_name,
    'description', p_map.description,
    'status', p_map.status,
    'recordVersion', p_map.record_version,
    'activePublishedVersionId', p_map.active_published_version_id,
    'createdAt', p_map.created_at,
    'updatedAt', p_map.updated_at
  );
$$;

create or replace function private.admin_world_version_json(p_version public.world_map_versions)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_version.id,
    'worldMapId', p_version.world_map_id,
    'versionNumber', p_version.version_number,
    'lifecycleStatus', p_version.lifecycle_status,
    'editVersion', p_version.edit_version,
    'checksum', p_version.checksum,
    'validationStatus', p_version.validation_status,
    'validationResult', case
      when p_version.validation_status = 'pending' then null
      else p_version.validation_result
    end,
    'createdAt', p_version.created_at,
    'updatedAt', p_version.updated_at,
    'validatedAt', p_version.validated_at,
    'publishedAt', p_version.published_at,
    'publicationReason', p_version.publication_reason,
    'supersedesVersionId', p_version.supersedes_version_id
  );
$$;

create or replace function private.claim_admin_world_limit(
  p_user_id uuid,
  p_scope text,
  p_limit integer
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.claim_world_rate_limit(p_scope, p_user_id::text, p_limit, 60);
$$;

revoke all on function private.admin_world_map_json(public.world_maps)
  from public, anon, authenticated, service_role;
revoke all on function private.admin_world_version_json(public.world_map_versions)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_admin_world_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;

create or replace function public.list_admin_world_maps(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_page integer,
  p_page_size integer,
  p_search text,
  p_status text,
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
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  if p_page not between 1 and 10000
     or p_page_size not between 1 and 100
     or char_length(normalized_search) > 100
     or p_status not in ('all', 'active', 'archived')
     or p_sort not in ('updated_at', 'display_name', 'slug', 'status')
     or p_direction not in ('asc', 'desc')
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_DIRECTORY_REQUEST';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select count(*)::integer into total_count
  from public.world_maps as map
  where (p_status = 'all' or map.status = p_status)
    and (
      normalized_search = ''
      or position(normalized_search in lower(map.display_name)) > 0
      or position(normalized_search in lower(map.slug)) > 0
    );

  select coalesce(
    jsonb_agg(
      item order by
        case when p_direction = 'asc' then ordering end asc,
        case when p_direction = 'desc' then ordering end desc,
        id
    ),
    '[]'::jsonb
  )
  into items
  from (
    select
      map.id,
      case p_sort
        when 'display_name' then lower(map.display_name)
        when 'slug' then map.slug
        when 'status' then map.status
        else to_char(map.updated_at, 'YYYYMMDDHH24MISSUS')
      end as ordering,
      private.admin_world_map_json(map) || jsonb_build_object(
        'activeVersionNumber', active.version_number,
        'activeChecksum', active.checksum,
        'draftVersionId', draft.id,
        'draftValidationStatus', draft.validation_status
      ) as item
    from public.world_maps as map
    left join public.world_map_versions as active on active.id = map.active_published_version_id
    left join lateral (
      select version.id, version.validation_status
      from public.world_map_versions as version
      where version.world_map_id = map.id
        and version.lifecycle_status in ('draft', 'validated')
      order by version.version_number desc
      limit 1
    ) as draft on true
    where (p_status = 'all' or map.status = p_status)
      and (
        normalized_search = ''
        or position(normalized_search in lower(map.display_name)) > 0
        or position(normalized_search in lower(map.slug)) > 0
      )
    order by
      case when p_direction = 'asc' then
        case p_sort
          when 'display_name' then lower(map.display_name)
          when 'slug' then map.slug
          when 'status' then map.status
          else to_char(map.updated_at, 'YYYYMMDDHH24MISSUS')
        end
      end asc,
      case when p_direction = 'desc' then
        case p_sort
          when 'display_name' then lower(map.display_name)
          when 'slug' then map.slug
          when 'status' then map.status
          else to_char(map.updated_at, 'YYYYMMDDHH24MISSUS')
        end
      end desc,
      map.id
    limit p_page_size offset (p_page - 1) * p_page_size
  ) as directory;

  return jsonb_build_object(
    'status', 'loaded',
    'items', items,
    'page', p_page,
    'pageSize', p_page_size,
    'total', total_count,
    'totalPages', case when total_count = 0 then 0 else ceil(total_count::numeric / p_page_size)::integer end
  );
end;
$$;

create or replace function public.get_admin_world_map(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
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
  versions jsonb;
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.read'
  );
  if p_world_map_id is null or p_request_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_rate_limit not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_DETAIL_REQUEST';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_world_read', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  select coalesce(
    jsonb_agg(private.admin_world_version_json(version) order by version.version_number desc),
    '[]'::jsonb
  ) into versions
  from public.world_map_versions as version
  where version.world_map_id = selected_map.id;

  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'versions', versions
  );
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

create or replace function public.create_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_expected_record_version integer,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  new_version public.world_map_versions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  if not private.claim_admin_world_limit(p_user_id, 'admin_draft_write', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if selected_map.record_version <> p_expected_record_version then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if exists (
    select 1 from public.world_map_versions
    where world_map_id = selected_map.id and lifecycle_status in ('draft', 'validated')
  ) then
    return jsonb_build_object('status', 'state_conflict');
  end if;
  select * into source_version
  from public.world_map_versions
  where id = selected_map.active_published_version_id and lifecycle_status = 'published';
  if not found then return jsonb_build_object('status', 'state_conflict'); end if;

  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    validation_status, validation_result, created_by_admin_id, derived_from_version_id
  )
  values (
    selected_map.id,
    (select coalesce(max(version_number), 0) + 1 from public.world_map_versions where world_map_id = selected_map.id),
    'draft',
    source_version.manifest,
    source_version.checksum,
    'pending',
    jsonb_build_object('valid', false, 'checkedAt', now(), 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
    p_user_id,
    source_version.id
  )
  returning * into new_version;

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome,
    before_state, after_state, metadata
  ) values (
    'world.draft_created', 'admin', p_user_id, trusted_session,
    selected_map.id, new_version.id, p_request_id, 'success',
    jsonb_build_object('sourceVersionId', source_version.id),
    jsonb_build_object('draftVersionId', new_version.id),
    jsonb_build_object('versionNumber', new_version.version_number)
  );

  return jsonb_build_object(
    'status', 'created',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(new_version),
    'manifest', new_version.manifest
  );
end;
$$;

create or replace function public.save_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
  p_manifest jsonb,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  validation jsonb;
  next_checksum text;
  before_state jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  if p_manifest is null or pg_column_size(p_manifest) > 262144 then
    raise exception using errcode = '22023', message = 'INVALID_WORLD_DRAFT';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_draft_write', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id and lifecycle_status = 'draft'
  for update;
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_version.edit_version <> p_expected_edit_version
     or (p_expected_checksum is not null and selected_version.checksum <> p_expected_checksum) then
    return jsonb_build_object('status', 'version_conflict');
  end if;

  validation := private.validate_world_manifest(selected_map.id, p_manifest);
  next_checksum := private.world_manifest_checksum(p_manifest);
  before_state := jsonb_build_object(
    'editVersion', selected_version.edit_version,
    'checksum', selected_version.checksum
  );

  update public.world_map_versions
  set manifest = p_manifest,
      checksum = next_checksum,
      edit_version = edit_version + 1,
      validation_status = case when (validation ->> 'valid')::boolean then 'pending' else 'invalid' end,
      validation_result = validation,
      validated_at = null,
      validated_by_admin_id = null
  where id = selected_version.id
  returning * into selected_version;

  perform private.sync_world_version_assets(selected_version.id, selected_version.manifest);

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome,
    before_state, after_state, metadata
  ) values (
    'world.draft_updated', 'admin', p_user_id, trusted_session,
    selected_map.id, selected_version.id, p_request_id, 'success',
    before_state,
    jsonb_build_object('editVersion', selected_version.edit_version, 'checksum', selected_version.checksum),
    jsonb_build_object(
      'validationValid', (validation ->> 'valid')::boolean,
      'errorCount', jsonb_array_length(validation -> 'errors')
    )
  );

  return jsonb_build_object(
    'status', 'updated',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest
  );
end;
$$;

create or replace function public.validate_admin_world_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_checksum text,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  validation jsonb;
  valid boolean;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  if not private.claim_admin_world_limit(p_user_id, 'admin_validate', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id and lifecycle_status = 'draft'
  for update;
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_version.edit_version <> p_expected_edit_version
     or (p_expected_checksum is not null and selected_version.checksum <> p_expected_checksum) then
    return jsonb_build_object('status', 'version_conflict');
  end if;

  validation := private.validate_world_manifest(selected_map.id, selected_version.manifest);
  valid := (validation ->> 'valid')::boolean;
  update public.world_map_versions
  set lifecycle_status = case when valid then 'validated' else 'draft' end,
      validation_status = case when valid then 'valid' else 'invalid' end,
      validation_result = validation,
      validated_at = case when valid then now() else null end,
      validated_by_admin_id = case when valid then p_user_id else null end
  where id = selected_version.id
  returning * into selected_version;

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    case when valid then 'world.validation_passed' else 'world.validation_failed' end,
    'admin', p_user_id, trusted_session, selected_map.id, selected_version.id,
    p_request_id, case when valid then 'success' else 'denied' end,
    jsonb_build_object('checksum', selected_version.checksum, 'errorCount', jsonb_array_length(validation -> 'errors'))
  );

  return jsonb_build_object(
    'status', case when valid then 'validated' else 'validation_failed' end,
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'validationResult', validation
  );
end;
$$;

create or replace function public.publish_admin_world_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_version_id uuid,
  p_expected_edit_version integer,
  p_expected_active_version_id uuid,
  p_expected_checksum text,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  previous_version public.world_map_versions%rowtype;
  validation jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.publish'
  );
  if not private.valid_world_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_PUBLICATION_REASON';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_publish', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  select * into selected_map from public.world_maps where id = p_world_map_id for update;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id and lifecycle_status = 'validated'
  for update;
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_map.active_published_version_id is distinct from p_expected_active_version_id
     or selected_version.edit_version <> p_expected_edit_version
     or selected_version.checksum <> p_expected_checksum then
    return jsonb_build_object('status', 'version_conflict');
  end if;

  validation := private.validate_world_manifest(selected_map.id, selected_version.manifest);
  if not (validation ->> 'valid')::boolean
     or private.world_manifest_checksum(selected_version.manifest) <> selected_version.checksum then
    insert into public.world_audit_events (
      event_key, actor_type, actor_admin_user_id, admin_session_id,
      target_world_map_id, target_world_map_version_id, request_id, outcome, reason, metadata
    ) values (
      'world.publication_rejected', 'admin', p_user_id, trusted_session,
      selected_map.id, selected_version.id, p_request_id, 'denied', p_reason,
      jsonb_build_object('validation', validation)
    );
    return jsonb_build_object('status', 'validation_failed');
  end if;

  if selected_map.active_published_version_id is not null then
    select * into previous_version
    from public.world_map_versions
    where id = selected_map.active_published_version_id
    for update;
  end if;

  perform set_config('starville.world_publication_transition', 'true', true);
  if previous_version.id is not null then
    update public.world_map_versions
    set lifecycle_status = 'superseded'
    where id = previous_version.id;
  end if;
  update public.world_map_versions
  set lifecycle_status = 'published',
      validation_status = 'valid',
      validation_result = validation,
      published_at = now(),
      published_by_admin_id = p_user_id,
      publication_reason = p_reason,
      supersedes_version_id = previous_version.id
  where id = selected_version.id
  returning * into selected_version;
  update public.world_maps
  set active_published_version_id = selected_version.id,
      record_version = record_version + 1
  where id = selected_map.id
  returning * into selected_map;
  perform set_config('starville.world_publication_transition', 'false', true);

  if previous_version.id is not null then
    insert into public.world_audit_events (
      event_key, actor_type, actor_admin_user_id, admin_session_id,
      target_world_map_id, target_world_map_version_id, request_id, outcome, reason, metadata
    ) values (
      'world.version_superseded', 'admin', p_user_id, trusted_session,
      selected_map.id, previous_version.id, p_request_id, 'success', p_reason,
      jsonb_build_object('replacementVersionId', selected_version.id)
    );
  end if;
  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, reason, metadata
  ) values (
    'world.version_published', 'admin', p_user_id, trusted_session,
    selected_map.id, selected_version.id, p_request_id, 'success', p_reason,
    jsonb_build_object('checksum', selected_version.checksum, 'previousVersionId', previous_version.id)
  );

  return jsonb_build_object(
    'status', 'published',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'previousVersionId', previous_version.id
  );
end;
$$;

create or replace function public.derive_admin_world_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_world_map_id uuid,
  p_source_version_id uuid,
  p_expected_record_version integer,
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  source_version public.world_map_versions%rowtype;
  new_version public.world_map_versions%rowtype;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.edit'
  );
  if not private.valid_world_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_DERIVATION_REASON';
  end if;
  if not private.claim_admin_world_limit(p_user_id, 'admin_derive', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id for update;
  select * into source_version
  from public.world_map_versions
  where id = p_source_version_id and world_map_id = p_world_map_id
    and lifecycle_status in ('published', 'superseded', 'archived');
  if selected_map.id is null or source_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if selected_map.record_version <> p_expected_record_version then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if exists (
    select 1 from public.world_map_versions
    where world_map_id = selected_map.id and lifecycle_status in ('draft', 'validated')
  ) then
    return jsonb_build_object('status', 'state_conflict');
  end if;

  insert into public.world_map_versions (
    world_map_id, version_number, lifecycle_status, manifest, checksum,
    validation_status, validation_result, created_by_admin_id, derived_from_version_id
  ) values (
    selected_map.id,
    (select max(version_number) + 1 from public.world_map_versions where world_map_id = selected_map.id),
    'draft',
    source_version.manifest,
    source_version.checksum,
    'pending',
    jsonb_build_object('valid', false, 'checkedAt', now(), 'errors', '[]'::jsonb, 'warnings', '[]'::jsonb),
    p_user_id,
    source_version.id
  )
  returning * into new_version;

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, reason, metadata
  ) values (
    'world.version_derived', 'admin', p_user_id, trusted_session,
    selected_map.id, new_version.id, p_request_id, 'success', p_reason,
    jsonb_build_object('sourceVersionId', source_version.id)
  );

  return jsonb_build_object(
    'status', 'created',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(new_version),
    'manifest', new_version.manifest
  );
end;
$$;

create or replace function public.preview_admin_world_version(
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
  trusted_session uuid;
  selected_map public.world_maps%rowtype;
  selected_version public.world_map_versions%rowtype;
  validation jsonb;
begin
  trusted_session := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'maps.preview'
  );
  if not private.claim_admin_world_limit(p_user_id, 'admin_preview', p_rate_limit) then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  select * into selected_map from public.world_maps where id = p_world_map_id;
  select * into selected_version
  from public.world_map_versions
  where id = p_version_id and world_map_id = p_world_map_id
    and lifecycle_status = 'validated';
  if selected_map.id is null or selected_version.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  validation := private.validate_world_manifest(selected_map.id, selected_version.manifest);
  if not (validation ->> 'valid')::boolean then
    return jsonb_build_object('status', 'validation_failed');
  end if;

  insert into public.world_audit_events (
    event_key, actor_type, actor_admin_user_id, admin_session_id,
    target_world_map_id, target_world_map_version_id, request_id, outcome, metadata
  ) values (
    'world.preview_opened', 'admin', p_user_id, trusted_session,
    selected_map.id, selected_version.id, p_request_id, 'success',
    jsonb_build_object('checksum', selected_version.checksum)
  );
  return jsonb_build_object(
    'status', 'loaded',
    'map', private.admin_world_map_json(selected_map),
    'version', private.admin_world_version_json(selected_version),
    'manifest', selected_version.manifest,
    'draftPreview', true
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

revoke all on function public.get_current_published_world(text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_published_world_manifest(text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.transition_player_world(text, text, integer, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_current_published_world(text, text, integer) to service_role;
grant execute on function public.get_published_world_manifest(text, text, text, integer) to service_role;
grant execute on function public.transition_player_world(text, text, integer, uuid, text, integer)
  to service_role;

revoke all on function public.list_admin_world_maps(uuid, uuid, text, integer, integer, text, text, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_admin_world_map(uuid, uuid, text, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.get_admin_world_draft(uuid, uuid, text, uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.create_admin_world_draft(uuid, uuid, text, uuid, integer, text, integer)
  from public, anon, authenticated;
revoke all on function public.save_admin_world_draft(uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer)
  from public, anon, authenticated;
revoke all on function public.validate_admin_world_draft(uuid, uuid, text, uuid, uuid, integer, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.publish_admin_world_version(uuid, uuid, text, uuid, uuid, integer, uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.derive_admin_world_version(uuid, uuid, text, uuid, uuid, integer, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.preview_admin_world_version(uuid, uuid, text, uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.list_admin_world_audit(uuid, uuid, text, uuid, integer, integer, text, text, integer)
  from public, anon, authenticated;
revoke all on function public.list_admin_world_assets(uuid, uuid, text, integer, integer, text, text, integer)
  from public, anon, authenticated;

grant execute on function public.list_admin_world_maps(uuid, uuid, text, integer, integer, text, text, text, text, text, integer)
  to service_role;
grant execute on function public.get_admin_world_map(uuid, uuid, text, uuid, text, integer)
  to service_role;
grant execute on function public.get_admin_world_draft(uuid, uuid, text, uuid, uuid, text, integer)
  to service_role;
grant execute on function public.create_admin_world_draft(uuid, uuid, text, uuid, integer, text, integer)
  to service_role;
grant execute on function public.save_admin_world_draft(uuid, uuid, text, uuid, uuid, integer, text, jsonb, text, integer)
  to service_role;
grant execute on function public.validate_admin_world_draft(uuid, uuid, text, uuid, uuid, integer, text, text, integer)
  to service_role;
grant execute on function public.publish_admin_world_version(uuid, uuid, text, uuid, uuid, integer, uuid, text, text, text, integer)
  to service_role;
grant execute on function public.derive_admin_world_version(uuid, uuid, text, uuid, uuid, integer, text, text, integer)
  to service_role;
grant execute on function public.preview_admin_world_version(uuid, uuid, text, uuid, uuid, text, integer)
  to service_role;
grant execute on function public.list_admin_world_audit(uuid, uuid, text, uuid, integer, integer, text, text, integer)
  to service_role;
grant execute on function public.list_admin_world_assets(uuid, uuid, text, integer, integer, text, text, integer)
  to service_role;
