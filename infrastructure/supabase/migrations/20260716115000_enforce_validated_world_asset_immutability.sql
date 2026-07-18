-- Keep a validated world-asset version input-only and immutable while retaining
-- the existing reviewed lifecycle transitions. This is forward-only because the
-- original draft RPC has already been applied to hosted environments.

create or replace function private.protect_validated_world_asset_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.lifecycle_status <> 'validated' then
    return new;
  end if;

  -- Trusted archival is an existing lifecycle transition guarded by its RPC.
  if coalesce(current_setting('starville.asset_lifecycle_transition', true), '') = 'true' then
    return new;
  end if;

  -- Human-review submission intentionally records only submission evidence and
  -- advances the validated candidate. It must not change artwork/configuration.
  if new.lifecycle_status = 'in_review'
     and new.submitted_by_admin_id is not null
     and new.submitted_at is not null
     and (to_jsonb(new) - array[
       'lifecycle_status', 'submitted_by_admin_id', 'submitted_at',
       'edit_version', 'updated_at'
     ]) is not distinct from
     (to_jsonb(old) - array[
       'lifecycle_status', 'submitted_by_admin_id', 'submitted_at',
       'edit_version', 'updated_at'
     ]) then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'ASSET_VALIDATED_VERSION_IMMUTABLE';
end;
$$;

drop trigger if exists world_asset_versions_protect_validated
  on public.world_asset_versions;
create trigger world_asset_versions_protect_validated
before update on public.world_asset_versions
for each row execute function private.protect_validated_world_asset_version();

revoke all on function private.protect_validated_world_asset_version() from public;

comment on function private.protect_validated_world_asset_version() is
  'Rejects configuration changes to validated asset versions while allowing evidence-only review submission and trusted lifecycle archival.';
