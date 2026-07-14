-- Starville Phase 7.5B: narrow lifecycle, preview, delivery, publication, and rollback RPCs.

create or replace function private.platform_configuration_authorized(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_permission_key text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    authz.result ->> 'outcome' = 'authorized'
    and (authz.result -> 'context' -> 'permissionKeys') ? p_permission_key,
    false
  )
  from (
    select private.evaluate_admin_authorization(
      p_user_id, p_auth_session_id, p_assurance_level
    ) as result
  ) as authz;
$$;

create or replace function private.claim_platform_configuration_rate_limit(
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
       'draft_create', 'draft_update', 'validate', 'submit_review', 'review', 'publish', 'rollback'
     )
     or p_subject_key is null
     or char_length(p_subject_key) not between 1 and 128
     or p_limit not between 1 and 120
     or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_PLATFORM_CONFIGURATION_RATE_LIMIT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('platform-configuration-rate:' || p_scope || ':' || p_subject_key, 0)
  );
  insert into public.game_platform_configuration_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + p_window_seconds * interval '1 second', now()
  )
  on conflict (scope, subject_key) do update set
    attempt_count = case
      when game_platform_configuration_rate_limits.window_expires_at <= now() then 1
      else game_platform_configuration_rate_limits.attempt_count + 1
    end,
    window_started_at = case
      when game_platform_configuration_rate_limits.window_expires_at <= now() then now()
      else game_platform_configuration_rate_limits.window_started_at
    end,
    window_expires_at = case
      when game_platform_configuration_rate_limits.window_expires_at <= now()
        then now() + p_window_seconds * interval '1 second'
      else game_platform_configuration_rate_limits.window_expires_at
    end,
    updated_at = now()
  where game_platform_configuration_rate_limits.window_expires_at <= now()
     or game_platform_configuration_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function private.platform_configuration_asset_delivery_paths(
  p_configuration jsonb,
  p_platform_key text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  branding jsonb;
  landing jsonb;
begin
  select coalesce(jsonb_object_agg(selection.key, version.delivery_preview_path), '{}'::jsonb)
  into branding
  from jsonb_each_text(p_configuration -> 'brandingAssets') as selection
  join public.world_asset_versions as version
    on selection.value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and version.id = selection.value::uuid
  join public.world_assets as asset on asset.id = version.world_asset_id
  where version.lifecycle_status = 'active'
    and asset.active_version_id = version.id
    and asset.lifecycle_status = 'active'
    and asset.production_status = 'approved_production'
    and asset.asset_type = selection.key
    and asset.game_key = p_platform_key;

  select coalesce(jsonb_object_agg(section.value ->> 'key', version.delivery_preview_path), '{}'::jsonb)
  into landing
  from jsonb_array_elements(p_configuration -> 'landing' -> 'sections') as section
  join public.world_asset_versions as version
    on (section.value ->> 'assetVersionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and version.id = (section.value ->> 'assetVersionId')::uuid
  join public.world_assets as asset on asset.id = version.world_asset_id
  where version.lifecycle_status = 'active'
    and asset.active_version_id = version.id
    and asset.lifecycle_status = 'active'
    and asset.production_status = 'approved_production'
    and asset.asset_type in ('landing_hero_background', 'social_share_image')
    and asset.game_key = p_platform_key;

  return jsonb_build_object('branding', branding, 'landing', landing);
end;
$$;

create or replace function private.platform_configuration_version_json(
  p_version public.game_platform_configuration_versions
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_version.id,
    'platformKey', platform.key,
    'versionNumber', p_version.version_number,
    'lifecycleStatus', p_version.lifecycle_status,
    'configuration', p_version.configuration,
    'assetDeliveryPaths', private.platform_configuration_asset_delivery_paths(p_version.configuration, platform.key),
    'validationResults', p_version.validation_results,
    'revision', p_version.revision,
    'createdAt', p_version.created_at,
    'reviewedAt', p_version.reviewed_at,
    'publishedAt', p_version.published_at
  )
  from public.game_platforms as platform
  where platform.id = p_version.game_platform_id;
$$;

create or replace function private.platform_configuration_assets_approved(
  p_configuration jsonb,
  p_platform_key text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  selected record;
  expected_type text;
begin
  for selected in select key, value from jsonb_each_text(p_configuration -> 'brandingAssets') loop
    if selected.value is null then continue; end if;
    expected_type := selected.key;
    if not exists (
      select 1
      from public.world_asset_versions as version
      join public.world_assets as asset on asset.id = version.world_asset_id
      where version.id = selected.value::uuid
        and version.lifecycle_status = 'active'
        and asset.active_version_id = version.id
        and asset.lifecycle_status = 'active'
        and asset.production_status = 'approved_production'
        and asset.asset_type = expected_type
        and asset.game_key = p_platform_key
    ) then return false; end if;
  end loop;

  for selected in
    select section ->> 'assetVersionId' as value
    from jsonb_array_elements(p_configuration -> 'landing' -> 'sections') section
    where section ->> 'assetVersionId' is not null
  loop
    if not exists (
      select 1
      from public.world_asset_versions as version
      join public.world_assets as asset on asset.id = version.world_asset_id
      where version.id = selected.value::uuid
        and version.lifecycle_status = 'active'
        and asset.active_version_id = version.id
        and asset.lifecycle_status = 'active'
        and asset.production_status = 'approved_production'
        and asset.asset_type in ('landing_hero_background', 'social_share_image')
        and asset.game_key = p_platform_key
    ) then return false; end if;
  end loop;
  return true;
exception when invalid_text_representation then
  return false;
end;
$$;

create or replace function public.get_active_platform_configuration(
  p_platform_key text default 'starville'
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'platformKey', platform.key,
    'versionId', version.id,
    'versionNumber', version.version_number,
    'revision', active.revision,
    'configuration', version.configuration,
    'assetDeliveryPaths', private.platform_configuration_asset_delivery_paths(version.configuration, platform.key),
    'fallback', false,
    'etag', format('platform-%s-v%s', active.revision, version.version_number)
  )
  from public.game_platforms as platform
  join public.game_platform_active_configuration as active
    on active.game_platform_id = platform.id
  join public.game_platform_configuration_versions as version
    on version.id = active.configuration_version_id
   and version.game_platform_id = platform.id
  where platform.key = p_platform_key
    and platform.status = 'active';
$$;

create or replace function public.get_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_platform_key text default 'starville'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  platform public.game_platforms%rowtype;
  include_audit boolean;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.read'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_ACCESS_DENIED'; end if;

  select * into strict platform from public.game_platforms where key = p_platform_key;
  include_audit := private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.audit.read'
  );

  return jsonb_build_object(
    'active', public.get_active_platform_configuration(p_platform_key),
    'draft', (
      select private.platform_configuration_version_json(version)
      from public.game_platform_configuration_versions as version
      where version.game_platform_id = platform.id
        and version.lifecycle_status in ('draft', 'validated', 'in_review')
      order by version.version_number desc limit 1
    ),
    'versions', coalesce((
      select jsonb_agg(private.platform_configuration_version_json(version)
                       order by version.version_number desc)
      from (
        select * from public.game_platform_configuration_versions
        where game_platform_id = platform.id
        order by version_number desc limit 50
      ) as version
    ), '[]'::jsonb),
    'audit', case when include_audit then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', audit.id,
        'versionId', audit.configuration_version_id,
        'action', audit.action,
        'permissionKey', audit.permission_key,
        'administratorId', audit.actor_admin_user_id,
        'requestId', audit.request_id,
        'reason', audit.reason,
        'beforeState', audit.before_state,
        'afterState', audit.after_state,
        'result', audit.result,
        'createdAt', audit.created_at
      ) order by audit.created_at desc)
      from (
        select * from public.game_platform_configuration_audit
        where game_platform_id = platform.id
        order by created_at desc limit 100
      ) as audit
    ), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.preview_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_platform_key text default 'starville'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare selected public.game_platform_configuration_versions%rowtype;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.preview'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_PREVIEW_DENIED'; end if;

  select version.* into strict selected
  from public.game_platform_configuration_versions as version
  join public.game_platforms as platform on platform.id = version.game_platform_id
  where version.id = p_version_id and platform.key = p_platform_key;

  if not private.platform_configuration_assets_approved(selected.configuration, p_platform_key) then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_ASSET_NOT_APPROVED';
  end if;
  return private.platform_configuration_version_json(selected);
