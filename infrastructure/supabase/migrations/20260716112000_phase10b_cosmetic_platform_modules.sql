-- Starville Phase 10B: additive future-draft platform modules. Historical
-- active configurations remain valid and untouched. The cosmetic shop is
-- structurally disabled; no configuration can enable it in this phase.

alter function private.valid_platform_configuration(jsonb)
  rename to valid_platform_configuration_phase10a;

create or replace function private.valid_platform_configuration(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare module_count integer;
declare normalized jsonb := p_value;
declare element_index integer;
begin
  if jsonb_typeof(p_value) is distinct from 'object'
     or jsonb_typeof(p_value -> 'modules') is distinct from 'array' then return false; end if;
  module_count := jsonb_array_length(p_value -> 'modules');
  if module_count in (15, 17, 18) then
    return private.valid_platform_configuration_phase10a(p_value);
  end if;
  if module_count <> 22 then return false; end if;
  if exists (
    select 1 from unnest(array[
      'wardrobe', 'emotes', 'cosmetic_collections', 'cosmetic_shop'
    ]::text[]) required(key)
    where (select count(*) from jsonb_array_elements(p_value -> 'modules') module
           where module ->> 'key' = required.key) <> 1
  ) or exists (
    select 1 from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' in (
      'wardrobe', 'emotes', 'cosmetic_collections', 'cosmetic_shop'
    ) and (
      jsonb_typeof(module -> 'enabled') is distinct from 'boolean'
      or char_length(coalesce(module ->> 'label', '')) not between 1 and 60
      or module ->> 'label' ~ '[[:cntrl:]<>]'
      or (select count(*) from jsonb_object_keys(module)) <> 3
    )
  ) or exists (
    select 1 from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' = 'cosmetic_shop' and module ->> 'enabled' <> 'false'
  ) then return false; end if;

  if exists (
    select 1 from unnest(array[
      'wardrobe', 'emotes', 'cosmetic_collections'
    ]::text[]) enabled_module(key)
    where exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = enabled_module.key and module ->> 'enabled' = 'true'
    ) and not exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = 'avatar_customization' and module ->> 'enabled' = 'true'
    )
  ) or (
    exists (select 1 from jsonb_array_elements(p_value -> 'modules') module
            where module ->> 'key' = 'cosmetic_collections' and module ->> 'enabled' = 'true')
    and not exists (select 1 from jsonb_array_elements(p_value -> 'modules') module
                    where module ->> 'key' = 'wardrobe' and module ->> 'enabled' = 'true')
  ) then return false; end if;

  element_index := jsonb_array_length(normalized -> 'modules') - 1;
  while element_index >= 0 loop
    if normalized -> 'modules' -> element_index ->> 'key' in (
      'wardrobe', 'emotes', 'cosmetic_collections', 'cosmetic_shop'
    ) then
      normalized := jsonb_set(
        normalized, '{modules}', (normalized -> 'modules') - element_index
      );
    end if;
    element_index := element_index - 1;
  end loop;
  return private.valid_platform_configuration_phase10a(normalized);
exception when others then return false;
end;
$$;

create or replace function private.upgrade_phase10b_platform_configuration(p_value jsonb)
returns jsonb
language plpgsql
immutable
strict
parallel unsafe
security definer
set search_path = ''
as $$
declare upgraded jsonb := private.upgrade_phase10a_platform_configuration(p_value);
declare module jsonb;
begin
  for module in select * from jsonb_array_elements('[
    {"key":"wardrobe","enabled":true,"label":"Wardrobe and outfits"},
    {"key":"emotes","enabled":true,"label":"Realtime emotes"},
    {"key":"cosmetic_collections","enabled":true,"label":"Cosmetic collections"},
    {"key":"cosmetic_shop","enabled":false,"label":"DUST cosmetic shop"}
  ]'::jsonb) loop
    if not exists (
      select 1 from jsonb_array_elements(upgraded -> 'modules') existing
      where existing ->> 'key' = module ->> 'key'
    ) then
      upgraded := jsonb_set(upgraded, '{modules}', upgraded -> 'modules' || module);
    end if;
  end loop;
  return upgraded;
end;
$$;

create or replace function private.upgrade_phase10b_platform_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lifecycle_status = 'draft' then
    new.configuration := private.upgrade_phase10b_platform_configuration(new.configuration);
  end if;
  return new;
end;
$$;

create trigger platform_configuration_phase10b_draft_upgrade
before insert on public.game_platform_configuration_versions
for each row execute function private.upgrade_phase10b_platform_draft();

alter table public.game_platform_configuration_versions
  drop constraint game_platform_configuration_versions_configuration_check;
alter table public.game_platform_configuration_versions
  add constraint game_platform_configuration_versions_configuration_check
  check (private.valid_platform_configuration(configuration));

revoke all on function private.valid_platform_configuration_phase10a(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase10b_platform_configuration(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.upgrade_phase10b_platform_draft()
  from public, anon, authenticated, service_role;
