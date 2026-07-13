-- Phase 6 extension: server-authoritative game maintenance and announcements.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('live_operations.read', 'Read live operations', 'View maintenance, announcements, and bounded audit history.', 'live_operations', false, true),
  ('live_operations.manage', 'Manage maintenance', 'Schedule, activate, and disable game maintenance.', 'live_operations', true, true),
  ('announcements.read', 'Read announcements', 'View announcement drafts and publication state.', 'live_operations', false, true),
  ('announcements.manage', 'Manage announcements', 'Create, publish, deactivate, and archive game announcements.', 'live_operations', true, true)
on conflict (key) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  is_sensitive = excluded.is_sensitive, is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('super_admin', 'live_operations.read'),
    ('super_admin', 'live_operations.manage'),
    ('super_admin', 'announcements.read'),
    ('super_admin', 'announcements.manage'),
    ('live_operations_manager', 'live_operations.read'),
    ('live_operations_manager', 'live_operations.manage'),
    ('live_operations_manager', 'announcements.read'),
    ('live_operations_manager', 'announcements.manage'),
    ('read_only_analyst', 'live_operations.read'),
    ('read_only_analyst', 'announcements.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

create table public.live_operations_maintenance (
  singleton_key boolean primary key default true check (singleton_key),
  enabled boolean not null default false,
  scheduled_start_at timestamptz,
  expected_end_at timestamptz,
  auto_disable_at_end boolean not null default false,
  title text not null default 'SERVER PAUSED' check (char_length(title) between 1 and 80 and title !~ '[[:cntrl:]<>]'),
  message text not null default E'Starville is temporarily unavailable for maintenance.\nPlease check back soon.' check (char_length(message) between 1 and 1000 and message !~ '[<>]'),
  update_details jsonb not null default '[]'::jsonb check (jsonb_typeof(update_details) = 'array' and jsonb_array_length(update_details) <= 10),
  expected_return_message text check (char_length(expected_return_message) between 1 and 240 and expected_return_message !~ '[[:cntrl:]<>]'),
  show_return_to_landing boolean not null default true,
  cta_label text check (char_length(cta_label) between 1 and 40 and cta_label !~ '[[:cntrl:]<>]'),
  cta_url text check (char_length(cta_url) between 1 and 500 and (cta_url = '/' or cta_url ~ '^/[^/]' or cta_url ~ '^https://')),
  internal_reason text not null default 'Initial disabled maintenance configuration' check (char_length(internal_reason) between 12 and 500 and internal_reason !~ '[[:cntrl:]<>]'),
  revision integer not null default 1 check (revision > 0),
  updated_by_admin_id uuid references public.admin_users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expected_end_at is null or scheduled_start_at is null or expected_end_at > scheduled_start_at),
  check ((cta_label is null) = (cta_url is null))
);

insert into public.live_operations_maintenance (singleton_key) values (true)
on conflict (singleton_key) do nothing;

create table public.game_announcements (
  id uuid primary key default gen_random_uuid(),
  internal_title text not null check (char_length(internal_title) between 1 and 100 and internal_title !~ '[[:cntrl:]<>]'),
  message text not null check (char_length(message) between 1 and 500 and message !~ '[<>]'),
  severity text not null check (severity in ('information', 'success', 'warning', 'critical')),
  presentation text not null check (presentation in ('ticker', 'banner')),
  priority integer not null default 0 check (priority between 0 and 1000),
  starts_at timestamptz,
  ends_at timestamptz,
  dismissible boolean not null default true,
  cta_label text check (char_length(cta_label) between 1 and 40 and cta_label !~ '[[:cntrl:]<>]'),
  cta_url text check (char_length(cta_url) between 1 and 500 and (cta_url = '/' or cta_url ~ '^/[^/]' or cta_url ~ '^https://')),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'published', 'deactivated', 'archived')),
  internal_reason text not null check (char_length(internal_reason) between 12 and 500 and internal_reason !~ '[[:cntrl:]<>]'),
  revision integer not null default 1 check (revision > 0),
  created_by_admin_id uuid not null references public.admin_users(user_id),
  updated_by_admin_id uuid not null references public.admin_users(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((cta_label is null) = (cta_url is null))
);