end;
$$;

create or replace function public.create_admin_platform_configuration_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_platform_key text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  platform public.game_platforms%rowtype;
  active_version public.game_platform_configuration_versions%rowtype;
  created public.game_platform_configuration_versions%rowtype;
  prior_id uuid;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.edit'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_EDIT_DENIED'; end if;
  if char_length(btrim(p_reason)) not between 3 and 500 or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;

  select audit.configuration_version_id into prior_id
  from public.game_platform_configuration_audit as audit
  join public.game_platforms as existing_platform on existing_platform.id = audit.game_platform_id
  where existing_platform.key = p_platform_key
    and audit.request_id = p_request_id and audit.action = 'draft_created';
  if found then
    select * into strict created from public.game_platform_configuration_versions where id = prior_id;
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(created));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'draft_create', p_user_id::text, 30, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;

  select * into strict platform from public.game_platforms where key = p_platform_key for update;
  select version.* into strict active_version
  from public.game_platform_active_configuration active
  join public.game_platform_configuration_versions version on version.id = active.configuration_version_id
  where active.game_platform_id = platform.id;

  insert into public.game_platform_configuration_versions (
    game_platform_id, version_number, lifecycle_status, configuration, created_by_admin_id
  ) values (
    platform.id,
    (select coalesce(max(version_number), 0) + 1 from public.game_platform_configuration_versions where game_platform_id = platform.id),
    'draft', active_version.configuration, p_user_id
  ) returning * into created;

  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key,
    actor_admin_user_id, request_id, reason, before_state, after_state, result
  ) values (
    platform.id, created.id, 'draft_created', 'platform_configuration.edit', p_user_id,
    p_request_id, btrim(p_reason), jsonb_build_object('sourceVersionId', active_version.id),
    jsonb_build_object('versionId', created.id, 'versionNumber', created.version_number), 'succeeded'
  );
  return jsonb_build_object('status', 'created', 'version', private.platform_configuration_version_json(created));
