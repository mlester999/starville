-- Starville Phase 7.5A final hosted validation repair.
-- Keep validation-result checking genuinely immutable for its CHECK constraints
-- by measuring the deterministic JSONB text representation instead of its
-- storage-dependent on-disk column representation.

begin;

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
  if jsonb_typeof(p_value) is distinct from 'object'
     or jsonb_typeof(p_value -> 'valid') is distinct from 'boolean'
     or jsonb_typeof(p_value -> 'checkedAt') is distinct from 'string'
     or jsonb_typeof(p_value -> 'issues') is distinct from 'array'
     then return false; end if;

  if jsonb_array_length(p_value -> 'issues') > 100
     or octet_length(p_value::text) > 65536
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

revoke all on function private.valid_world_asset_validation_results(jsonb)
  from public, anon, authenticated, service_role;

commit;
