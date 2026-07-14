-- Starville Phase 7.5A corrective migration: align asset-audit access with
-- the established read-only permission suffix without changing permission IDs.

begin;

-- Permission keys may contain bounded namespace segments while retaining the
-- lowercase dot-separated convention and the final action segment.
alter table public.admin_permissions
  drop constraint if exists admin_permissions_key_check;
alter table public.admin_permissions
  add constraint admin_permissions_key_check
  check (key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$') not valid;
alter table public.admin_permissions
  validate constraint admin_permissions_key_check;

-- Asset audit evidence can record the corrected read permission if a future
-- audited operation needs it. Existing append-only events remain untouched.
alter table public.world_asset_audit_events
  drop constraint if exists world_asset_audit_events_permission_key_check;
alter table public.world_asset_audit_events
  add constraint world_asset_audit_events_permission_key_check
  check (
    permission_key ~ '^assets\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    or permission_key = 'maps.edit'
  ) not valid;
alter table public.world_asset_audit_events
  validate constraint world_asset_audit_events_permission_key_check;

do $$
begin
  if exists (
    select 1 from public.admin_permissions where key = 'assets.audit_read'
  ) and exists (
    select 1 from public.admin_permissions where key = 'assets.audit.read'
  ) then
    raise exception using
      errcode = '23505',
      message = 'Both legacy and corrected asset-audit permissions exist';
  end if;
end;
$$;

-- The system-catalog trigger correctly blocks runtime key changes. Disable it
-- only for this reviewed migration transaction so the deployed row is renamed
-- in place. admin_role_permissions continues to reference the same UUID.
alter table public.admin_permissions
  disable trigger admin_permissions_protect_system;

update public.admin_permissions
set key = 'assets.audit.read'
where key = 'assets.audit_read';

alter table public.admin_permissions
  enable trigger admin_permissions_protect_system;

do $$
begin
  if not exists (
    select 1
    from public.admin_permissions
    where key = 'assets.audit.read' and is_system
  ) or exists (
    select 1 from public.admin_permissions where key = 'assets.audit_read'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Asset-audit permission correction did not converge';
  end if;
end;
$$;

commit;
