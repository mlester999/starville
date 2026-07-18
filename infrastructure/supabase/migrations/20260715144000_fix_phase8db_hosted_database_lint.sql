-- Phase 8D-B forward-only hosted lint repair.
-- Preserve activity authority while removing obsolete PL/pgSQL declarations and
-- keep input-only platform transformations truthfully immutable.

create or replace function public.enter_realtime_cooperative_activity(
  p_session_id uuid, p_preparation_id uuid, p_client_request_id text
)
returns jsonb
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  session public.realtime_sessions%rowtype;
  actor public.player_profiles%rowtype;
  preparation public.cooperative_activity_entry_preparations%rowtype;
  ready public.player_party_ready_checks%rowtype;
  party public.player_parties%rowtype;
  version public.cooperative_activity_versions%rowtype;
  instance public.cooperative_activity_instances%rowtype;
  first_objective jsonb;
  replay jsonb;
  response jsonb;
  request_hash text;
begin
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_COOPERATIVE_ACTIVITY_ENTER';
  end if;
  session := private.cooperative_activity_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_preparation_id::text;
  replay := private.cooperative_activity_replay(actor.id, 'entry_enter', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select prepared.* into preparation from public.cooperative_activity_entry_preparations prepared
  where prepared.public_preparation_id = p_preparation_id for update;
  if not found or preparation.leader_profile_id <> actor.id then response := jsonb_build_object('status', 'leader_required');
  else
    select * into party from public.player_parties where id = preparation.party_id and status = 'active' for update;
    select * into ready from public.player_party_ready_checks where id = preparation.ready_check_id for update;
    select * into strict version from public.cooperative_activity_versions where id = preparation.activity_version_id;
    if preparation.status = 'entered' then
      select * into instance from public.cooperative_activity_instances
      where party_id = preparation.party_id and status in ('waiting_for_players','active','paused');
      response := jsonb_build_object('status', 'entered',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
        'affectedPresenceIds', private.social_graph_party_presence_ids(party.id));
    elsif preparation.expires_at <= now() or ready.expires_at <= now() then
      update public.cooperative_activity_entry_preparations set status = 'expired', resolved_at = now()
      where id = preparation.id;
      response := jsonb_build_object('status', 'not_ready');
    elsif ready.status <> 'completed' or party.revision <> ready.party_revision
       or exists (select 1 from public.player_party_ready_responses where ready_check_id = ready.id and state <> 'ready') then
      response := jsonb_build_object('status', 'not_ready');
    elsif exists (
      select 1 from public.player_party_members party_member
      left join public.player_party_ready_responses ready_response
        on ready_response.ready_check_id = ready.id and ready_response.player_profile_id = party_member.player_profile_id
      where party_member.party_id = party.id and party_member.status = 'active'
        and ready_response.player_profile_id is null
    ) then response := jsonb_build_object('status', 'party_changed');
    else
      first_objective := version.objective_definitions -> 0;
      insert into public.cooperative_activity_instances (
        activity_version_id, party_id, party_public_id, locked_party_revision,
        leader_profile_id, status, current_objective_key, minimum_active_participants,
        waiting_expires_at, started_at, expires_at, return_world_map_id
      ) values (
        version.id, party.id, party.public_party_id, party.revision, actor.id, 'active',
        first_objective ->> 'key', version.minimum_party_size,
        now() + make_interval(secs => version.waiting_for_players_seconds), now(),
        now() + make_interval(secs => version.duration_seconds), session.world_map_id
      ) returning * into instance;
      insert into public.cooperative_activity_participants (
        instance_id, player_profile_id, public_presence_id, connection_status
      ) select instance.id, profile.id, profile.public_presence_id, 'online'
      from public.player_party_members party_member
      join public.player_profiles profile on profile.id = party_member.player_profile_id
      where party_member.party_id = party.id and party_member.status = 'active'
      order by profile.id;
      insert into public.cooperative_activity_objectives (
        instance_id, objective_key, sequence_number, objective_type, label, target,
        status, started_at, timer_ends_at
      ) select instance.id, objective ->> 'key', objective_row.ordinality,
        objective ->> 'type', objective ->> 'label', (objective ->> 'target')::integer,
        case when objective_row.ordinality = 1 then 'active' else 'pending' end,
        case when objective_row.ordinality = 1 then now() else null end,
        case when objective_row.ordinality = 1 and objective ->> 'type' = 'timed_wait'
          then now() + make_interval(secs => (objective ->> 'timeLimitSeconds')::integer) else null end
      from jsonb_array_elements(version.objective_definitions) with ordinality objective_row(objective, ordinality);
      update public.cooperative_activity_entry_preparations set status = 'entered', resolved_at = now()
      where id = preparation.id;
      insert into public.cooperative_activity_audit (
        instance_id, activity_version_id, actor_profile_id, action, result, request_id, revision, details
      ) values (
        instance.id, version.id, actor.id, 'instance_created', 'active', p_client_request_id,
        instance.revision, jsonb_build_object('partyId', party.public_party_id,
          'participantCount', (select count(*) from public.cooperative_activity_participants where instance_id = instance.id))
      );
      response := jsonb_build_object('status', 'entered',
        'snapshot', private.cooperative_activity_snapshot_json(instance, actor.id),
        'affectedPresenceIds', private.social_graph_party_presence_ids(party.id));
    end if;
  end if;
  perform private.cooperative_activity_store_replay(actor.id, 'entry_enter', p_client_request_id, request_hash, response);
  return response;
exception when unique_violation then
  response := jsonb_build_object('status', 'already_active');
  perform private.cooperative_activity_store_replay(actor.id, 'entry_enter', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function private.valid_cooperative_activity_objectives(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare
  objective jsonb;
  objective_keys text[] := array[]::text[];
  objective_key text;
  next_key text;
  objective_count integer;
begin
  if jsonb_typeof(p_value) is distinct from 'array'
     or octet_length(p_value::text) > 32768 then return false; end if;
  objective_count := jsonb_array_length(p_value);
  if objective_count not between 2 and 16 then return false; end if;
  for objective in select value from jsonb_array_elements(p_value) loop
    objective_key := objective ->> 'key';
    if jsonb_typeof(objective) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(objective)) <> 10
       or objective_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
       or objective_key = any(objective_keys)
       or objective ->> 'type' not in (
         'shared_interact_count', 'shared_collect_count', 'shared_plant_count',
         'shared_water_count', 'timed_wait', 'shared_harvest_count',
         'shared_deliver_count', 'all_members_present', 'all_members_interact',
         'sequence_complete'
       )
       or coalesce((objective ->> 'target')::integer, 0) not between 1 and 100
       or char_length(coalesce(objective ->> 'label', '')) not between 3 and 80
       or char_length(coalesce(objective ->> 'description', '')) not between 3 and 240
       or objective ->> 'contributionPolicy' <> 'shared_equal'
       or objective ->> 'completionPolicy' not in ('party_total', 'server_timer')
       or objective::text ~* '(javascript:|<script|<iframe|onerror[[:space:]]*=)'
    then return false; end if;
    if objective ->> 'type' = 'timed_wait' then
      if objective ->> 'completionPolicy' <> 'server_timer'
         or coalesce((objective ->> 'timeLimitSeconds')::integer, 0) not between 5 and 900
         or jsonb_typeof(objective -> 'allowedInteractionKey') is distinct from 'null'
      then return false; end if;
    elsif objective ->> 'completionPolicy' <> 'party_total'
       or jsonb_typeof(objective -> 'timeLimitSeconds') is distinct from 'null'
       or coalesce(objective ->> 'allowedInteractionKey', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    then return false; end if;
    objective_keys := array_append(objective_keys, objective_key);
  end loop;
  for objective_index in 0..objective_count - 1 loop
    next_key := p_value -> objective_index ->> 'nextObjectiveKey';
    if objective_index = objective_count - 1 then
      if jsonb_typeof(p_value -> objective_index -> 'nextObjectiveKey') is distinct from 'null'
      then return false; end if;
    elsif next_key is distinct from (p_value -> (objective_index + 1) ->> 'key') then
      return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

create or replace function private.valid_platform_configuration(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare
  normalized jsonb;
  module_count integer;
  element_index integer;
begin
  module_count := jsonb_array_length(p_value -> 'modules');
  if module_count = 15 then
    return private.valid_platform_configuration_phase75(p_value);
  end if;
  if module_count <> 17
     or (select count(*) from jsonb_array_elements(p_value -> 'modules') module
         where module ->> 'key' = 'social_graph') <> 1
     or (select count(*) from jsonb_array_elements(p_value -> 'modules') module
         where module ->> 'key' = 'cooperative_activities') <> 1
     or exists (
       select 1 from jsonb_array_elements(p_value -> 'modules') module
       where module ->> 'key' in ('social_graph', 'cooperative_activities')
         and (
           jsonb_typeof(module -> 'enabled') is distinct from 'boolean'
           or char_length(coalesce(module ->> 'label', '')) not between 1 and 60
           or module ->> 'label' ~ '[[:cntrl:]<>]'
         )
     )
  then return false; end if;

  if exists (
    select 1 from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' = 'social_graph' and module ->> 'enabled' = 'true'
  ) and exists (
    select 1 from unnest(array['players', 'operations', 'audit']) dependency
    where not exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = dependency and module ->> 'enabled' = 'true'
    )
  ) then return false; end if;

  if exists (
    select 1 from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' = 'cooperative_activities' and module ->> 'enabled' = 'true'
  ) and exists (
    select 1 from unnest(array['social_graph', 'cozy_gameplay', 'world_management', 'audit']) dependency
    where not exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = dependency and module ->> 'enabled' = 'true'
    )
  ) then return false; end if;

  if exists (
    select 1 from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'cooperative_activities'
      and (
        navigation ->> 'moduleKey' is distinct from 'cooperative_activities'
        or navigation ->> 'icon' is distinct from 'activities'
      )
  ) or (
    select count(*) from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'cooperative_activities'
  ) > 1 then return false; end if;

  normalized := p_value;
  element_index := jsonb_array_length(normalized -> 'modules') - 1;
  while element_index >= 0 loop
    if normalized -> 'modules' -> element_index ->> 'key'
       in ('social_graph', 'cooperative_activities') then
      normalized := jsonb_set(
        normalized,
        '{modules}',
        (normalized -> 'modules') - element_index
      );
    end if;
    element_index := element_index - 1;
  end loop;
  element_index := jsonb_array_length(normalized -> 'navigation' -> 'items') - 1;
  while element_index >= 0 loop
    if normalized -> 'navigation' -> 'items' -> element_index ->> 'routeKey'
       = 'cooperative_activities' then
      normalized := jsonb_set(
        normalized,
        '{navigation,items}',
        (normalized -> 'navigation' -> 'items') - element_index
      );
    end if;
    element_index := element_index - 1;
  end loop;
  return private.valid_platform_configuration_phase75(normalized);
exception when others then
  return false;
end;
$$;

create or replace function private.upgrade_phase8db_platform_configuration(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare
  upgraded jsonb := p_value;
  next_order integer;
  new_navigation jsonb;
begin
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'modules') module
    where module ->> 'key' = 'social_graph'
  ) then
    upgraded := jsonb_set(
      upgraded,
      '{modules}',
      upgraded -> 'modules' ||
        '{"key":"social_graph","enabled":true,"label":"Friends and parties"}'::jsonb
    );
  end if;
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'modules') module
    where module ->> 'key' = 'cooperative_activities'
  ) then
    upgraded := jsonb_set(
      upgraded,
      '{modules}',
      upgraded -> 'modules' ||
        '{"key":"cooperative_activities","enabled":true,"label":"Cooperative activities"}'::jsonb
    );
  end if;
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'cooperative_activities'
  ) then
    select candidate into next_order
    from generate_series(0, 100) candidate
    where not exists (
      select 1 from jsonb_array_elements(upgraded -> 'navigation' -> 'items') navigation
      where (navigation ->> 'order')::integer = candidate
    )
    order by candidate desc
    limit 1;
    new_navigation := '{"routeKey":"cooperative_activities","moduleKey":"cooperative_activities","label":"Activities","icon":"activities","order":0,"group":"Administration","badgeLabel":null}'::jsonb;
    new_navigation := jsonb_set(
      new_navigation,
      '{order}',
      (coalesce(next_order, 100)::text)::jsonb
    );
    upgraded := jsonb_set(
      upgraded,
      '{navigation,items}',
      upgraded #> '{navigation,items}' || new_navigation
    );
  end if;
  return upgraded;
end;
$$;

revoke all on function public.enter_realtime_cooperative_activity(uuid,uuid,text)
from public, anon, authenticated, service_role;
grant execute on function public.enter_realtime_cooperative_activity(uuid,uuid,text)
to service_role;

revoke all on function private.valid_cooperative_activity_objectives(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.valid_platform_configuration(jsonb)
from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase8db_platform_configuration(jsonb)
from public, anon, authenticated, service_role;