end;
$$;

create or replace function public.update_admin_platform_configuration_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_configuration jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.game_platform_configuration_versions%rowtype;
  updated public.game_platform_configuration_versions%rowtype;
  prior_id uuid;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.edit'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_EDIT_DENIED'; end if;
  if not private.valid_platform_configuration(p_configuration)
     or char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;
  select audit.configuration_version_id into prior_id
  from public.game_platform_configuration_audit as audit
  where audit.configuration_version_id = p_version_id
    and audit.request_id = p_request_id and audit.action = 'draft_edited';
  if found then
    select * into strict updated from public.game_platform_configuration_versions where id = prior_id;
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'draft_update', p_user_id::text, 30, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  select * into strict existing from public.game_platform_configuration_versions
  where id = p_version_id for update;
  if existing.lifecycle_status <> 'draft' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_NOT_EDITABLE';
  end if;
  if existing.revision <> p_expected_revision then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  update public.game_platform_configuration_versions set
    configuration = p_configuration,
    validation_results = null,
    revision = revision + 1
  where id = existing.id returning * into updated;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    existing.game_platform_id, existing.id, 'draft_edited', 'platform_configuration.edit', p_user_id,
    p_request_id, btrim(p_reason), jsonb_build_object('revision', existing.revision),
    jsonb_build_object('revision', updated.revision), 'succeeded'
  );
  return jsonb_build_object('status', 'updated', 'version', private.platform_configuration_version_json(updated));
exception when unique_violation then
  select * into strict updated from public.game_platform_configuration_versions where id = p_version_id;
  return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
end;
$$;

