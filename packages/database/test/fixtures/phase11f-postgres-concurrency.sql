\set ON_ERROR_STOP on

begin;

do $$
declare
  owner_wallet constant text:=repeat('2',30)||'55';
  owner_id uuid; home_id uuid; access_id uuid; session_id uuid;
  home_version integer; settings_revision integer; config_id uuid; config_revision integer;
  profile_row record; result jsonb;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values(owner_wallet,'P11F Race Owner','moss','lantern-square','79000000-0000-4000-8000-000000000001',19,8,'north');
  for profile_row in select value from generate_series(31,39) value union all select 41 union all select 42 loop
    insert into public.player_profiles(
      wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
      safe_position_x,safe_position_y,facing_direction
    ) values(
      repeat('2',30)||profile_row.value::text,'P11F Race '||profile_row.value::text,'moonberry',
      'lantern-square','79000000-0000-4000-8000-000000000001',12,10,'south'
    );
  end loop;
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  perform public.bootstrap_player_cozy_gameplay(owner_wallet,'phase11f-race-owner-bootstrap','phase11f:race:bootstrap');
  select id,state_version into strict home_id,home_version from public.player_homes where player_profile_id=owner_id;
  result:=public.enter_player_home(owner_wallet,home_version,'phase11f-race-owner-enter','phase11f:race:enter');
  if result->>'status'<>'updated' then raise exception 'phase11f race owner could not enter: %',result; end if;

  select config.id,config.config_version into strict config_id,config_revision
  from public.token_gate_configs config where config.environment_key='development' and config.network='solana:devnet';
  insert into public.wallet_auth_challenges(
    id,wallet_address,network,token_gate_config_id,config_version_snapshot,nonce_hash,message_hash,
    domain,uri,issued_at,expires_at,request_id,ip_hash
  ) values(
    'f1100000-0000-4000-8000-000000000200',owner_wallet,'solana:devnet',config_id,config_revision,
    repeat('f',63)||'2',repeat('f',63)||'3','localhost','http://localhost:3001',now(),now()+interval '5 minutes',
    'phase11f:race:challenge',repeat('f',63)||'4'
  );
  insert into public.wallet_access_sessions(
    id,challenge_id,wallet_address,network,token_gate_config_id,config_version_snapshot,session_token_hash,
    status,observed_balance_raw,required_balance_raw,checked_slot,last_balance_check_at,expires_at
  ) values(
    'f1100000-0000-4000-8000-000000000201','f1100000-0000-4000-8000-000000000200',owner_wallet,
    'solana:devnet',config_id,config_revision,repeat('f',63)||'1','active',1000,1000,1,now(),now()+interval '30 minutes'
  ) returning id into access_id;
  insert into public.cozy_private_realtime_sessions(
    wallet_access_session_id,player_profile_id,player_home_id,connection_id
  ) values(access_id,owner_id,home_id,'phase11f-race-owner-private-home');

  perform public.get_player_home_visit_workspace(owner_wallet,'phase11f:race:workspace');
  select configuration_revision into strict settings_revision from public.home_social_settings where player_home_id=home_id;
  result:=public.update_player_home_social_settings(
    owner_wallet,home_id,'public','view_only',true,true,true,true,true,false,true,true,false,
    settings_revision,'phase11f-race-settings','phase11f:race:settings'
  );
  settings_revision:=(result#>>'{settings,configurationRevision}')::integer;
  result:=public.start_player_home_visit_session(
    owner_wallet,home_id,settings_revision,'phase11f-race-start','phase11f:race:start'
  );
  session_id:=(result#>>'{session,id}')::uuid;
  if session_id is null then raise exception 'phase11f race session did not start: %',result; end if;

  insert into public.home_visit_participants(
    visit_session_id,player_home_id,player_profile_id,role,interaction_mode_snapshot,
    capability_snapshot,return_destination,position_x,position_y,facing_direction
  ) select session_id,home_id,profile.id,'visitor','view_only',private.home_visit_capabilities('view_only'),
    jsonb_build_object('mapId','lantern-square','x',12,'y',10,'facingDirection','south'),
    2+(row_number() over(order by profile.id)%3),2+(row_number() over(order by profile.id)/3),'south'
  from public.player_profiles profile where profile.display_name ~ '^P11F Race 3[1-9]$';
  update public.home_visit_sessions set current_visitor_count=9,configuration_revision=2 where id=session_id;
end;
$$;

commit;

select 'Phase 11F final-slot concurrency setup passed' as result;
