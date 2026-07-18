-- Phase 8D-B platform-module schema evolution. Existing published versions remain immutable.

alter function private.valid_platform_configuration(jsonb)
  rename to valid_platform_configuration_phase75;

create or replace function private.valid_platform_configuration(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  normalized jsonb;
  module_count integer;
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

  normalized := jsonb_set(
    jsonb_set(
      p_value,
      '{modules}',
      coalesce((
        select jsonb_agg(module order by ordinality)
        from jsonb_array_elements(p_value -> 'modules') with ordinality selection(module, ordinality)
        where module ->> 'key' not in ('social_graph', 'cooperative_activities')
      ), '[]'::jsonb)
    ),
    '{navigation,items}',
    coalesce((
      select jsonb_agg(navigation order by ordinality)
      from jsonb_array_elements(p_value -> 'navigation' -> 'items')
        with ordinality selection(navigation, ordinality)
      where navigation ->> 'routeKey' <> 'cooperative_activities'
    ), '[]'::jsonb)
  );
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
security definer
set search_path = ''
as $$
declare
  upgraded jsonb := p_value;
  next_order integer;
begin
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'modules') module
    where module ->> 'key' = 'social_graph'
  ) then
    upgraded := jsonb_set(
      upgraded,
      '{modules}',
      upgraded -> 'modules' || jsonb_build_array(jsonb_build_object(
        'key', 'social_graph', 'enabled', true, 'label', 'Friends and parties'
      ))
    );
  end if;
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'modules') module
    where module ->> 'key' = 'cooperative_activities'
  ) then
    upgraded := jsonb_set(
      upgraded,
      '{modules}',
      upgraded -> 'modules' || jsonb_build_array(jsonb_build_object(
        'key', 'cooperative_activities', 'enabled', true, 'label', 'Cooperative activities'
      ))
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
    upgraded := jsonb_set(
      upgraded,
      '{navigation,items}',
      upgraded #> '{navigation,items}' || jsonb_build_array(jsonb_build_object(
        'routeKey', 'cooperative_activities',
        'moduleKey', 'cooperative_activities',
        'label', 'Activities',
        'icon', 'activities',
        'order', coalesce(next_order, 100),
        'group', 'Administration',
        'badgeLabel', null
      ))
    );
  end if;
  return upgraded;
end;
$$;

create or replace function private.upgrade_phase8db_platform_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_status = 'draft' then
    new.configuration := private.upgrade_phase8db_platform_configuration(new.configuration);
  end if;
  return new;
end;
$$;

create trigger platform_configuration_phase8db_draft_upgrade
before insert on public.game_platform_configuration_versions
for each row execute function private.upgrade_phase8db_platform_draft();

alter table public.game_platform_configuration_versions
  drop constraint game_platform_configuration_versions_configuration_check;
alter table public.game_platform_configuration_versions
  add constraint game_platform_configuration_versions_configuration_check
  check (private.valid_platform_configuration(configuration));

revoke all on function private.valid_platform_configuration_phase75(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase8db_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase8db_platform_draft()
  from public, anon, authenticated, service_role;
