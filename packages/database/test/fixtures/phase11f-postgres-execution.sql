\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11f_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11F_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase11f_assert(
  (select count(*)=11 from public.admin_permissions where key like 'home_visits.%')
  and exists(select 1 from public.home_visit_policy_versions where status='active')
  and exists(select 1 from public.home_visit_active_policy),
  'the bounded permission catalog and active immutable visit policy exist'
);

select pg_temp.phase11f_assert(
  (select provolatile='v' from pg_catalog.pg_proc where oid='private.home_visit_workspace_json(uuid)'::regprocedure)
  and (select provolatile='i' from pg_catalog.pg_proc where oid='private.home_visit_capabilities(text)'::regprocedure)
  and (select bool_and(procedure.provolatile='s')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='private' and procedure.proname in (
      'home_visit_safe_profile','home_visit_policy_json',
      'home_visit_session_json','home_visit_participant_json','home_visit_settings_json',
      'home_visit_realtime_snapshot'
    ))
  and (select bool_and(procedure.provolatile='v')
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public' and procedure.proname in (
      'get_player_home_visit_workspace','update_player_home_social_settings',
      'start_player_home_visit_session','set_player_home_visit_admissions',
      'stop_player_home_visit_session','create_player_home_visit_invitation',
      'revoke_player_home_visit_invitation','join_player_home_visit',
      'leave_player_home_visit','perform_player_home_visit_interaction',
      'write_player_home_guestbook_entry','change_player_home_appreciation',
      'help_water_player_home_crop','moderate_player_home_visitor',
      'report_player_home_visit','moderate_player_home_guestbook_entry',
      'issue_player_home_visit_realtime_ticket','admit_player_home_visit_realtime_ticket',
      'checkpoint_player_home_visit_movement','revalidate_player_home_visit_realtime_session',
      'close_player_home_visit_realtime_session','get_admin_home_visit_workspace',
      'transition_admin_home_visit_report',
      'create_admin_home_visit_policy_successor','transition_admin_home_visit_policy',
      'close_admin_home_visit_session','moderate_admin_home_guestbook_entry',
      'request_admin_home_visit_reconciliation','run_home_visit_maintenance'
    )),
  'function volatility matches reads, time, rate limits, lazy initialization, and mutations'
);

select pg_temp.phase11f_assert(
  (select bool_and(relrowsecurity and relforcerowsecurity)
    from pg_catalog.pg_class relation
    join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
    where namespace.nspname='public' and relation.relname in (
      'home_social_settings','home_visit_sessions','home_visit_participants',
      'home_visit_invitations','home_visit_events','home_visit_seats',
      'home_visit_photo_participants','home_guestbook_entries','home_appreciations',
      'home_helper_actions','home_visit_reports','home_visit_realtime_tickets',
      'home_visit_realtime_sessions','home_visit_idempotency','home_visit_rate_limits',
      'home_visit_audit_events','home_visit_reconciliation_runs','home_visit_telemetry_events'
    ))
  and not has_table_privilege('authenticated','public.home_visit_sessions','select')
  and not has_table_privilege('service_role','public.home_visit_sessions','insert')
  and has_function_privilege('service_role','public.join_player_home_visit(text,uuid,uuid,integer,text,text)','execute'),
  'visit state is RLS fail-closed and reachable only through narrow RPCs'
);

do $$
declare
  owner_wallet constant text:='11111111111111111111111111112211';
  friend_wallet constant text:='11111111111111111111111111112212';
  invitee_wallet constant text:='11111111111111111111111111112213';
  blocked_wallet constant text:='11111111111111111111111111112214';
  owner_id uuid; friend_id uuid; invitee_id uuid; blocked_id uuid;
  home_id uuid; access_id uuid; session_id uuid; participant_id uuid; crop_id uuid; tile_id uuid;
  home_version integer; settings_revision integer; session_revision integer; participant_revision integer;
  crop_version integer; tile_version integer; guestbook_version integer;
  config_id uuid; config_version integer; result jsonb; replay jsonb; invitation_id uuid;
  owner_dust_before numeric; friend_dust_before numeric;
