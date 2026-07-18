-- Starville Phase 8D-B: structured administration, reviewed maintenance policy,
-- and immediate party/access reconciliation for cooperative activities.

create or replace function private.valid_cooperative_activity_editor(p_activity jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare module_key text;
declare asset_key text;
begin
  if jsonb_typeof(p_activity) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_activity)) <> 23
     or not p_activity ?& array[
       'activityKey','name','shortDescription','longDescription','category',
       'minimumPartySize','maximumPartySize','recommendedLevel','durationSeconds',
       'reconnectGraceSeconds','waitingForPlayersSeconds','entryWorldId','entryWorldName',
       'entryInteractionKey','sceneRef','objectives','reward','entryCooldownSeconds',
       'rewardCooldownSeconds','dailyRewardLimit','requiredModules','requiredAssets','contentVersion'
     ]
     or p_activity ->> 'activityKey' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_activity ->> 'category' <> 'cozy_cooperative'
     or char_length(p_activity ->> 'name') not between 3 and 80
     or char_length(p_activity ->> 'shortDescription') not between 3 and 180
     or char_length(p_activity ->> 'longDescription') not between 3 and 1000
     or (p_activity ->> 'minimumPartySize')::integer not between 2 and 4
     or (p_activity ->> 'maximumPartySize')::integer not between 2 and 4
     or (p_activity ->> 'minimumPartySize')::integer > (p_activity ->> 'maximumPartySize')::integer
     or (p_activity ->> 'recommendedLevel')::integer not between 1 and 999
     or (p_activity ->> 'durationSeconds')::integer not between 60 and 3600
     or (p_activity ->> 'reconnectGraceSeconds')::integer not between 15 and 600
     or (p_activity ->> 'waitingForPlayersSeconds')::integer not between 15 and 600
     or p_activity ->> 'entryWorldId' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(p_activity ->> 'entryWorldName') not between 3 and 120
     or p_activity ->> 'entryInteractionKey' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or p_activity ->> 'sceneRef' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or not private.valid_cooperative_activity_objectives(p_activity -> 'objectives')
     or not private.valid_cooperative_activity_reward(p_activity -> 'reward')
     or (p_activity ->> 'entryCooldownSeconds')::integer not between 0 and 86400
     or (p_activity ->> 'rewardCooldownSeconds')::integer not between 0 and 604800
     or (p_activity ->> 'dailyRewardLimit')::integer not between 0 and 20
     or (p_activity ->> 'contentVersion')::integer < 1
     or jsonb_typeof(p_activity -> 'requiredModules') is distinct from 'array'
     or jsonb_array_length(p_activity -> 'requiredModules') not between 1 and 12
     or jsonb_typeof(p_activity -> 'requiredAssets') is distinct from 'array'
     or jsonb_array_length(p_activity -> 'requiredAssets') > 40
     or p_activity::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
  then
    return false;
  end if;
  for module_key in select jsonb_array_elements_text(p_activity -> 'requiredModules') loop
    if module_key !~ '^[a-z][a-z0-9_]{0,79}$' then return false; end if;
  end loop;
  for asset_key in select jsonb_array_elements_text(p_activity -> 'requiredAssets') loop
    if asset_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function private.cooperative_activity_active_session(p_session_id uuid)