create or replace function public.validate_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_validation_results jsonb,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.game_platform_configuration_versions%rowtype;
  updated public.game_platform_configuration_versions%rowtype;
  valid boolean;
  prior_id uuid;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.validate'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_VALIDATE_DENIED'; end if;
  if jsonb_typeof(p_validation_results) is distinct from 'object'
     or jsonb_typeof(p_validation_results -> 'valid') is distinct from 'boolean'
     or jsonb_typeof(p_validation_results -> 'findings') is distinct from 'array'
     or jsonb_array_length(p_validation_results -> 'findings') > 200
     or octet_length(p_validation_results::text) > 65536
     or char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_VALIDATION';
  end if;
  select audit.configuration_version_id into prior_id
  from public.game_platform_configuration_audit as audit
  where audit.configuration_version_id = p_version_id
    and audit.request_id = p_request_id
    and audit.action in ('validation_passed', 'validation_failed');
  if found then
    select * into strict updated from public.game_platform_configuration_versions where id = prior_id;
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'validate', p_user_id::text, 20, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  select * into strict existing from public.game_platform_configuration_versions
  where id = p_version_id for update;
  if existing.lifecycle_status not in ('draft', 'validated') then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_NOT_VALIDATABLE';
  end if;
  if existing.revision <> p_expected_revision then return jsonb_build_object('status', 'version_conflict'); end if;
  valid := (p_validation_results ->> 'valid')::boolean
    and private.valid_platform_configuration(existing.configuration)
    and private.platform_configuration_assets_approved(
      existing.configuration,
      (select key from public.game_platforms where id = existing.game_platform_id)
    );
  update public.game_platform_configuration_versions set
    lifecycle_status = case when valid then 'validated' else 'draft' end,
    validation_results = jsonb_set(p_validation_results, '{valid}', to_jsonb(valid)),
    revision = revision + 1
  where id = existing.id returning * into updated;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    existing.game_platform_id, existing.id,
    case when valid then 'validation_passed' else 'validation_failed' end,
    'platform_configuration.validate', p_user_id, p_request_id, btrim(p_reason),
    jsonb_build_object('revision', existing.revision),
    jsonb_build_object('revision', updated.revision, 'valid', valid), 'succeeded'
  );
  return jsonb_build_object('status', 'validated', 'version', private.platform_configuration_version_json(updated));
exception when unique_violation then
  select * into strict updated from public.game_platform_configuration_versions where id = p_version_id;
  return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
end;
$$;

create or replace function public.submit_admin_platform_configuration_review(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.game_platform_configuration_versions%rowtype;
  updated public.game_platform_configuration_versions%rowtype;
  prior_id uuid;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.edit'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_REVIEW_SUBMIT_DENIED'; end if;
  if char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;
  select audit.configuration_version_id into prior_id
  from public.game_platform_configuration_audit as audit
  where audit.configuration_version_id = p_version_id
    and audit.request_id = p_request_id and audit.action = 'review_submitted';
  if found then
    select * into strict updated from public.game_platform_configuration_versions where id = prior_id;
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'submit_review', p_user_id::text, 20, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  select * into strict existing from public.game_platform_configuration_versions where id = p_version_id for update;
  if existing.lifecycle_status <> 'validated' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_NOT_VALIDATED';
  end if;
  if existing.revision <> p_expected_revision then return jsonb_build_object('status', 'version_conflict'); end if;
  update public.game_platform_configuration_versions set
    lifecycle_status = 'in_review', submitted_by_admin_id = p_user_id,
    submitted_at = now(), revision = revision + 1
  where id = existing.id returning * into updated;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    existing.game_platform_id, existing.id, 'review_submitted', 'platform_configuration.edit', p_user_id,
    p_request_id, btrim(p_reason), jsonb_build_object('status', existing.lifecycle_status),
    jsonb_build_object('status', updated.lifecycle_status), 'succeeded'
  );
  return jsonb_build_object('status', 'submitted', 'version', private.platform_configuration_version_json(updated));
exception when unique_violation then
  select * into strict updated from public.game_platform_configuration_versions where id = p_version_id;
  return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
end;
$$;