begin
  insert into public.player_profiles(
    wallet_address,display_name,appearance_preset,current_map_id,current_map_version_id,
    safe_position_x,safe_position_y,facing_direction
  ) values
    (owner_wallet,'P11F Owner','moss','lantern-square','79000000-0000-4000-8000-000000000001',12,10.5,'north'),
    (friend_wallet,'P11F Friend','moonberry','lantern-square','79000000-0000-4000-8000-000000000001',12,10,'south'),
    (invitee_wallet,'P11F Invitee','moss','lantern-square','79000000-0000-4000-8000-000000000001',13,10,'east'),
    (blocked_wallet,'P11F Blocked','moonberry','lantern-square','79000000-0000-4000-8000-000000000001',14,10,'west');
  select id into strict owner_id from public.player_profiles where wallet_address=owner_wallet;
  select id into strict friend_id from public.player_profiles where wallet_address=friend_wallet;
  select id into strict invitee_id from public.player_profiles where wallet_address=invitee_wallet;
  select id into strict blocked_id from public.player_profiles where wallet_address=blocked_wallet;

  perform public.bootstrap_player_cozy_gameplay(owner_wallet,'phase11f-owner-bootstrap-0001','phase11f:owner:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(friend_wallet,'phase11f-friend-bootstrap-0001','phase11f:friend:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(invitee_wallet,'phase11f-invitee-bootstrap-0001','phase11f:invitee:bootstrap');
  perform public.bootstrap_player_cozy_gameplay(blocked_wallet,'phase11f-blocked-bootstrap-0001','phase11f:blocked:bootstrap');
  perform public.accept_player_starter_farming_quest(owner_wallet,'phase11f-owner-quest-0001','phase11f:owner:quest');

  select id,state_version into strict home_id,home_version from public.player_homes where player_profile_id=owner_id;
  update public.player_profiles set safe_position_x=19,safe_position_y=8 where id=owner_id;
  result:=public.enter_player_home(owner_wallet,home_version,'phase11f-owner-enter-0001','phase11f:owner:enter');
  perform pg_temp.phase11f_assert(result->>'status'='updated','the owner enters the canonical personal home');

  select config.id,config.config_version into strict config_id,config_version from public.token_gate_configs config
  where config.environment_key='development' and config.network='solana:devnet';
  insert into public.wallet_auth_challenges(
    id,wallet_address,network,token_gate_config_id,config_version_snapshot,nonce_hash,message_hash,
    domain,uri,issued_at,expires_at,request_id,ip_hash
  ) values(
    'f1100000-0000-4000-8000-000000000100',owner_wallet,'solana:devnet',config_id,config_version,
    repeat('1',64),repeat('2',64),'localhost','http://localhost:3001',now(),now()+interval '5 minutes',
    'phase11f:owner:challenge',repeat('3',64)
  );
  insert into public.wallet_access_sessions(
    id,challenge_id,wallet_address,network,token_gate_config_id,config_version_snapshot,session_token_hash,
    status,observed_balance_raw,required_balance_raw,checked_slot,last_balance_check_at,expires_at
  ) values(
    'f1100000-0000-4000-8000-000000000101','f1100000-0000-4000-8000-000000000100',owner_wallet,
    'solana:devnet',config_id,config_version,repeat('4',64),'active',1000,1000,1,now(),now()+interval '30 minutes'
  ) returning id into access_id;
  insert into public.cozy_private_realtime_sessions(
    wallet_access_session_id,player_profile_id,player_home_id,connection_id
  ) values(access_id,owner_id,home_id,'phase11f-owner-private-home') ;

  result:=public.get_player_home_visit_workspace(owner_wallet,'phase11f:workspace:initialize');
  perform pg_temp.phase11f_assert(
    result->>'status'='loaded' and result#>>'{workspace,settings,visibility}'='private'
      and (result#>>'{workspace,gameTest}')::boolean=false,
    'workspace lazy initialization executes safely and remains normal persistence'
  );
  select configuration_revision into strict settings_revision from public.home_social_settings where player_home_id=home_id;
  result:=public.update_player_home_social_settings(
    owner_wallet,home_id,'public','allow_helpers',true,true,true,true,true,true,true,true,false,
    settings_revision,'phase11f-settings-public-0001','phase11f:settings:public'
  );
  perform pg_temp.phase11f_assert(
    result->>'status'='updated' and result#>>'{settings,visibility}'='public'
      and result#>>'{settings,interactionMode}'='allow_helpers',
    'Public and Allow Helpers settings are revisioned server-side'
  );
  perform pg_temp.phase11f_assert(
    public.update_player_home_social_settings(
      owner_wallet,home_id,'friends_only','view_only',false,true,true,true,true,false,true,true,false,
      settings_revision,'phase11f-settings-stale-0001','phase11f:settings:stale')->>'status'='home_visit_conflict',
    'stale settings revisions fail closed'
  );

  select configuration_revision into strict settings_revision from public.home_social_settings where player_home_id=home_id;
  result:=public.start_player_home_visit_session(
    owner_wallet,home_id,settings_revision,'phase11f-host-start-0001','phase11f:host:start'
  );
  session_id:=(result#>>'{session,id}')::uuid;
  perform pg_temp.phase11f_assert(
    result->>'status'='started' and session_id is not null
      and (select count(*)=1 from public.home_visit_participants where visit_session_id=session_id and role='owner'),
    'owner presence opens one hosted session and creates one owner participant'
  );
  perform pg_temp.phase11f_assert(
    public.start_player_home_visit_session(
      owner_wallet,home_id,settings_revision,'phase11f-host-start-0002','phase11f:host:duplicate')->>'status'='home_visit_already_hosting',
    'one active session per home is enforced'
  );

  insert into public.player_friendships(player_one_profile_id,player_two_profile_id)
  values(least(owner_id,friend_id),greatest(owner_id,friend_id));
  insert into public.multiplayer_chat_player_preferences(player_profile_id,target_player_profile_id,muted,blocked)
  values(owner_id,blocked_id,true,true);

  update public.home_visit_sessions set visibility_snapshot='friends_only' where id=session_id;
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  result:=public.join_player_home_visit(
    friend_wallet,session_id,null,session_revision,'phase11f-friend-join-0001','phase11f:friend:join'
  );
  participant_id:=(result#>>'{participant,id}')::uuid;
  perform pg_temp.phase11f_assert(result->>'status'='joined' and participant_id is not null,'accepted friends can enter Friends Only');
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  perform pg_temp.phase11f_assert(
    public.join_player_home_visit(
      invitee_wallet,session_id,null,session_revision,'phase11f-nonfriend-denied-0001','phase11f:nonfriend:denied')->>'status'='home_visit_friend_required',
    'non-friends are denied from Friends Only without an invite'
  );
  perform pg_temp.phase11f_assert(
    public.join_player_home_visit(
      blocked_wallet,session_id,null,session_revision,'phase11f-blocked-denied-0001','phase11f:blocked:denied')->>'status'='home_visit_blocked',
    'blocks deny admission before visibility evaluation'
  );

  select state_version into strict participant_revision from public.home_visit_participants where id=participant_id;
  result:=public.write_player_home_guestbook_entry(
    friend_wallet,participant_id,'A warm and welcoming home.','phase11f-guestbook-0001','phase11f:guestbook:create'
  );
  guestbook_version:=(result#>>'{entry,stateVersion}')::integer;
  perform pg_temp.phase11f_assert(
    result->>'status'='created'
      and public.write_player_home_guestbook_entry(
        friend_wallet,participant_id,'A second entry too soon.','phase11f-guestbook-0002','phase11f:guestbook:rate')->>'status'='home_guestbook_rate_limited',
    'guestbook requires an active eligible visitor and enforces cooldown'
  );
  result:=public.change_player_home_appreciation(
    friend_wallet,participant_id,'cozy',0,'phase11f-appreciation-0001','phase11f:appreciation:create'
  );
  replay:=public.change_player_home_appreciation(
    friend_wallet,participant_id,'cozy',0,'phase11f-appreciation-0001','phase11f:appreciation:replay'
  );
  perform pg_temp.phase11f_assert(
    result->>'status'='updated' and replay->>'status'='updated' and (replay->>'replayed')::boolean
      and (select count(*)=1 from public.home_appreciations where player_home_id=home_id and reacting_player_profile_id=friend_id),
    'persistent appreciation is unique and idempotent per visitor and home'
  );

  select balance into strict owner_dust_before from public.player_dust_accounts where player_profile_id=owner_id;
  select balance into strict friend_dust_before from public.player_dust_accounts where player_profile_id=friend_id;
  select id,state_version into strict tile_id,tile_version from public.player_home_farming_tiles where player_home_id=home_id and slot=1;
  result:=public.prepare_player_home_soil(
    owner_wallet,tile_id,tile_version,'phase11f-owner-prepare-0001','phase11f:owner:prepare'
  );
  perform pg_temp.phase11f_assert(result->>'status'='updated','owner soil preparation succeeds for the helper fixture: '||result::text);
  update public.cozy_farming_action_cooldowns set last_action_at=clock_timestamp()-interval '1 second' where player_profile_id=owner_id;
  select state_version into strict tile_version from public.player_home_farming_tiles where id=tile_id;
  result:=public.plant_player_home_crop(
    owner_wallet,tile_id,'moonbean-seed',tile_version,'phase11f-owner-plant-0001','phase11f:owner:plant'
  );
  perform pg_temp.phase11f_assert(result->>'status'='updated','owner crop planting succeeds for the helper fixture: '||result::text);
  select crop_instance_id into strict crop_id from public.player_home_farming_tiles where id=tile_id;
  select state_version into strict crop_version from public.player_home_crop_instances where id=crop_id;
  result:=public.help_water_player_home_crop(
    friend_wallet,participant_id,crop_id,crop_version,'phase11f-helper-water-0001','phase11f:helper:water'
  );
  replay:=public.help_water_player_home_crop(
    friend_wallet,participant_id,crop_id,crop_version,'phase11f-helper-water-0001','phase11f:helper:replay'
  );
  perform pg_temp.phase11f_assert(
    result->>'status'='completed' and replay->>'status'='completed' and (replay->>'replayed')::boolean
      and (result->>'visitorReward') is null
      and (select player_profile_id=owner_id and status='growing' from public.player_home_crop_instances where id=crop_id)
      and (select balance=owner_dust_before from public.player_dust_accounts where player_profile_id=owner_id)
      and (select balance=friend_dust_before from public.player_dust_accounts where player_profile_id=friend_id)
      and (select count(*)=1 from public.home_helper_actions where crop_instance_id=crop_id),
    'helper watering changes the owner crop exactly once and grants neither player a visit reward'
  );

  update public.home_visit_sessions set visibility_snapshot='invite_only' where id=session_id;
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  result:=public.create_player_home_visit_invitation(
    owner_wallet,session_id,invitee_id,'direct_player','phase11f-invite-create-0001','phase11f:invite:create'
  );
  invitation_id:=(result->>'invitationId')::uuid;
  perform pg_temp.phase11f_assert(
    result->>'status'='created' and invitation_id is not null,
    'a session-bound direct invitation is created: '||result::text
  );
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  result:=public.join_player_home_visit(
    invitee_wallet,session_id,invitation_id,session_revision,'phase11f-invitee-join-0001','phase11f:invitee:join'
  );
  perform pg_temp.phase11f_assert(result->>'status'='joined','a valid current invitation admits its exact invitee');

  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  update public.home_visit_sessions set maximum_visitors=current_visitor_count where id=session_id;
  perform pg_temp.phase11f_assert(
    public.join_player_home_visit(
      blocked_wallet,session_id,null,session_revision,'phase11f-full-denied-0001','phase11f:full:denied')->>'status'='home_visit_blocked',
    'block denial remains authoritative even when capacity is exhausted'
  );
  delete from public.multiplayer_chat_player_preferences where player_profile_id=owner_id and target_player_profile_id=blocked_id;
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  perform pg_temp.phase11f_assert(
    public.join_player_home_visit(
      blocked_wallet,session_id,null,session_revision,'phase11f-capacity-denied-0001','phase11f:capacity:denied')->>'status'='home_visit_invitation_required',
    'Invite Only is evaluated before capacity for an uninvited player'
  );
  update public.home_visit_sessions set visibility_snapshot='public' where id=session_id;
  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  perform pg_temp.phase11f_assert(
    public.join_player_home_visit(
      blocked_wallet,session_id,null,session_revision,'phase11f-capacity-denied-0002','phase11f:capacity:full')->>'status'='home_visit_full',
    'the bounded visitor capacity denies an eleventh slot'
  );

  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  result:=public.moderate_player_home_visitor(
    owner_wallet,session_id,participant_id,'remove','Owner ended this visit.',session_revision,
    'phase11f-owner-remove-0001','phase11f:owner:remove'
  );
  perform pg_temp.phase11f_assert(
    result->>'status'='removed'
      and (select status='removed' and presence_state='returned' from public.home_visit_participants where id=participant_id)
      and (select current_visitor_count=1 from public.home_visit_sessions where id=session_id),
    'owner removal revokes the participant and releases exactly one capacity slot'
  );
  perform pg_temp.phase11f_assert(
    public.moderate_player_home_guestbook_entry(
      owner_wallet,(select id from public.home_guestbook_entries where player_home_id=home_id limit 1),
      'owner_hide','Owner moderation fixture.',guestbook_version,
      'phase11f-guestbook-hide-0001','phase11f:guestbook:hide')->>'status'='updated',
    'owner guestbook moderation is revisioned and audited'
  );

  select configuration_revision into strict session_revision from public.home_visit_sessions where id=session_id;
  result:=public.stop_player_home_visit_session(
    owner_wallet,session_id,session_revision,'phase11f-host-stop-0001','phase11f:host:stop'
  );
  replay:=public.stop_player_home_visit_session(
    owner_wallet,session_id,session_revision,'phase11f-host-stop-0001','phase11f:host:stop:replay'
  );
  perform pg_temp.phase11f_assert(
    result->>'status'='stopped' and replay->>'status'='stopped' and (replay->>'replayed')::boolean
      and (select status='closed' and current_visitor_count=0 from public.home_visit_sessions where id=session_id)
      and not exists(select 1 from public.home_visit_participants where visit_session_id=session_id and status in ('active','reconnecting')),
    'session closure returns all participants and is exactly-once'
  );

  perform pg_temp.phase11f_assert(
    (select count(*)=0 from public.home_visit_realtime_tickets)
      and (select count(*)=0 from public.home_visit_realtime_sessions)
      and not exists(select 1 from public.home_helper_actions where safe_metadata->>'visitorReward'='true'),
    'the SQL fixture does not mint realtime access and helper rewards remain excluded'
  );
end;
$$;

do $$
declare test_home_id uuid; test_owner_id uuid;
begin
  select home.id,home.player_profile_id into strict test_home_id,test_owner_id
  from public.player_homes home
  join public.player_profiles profile on profile.id=home.player_profile_id
  where profile.display_name='P11F Friend';
  insert into public.home_visit_sessions(
    player_home_id,owner_player_profile_id,status,visibility_snapshot,interaction_mode_snapshot,
    maximum_visitors,current_visitor_count,admissions_open,owner_presence_state
  ) values(test_home_id,test_owner_id,'open','public','view_only',10,0,true,'connected');
  begin
    insert into public.home_visit_sessions(
      player_home_id,owner_player_profile_id,status,visibility_snapshot,interaction_mode_snapshot,
      maximum_visitors,current_visitor_count,admissions_open,owner_presence_state
    ) values(test_home_id,test_owner_id,'open','public','view_only',10,0,true,'connected');
    raise exception 'expected unique active-home rejection';
  exception when unique_violation then null; end;
end;
$$;

select pg_temp.phase11f_assert(
  not exists(select 1 from public.home_visit_sessions where safe_metadata->>'gameTest'='true')
  and not exists(select 1 from public.home_visit_participants where safe_metadata->>'gameTest'='true'),
  'Game Test visits are excluded from persistent tables'
);

select 'Phase 11F home-visit execution assertions passed' as result;

rollback;