returns public.realtime_sessions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare access_session public.wallet_access_sessions%rowtype;
declare profile public.player_profiles%rowtype;
declare settings public.cooperative_activity_settings%rowtype;
declare denial text;
declare existing_instance boolean;
begin
  select * into session from public.realtime_sessions
  where id = p_session_id and status = 'active'
    and last_heartbeat_at > now() - interval '30 seconds';
  if not found then
    raise exception using errcode = '28000', message = 'COOPERATIVE_ACTIVITY_ACCESS_CHANGED';
  end if;
  select * into strict access_session from public.wallet_access_sessions
  where id = session.wallet_access_session_id;
  select * into strict profile from public.player_profiles where id = session.player_profile_id;
  select * into strict settings from public.cooperative_activity_settings where singleton_key;
  select exists (
    select 1
    from public.cooperative_activity_participants participant
    join public.cooperative_activity_instances instance on instance.id = participant.instance_id
    where participant.player_profile_id = profile.id
      and participant.connection_status in ('online','reconnecting')
      and instance.status in ('waiting_for_players','active','paused')
  ) into existing_instance;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null and not (
    denial = 'maintenance' and existing_instance and settings.allow_existing_instances_to_finish
  ) then
    raise exception using errcode = '28000', message = case
      when denial = 'maintenance' then 'COOPERATIVE_ACTIVITY_MAINTENANCE'
      else 'COOPERATIVE_ACTIVITY_ACCESS_CHANGED'
    end;
  end if;
  if not settings.module_enabled and not (
    existing_instance and settings.allow_existing_instances_to_finish
  ) then
    raise exception using errcode = '28000', message = 'COOPERATIVE_ACTIVITY_MODULE_DISABLED';
  end if;
  return session;
end;
$$;