create table public.live_operations_audit_logs (
  id uuid primary key default gen_random_uuid(),
  event_key text not null check (event_key ~ '^live_operations\.[a-z_.]+$'),
  target_type text not null check (target_type in ('maintenance', 'announcement')),
  target_id uuid,
  actor_admin_user_id uuid not null references public.admin_users(user_id),
  admin_session_id uuid not null references public.admin_sessions(id),
  request_id text not null check (char_length(request_id) between 1 and 128),
  reason text not null check (char_length(reason) between 12 and 500 and reason !~ '[[:cntrl:]<>]'),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object'),
  created_at timestamptz not null default now()
);

create index game_announcements_active_idx on public.game_announcements
  (priority desc, starts_at desc, id desc)
  where lifecycle_status = 'published';
create index game_announcements_admin_idx on public.game_announcements
  (updated_at desc, id desc);
create index live_operations_audit_created_idx on public.live_operations_audit_logs
  (created_at desc, id desc);
create unique index live_operations_audit_request_idx on public.live_operations_audit_logs
  (request_id);

create or replace function private.reject_live_operations_audit_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'LIVE_OPERATIONS_AUDIT_IMMUTABLE';
end;
$$;

create trigger live_operations_audit_immutable
before update or delete on public.live_operations_audit_logs
for each row execute function private.reject_live_operations_audit_mutation();

alter table public.live_operations_maintenance enable row level security;
alter table public.live_operations_maintenance force row level security;
alter table public.game_announcements enable row level security;
alter table public.game_announcements force row level security;
alter table public.live_operations_audit_logs enable row level security;
alter table public.live_operations_audit_logs force row level security;
revoke all on table public.live_operations_maintenance from public, anon, authenticated, service_role;
revoke all on table public.game_announcements from public, anon, authenticated, service_role;
revoke all on table public.live_operations_audit_logs from public, anon, authenticated, service_role;

create or replace function private.live_operations_maintenance_state(config public.live_operations_maintenance)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when not config.enabled and config.revision = 1 then 'disabled'
    when not config.enabled then 'completed'
    when config.scheduled_start_at is not null and config.scheduled_start_at > now() then 'scheduled'
    when config.expected_end_at is not null and config.expected_end_at <= now() and config.auto_disable_at_end then 'completed'
    when config.expected_end_at is not null and config.expected_end_at <= now() then 'expired'
    else 'active'
  end;
$$;

create or replace function private.live_operations_maintenance_json(config public.live_operations_maintenance, include_private boolean)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'state', private.live_operations_maintenance_state(config),
    'active', private.live_operations_maintenance_state(config) in ('active', 'expired'),
    'revision', config.revision, 'title', config.title, 'message', config.message,
    'updateDetails', config.update_details, 'expectedEndAt', config.expected_end_at,
    'expectedReturnMessage', config.expected_return_message,
    'showReturnToLanding', config.show_return_to_landing,
    'ctaLabel', config.cta_label, 'ctaUrl', config.cta_url,
    'updatedAt', config.updated_at
  ) || case when include_private then jsonb_build_object(
    'enabled', config.enabled,
    'scheduledStartAt', config.scheduled_start_at,
    'autoDisableAtEnd', config.auto_disable_at_end,
    'internalReason', config.internal_reason,
    'updatedByAdminId', config.updated_by_admin_id
  ) else '{}'::jsonb end;
$$;

create or replace function private.live_operations_announcement_status(item public.game_announcements)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when item.lifecycle_status = 'draft' then 'draft'
    when item.lifecycle_status = 'deactivated' then 'deactivated'
    when item.lifecycle_status = 'archived' then 'archived'
    when item.starts_at is not null and item.starts_at > now() then 'scheduled'
    when item.ends_at is not null and item.ends_at <= now() then 'expired'
    else 'active'
  end;
$$;

create or replace function public.get_public_live_operations()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare config public.live_operations_maintenance%rowtype;
begin
  select * into strict config from public.live_operations_maintenance where singleton_key;
  return jsonb_build_object(
    'maintenance', private.live_operations_maintenance_json(config, false),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'revision', item.revision, 'message', item.message,
      'severity', item.severity, 'presentation', item.presentation,
      'priority', item.priority, 'dismissible', item.dismissible,
      'ctaLabel', item.cta_label, 'ctaUrl', item.cta_url,
      'startsAt', coalesce(item.starts_at, item.updated_at), 'endsAt', item.ends_at
    ) order by (item.severity='critical' and not item.dismissible) desc,
      item.priority desc, item.starts_at desc nulls last, item.id desc)
    from (
      select * from public.game_announcements source
      where private.live_operations_announcement_status(source) = 'active'
      order by (source.severity='critical' and not source.dismissible) desc,
        source.priority desc, source.starts_at desc nulls last, source.id desc
      limit 10
    ) item), '[]'::jsonb),
    'generatedAt', now()
  );