create or replace function public.review_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare existing public.game_platform_configuration_versions%rowtype;
  updated public.game_platform_configuration_versions%rowtype;
  prior_id uuid;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.review'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_REVIEW_DENIED'; end if;
  if char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;
  select audit.configuration_version_id into prior_id
  from public.game_platform_configuration_audit as audit
  where audit.configuration_version_id = p_version_id
    and audit.request_id = p_request_id and audit.action = 'review_approved';
  if found then
    select * into strict updated from public.game_platform_configuration_versions where id = prior_id;
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'review', p_user_id::text, 20, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  select * into strict existing from public.game_platform_configuration_versions where id = p_version_id for update;
  if existing.lifecycle_status <> 'in_review' or existing.submitted_by_admin_id = p_user_id then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_REVIEW_INVALID';
  end if;
  if existing.revision <> p_expected_revision then return jsonb_build_object('status', 'version_conflict'); end if;
  update public.game_platform_configuration_versions set
    reviewed_by_admin_id = p_user_id, reviewed_at = now(), revision = revision + 1
  where id = existing.id returning * into updated;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    existing.game_platform_id, existing.id, 'review_approved', 'platform_configuration.review', p_user_id,
    p_request_id, btrim(p_reason), '{}', jsonb_build_object('reviewed', true), 'succeeded'
  );
  return jsonb_build_object('status', 'reviewed', 'version', private.platform_configuration_version_json(updated));
exception when unique_violation then
  select * into strict updated from public.game_platform_configuration_versions where id = p_version_id;
  return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(updated));
end;
$$;

create or replace function public.publish_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_expected_active_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare selected public.game_platform_configuration_versions%rowtype;
  previous public.game_platform_configuration_versions%rowtype;
  active public.game_platform_active_configuration%rowtype;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.publish'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_PUBLISH_DENIED'; end if;
  if char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;
  select * into strict selected from public.game_platform_configuration_versions where id = p_version_id for update;
  select * into strict active from public.game_platform_active_configuration
  where game_platform_id = selected.game_platform_id for update;
  if exists (
    select 1 from public.game_platform_configuration_audit
    where game_platform_id = selected.game_platform_id and request_id = p_request_id and action = 'published'
  ) then
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(selected));
  end if;
  if not private.claim_platform_configuration_rate_limit(
    'publish', p_user_id::text, 10, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  if selected.revision <> p_expected_revision or active.revision <> p_expected_active_revision then
    return jsonb_build_object('status', 'version_conflict');
  end if;
  if selected.lifecycle_status <> 'in_review' or selected.reviewed_at is null
     or selected.validation_results ->> 'valid' <> 'true'
     or not private.platform_configuration_assets_approved(
       selected.configuration,
       (select key from public.game_platforms where id = selected.game_platform_id)
     ) then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_NOT_PUBLISHABLE';
  end if;
  select * into strict previous from public.game_platform_configuration_versions
  where id = active.configuration_version_id;
  update public.game_platform_configuration_versions
  set lifecycle_status = 'superseded'
  where id = previous.id and id <> selected.id;
  update public.game_platform_configuration_versions set
    lifecycle_status = 'published', published_by_admin_id = p_user_id,
    published_at = coalesce(published_at, now()), revision = revision + 1
  where id = selected.id returning * into selected;
  update public.game_platform_active_configuration set
    configuration_version_id = selected.id, revision = revision + 1,
    activated_at = now(), activated_by_admin_id = p_user_id
  where game_platform_id = selected.game_platform_id;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    selected.game_platform_id, selected.id, 'published', 'platform_configuration.publish', p_user_id,
    p_request_id, btrim(p_reason), jsonb_build_object('versionId', previous.id),
    jsonb_build_object('versionId', selected.id), 'succeeded'
  );
  return jsonb_build_object('status', 'published', 'version', private.platform_configuration_version_json(selected));
end;
$$;