create or replace function public.get_admin_cooperative_activities(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_view text,
  p_search text,
  p_status text,
  p_page integer,
  p_page_size integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare total integer;
declare rows jsonb;
declare offset_rows integer;
declare required_permission text;
begin
  required_permission := case when p_view = 'audit'
    then 'cooperative_activities.audit.read' else 'cooperative_activities.read' end;
  if not private.social_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, required_permission
  ) then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITIES_ACCESS_DENIED';
  end if;
  if p_view not in ('catalog','instances','rewards','audit')
     or p_status not in (
       'all','draft','validated','in_review','published','superseded','disabled',
       'preparing','waiting_for_players','active','paused','completed','failed','cancelled',
       'expired','abandoned','settled','pending_inventory','ineligible'
     )
     or p_page < 1 or p_page_size not in (10,50,100)
     or char_length(p_search) > 80
  then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITIES_QUERY';
  end if;
  offset_rows := (p_page - 1) * p_page_size;
  if p_view = 'catalog' then
    select count(*)::integer into total
    from public.cooperative_activity_versions version
    join public.cooperative_activity_definitions definition
      on definition.id = version.activity_definition_id
    where (p_status = 'all' or version.lifecycle_status = p_status)
      and (p_search = '' or definition.activity_key ilike '%' || p_search || '%'
        or version.name ilike '%' || p_search || '%');
    select coalesce(jsonb_agg(private.cooperative_activity_version_json(page.version)
      order by page.created_at desc), '[]'::jsonb) into rows
    from (
      select version, version.created_at
      from public.cooperative_activity_versions version
      join public.cooperative_activity_definitions definition
        on definition.id = version.activity_definition_id
      where (p_status = 'all' or version.lifecycle_status = p_status)
        and (p_search = '' or definition.activity_key ilike '%' || p_search || '%'
          or version.name ilike '%' || p_search || '%')
      order by version.created_at desc, version.id
      limit p_page_size offset offset_rows
    ) page;
  elsif p_view = 'instances' then
    select count(*)::integer into total
    from public.cooperative_activity_instances instance
    join public.cooperative_activity_versions version on version.id = instance.activity_version_id
    join public.cooperative_activity_definitions definition
      on definition.id = version.activity_definition_id
    where (p_status = 'all' or instance.status = p_status)
      and (p_search = '' or instance.public_instance_id::text = p_search
        or definition.activity_key ilike '%' || p_search || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'instanceId', page.public_instance_id,
      'activityKey', page.activity_key,
      'activityName', page.activity_name,
      'partyId', page.party_public_id,
      'status', page.status,
      'revision', page.revision,
      'participantCount', page.participant_count,
      'currentObjectiveKey', page.current_objective_key,
      'startedAt', page.started_at,
      'expiresAt', page.expires_at,
      'completedAt', page.completed_at,
      'resultCode', page.result_code
    ) order by page.created_at desc), '[]'::jsonb) into rows
    from (
      select instance.*, definition.activity_key, version.name as activity_name,
        (select count(*)::integer from public.cooperative_activity_participants participant
          where participant.instance_id = instance.id) as participant_count
      from public.cooperative_activity_instances instance
      join public.cooperative_activity_versions version on version.id = instance.activity_version_id
      join public.cooperative_activity_definitions definition
        on definition.id = version.activity_definition_id
      where (p_status = 'all' or instance.status = p_status)
        and (p_search = '' or instance.public_instance_id::text = p_search
          or definition.activity_key ilike '%' || p_search || '%')
      order by instance.created_at desc, instance.id
      limit p_page_size offset offset_rows
    ) page;
  elsif p_view = 'rewards' then
    select count(*)::integer into total
    from public.cooperative_activity_reward_receipts receipt
    join public.player_profiles profile on profile.id = receipt.player_profile_id
    where (p_status = 'all' or receipt.status = p_status)
      and (p_search = '' or receipt.public_receipt_id::text = p_search
        or profile.display_name ilike '%' || p_search || '%');
    select coalesce(jsonb_agg(jsonb_build_object(
      'receiptId', page.public_receipt_id,
      'completionId', page.public_completion_id,
      'instanceId', page.public_instance_id,
      'presenceId', page.public_presence_id,
      'displayName', page.display_name,
      'status', page.status,
      'dust', page.dust_amount,
      'settledAt', page.settled_at,
      'dailyRewardNumber', page.daily_reward_number
    ) order by page.settled_at desc), '[]'::jsonb) into rows
    from (
      select receipt.*, completion.public_completion_id, instance.public_instance_id,
        profile.public_presence_id, profile.display_name
      from public.cooperative_activity_reward_receipts receipt
      join public.cooperative_activity_completions completion on completion.id = receipt.completion_id
      join public.cooperative_activity_instances instance on instance.id = completion.instance_id
      join public.player_profiles profile on profile.id = receipt.player_profile_id
      where (p_status = 'all' or receipt.status = p_status)
        and (p_search = '' or receipt.public_receipt_id::text = p_search
          or profile.display_name ilike '%' || p_search || '%')
      order by receipt.settled_at desc, receipt.id
      limit p_page_size offset offset_rows
    ) page;
  else
    select count(*)::integer into total
    from public.cooperative_activity_audit audit
    left join public.cooperative_activity_instances instance on instance.id = audit.instance_id
    where p_status = 'all'
      and (p_search = '' or audit.action ilike '%' || p_search || '%'
        or instance.public_instance_id::text = p_search);
    select coalesce(jsonb_agg(jsonb_build_object(
      'entryNumber', page.entry_number,
      'instanceId', page.public_instance_id,
      'versionId', page.activity_version_id,
      'action', page.action,
      'result', page.result,
      'revision', page.revision,
      'createdAt', page.created_at,
      'details', page.details
    ) order by page.entry_number desc), '[]'::jsonb) into rows
    from (
      select audit.*, instance.public_instance_id
      from public.cooperative_activity_audit audit
      left join public.cooperative_activity_instances instance on instance.id = audit.instance_id
      where p_status = 'all'
        and (p_search = '' or audit.action ilike '%' || p_search || '%'
          or instance.public_instance_id::text = p_search)
      order by audit.entry_number desc
      limit p_page_size offset offset_rows
    ) page;
  end if;
  return jsonb_build_object(
    'view', p_view,
    'rows', rows,
    'total', total,
    'page', p_page,
    'pageSize', p_page_size
  );
end;
$$;