exception when others then
  return jsonb_build_object(
    'maintenance', jsonb_build_object(
      'state', 'configuration_error', 'active', true, 'revision', 0,
      'title', 'SERVER PAUSED',
      'message', E'Starville is temporarily unavailable for maintenance.\nPlease check back soon.',
      'updateDetails', '[]'::jsonb, 'expectedEndAt', null,
      'expectedReturnMessage', null, 'showReturnToLanding', true,
      'ctaLabel', null, 'ctaUrl', null, 'updatedAt', now()
    ), 'announcements', '[]'::jsonb, 'generatedAt', now()
  );
end;
$$;

create or replace function public.get_admin_live_operations(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_search text, p_status text, p_severity text, p_presentation text,
  p_sort text, p_direction text, p_page integer, p_page_size integer,
  p_audit_page integer, p_audit_page_size integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare config public.live_operations_maintenance%rowtype; announcement_total integer; audit_total integer;
begin
  perform private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'live_operations.read');
  perform private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'announcements.read');
  if p_status not in ('all','draft','scheduled','active','expired','deactivated','archived')
     or p_severity not in ('all','information','success','warning','critical')
     or p_presentation not in ('all','ticker','banner')
     or p_sort not in ('updated_at','priority','starts_at','internal_title')
     or p_direction not in ('asc','desc')
     or p_page < 1 or p_page_size not between 1 and 100
     or p_audit_page < 1 or p_audit_page_size not between 1 and 100 then
    raise exception using errcode = '22023', message = 'INVALID_LIVE_OPERATIONS_QUERY';
  end if;
  select * into strict config from public.live_operations_maintenance where singleton_key;
  select count(*)::integer into announcement_total from public.game_announcements item
  where (p_search = '' or position(lower(p_search) in lower(item.internal_title || ' ' || item.message)) > 0)
    and (p_status = 'all' or private.live_operations_announcement_status(item) = p_status)
    and (p_severity = 'all' or item.severity = p_severity)
    and (p_presentation = 'all' or item.presentation = p_presentation);
  select count(*)::integer into audit_total from public.live_operations_audit_logs;
  return jsonb_build_object(
    'maintenance', private.live_operations_maintenance_json(config, true),
    'announcements', coalesce((select jsonb_agg(jsonb_build_object(
      'id', item.id, 'revision', item.revision, 'internalTitle', item.internal_title,
      'message', item.message, 'severity', item.severity, 'presentation', item.presentation,
      'priority', item.priority, 'startsAt', item.starts_at, 'endsAt', item.ends_at,
      'dismissible', item.dismissible, 'ctaLabel', item.cta_label, 'ctaUrl', item.cta_url,
      'lifecycleStatus', item.lifecycle_status,
      'effectiveStatus', private.live_operations_announcement_status(item),
      'internalReason', item.internal_reason, 'createdByAdminId', item.created_by_admin_id,
      'updatedByAdminId', item.updated_by_admin_id, 'createdAt', item.created_at, 'updatedAt', item.updated_at
    ) order by item.updated_at desc, item.id desc) from (
      select * from public.game_announcements source
      where (p_search = '' or position(lower(p_search) in lower(source.internal_title || ' ' || source.message)) > 0)
        and (p_status = 'all' or private.live_operations_announcement_status(source) = p_status)
        and (p_severity = 'all' or source.severity = p_severity)
        and (p_presentation = 'all' or source.presentation = p_presentation)
      order by
        case when p_sort='updated_at' and p_direction='asc' then source.updated_at end asc,
        case when p_sort='updated_at' and p_direction='desc' then source.updated_at end desc,
        case when p_sort='priority' and p_direction='asc' then source.priority end asc,
        case when p_sort='priority' and p_direction='desc' then source.priority end desc,
        case when p_sort='starts_at' and p_direction='asc' then source.starts_at end asc nulls last,
        case when p_sort='starts_at' and p_direction='desc' then source.starts_at end desc nulls last,
        case when p_sort='internal_title' and p_direction='asc' then lower(source.internal_title) end asc,
        case when p_sort='internal_title' and p_direction='desc' then lower(source.internal_title) end desc,
        source.id desc limit p_page_size offset ((p_page - 1) * p_page_size)
    ) item), '[]'::jsonb),
    'announcementPage', p_page, 'announcementPageSize', p_page_size,
    'announcementTotal', announcement_total,
    'announcementTotalPages', ceil(announcement_total::numeric / p_page_size)::integer,
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'id', audit.id, 'event', audit.event_key, 'targetType', audit.target_type,
      'targetId', audit.target_id, 'actorAdminUserId', audit.actor_admin_user_id,
      'requestId', audit.request_id, 'reason', audit.reason,
      'beforeState', audit.before_state, 'afterState', audit.after_state, 'createdAt', audit.created_at
    ) order by audit.created_at desc, audit.id desc) from (
      select * from public.live_operations_audit_logs source order by source.created_at desc, source.id desc
      limit p_audit_page_size offset ((p_audit_page - 1) * p_audit_page_size)
    ) audit), '[]'::jsonb),
    'auditPage', p_audit_page, 'auditPageSize', p_audit_page_size, 'auditTotal', audit_total,
    'auditTotalPages', ceil(audit_total::numeric / p_audit_page_size)::integer
  );
