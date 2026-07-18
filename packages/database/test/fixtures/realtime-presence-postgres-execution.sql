do $$
declare channel_total integer;
declare result jsonb;
begin
  select count(*) into channel_total from public.realtime_channels;
  if channel_total <> (select count(*) * 3 from public.world_maps where status = 'active') then
    raise exception 'realtime channel seed count mismatch';
  end if;
  if exists (
    select 1 from public.admin_role_permissions mapping
    join public.admin_roles role on role.id = mapping.role_id
    join public.admin_permissions permission on permission.id = mapping.permission_id
    where role.key = 'read_only_analyst'
      and permission.key !~ '\.(read|inspect)$'
  ) then raise exception 'Read-only Analyst received a non-read permission'; end if;
  result := public.admit_player_realtime_ticket(
    repeat('0', 64), 'fixture-connection', 'fixture-request'
  );
  if result ->> 'status' <> 'invalid_ticket' then
    raise exception 'invalid realtime ticket was not rejected';
  end if;
  if has_table_privilege('service_role', 'public.realtime_sessions', 'update') then
    raise exception 'service role has direct realtime session mutation';
  end if;
  if not has_function_privilege(
    'service_role', 'public.admit_player_realtime_ticket(text,text,text)', 'execute'
  ) then raise exception 'service role cannot call narrow realtime admission RPC'; end if;
end;
$$;

select 'realtime-presence execution assertions passed' as result;