create or replace function public.update_admin_cooperative_activity_settings(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_expected_version integer,
  p_module_enabled boolean,
  p_allow_existing_instances_to_finish boolean,
  p_maximum_active_instances integer,
  p_maximum_failed_attempts_per_hour integer,
  p_maximum_party_creations_per_hour integer,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare settings public.cooperative_activity_settings%rowtype;
begin
  if not private.social_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level,
    'cooperative_activities.settings.edit'
  ) then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_SETTINGS_ACCESS_DENIED';
  end if;
  if char_length(p_request_id) not between 1 and 128
     or p_expected_version < 1
     or p_maximum_active_instances not between 1 and 1000
     or p_maximum_failed_attempts_per_hour not between 1 and 60
     or p_maximum_party_creations_per_hour not between 1 and 60
  then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_SETTINGS';
  end if;
  select * into strict settings from public.cooperative_activity_settings
  where singleton_key for update;
  if settings.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'COOPERATIVE_ACTIVITY_SETTINGS_CONFLICT';
  end if;
  update public.cooperative_activity_settings set
    module_enabled = p_module_enabled,
    public_queue_enabled = false,
    allow_existing_instances_to_finish = p_allow_existing_instances_to_finish,
    maximum_active_instances = p_maximum_active_instances,
    maximum_failed_attempts_per_hour = p_maximum_failed_attempts_per_hour,
    maximum_party_creations_per_hour = p_maximum_party_creations_per_hour,
    version = version + 1
  where singleton_key returning * into settings;
  insert into public.cooperative_activity_audit (
    actor_admin_id, action, result, request_id, revision, details
  ) values (
    p_user_id, 'settings_updated', 'updated', p_request_id, settings.version,
    jsonb_build_object(
      'moduleEnabled', settings.module_enabled,
      'allowExistingInstancesToFinish', settings.allow_existing_instances_to_finish
    )
  );
  return public.get_admin_cooperative_activity_settings(
    p_user_id, p_auth_session_id, p_assurance_level
  );
end;
$$;

create or replace function public.create_admin_cooperative_activity_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_activity jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare definition public.cooperative_activity_definitions%rowtype;
declare version public.cooperative_activity_versions%rowtype;
declare source_version_id uuid;
declare entry_map_id uuid;
declare next_version integer;
begin
  if not private.social_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.edit'
  ) then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_EDIT_ACCESS_DENIED';
  end if;
  if char_length(p_request_id) not between 1 and 128
     or not private.valid_cooperative_activity_editor(p_activity)
  then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_DRAFT';
  end if;
  select id into entry_map_id from public.world_maps
  where slug = p_activity ->> 'entryWorldId' and status = 'active';
  if entry_map_id is null then
    raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_ENTRY_WORLD_UNAVAILABLE';
  end if;
  insert into public.cooperative_activity_definitions (activity_key)
  values (p_activity ->> 'activityKey')
  on conflict (activity_key) do nothing;
  select * into strict definition from public.cooperative_activity_definitions
  where activity_key = p_activity ->> 'activityKey' for update;
  select version_number + 1, id into next_version, source_version_id
  from public.cooperative_activity_versions
  where activity_definition_id = definition.id
  order by version_number desc limit 1;
  next_version := coalesce(next_version, 1);
  version.id := gen_random_uuid();
  insert into public.cooperative_activity_versions (
    id, activity_definition_id, version_number, lifecycle_status, name,
    short_description, long_description, category, minimum_party_size, maximum_party_size,
    recommended_level, duration_seconds, reconnect_grace_seconds,
    waiting_for_players_seconds, entry_world_map_id, entry_interaction_key, scene_ref,
    objective_definitions, reward_definition, entry_cooldown_seconds,
    reward_cooldown_seconds, daily_reward_limit, required_modules, required_assets,
    content_version, revision, created_by_admin_id
  ) values (
    version.id, definition.id, next_version, 'draft', p_activity ->> 'name',
    p_activity ->> 'shortDescription', p_activity ->> 'longDescription', 'cozy_cooperative',
    (p_activity ->> 'minimumPartySize')::integer,
    (p_activity ->> 'maximumPartySize')::integer,
    (p_activity ->> 'recommendedLevel')::integer,
    (p_activity ->> 'durationSeconds')::integer,
    (p_activity ->> 'reconnectGraceSeconds')::integer,
    (p_activity ->> 'waitingForPlayersSeconds')::integer,
    entry_map_id, p_activity ->> 'entryInteractionKey', p_activity ->> 'sceneRef',
    p_activity -> 'objectives', p_activity -> 'reward',
    (p_activity ->> 'entryCooldownSeconds')::integer,
    (p_activity ->> 'rewardCooldownSeconds')::integer,
    (p_activity ->> 'dailyRewardLimit')::integer,
    array(select jsonb_array_elements_text(p_activity -> 'requiredModules')),
    array(select jsonb_array_elements_text(p_activity -> 'requiredAssets')),
    (p_activity ->> 'contentVersion')::integer, 1, p_user_id
  ) returning * into version;
  if source_version_id is not null then
    insert into public.cooperative_activity_objects (
      activity_version_id, object_key, interaction_key, label, object_type,
      position_x, position_y, interaction_range, active
    )
    select version.id, object_key, interaction_key, label, object_type,
      position_x, position_y, interaction_range, active
    from public.cooperative_activity_objects where activity_version_id = source_version_id;
  end if;
  insert into public.cooperative_activity_audit (
    activity_version_id, actor_admin_id, action, result, request_id, revision
  ) values (version.id, p_user_id, 'draft_created', 'created', p_request_id, version.revision);
  return private.cooperative_activity_version_json(version);