end;
$$;

create or replace function public.update_admin_maintenance(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_input jsonb, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session_id uuid; current_config public.live_operations_maintenance%rowtype; updated public.live_operations_maintenance%rowtype;
begin
  session_id := private.assert_verified_admin_permission(p_user_id, p_auth_session_id, p_assurance_level, 'live_operations.manage');
  select * into strict current_config from public.live_operations_maintenance where singleton_key for update;
  if (p_input->>'expectedRevision')::integer <> current_config.revision then return jsonb_build_object('status','version_conflict'); end if;
  if coalesce((p_input->>'enabled')::boolean,false)
     and (nullif(p_input->>'scheduledStartAt','') is null
       or nullif(p_input->>'scheduledStartAt','')::timestamptz <= now())
     and p_input->>'confirmation' <> 'MAINTENANCE' then
    raise exception using errcode='22023', message='MAINTENANCE_CONFIRMATION_REQUIRED';
  end if;
  update public.live_operations_maintenance set
    enabled=(p_input->>'enabled')::boolean,
    scheduled_start_at=nullif(p_input->>'scheduledStartAt','')::timestamptz,
    expected_end_at=nullif(p_input->>'expectedEndAt','')::timestamptz,
    auto_disable_at_end=coalesce((p_input->>'autoDisableAtEnd')::boolean,false),
    title=p_input->>'title', message=p_input->>'message', update_details=coalesce(p_input->'updateDetails','[]'::jsonb),
    expected_return_message=nullif(p_input->>'expectedReturnMessage',''),
    show_return_to_landing=coalesce((p_input->>'showReturnToLanding')::boolean,true),
    cta_label=nullif(p_input->>'ctaLabel',''), cta_url=nullif(p_input->>'ctaUrl',''),
    internal_reason=p_input->>'reason', revision=revision+1, updated_by_admin_id=p_user_id, updated_at=now()
  where singleton_key returning * into updated;
  insert into public.live_operations_audit_logs
    (event_key,target_type,actor_admin_user_id,admin_session_id,request_id,reason,before_state,after_state)
  values (case when updated.enabled then 'live_operations.maintenance.updated' else 'live_operations.maintenance.disabled' end,
    'maintenance',p_user_id,session_id,p_request_id,updated.internal_reason,
    private.live_operations_maintenance_json(current_config,false),private.live_operations_maintenance_json(updated,false));
  return jsonb_build_object('status','updated','revision',updated.revision);
end;
$$;

create or replace function public.save_admin_announcement(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_input jsonb, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session_id uuid; target public.game_announcements%rowtype; previous jsonb := '{}'::jsonb; target_id uuid;
begin
  session_id := private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'announcements.manage');
  target_id := nullif(p_input->>'id','')::uuid;
  if target_id is null then
    insert into public.game_announcements
      (internal_title,message,severity,presentation,priority,starts_at,ends_at,dismissible,cta_label,cta_url,internal_reason,created_by_admin_id,updated_by_admin_id)
    values (p_input->>'internalTitle',p_input->>'message',p_input->>'severity',p_input->>'presentation',
      (p_input->>'priority')::integer,nullif(p_input->>'startsAt','')::timestamptz,nullif(p_input->>'endsAt','')::timestamptz,
      (p_input->>'dismissible')::boolean,nullif(p_input->>'ctaLabel',''),nullif(p_input->>'ctaUrl',''),p_input->>'reason',p_user_id,p_user_id)
    returning * into target;
  else
    select * into strict target from public.game_announcements where id=target_id for update;
    if (p_input->>'expectedRevision')::integer <> target.revision or target.lifecycle_status <> 'draft' then
      return jsonb_build_object('status','version_conflict');
    end if;
    previous := to_jsonb(target) - array['internal_reason','created_by_admin_id','updated_by_admin_id'];
    update public.game_announcements set internal_title=p_input->>'internalTitle',message=p_input->>'message',
      severity=p_input->>'severity',presentation=p_input->>'presentation',priority=(p_input->>'priority')::integer,
      starts_at=nullif(p_input->>'startsAt','')::timestamptz,ends_at=nullif(p_input->>'endsAt','')::timestamptz,
      dismissible=(p_input->>'dismissible')::boolean,cta_label=nullif(p_input->>'ctaLabel',''),cta_url=nullif(p_input->>'ctaUrl',''),
      internal_reason=p_input->>'reason',revision=revision+1,updated_by_admin_id=p_user_id,updated_at=now()
    where id=target_id returning * into target;
  end if;
  insert into public.live_operations_audit_logs
    (event_key,target_type,target_id,actor_admin_user_id,admin_session_id,request_id,reason,before_state,after_state)
  values ('live_operations.announcement.saved','announcement',target.id,p_user_id,session_id,p_request_id,target.internal_reason,
    previous,to_jsonb(target)-array['internal_reason','created_by_admin_id','updated_by_admin_id']);
  return jsonb_build_object('status','saved','id',target.id,'revision',target.revision);
end;
$$;

create or replace function public.set_admin_announcement_status(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_announcement_id uuid, p_expected_revision integer, p_action text, p_reason text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session_id uuid; target public.game_announcements%rowtype; previous jsonb; next_status text;
begin
  session_id := private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'announcements.manage');
  if p_action not in ('publish','deactivate','archive') then raise exception using errcode='22023',message='INVALID_ANNOUNCEMENT_ACTION'; end if;
  select * into strict target from public.game_announcements where id=p_announcement_id for update;
  if target.revision <> p_expected_revision then return jsonb_build_object('status','version_conflict'); end if;
  if (p_action='publish' and target.lifecycle_status not in ('draft','deactivated'))
     or (p_action='deactivate' and target.lifecycle_status <> 'published')
     or (p_action='archive' and target.lifecycle_status = 'archived') then
    return jsonb_build_object('status','version_conflict');
  end if;
  next_status := case p_action when 'publish' then 'published' when 'deactivate' then 'deactivated' else 'archived' end;
  previous := to_jsonb(target)-array['internal_reason','created_by_admin_id','updated_by_admin_id'];
  update public.game_announcements set lifecycle_status=next_status,
    starts_at=case when p_action='publish' then coalesce(starts_at,now()) else starts_at end,
    internal_reason=p_reason,revision=revision+1,updated_by_admin_id=p_user_id,updated_at=now()
  where id=target.id returning * into target;
  insert into public.live_operations_audit_logs
    (event_key,target_type,target_id,actor_admin_user_id,admin_session_id,request_id,reason,before_state,after_state)
  values ('live_operations.announcement.'||p_action,'announcement',target.id,p_user_id,session_id,p_request_id,p_reason,
    previous,to_jsonb(target)-array['internal_reason','created_by_admin_id','updated_by_admin_id']);
  return jsonb_build_object('status','updated','id',target.id,'revision',target.revision);
end;
$$;

revoke all on function private.live_operations_maintenance_state(public.live_operations_maintenance) from public,anon,authenticated,service_role;
revoke all on function private.live_operations_maintenance_json(public.live_operations_maintenance,boolean) from public,anon,authenticated,service_role;
revoke all on function private.live_operations_announcement_status(public.game_announcements) from public,anon,authenticated,service_role;
revoke all on function private.reject_live_operations_audit_mutation() from public,anon,authenticated,service_role;
revoke all on function public.get_public_live_operations() from public,anon,authenticated,service_role;
revoke all on function public.get_admin_live_operations(uuid,uuid,text,text,text,text,text,text,text,integer,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.update_admin_maintenance(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.save_admin_announcement(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.set_admin_announcement_status(uuid,uuid,text,uuid,integer,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.get_public_live_operations() to service_role;
grant execute on function public.get_admin_live_operations(uuid,uuid,text,text,text,text,text,text,text,integer,integer,integer,integer) to service_role;
grant execute on function public.update_admin_maintenance(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.save_admin_announcement(uuid,uuid,text,jsonb,text) to service_role;
grant execute on function public.set_admin_announcement_status(uuid,uuid,text,uuid,integer,text,text,text) to service_role;
