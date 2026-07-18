-- Starville Phase 10A: additive avatar customization platform module.
-- Historical 15/17-module published configurations remain valid. Only future
-- draft inserts are upgraded; the active published configuration is untouched.

alter function private.valid_platform_configuration(jsonb)
  rename to valid_platform_configuration_phase8db;

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
  module_count integer;
  normalized jsonb;
  element_index integer;
begin
  if jsonb_typeof(p_value) is distinct from 'object'
     or jsonb_typeof(p_value -> 'modules') is distinct from 'array'
     or jsonb_typeof(p_value -> 'navigation' -> 'items') is distinct from 'array' then
    return false;
  end if;
  module_count := jsonb_array_length(p_value -> 'modules');
  if module_count in (15, 17) then
    return private.valid_platform_configuration_phase8db(p_value);
  end if;
  if module_count <> 18
     or (select count(*) from jsonb_array_elements(p_value -> 'modules') module
         where module ->> 'key' = 'avatar_customization') <> 1
     or exists (
       select 1 from jsonb_array_elements(p_value -> 'modules') module
       where module ->> 'key' = 'avatar_customization' and (
         jsonb_typeof(module -> 'enabled') is distinct from 'boolean'
         or char_length(coalesce(module ->> 'label', '')) not between 1 and 60
         or module ->> 'label' ~ '[[:cntrl:]<>]'
         or (select count(*) from jsonb_object_keys(module)) <> 3
       )
     ) then
    return false;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' = 'avatar_customization' and module ->> 'enabled' = 'true'
  ) and exists (
    select 1 from unnest(array[
      'players', 'world_assets', 'content_management', 'audit'
    ]::text[]) dependency(key)
    where not exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = dependency.key and module ->> 'enabled' = 'true'
    )
  ) then return false; end if;

  if (
    select count(*) from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'avatar_content'
  ) > 1 or exists (
    select 1 from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'avatar_content' and (
      navigation ->> 'moduleKey' is distinct from 'avatar_customization'
      or navigation ->> 'icon' is distinct from 'players'
      or navigation ->> 'group' is distinct from 'World Management'
      or char_length(coalesce(navigation ->> 'label', '')) not between 1 and 40
      or navigation ->> 'label' ~ '[[:cntrl:]<>]'
      or jsonb_typeof(navigation -> 'order') is distinct from 'number'
      or (navigation ->> 'order')::integer not between 0 and 100
      or jsonb_typeof(navigation -> 'badgeLabel') is distinct from 'null'
      or (select count(*) from jsonb_object_keys(navigation)) <> 7
    )
  ) then return false; end if;

  normalized := p_value;
  element_index := jsonb_array_length(normalized -> 'modules') - 1;
  while element_index >= 0 loop
    if normalized -> 'modules' -> element_index ->> 'key' = 'avatar_customization' then
      normalized := jsonb_set(
        normalized, '{modules}', (normalized -> 'modules') - element_index
      );
    end if;
    element_index := element_index - 1;
  end loop;
  element_index := jsonb_array_length(normalized -> 'navigation' -> 'items') - 1;
  while element_index >= 0 loop
    if normalized -> 'navigation' -> 'items' -> element_index ->> 'routeKey'
       = 'avatar_content' then
      normalized := jsonb_set(
        normalized, '{navigation,items}',
        (normalized -> 'navigation' -> 'items') - element_index
      );
    end if;
    element_index := element_index - 1;
  end loop;
  return private.valid_platform_configuration_phase8db(normalized);
exception when others then
  return false;
end;
$$;

create or replace function private.upgrade_phase10a_platform_configuration(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare
  upgraded jsonb := private.upgrade_phase8db_platform_configuration(p_value);
  navigation_order integer;
begin
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'modules') module
    where module ->> 'key' = 'avatar_customization'
  ) then
    upgraded := jsonb_set(
      upgraded,
      '{modules}',
      upgraded -> 'modules' ||
        '{"key":"avatar_customization","enabled":true,"label":"Avatar customization"}'::jsonb
    );
  end if;
  if not exists (
    select 1 from jsonb_array_elements(upgraded -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' = 'avatar_content'
  ) then
    select candidate into navigation_order
    from generate_series(65, 100) candidate
    where not exists (
      select 1 from jsonb_array_elements(upgraded -> 'navigation' -> 'items') navigation
      where (navigation ->> 'order')::integer = candidate
    )
    order by candidate
    limit 1;
    if navigation_order is null then
      raise exception using errcode = '22023', message = 'PLATFORM_NAVIGATION_ORDER_UNAVAILABLE';
    end if;
    upgraded := jsonb_set(
      upgraded,
      '{navigation,items}',
      upgraded #> '{navigation,items}' || jsonb_set(
        '{"routeKey":"avatar_content","moduleKey":"avatar_customization","label":"Avatar Content","icon":"players","order":65,"group":"World Management","badgeLabel":null}'::jsonb,
        '{order}',
        (navigation_order::text)::jsonb
      )
    );
  end if;
  return upgraded;
end;
$$;

create or replace function private.upgrade_phase10a_platform_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_status = 'draft' then
    new.configuration := private.upgrade_phase10a_platform_configuration(new.configuration);
  end if;
  return new;
end;
$$;

create trigger platform_configuration_phase10a_draft_upgrade
before insert on public.game_platform_configuration_versions
for each row execute function private.upgrade_phase10a_platform_draft();

alter table public.game_platform_configuration_versions
  drop constraint game_platform_configuration_versions_configuration_check;
alter table public.game_platform_configuration_versions
  add constraint game_platform_configuration_versions_configuration_check
  check (private.valid_platform_configuration(configuration));

revoke all on function private.valid_platform_configuration_phase8db(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase10a_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase10a_platform_draft()
  from public, anon, authenticated, service_role;