end;
$$;

create or replace function public.update_admin_cooperative_activity_draft(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_activity jsonb,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare version public.cooperative_activity_versions%rowtype;
declare definition public.cooperative_activity_definitions%rowtype;
declare entry_map_id uuid;
begin
  if not private.social_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, 'cooperative_activities.edit'
  ) then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_EDIT_ACCESS_DENIED';
  end if;
  if char_length(p_request_id) not between 1 and 128
     or p_expected_revision < 1
     or not private.valid_cooperative_activity_editor(p_activity)
  then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_DRAFT';
  end if;
  select * into version from public.cooperative_activity_versions where id = p_version_id for update;
  if not found then raise no_data_found; end if;
  select * into strict definition from public.cooperative_activity_definitions
  where id = version.activity_definition_id;
  if version.lifecycle_status <> 'draft' or version.revision <> p_expected_revision
     or definition.activity_key <> p_activity ->> 'activityKey'
  then
    raise exception using errcode = '40001', message = 'COOPERATIVE_ACTIVITY_DRAFT_CONFLICT';
  end if;
  select id into entry_map_id from public.world_maps
  where slug = p_activity ->> 'entryWorldId' and status = 'active';
  if entry_map_id is null then
    raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_ENTRY_WORLD_UNAVAILABLE';
  end if;
  update public.cooperative_activity_versions set
    name = p_activity ->> 'name',
    short_description = p_activity ->> 'shortDescription',
    long_description = p_activity ->> 'longDescription',
    minimum_party_size = (p_activity ->> 'minimumPartySize')::integer,
    maximum_party_size = (p_activity ->> 'maximumPartySize')::integer,
    recommended_level = (p_activity ->> 'recommendedLevel')::integer,
    duration_seconds = (p_activity ->> 'durationSeconds')::integer,
    reconnect_grace_seconds = (p_activity ->> 'reconnectGraceSeconds')::integer,
    waiting_for_players_seconds = (p_activity ->> 'waitingForPlayersSeconds')::integer,
    entry_world_map_id = entry_map_id,
    entry_interaction_key = p_activity ->> 'entryInteractionKey',
    scene_ref = p_activity ->> 'sceneRef',
    objective_definitions = p_activity -> 'objectives',
    reward_definition = p_activity -> 'reward',
    entry_cooldown_seconds = (p_activity ->> 'entryCooldownSeconds')::integer,
    reward_cooldown_seconds = (p_activity ->> 'rewardCooldownSeconds')::integer,
    daily_reward_limit = (p_activity ->> 'dailyRewardLimit')::integer,
    required_modules = array(select jsonb_array_elements_text(p_activity -> 'requiredModules')),
    required_assets = array(select jsonb_array_elements_text(p_activity -> 'requiredAssets')),
    content_version = (p_activity ->> 'contentVersion')::integer,
    validation_results = null,
    revision = revision + 1
  where id = version.id returning * into version;
  insert into public.cooperative_activity_audit (
    activity_version_id, actor_admin_id, action, result, request_id, revision
  ) values (version.id, p_user_id, 'draft_updated', 'updated', p_request_id, version.revision);
  return private.cooperative_activity_version_json(version);