create or replace function public.rollback_admin_platform_configuration(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_active_revision integer,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare target public.game_platform_configuration_versions%rowtype;
  current public.game_platform_configuration_versions%rowtype;
  active public.game_platform_active_configuration%rowtype;
begin
  if not private.platform_configuration_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'platform_configuration.rollback'
  ) then raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_ROLLBACK_DENIED'; end if;
  if char_length(btrim(p_reason)) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128
     or p_reason ~ '[[:cntrl:]<>]' then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_INVALID_REQUEST';
  end if;
  select * into strict target from public.game_platform_configuration_versions where id = p_version_id for update;
  select * into strict active from public.game_platform_active_configuration
  where game_platform_id = target.game_platform_id for update;
  if exists (
    select 1 from public.game_platform_configuration_audit
    where game_platform_id = target.game_platform_id and request_id = p_request_id and action = 'rolled_back'
  ) then return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(target)); end if;
  if not private.claim_platform_configuration_rate_limit(
    'rollback', p_user_id::text, 10, 60
  ) then return jsonb_build_object('status', 'rate_limited'); end if;
  if active.revision <> p_expected_active_revision then return jsonb_build_object('status', 'version_conflict'); end if;
  if target.lifecycle_status not in ('published', 'superseded', 'rolled_back')
     or target.validation_results ->> 'valid' <> 'true'
     or not private.platform_configuration_assets_approved(
       target.configuration,
       (select key from public.game_platforms where id = target.game_platform_id)
     ) then
    raise exception using errcode = '22023', message = 'PLATFORM_CONFIGURATION_ROLLBACK_INVALID';
  end if;
  select * into strict current from public.game_platform_configuration_versions
  where id = active.configuration_version_id;
  if current.id = target.id then
    return jsonb_build_object('status', 'idempotent', 'version', private.platform_configuration_version_json(target));
  end if;
  update public.game_platform_configuration_versions set lifecycle_status = 'rolled_back'
  where id = current.id;
  update public.game_platform_configuration_versions set lifecycle_status = 'published'
  where id = target.id returning * into target;
  update public.game_platform_active_configuration set
    configuration_version_id = target.id, revision = revision + 1,
    activated_at = now(), activated_by_admin_id = p_user_id
  where game_platform_id = target.game_platform_id;
  insert into public.game_platform_configuration_audit (
    game_platform_id, configuration_version_id, action, permission_key, actor_admin_user_id,
    request_id, reason, before_state, after_state, result
  ) values (
    target.game_platform_id, target.id, 'rolled_back', 'platform_configuration.rollback', p_user_id,
    p_request_id, btrim(p_reason), jsonb_build_object('versionId', current.id),
    jsonb_build_object('versionId', target.id), 'succeeded'
  );
  return jsonb_build_object('status', 'rolled_back', 'version', private.platform_configuration_version_json(target));
end;
$$;

revoke all on function private.platform_configuration_authorized(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function private.claim_platform_configuration_rate_limit(text, text, integer, integer) from public, anon, authenticated, service_role;
revoke all on function private.platform_configuration_version_json(public.game_platform_configuration_versions) from public, anon, authenticated, service_role;
revoke all on function private.platform_configuration_assets_approved(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.platform_configuration_asset_delivery_paths(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.get_active_platform_configuration(text) from public, anon, authenticated, service_role;
revoke all on function public.get_admin_platform_configuration(uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_admin_platform_configuration(uuid, uuid, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_admin_platform_configuration_draft(uuid, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_admin_platform_configuration_draft(uuid, uuid, text, uuid, integer, jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.validate_admin_platform_configuration(uuid, uuid, text, uuid, integer, jsonb, text, text) from public, anon, authenticated, service_role;
revoke all on function public.submit_admin_platform_configuration_review(uuid, uuid, text, uuid, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.review_admin_platform_configuration(uuid, uuid, text, uuid, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.publish_admin_platform_configuration(uuid, uuid, text, uuid, integer, integer, text, text) from public, anon, authenticated, service_role;
revoke all on function public.rollback_admin_platform_configuration(uuid, uuid, text, uuid, integer, text, text) from public, anon, authenticated, service_role;

grant execute on function public.get_active_platform_configuration(text) to service_role;
grant execute on function public.get_admin_platform_configuration(uuid, uuid, text, text) to service_role;
grant execute on function public.preview_admin_platform_configuration(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.create_admin_platform_configuration_draft(uuid, uuid, text, text, text, text) to service_role;
grant execute on function public.update_admin_platform_configuration_draft(uuid, uuid, text, uuid, integer, jsonb, text, text) to service_role;
grant execute on function public.validate_admin_platform_configuration(uuid, uuid, text, uuid, integer, jsonb, text, text) to service_role;
grant execute on function public.submit_admin_platform_configuration_review(uuid, uuid, text, uuid, integer, text, text) to service_role;
grant execute on function public.review_admin_platform_configuration(uuid, uuid, text, uuid, integer, text, text) to service_role;
grant execute on function public.publish_admin_platform_configuration(uuid, uuid, text, uuid, integer, integer, text, text) to service_role;
grant execute on function public.rollback_admin_platform_configuration(uuid, uuid, text, uuid, integer, text, text) to service_role;