end;
$$;

create or replace function public.transition_admin_cooperative_activity_version(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_version_id uuid,
  p_expected_revision integer,
  p_action text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare version public.cooperative_activity_versions%rowtype;
declare required_permission text;
declare missing_interaction boolean;
begin
  required_permission := case p_action
    when 'validate' then 'cooperative_activities.validate'
    when 'submit_review' then 'cooperative_activities.review'
    when 'publish' then 'cooperative_activities.publish'
    when 'disable' then 'cooperative_activities.publish'
    else null
  end;
  if required_permission is null or char_length(p_request_id) not between 1 and 128
     or p_expected_revision < 1
  then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_LIFECYCLE';
  end if;
  if not private.social_admin_authorized(
    p_user_id, p_auth_session_id, p_assurance_level, required_permission
  ) then
    raise exception using errcode = '42501', message = 'COOPERATIVE_ACTIVITY_LIFECYCLE_ACCESS_DENIED';
  end if;
  select * into version from public.cooperative_activity_versions where id = p_version_id for update;
  if not found then raise no_data_found; end if;
  if version.revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'COOPERATIVE_ACTIVITY_VERSION_CONFLICT';
  end if;
  if p_action = 'validate' then
    if version.lifecycle_status <> 'draft' then
      raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_LIFECYCLE_CONFLICT';
    end if;
    select exists (
      select 1
      from jsonb_array_elements(version.objective_definitions) objective
      where objective ->> 'allowedInteractionKey' is not null
        and not exists (
          select 1 from public.cooperative_activity_objects object
          where object.activity_version_id = version.id and object.active
            and object.interaction_key = objective ->> 'allowedInteractionKey'
        )
    ) into missing_interaction;
    if missing_interaction or exists (
      select 1 from jsonb_array_elements(version.reward_definition -> 'items') reward_item
      where not exists (
        select 1 from public.cozy_item_definitions item
        where item.slug = reward_item ->> 'itemSlug' and item.active
      )
    ) then
      raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_VALIDATION_FAILED';
    end if;
    update public.cooperative_activity_versions set
      lifecycle_status = 'validated',
      validation_results = '{"valid":true,"findings":[{"level":"passed","code":"ACTIVITY_VALID"}]}'::jsonb,
      revision = revision + 1
    where id = version.id returning * into version;
  elsif p_action = 'submit_review' then
    if version.lifecycle_status <> 'validated' then
      raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_LIFECYCLE_CONFLICT';
    end if;
    update public.cooperative_activity_versions set
      lifecycle_status = 'in_review',
      submitted_at = now(),
      reviewed_at = now(),
      reviewed_by_admin_id = p_user_id,
      revision = revision + 1
    where id = version.id returning * into version;
  elsif p_action = 'publish' then
    if version.lifecycle_status <> 'in_review' then
      raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_LIFECYCLE_CONFLICT';
    end if;
    update public.cooperative_activity_versions set lifecycle_status = 'superseded'
    where activity_definition_id = version.activity_definition_id
      and lifecycle_status = 'published' and id <> version.id;
    update public.cooperative_activity_versions set
      lifecycle_status = 'published',
      published_at = now(),
      published_by_admin_id = p_user_id,
      revision = revision + 1
    where id = version.id returning * into version;
    insert into public.cooperative_activity_active_versions (
      activity_definition_id, activity_version_id, enabled, revision, activated_at,
      activated_by_admin_id
    ) values (
      version.activity_definition_id, version.id, true, 1, now(), p_user_id
    ) on conflict (activity_definition_id) do update set
      activity_version_id = excluded.activity_version_id,
      enabled = true,
      revision = public.cooperative_activity_active_versions.revision + 1,
      activated_at = now(),
      activated_by_admin_id = p_user_id;
  else
    if version.lifecycle_status <> 'published' then
      raise exception using errcode = '22023', message = 'COOPERATIVE_ACTIVITY_LIFECYCLE_CONFLICT';
    end if;
    update public.cooperative_activity_versions set lifecycle_status = 'disabled'
    where id = version.id returning * into version;
    update public.cooperative_activity_active_versions set
      enabled = false,
      revision = revision + 1,
      activated_at = now(),
      activated_by_admin_id = p_user_id
    where activity_definition_id = version.activity_definition_id
      and activity_version_id = version.id;
  end if;
  insert into public.cooperative_activity_audit (
    activity_version_id, actor_admin_id, action, result, request_id, revision
  ) values (
    version.id, p_user_id, 'lifecycle_' || p_action, 'accepted', p_request_id, version.revision
  );
  return private.cooperative_activity_version_json(version);
end;
$$;

create or replace function private.reconcile_cooperative_activity_party_change()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare instance public.cooperative_activity_instances%rowtype;
declare active_count integer;
declare affected_player_id uuid;
declare affected_party_id uuid;
declare reason text;
begin
  if tg_table_name = 'player_party_members' then
    if old.status <> 'active' or new.status = 'active' then return new; end if;
    affected_player_id := old.player_profile_id;
    affected_party_id := old.party_id;
    reason := case when new.status = 'kicked' then 'party_kicked' else 'party_left' end;
  else
    if old.status <> 'active' or new.status = 'active' then return new; end if;
    affected_party_id := old.id;
    reason := 'party_disbanded';
  end if;
  for instance in
    select activity_instance.*
    from public.cooperative_activity_instances activity_instance
    where activity_instance.party_id = affected_party_id
      and activity_instance.status in ('preparing','waiting_for_players','active','paused')
    order by activity_instance.id for update
  loop
    update public.cooperative_activity_participants set
      connection_status = 'removed',
      reward_eligible = false,
      reconnect_deadline = null,
      removed_at = now(),
      removal_reason = reason
    where instance_id = instance.id
      and (affected_player_id is null or player_profile_id = affected_player_id)
      and connection_status <> 'removed';
    delete from public.cooperative_activity_temporary_items
    where instance_id = instance.id
      and (affected_player_id is null or player_profile_id = affected_player_id);
    select count(*)::integer into active_count
    from public.cooperative_activity_participants
    where instance_id = instance.id and connection_status = 'online' and reward_eligible;
    if active_count < instance.minimum_active_participants then
      perform private.cooperative_activity_fail(
        instance.id, 'insufficient_participants', 'party-change-' || instance.id::text
      );
    else
      update public.cooperative_activity_instances set
        revision = revision + 1,
        checkpoint_version = checkpoint_version + 1
      where id = instance.id;
    end if;
  end loop;
  return new;
end;
$$;

create trigger cooperative_activity_party_member_reconcile
after update of status on public.player_party_members
for each row execute function private.reconcile_cooperative_activity_party_change();

create trigger cooperative_activity_party_status_reconcile
after update of status on public.player_parties
for each row execute function private.reconcile_cooperative_activity_party_change();

create or replace function public.handle_realtime_cooperative_activity_disconnect(
  p_session_id uuid,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare session public.realtime_sessions%rowtype;
declare actor public.player_profiles%rowtype;
declare instance public.cooperative_activity_instances%rowtype;
declare version public.cooperative_activity_versions%rowtype;
declare affected jsonb;
declare active_count integer;
declare removed boolean;
begin
  select * into session from public.realtime_sessions where id = p_session_id;
  if not found then return jsonb_build_object('status', 'unchanged'); end if;
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  select * into instance from private.cooperative_activity_active_instance(actor.id);
  if instance.id is null then return jsonb_build_object('status', 'unchanged'); end if;
  select * into strict version from public.cooperative_activity_versions
  where id = instance.activity_version_id;
  removed := p_reason in (
    'player_suspended','access_revoked','authorization_failed','party_removed'
  );
  if removed then
    update public.cooperative_activity_participants set
      connection_status = 'removed',
      reward_eligible = false,
      reconnect_deadline = null,
      removed_at = now(),
      removal_reason = p_reason
    where instance_id = instance.id and player_profile_id = actor.id;
    delete from public.cooperative_activity_temporary_items
    where instance_id = instance.id and player_profile_id = actor.id;
  else
    update public.cooperative_activity_participants set
      connection_status = 'reconnecting',
      reconnect_deadline = now() + make_interval(secs => version.reconnect_grace_seconds)
    where instance_id = instance.id and player_profile_id = actor.id
      and connection_status <> 'removed';
  end if;
  select count(*)::integer into active_count
  from public.cooperative_activity_participants
  where instance_id = instance.id and connection_status = 'online' and reward_eligible;
  if removed and active_count < instance.minimum_active_participants then
    instance := private.cooperative_activity_fail(
      instance.id, 'insufficient_participants', p_request_id
    );
  else
    update public.cooperative_activity_instances set
      revision = revision + 1,
      checkpoint_version = checkpoint_version + 1
    where id = instance.id returning * into instance;
  end if;
  select coalesce(jsonb_agg(profile.public_presence_id order by profile.public_presence_id), '[]'::jsonb)
  into affected
  from public.cooperative_activity_participants participant
  join public.player_profiles profile on profile.id = participant.player_profile_id
  where participant.instance_id = instance.id;
  insert into public.cooperative_activity_audit (
    instance_id, activity_version_id, actor_profile_id, action, result,
    request_id, revision, details
  ) values (
    instance.id, instance.activity_version_id, actor.id, 'participant_disconnected',
    case when removed then 'removed' else 'reconnecting' end,
    p_request_id, instance.revision, jsonb_build_object('reason', p_reason)
  );
  return jsonb_build_object(
    'status', 'updated',
    'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
    'affectedPresenceIds', affected
  );
end;
$$;

revoke all on function private.valid_cooperative_activity_editor(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.cooperative_activity_active_session(uuid)
from public, anon, authenticated, service_role;
revoke all on function private.reconcile_cooperative_activity_party_change()
from public, anon, authenticated, service_role;

revoke all on function public.get_admin_cooperative_activities(uuid,uuid,text,text,text,text,integer,integer)
from public, anon, authenticated, service_role;
revoke all on function public.update_admin_cooperative_activity_settings(uuid,uuid,text,integer,boolean,boolean,integer,integer,integer,text)
from public, anon, authenticated, service_role;
revoke all on function public.create_admin_cooperative_activity_draft(uuid,uuid,text,jsonb,text)
from public, anon, authenticated, service_role;
revoke all on function public.update_admin_cooperative_activity_draft(uuid,uuid,text,uuid,integer,jsonb,text)
from public, anon, authenticated, service_role;
revoke all on function public.transition_admin_cooperative_activity_version(uuid,uuid,text,uuid,integer,text,text)
from public, anon, authenticated, service_role;
revoke all on function public.handle_realtime_cooperative_activity_disconnect(uuid,text,text)
from public, anon, authenticated, service_role;

grant execute on function public.get_admin_cooperative_activities(uuid,uuid,text,text,text,text,integer,integer)
to service_role;
grant execute on function public.update_admin_cooperative_activity_settings(uuid,uuid,text,integer,boolean,boolean,integer,integer,integer,text)
to service_role;
grant execute on function public.create_admin_cooperative_activity_draft(uuid,uuid,text,jsonb,text)
to service_role;
grant execute on function public.update_admin_cooperative_activity_draft(uuid,uuid,text,uuid,integer,jsonb,text)
to service_role;
grant execute on function public.transition_admin_cooperative_activity_version(uuid,uuid,text,uuid,integer,text,text)
to service_role;
grant execute on function public.handle_realtime_cooperative_activity_disconnect(uuid,text,text)
to service_role;
