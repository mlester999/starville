-- Starville Phase 11F: narrow player and realtime RPCs for live home visits.

create or replace function private.home_visit_capabilities(p_mode text)
returns text[] language sql immutable security invoker set search_path='' as $$
  select case p_mode
    when 'view_only' then array['home.enter','home.walk','home.inspect']::text[]
    when 'social_interactions' then array[
      'home.enter','home.walk','home.inspect','home.emote','home.sit','home.photo_area',
      'home.guestbook.write','home.appreciate'
    ]::text[]
    when 'allow_helpers' then array[
      'home.enter','home.walk','home.inspect','home.emote','home.sit','home.photo_area',
      'home.guestbook.write','home.appreciate','home.helper.water_crop'
    ]::text[]
    else array[]::text[] end;
$$;

create or replace function private.home_visit_safe_profile(p_profile public.player_profiles)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'presenceId',p_profile.public_presence_id,'displayName',p_profile.display_name,
    'level',p_profile.public_level,'appearancePreset',p_profile.appearance_preset,
    'titleKey',p_profile.equipped_title_key,'badgeKey',p_profile.selected_badge_key
  );
$$;

create or replace function private.home_visit_policy_json()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'versionId',policy.id,'version',policy.version_number,'maximumVisitors',policy.maximum_visitors,
    'ownerDisconnectGraceSeconds',policy.owner_disconnect_grace_seconds,
    'visitorReconnectGraceSeconds',policy.visitor_reconnect_grace_seconds,
    'invitationExpirySeconds',policy.invitation_expiry_seconds,
    'guestbookCooldownSeconds',policy.guestbook_cooldown_seconds,
    'guestbookDailyLimit',policy.guestbook_daily_limit,
    'appreciationPolicy',policy.appreciation_policy,
    'helperWateringsPerVisitorDay',policy.helper_waterings_per_visitor_day,
    'visitsEnabled',policy.visits_enabled,'publicDiscoveryEnabled',policy.public_discovery_enabled,
    'invitationsEnabled',policy.invitations_enabled,'admissionsEnabled',policy.admissions_enabled,
    'socialInteractionsEnabled',policy.social_interactions_enabled,
    'guestbookWritesEnabled',policy.guestbook_writes_enabled,
    'appreciationEnabled',policy.appreciation_enabled,'helperActionsEnabled',policy.helper_actions_enabled,
    'maintenanceMessage',policy.maintenance_message,'configurationRevision',policy.configuration_revision
  ) from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy on policy.id=active_pointer.policy_version_id
  where active_pointer.singleton_key;
$$;

create or replace function private.home_visit_session_json(p_session public.home_visit_sessions)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',p_session.id,'homeId',p_session.player_home_id,'ownerPlayerId',p_session.owner_player_profile_id,
    'worldInstanceId',p_session.world_instance_id,'status',p_session.status,
    'visibility',p_session.visibility_snapshot,'interactionMode',p_session.interaction_mode_snapshot,
    'maximumVisitors',p_session.maximum_visitors,'visitorCount',p_session.current_visitor_count,
    'admissionsOpen',p_session.admissions_open,'ownerPresenceState',p_session.owner_presence_state,
    'startedAt',p_session.started_at,'ownerReconnectDeadline',p_session.owner_reconnect_deadline,
    'closingAt',p_session.closing_at,'closedAt',p_session.closed_at,'closeReason',p_session.close_reason,
    'configurationRevision',p_session.configuration_revision
  );
$$;

create or replace function private.home_visit_participant_json(p_participant public.home_visit_participants)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',p_participant.id,'sessionId',p_participant.visit_session_id,
    'player',private.home_visit_safe_profile(profile),'role',p_participant.role,
    'interactionMode',p_participant.interaction_mode_snapshot,
    'capabilities',to_jsonb(p_participant.capability_snapshot),'status',p_participant.status,
    'presenceState',p_participant.presence_state,'x',p_participant.position_x,'y',p_participant.position_y,
    'facingDirection',p_participant.facing_direction,'movementSequence',p_participant.movement_sequence::text,
    'socialState',p_participant.social_state,'joinedAt',p_participant.joined_at,
    'reconnectDeadline',p_participant.reconnect_deadline,'stateVersion',p_participant.state_version
  ) from public.player_profiles profile where profile.id=p_participant.player_profile_id;
$$;

create or replace function private.home_visit_claim_rate(
  p_player_profile_id uuid,p_scope text,p_limit integer,p_window_seconds integer
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare allowed boolean;
begin
  if p_player_profile_id is null or p_scope !~ '^[a-z][a-z0-9_]{2,79}$'
     or p_limit not between 1 and 10000 or p_window_seconds not between 1 and 86400 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'home-visit-rate:'||p_player_profile_id::text||':'||p_scope,0));
  insert into public.home_visit_rate_limits(
    player_profile_id,scope,window_started_at,window_expires_at,attempt_count
  ) values(p_player_profile_id,p_scope,now(),now()+make_interval(secs=>p_window_seconds),1)
  on conflict(player_profile_id,scope) do update set
    window_started_at=case when home_visit_rate_limits.window_expires_at<=now() then now() else home_visit_rate_limits.window_started_at end,
    window_expires_at=case when home_visit_rate_limits.window_expires_at<=now() then now()+make_interval(secs=>p_window_seconds) else home_visit_rate_limits.window_expires_at end,
    attempt_count=case when home_visit_rate_limits.window_expires_at<=now() then 1 else home_visit_rate_limits.attempt_count+1 end
  returning attempt_count<=p_limit into allowed;
  return allowed;
end;
$$;

create or replace function public.create_player_home_visit_invitation(
  p_wallet_address text,p_visit_session_id uuid,p_invitee_player_profile_id uuid,p_invitation_type text,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare owner_profile public.player_profiles%rowtype; invitee_profile public.player_profiles%rowtype;
  session_row public.home_visit_sessions%rowtype; settings_row public.home_social_settings%rowtype;
  policy public.home_visit_policy_versions%rowtype; invitation public.home_visit_invitations%rowtype;
  request_hash text; replay jsonb; response jsonb; owner_party_id uuid; invitee_party_id uuid;
begin
  if p_visit_session_id is null or p_invitee_player_profile_id is null
     or p_invitation_type not in ('direct_player','friend','party_snapshot')
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_INVITATION'; end if;
  select * into owner_profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  if owner_profile.id=p_invitee_player_profile_id then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_invitee_player_profile_id,p_invitation_type),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(owner_profile.id,'create_invitation',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(owner_profile.id,'invitation_create',20,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into session_row from public.home_visit_sessions source_session
  where source_session.id=p_visit_session_id and source_session.owner_player_profile_id=owner_profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id
  where active_pointer.singleton_key;
  if not policy.invitations_enabled then return jsonb_build_object('status','home_visit_invitation_disabled'); end if;
  if p_invitation_type in ('direct_player','friend') and not settings_row.friend_invitations_enabled then
    return jsonb_build_object('status','home_visit_invitation_disabled'); end if;
  if p_invitation_type='party_snapshot' and not settings_row.party_invitations_enabled then
    return jsonb_build_object('status','home_visit_invitation_disabled'); end if;
  select * into invitee_profile from public.player_profiles target_profile where target_profile.id=p_invitee_player_profile_id;
  if not found then return jsonb_build_object('status','home_visit_invitation_invalid'); end if;
  if private.social_graph_pair_blocked(owner_profile.id,invitee_profile.id) then return jsonb_build_object('status','home_visit_blocked'); end if;
  if p_invitation_type='friend' and not private.social_graph_friendship_exists(owner_profile.id,invitee_profile.id) then
    return jsonb_build_object('status','home_visit_friend_required'); end if;
  if p_invitation_type='party_snapshot' then
    owner_party_id:=private.social_graph_active_party_id(owner_profile.id);
    invitee_party_id:=private.social_graph_active_party_id(invitee_profile.id);
    if owner_party_id is null or owner_party_id is distinct from invitee_party_id then
      return jsonb_build_object('status','home_visit_invitation_invalid'); end if;
  end if;
  select * into invitation from public.home_visit_invitations existing_invitation
  where existing_invitation.player_home_id=session_row.player_home_id
    and existing_invitation.invitee_player_profile_id=invitee_profile.id and existing_invitation.status='pending' for update;
  if found then
    response:=jsonb_build_object('status','created','invitationId',invitation.id,'expiresAt',invitation.expires_at);
    return private.home_visit_store_replay(owner_profile.id,'create_invitation',p_idempotency_key,request_hash,response);
  end if;
  insert into public.home_visit_invitations(
    player_home_id,owner_player_profile_id,invitee_player_profile_id,visit_session_id,
    invitation_type,status,expires_at,safe_metadata
  ) values(session_row.player_home_id,owner_profile.id,invitee_profile.id,session_row.id,
    p_invitation_type,'pending',now()+make_interval(secs=>policy.invitation_expiry_seconds),
    jsonb_build_object('partyId',case when p_invitation_type='party_snapshot' then owner_party_id else null end))
  returning * into invitation;
  perform private.home_visit_notify(invitee_profile.id,owner_profile.id,'home_visit_invitation',
    owner_profile.display_name||' invited you to visit their live home.',
    'home-visit-invite:'||invitation.id::text);
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,owner_profile.id,'owner',
    'invitation_created','success',p_request_id,jsonb_build_object('invitationId',invitation.id,'type',p_invitation_type));
  response:=jsonb_build_object('status','created','invitationId',invitation.id,'expiresAt',invitation.expires_at);
  return private.home_visit_store_replay(owner_profile.id,'create_invitation',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.revoke_player_home_visit_invitation(
  p_wallet_address text,p_invitation_id uuid,p_expected_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare owner_profile public.player_profiles%rowtype; invitation public.home_visit_invitations%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_invitation_id is null or p_expected_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_INVITATION_REVOKE'; end if;
  select * into owner_profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_invitation_id,p_expected_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(owner_profile.id,'revoke_invitation',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into invitation from public.home_visit_invitations source_invitation
  where source_invitation.id=p_invitation_id and source_invitation.owner_player_profile_id=owner_profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_invitation_invalid'); end if;
  if invitation.configuration_revision<>p_expected_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  if invitation.status='revoked' then response:=jsonb_build_object('status','revoked','invitationId',invitation.id);
  elsif invitation.status<>'pending' then return jsonb_build_object('status','home_visit_invitation_invalid');
  else
    update public.home_visit_invitations set status='revoked',revoked_at=now(),resolved_at=now(),
      configuration_revision=configuration_revision+1 where id=invitation.id returning * into invitation;
    perform private.home_visit_notify(invitation.invitee_player_profile_id,owner_profile.id,'home_visit_invitation_revoked',
      'A live home visit invitation was revoked.','home-visit-revoked:'||invitation.id::text);
    perform private.home_visit_audit(invitation.visit_session_id,invitation.player_home_id,owner_profile.id,'owner',
      'invitation_revoked','success',p_request_id,jsonb_build_object('invitationId',invitation.id));
    response:=jsonb_build_object('status','revoked','invitationId',invitation.id);
  end if;
  return private.home_visit_store_replay(owner_profile.id,'revoke_invitation',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.join_player_home_visit(
  p_wallet_address text,p_visit_session_id uuid,p_invitation_id uuid,p_expected_session_revision integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare visitor_profile public.player_profiles%rowtype; owner_profile public.player_profiles%rowtype;
  session_row public.home_visit_sessions%rowtype; settings_row public.home_social_settings%rowtype;
  policy public.home_visit_policy_versions%rowtype; invitation public.home_visit_invitations%rowtype;
  participant public.home_visit_participants%rowtype; request_hash text; replay jsonb; response jsonb;
  invitation_valid boolean:=false; friendship_valid boolean:=false; spawn_offset integer;
begin
  if p_visit_session_id is null or p_expected_session_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_ADMISSION'; end if;
  select * into visitor_profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_invitation_id,p_expected_session_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(visitor_profile.id,'join_visit',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(visitor_profile.id,'admission',10,60) then return jsonb_build_object('status','rate_limited'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-visit-session:'||p_visit_session_id::text,0));
  select * into session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id for update;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  if session_row.owner_player_profile_id=visitor_profile.id then return jsonb_build_object('status','home_visit_already_joined'); end if;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if session_row.configuration_revision<>p_expected_session_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  if not session_row.admissions_open then return jsonb_build_object('status','home_visit_not_hosting'); end if;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  select * into strict owner_profile from public.player_profiles source_owner where source_owner.id=session_row.owner_player_profile_id;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id
  where active_pointer.singleton_key;
  if not policy.visits_enabled or not policy.admissions_enabled then return jsonb_build_object('status','home_visit_disabled'); end if;
  if private.social_graph_pair_blocked(visitor_profile.id,owner_profile.id) then return jsonb_build_object('status','home_visit_blocked'); end if;
  if not exists(select 1 from public.player_homes owner_home where owner_home.id=session_row.player_home_id
    and owner_home.player_profile_id=owner_profile.id and owner_home.inside_home and owner_home.lifecycle_status='active')
    or not exists(select 1 from public.cozy_private_realtime_sessions private_session
      where private_session.player_home_id=session_row.player_home_id and private_session.player_profile_id=owner_profile.id
        and private_session.status='active' and private_session.last_heartbeat_at>now()-interval '30 seconds') then
    update public.home_visit_sessions set admissions_open=false,owner_presence_state='reconnecting',
      owner_reconnect_deadline=now()+make_interval(secs=>policy.owner_disconnect_grace_seconds),
      configuration_revision=configuration_revision+1 where id=session_row.id;
    return jsonb_build_object('status','home_visit_owner_absent');
  end if;
  friendship_valid:=private.social_graph_friendship_exists(visitor_profile.id,owner_profile.id);
  if p_invitation_id is not null then
    select * into invitation from public.home_visit_invitations source_invitation
    where source_invitation.id=p_invitation_id and source_invitation.visit_session_id=session_row.id
      and source_invitation.invitee_player_profile_id=visitor_profile.id for update;
    invitation_valid:=found and invitation.status in ('pending','accepted') and invitation.expires_at>now();
    if found and invitation.status='pending' and invitation.expires_at<=now() then
      update public.home_visit_invitations set status='expired',resolved_at=now(),configuration_revision=configuration_revision+1
      where id=invitation.id;
    end if;
  end if;
  if session_row.visibility_snapshot='private' then return jsonb_build_object('status','home_visit_private'); end if;
  if session_row.visibility_snapshot='friends_only' and not friendship_valid and not invitation_valid then
    return jsonb_build_object('status','home_visit_friend_required'); end if;
  if session_row.visibility_snapshot='invite_only' and not invitation_valid then
    return jsonb_build_object('status','home_visit_invitation_required'); end if;
  if p_invitation_id is not null and not invitation_valid then return jsonb_build_object('status','home_visit_invitation_invalid'); end if;
  select * into participant from public.home_visit_participants existing_participant
  where existing_participant.visit_session_id=session_row.id and existing_participant.player_profile_id=visitor_profile.id for update;
  if found and participant.status in ('active','reconnecting') then
    response:=jsonb_build_object('status','joined','session',private.home_visit_session_json(session_row),
      'participant',private.home_visit_participant_json(participant));
    return private.home_visit_store_replay(visitor_profile.id,'join_visit',p_idempotency_key,request_hash,response);
  end if;
  if session_row.current_visitor_count>=session_row.maximum_visitors then return jsonb_build_object('status','home_visit_full'); end if;
  spawn_offset:=session_row.current_visitor_count;
  if participant.id is null then
    insert into public.home_visit_participants(
      visit_session_id,player_home_id,player_profile_id,role,interaction_mode_snapshot,capability_snapshot,
      return_destination,position_x,position_y,facing_direction,safe_metadata
    ) values(session_row.id,session_row.player_home_id,visitor_profile.id,'visitor',session_row.interaction_mode_snapshot,
      private.home_visit_capabilities(session_row.interaction_mode_snapshot),
      jsonb_build_object('mapId',visitor_profile.current_map_id,'mapVersionId',visitor_profile.current_map_version_id,
        'x',visitor_profile.safe_position_x,'y',visitor_profile.safe_position_y,'facingDirection',visitor_profile.facing_direction,
        'fallbackMapId','lantern-square'),
      2+(spawn_offset%3),2+(spawn_offset/3),visitor_profile.facing_direction,
      jsonb_build_object('friendAtAdmission',friendship_valid,'invitationId',p_invitation_id))
    returning * into participant;
  else
    update public.home_visit_participants set status='active',presence_state='connected',joined_at=now(),
      left_at=null,removed_at=null,removal_reason=null,reconnect_deadline=null,
      interaction_mode_snapshot=session_row.interaction_mode_snapshot,
      capability_snapshot=private.home_visit_capabilities(session_row.interaction_mode_snapshot),
      position_x=2+(spawn_offset%3),position_y=2+(spawn_offset/3),social_state='idle',state_version=state_version+1
    where id=participant.id returning * into participant;
  end if;
  update public.home_visit_sessions set current_visitor_count=current_visitor_count+1,
    configuration_revision=configuration_revision+1,last_owner_heartbeat_at=now(),owner_presence_state='connected',owner_reconnect_deadline=null
  where id=session_row.id returning * into session_row;
  if invitation_valid then
    update public.home_visit_invitations set status='consumed',accepted_at=coalesce(accepted_at,now()),
      consumed_at=now(),resolved_at=now(),configuration_revision=configuration_revision+1 where id=invitation.id;
  end if;
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_visitor_joined',
    jsonb_build_object('participant',private.home_visit_participant_json(participant),'visitorCount',session_row.current_visitor_count));
  if settings_row.join_notifications_enabled then
    perform private.home_visit_notify(owner_profile.id,visitor_profile.id,'home_visit_joined',
      visitor_profile.display_name||' joined your live home.','home-visit-joined:'||participant.id::text||':'||participant.state_version::text);
  end if;
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,visitor_profile.id,'visitor','visitor_admitted','success',p_request_id,
    jsonb_build_object('participantId',participant.id,'visibility',session_row.visibility_snapshot,'invitationId',p_invitation_id));
  response:=jsonb_build_object('status','joined','session',private.home_visit_session_json(session_row),
    'participant',private.home_visit_participant_json(participant));
  return private.home_visit_store_replay(visitor_profile.id,'join_visit',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.leave_player_home_visit(
  p_wallet_address text,p_participant_id uuid,p_expected_participant_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; participant public.home_visit_participants%rowtype;
  session_row public.home_visit_sessions%rowtype; settings_row public.home_social_settings%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_participant_id is null or p_expected_participant_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_LEAVE'; end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_participant_id,p_expected_participant_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'leave_visit',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=profile.id for update;
  if not found or participant.role<>'visitor' then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if participant.state_version<>p_expected_participant_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id for update;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  if participant.status in ('active','reconnecting') then
    update public.home_visit_participants set status='returned',presence_state='returned',left_at=now(),
      reconnect_deadline=null,social_state='idle',state_version=state_version+1 where id=participant.id returning * into participant;
    update public.home_visit_sessions set current_visitor_count=greatest(current_visitor_count-1,0),
      configuration_revision=configuration_revision+1 where id=session_row.id returning * into session_row;
    update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1 where participant_id=participant.id and status='occupied';
    update public.home_visit_photo_participants set status='left',left_at=now() where participant_id=participant.id and status='active';
    update public.home_visit_realtime_sessions set status='closed',closed_at=now(),close_reason='visitor_left'
    where participant_id=participant.id and status='active';
    perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_visitor_left',
      jsonb_build_object('participantId',participant.id,'visitorCount',session_row.current_visitor_count));
    if settings_row.leave_notifications_enabled then perform private.home_visit_notify(session_row.owner_player_profile_id,profile.id,
      'home_visit_left',profile.display_name||' left your live home.','home-visit-left:'||participant.id::text||':'||participant.state_version::text); end if;
  end if;
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,profile.id,'visitor','visitor_left','success',p_request_id,jsonb_build_object('participantId',participant.id));
  response:=jsonb_build_object('status','left','returnDestination',participant.return_destination,
    'session',private.home_visit_session_json(session_row));
  return private.home_visit_store_replay(profile.id,'leave_visit',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function private.home_visit_replay(
  p_player_profile_id uuid,p_operation text,p_idempotency_key text,p_request_hash text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare replay_row public.home_visit_idempotency%rowtype;
begin
  select * into replay_row from public.home_visit_idempotency replay
  where replay.player_profile_id=p_player_profile_id and replay.idempotency_key=p_idempotency_key;
  if not found then return null; end if;
  if replay_row.operation<>p_operation or replay_row.request_hash<>p_request_hash then
    return jsonb_build_object('status','request_already_processed');
  end if;
  return replay_row.response||jsonb_build_object('replayed',true);
end;
$$;

create or replace function private.home_visit_store_replay(
  p_player_profile_id uuid,p_operation text,p_idempotency_key text,p_request_hash text,p_response jsonb
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
begin
  insert into public.home_visit_idempotency(player_profile_id,operation,idempotency_key,request_hash,response)
  values(p_player_profile_id,p_operation,p_idempotency_key,p_request_hash,p_response);
  return p_response||jsonb_build_object('replayed',false);
end;
$$;

create or replace function private.home_visit_emit(
  p_visit_session_id uuid,p_player_home_id uuid,p_actor_participant_id uuid,p_event_key text,p_payload jsonb
)
returns bigint language plpgsql volatile security definer set search_path='' as $$
declare created_number bigint;
begin
  insert into public.home_visit_events(visit_session_id,player_home_id,actor_participant_id,event_key,payload)
  values(p_visit_session_id,p_player_home_id,p_actor_participant_id,p_event_key,coalesce(p_payload,'{}'::jsonb))
  returning event_number into created_number;
  return created_number;
end;
$$;

create or replace function private.home_visit_audit(
  p_session_id uuid,p_home_id uuid,p_player_id uuid,p_actor_type text,p_event_key text,
  p_result text,p_request_id text,p_payload jsonb
)
returns uuid language plpgsql volatile security definer set search_path='' as $$
declare created_id uuid;
begin
  insert into public.home_visit_audit_events(
    visit_session_id,player_home_id,actor_player_profile_id,actor_type,event_key,result_category,request_id,safe_payload
  ) values(p_session_id,p_home_id,p_player_id,p_actor_type,p_event_key,p_result,p_request_id,coalesce(p_payload,'{}'::jsonb))
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function private.home_visit_notify(
  p_recipient uuid,p_actor uuid,p_type text,p_text text,p_deduplication_key text
)
returns void language plpgsql volatile security definer set search_path='' as $$
begin
  insert into public.player_social_notifications(
    recipient_profile_id,actor_profile_id,notification_type,message_text,deduplication_key,expires_at
  ) values(p_recipient,p_actor,p_type,p_text,p_deduplication_key,now()+interval '7 days')
  on conflict(recipient_profile_id,deduplication_key) do nothing;
end;
$$;

create or replace function private.home_visit_settings_json(p_settings public.home_social_settings)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'homeId',p_settings.player_home_id,'visibility',p_settings.visibility,
    'interactionMode',p_settings.interaction_mode,'publicDiscoveryEnabled',p_settings.public_discovery_enabled,
    'friendInvitationsEnabled',p_settings.friend_invitations_enabled,
    'partyInvitationsEnabled',p_settings.party_invitations_enabled,
    'guestbookEnabled',p_settings.guestbook_enabled,'appreciationEnabled',p_settings.appreciation_enabled,
    'helperActionsEnabled',p_settings.helper_actions_enabled,
    'joinNotificationsEnabled',p_settings.join_notifications_enabled,
    'leaveNotificationsEnabled',p_settings.leave_notifications_enabled,
    'defaultVisitorMuted',p_settings.default_visitor_muted,'maximumVisitors',p_settings.maximum_visitors,
    'admissionsOpen',p_settings.admissions_open,'configurationRevision',p_settings.configuration_revision,
    'updatedAt',p_settings.updated_at
  );
$$;

create or replace function private.home_visit_workspace_json(p_player_profile_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare owned_home public.player_homes%rowtype; owned_settings public.home_social_settings%rowtype;
  owned_session public.home_visit_sessions%rowtype; own_participant public.home_visit_participants%rowtype;
  invitations_json jsonb; discovery_json jsonb; recent_json jsonb; participants_json jsonb;
  guestbook_json jsonb; appreciation_json jsonb; own_appreciation_json jsonb;
begin
  select * into owned_home from public.player_homes home where home.player_profile_id=p_player_profile_id;
  if found then
    insert into public.home_social_settings(player_home_id,owner_player_profile_id)
    values(owned_home.id,p_player_profile_id) on conflict(player_home_id) do nothing;
    select * into owned_settings from public.home_social_settings settings where settings.player_home_id=owned_home.id;
    select * into owned_session from public.home_visit_sessions session_row
    where session_row.player_home_id=owned_home.id and session_row.status in ('starting','open','closing');
  end if;
  select * into own_participant from public.home_visit_participants participant
  where participant.player_profile_id=p_player_profile_id and participant.status in ('active','reconnecting');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',invitation.id,'homeId',invitation.player_home_id,
    'sessionId',invitation.visit_session_id,'owner',private.home_visit_safe_profile(owner_profile),
    'type',invitation.invitation_type,'status',invitation.status,'expiresAt',invitation.expires_at,
    'configurationRevision',invitation.configuration_revision,
    'sessionConfigurationRevision',session_row.configuration_revision
  ) order by invitation.created_at desc),'[]'::jsonb) into invitations_json
  from public.home_visit_invitations invitation
  join public.player_profiles owner_profile on owner_profile.id=invitation.owner_player_profile_id
  left join public.home_visit_sessions session_row on session_row.id=invitation.visit_session_id
  where invitation.invitee_player_profile_id=p_player_profile_id
    and invitation.status in ('pending','accepted') and invitation.expires_at>now();

  select coalesce(jsonb_agg(discovery.card order by discovery.started_at desc),'[]'::jsonb) into discovery_json
  from (select session_row.started_at,jsonb_build_object(
    'session',private.home_visit_session_json(session_row),'owner',private.home_visit_safe_profile(owner_profile),
    'homeTitle','A cozy Starville home','homeTier',home.home_tier,
    'friend',private.social_graph_friendship_exists(p_player_profile_id,session_row.owner_player_profile_id),
    'joinEligible',not private.social_graph_pair_blocked(p_player_profile_id,session_row.owner_player_profile_id)
      and session_row.current_visitor_count<session_row.maximum_visitors
  ) card from public.home_visit_sessions session_row
  join public.player_profiles owner_profile on owner_profile.id=session_row.owner_player_profile_id
  join public.player_homes home on home.id=session_row.player_home_id
  join public.home_social_settings settings on settings.player_home_id=home.id
  join public.home_visit_active_policy active_pointer on active_pointer.singleton_key
  join public.home_visit_policy_versions policy on policy.id=active_pointer.policy_version_id
  where session_row.status='open' and session_row.admissions_open and session_row.visibility_snapshot='public'
    and settings.public_discovery_enabled and policy.public_discovery_enabled
    and session_row.owner_player_profile_id<>p_player_profile_id
    and not private.social_graph_pair_blocked(p_player_profile_id,session_row.owner_player_profile_id)
  order by session_row.started_at desc limit 50) discovery;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sessionId',participant.visit_session_id,'homeId',participant.player_home_id,
    'owner',private.home_visit_safe_profile(owner_profile),'joinedAt',participant.joined_at,
    'leftAt',coalesce(participant.left_at,participant.removed_at),'status',participant.status
  ) order by participant.joined_at desc),'[]'::jsonb) into recent_json
  from (select * from public.home_visit_participants visit_row
    where visit_row.player_profile_id=p_player_profile_id and visit_row.role='visitor'
    order by visit_row.joined_at desc limit 20) participant
  join public.home_visit_sessions session_row on session_row.id=participant.visit_session_id
  join public.player_profiles owner_profile on owner_profile.id=session_row.owner_player_profile_id
  where not private.social_graph_pair_blocked(p_player_profile_id,session_row.owner_player_profile_id);

  if coalesce(owned_session.id,own_participant.visit_session_id) is not null then
    select coalesce(jsonb_agg(private.home_visit_participant_json(participant) order by participant.joined_at,participant.id),'[]'::jsonb)
    into participants_json from public.home_visit_participants participant
    where participant.visit_session_id=coalesce(owned_session.id,own_participant.visit_session_id)
      and participant.status in ('active','reconnecting');
  else participants_json:='[]'::jsonb; end if;

  if coalesce(owned_home.id,own_participant.player_home_id) is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',entry.id,'author',private.home_visit_safe_profile(author_profile),'message',entry.message_text,
      'moderationStatus',entry.moderation_status,'createdAt',entry.created_at,'stateVersion',entry.state_version
    ) order by entry.created_at desc),'[]'::jsonb) into guestbook_json
    from (select * from public.home_guestbook_entries source_entry
      where source_entry.player_home_id=coalesce(owned_home.id,own_participant.player_home_id)
        and source_entry.moderation_status='visible' order by source_entry.created_at desc limit 50) entry
    join public.player_profiles author_profile on author_profile.id=entry.author_player_profile_id;
    select coalesce(jsonb_object_agg(reaction.reaction_key,reaction.reaction_count),'{}'::jsonb)
    into appreciation_json from (select appreciation.reaction_key,count(*) reaction_count
      from public.home_appreciations appreciation
      where appreciation.player_home_id=coalesce(owned_home.id,own_participant.player_home_id)
      group by appreciation.reaction_key) reaction;
    select jsonb_build_object('reactionKey',appreciation.reaction_key,'stateVersion',appreciation.state_version)
    into own_appreciation_json from public.home_appreciations appreciation
    where appreciation.player_home_id=coalesce(owned_home.id,own_participant.player_home_id)
      and appreciation.reacting_player_profile_id=p_player_profile_id;
  else guestbook_json:='[]'::jsonb; appreciation_json:='{}'::jsonb; own_appreciation_json:=null; end if;

  return jsonb_build_object(
    'policy',private.home_visit_policy_json(),
    'ownedHome',case when owned_home.id is null then null else jsonb_build_object(
      'id',owned_home.id,'homeTier',owned_home.home_tier,'insideHome',owned_home.inside_home,
      'stateVersion',owned_home.state_version) end,
    'settings',case when owned_settings.player_home_id is null then null else private.home_visit_settings_json(owned_settings) end,
    'hostSession',case when owned_session.id is null then null else private.home_visit_session_json(owned_session) end,
    'activeParticipant',case when own_participant.id is null then null else private.home_visit_participant_json(own_participant) end,
    'participants',participants_json,'invitations',invitations_json,'discovery',discovery_json,
    'recentVisits',recent_json,'guestbook',guestbook_json,'appreciation',appreciation_json,
    'ownAppreciation',own_appreciation_json,
    'gameTest',false,'serverTime',now()
  );
end;
$$;

create or replace function public.get_player_home_visit_workspace(p_wallet_address text,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype;
begin
  if p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_REQUEST'; end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  if not private.home_visit_claim_rate(profile.id,'workspace_read',120,60) then
    return jsonb_build_object('status','rate_limited'); end if;
  return jsonb_build_object('status','loaded','workspace',private.home_visit_workspace_json(profile.id));
end;
$$;

create or replace function public.update_player_home_social_settings(
  p_wallet_address text,p_home_id uuid,p_visibility text,p_interaction_mode text,
  p_public_discovery_enabled boolean,p_friend_invitations_enabled boolean,p_party_invitations_enabled boolean,
  p_guestbook_enabled boolean,p_appreciation_enabled boolean,p_helper_actions_enabled boolean,
  p_join_notifications_enabled boolean,p_leave_notifications_enabled boolean,p_default_visitor_muted boolean,
  p_expected_configuration_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  settings_row public.home_social_settings%rowtype; active_session public.home_visit_sessions%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_home_id is null or p_visibility not in ('public','friends_only','invite_only','private')
     or p_interaction_mode not in ('view_only','social_interactions','allow_helpers')
     or p_expected_configuration_revision<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or p_public_discovery_enabled is null or p_friend_invitations_enabled is null or p_party_invitations_enabled is null
     or p_guestbook_enabled is null or p_appreciation_enabled is null or p_helper_actions_enabled is null
     or p_join_notifications_enabled is null or p_leave_notifications_enabled is null or p_default_visitor_muted is null
     or (p_visibility<>'public' and p_public_discovery_enabled)
     or (p_interaction_mode<>'allow_helpers' and p_helper_actions_enabled) then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_SETTINGS';
  end if;
  select * into profile from public.player_profiles source_profile where source_profile.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_home_id,p_visibility,p_interaction_mode,p_public_discovery_enabled,
    p_friend_invitations_enabled,p_party_invitations_enabled,p_guestbook_enabled,p_appreciation_enabled,
    p_helper_actions_enabled,p_join_notifications_enabled,p_leave_notifications_enabled,p_default_visitor_muted,
    p_expected_configuration_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'update_settings',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(profile.id,'settings_write',20,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into home from public.player_homes home_row where home_row.id=p_home_id and home_row.player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  insert into public.home_social_settings(player_home_id,owner_player_profile_id)
  values(home.id,profile.id) on conflict(player_home_id) do nothing;
  select * into settings_row from public.home_social_settings source_settings
  where source_settings.player_home_id=home.id for update;
  if settings_row.configuration_revision<>p_expected_configuration_revision then
    return jsonb_build_object('status','home_visit_conflict','configurationRevision',settings_row.configuration_revision); end if;
  update public.home_social_settings set
    visibility=p_visibility,interaction_mode=p_interaction_mode,
    public_discovery_enabled=p_public_discovery_enabled,friend_invitations_enabled=p_friend_invitations_enabled,
    party_invitations_enabled=p_party_invitations_enabled,guestbook_enabled=p_guestbook_enabled,
    appreciation_enabled=p_appreciation_enabled,helper_actions_enabled=p_helper_actions_enabled,
    join_notifications_enabled=p_join_notifications_enabled,leave_notifications_enabled=p_leave_notifications_enabled,
    default_visitor_muted=p_default_visitor_muted,configuration_revision=configuration_revision+1
  where player_home_id=home.id returning * into settings_row;
  select * into active_session from public.home_visit_sessions session_row
  where session_row.player_home_id=home.id and session_row.status in ('starting','open','closing') for update;
  if found then
    update public.home_visit_sessions set visibility_snapshot=p_visibility,
      interaction_mode_snapshot=p_interaction_mode,configuration_revision=configuration_revision+1,
      admissions_open=case when p_visibility='private' then false else admissions_open end,
      status=case when p_visibility='private' then 'closing' else status end,
      closing_at=case when p_visibility='private' then coalesce(closing_at,now()) else closing_at end,
      close_reason=case when p_visibility='private' then 'visibility_private' else close_reason end
    where id=active_session.id returning * into active_session;
    update public.home_visit_participants set
      interaction_mode_snapshot=p_interaction_mode,capability_snapshot=private.home_visit_capabilities(p_interaction_mode),
      social_state=case when p_interaction_mode='view_only' then 'idle' else social_state end,
      state_version=state_version+1
    where visit_session_id=active_session.id and role='visitor' and status in ('active','reconnecting');
    if p_interaction_mode='view_only' then
      update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
      where visit_session_id=active_session.id and status='occupied';
      update public.home_visit_photo_participants set status='left',left_at=now()
      where visit_session_id=active_session.id and status='active';
    end if;
    perform private.home_visit_emit(active_session.id,home.id,null,'home_visibility_changed',
      jsonb_build_object('visibility',p_visibility,'interactionMode',p_interaction_mode));
  end if;
  perform private.home_visit_audit(active_session.id,home.id,profile.id,'owner','settings_updated','success',p_request_id,
    jsonb_build_object('visibility',p_visibility,'interactionMode',p_interaction_mode,'configurationRevision',settings_row.configuration_revision));
  response:=jsonb_build_object('status','updated','settings',private.home_visit_settings_json(settings_row),
    'session',case when active_session.id is null then null else private.home_visit_session_json(active_session) end);
  return private.home_visit_store_replay(profile.id,'update_settings',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.start_player_home_visit_session(
  p_wallet_address text,p_home_id uuid,p_expected_settings_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; home public.player_homes%rowtype;
  settings_row public.home_social_settings%rowtype; policy public.home_visit_policy_versions%rowtype;
  created_session public.home_visit_sessions%rowtype; owner_participant public.home_visit_participants%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_home_id is null or p_expected_settings_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_START'; end if;
  select * into profile from public.player_profiles source_profile where source_profile.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_home_id,p_expected_settings_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'start_hosting',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(profile.id,'start_hosting',5,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into home from public.player_homes home_row where home_row.id=p_home_id and home_row.player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if home.lifecycle_status<>'active' then return jsonb_build_object('status','home_visit_disabled'); end if;
  if not home.inside_home then return jsonb_build_object('status','home_visit_owner_absent'); end if;
  if exists(select 1 from public.housing_decoration_sessions decoration
    where decoration.player_home_id=home.id and decoration.status='active') then
    return jsonb_build_object('status','home_visit_decoration_conflict'); end if;
  if not exists(select 1 from public.cozy_private_realtime_sessions private_session
    where private_session.player_home_id=home.id and private_session.player_profile_id=profile.id
      and private_session.status='active' and private_session.last_heartbeat_at>now()-interval '30 seconds') then
    return jsonb_build_object('status','home_visit_owner_absent'); end if;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id
  where active_pointer.singleton_key;
  if not policy.visits_enabled then return jsonb_build_object('status','home_visit_disabled'); end if;
  insert into public.home_social_settings(player_home_id,owner_player_profile_id)
  values(home.id,profile.id) on conflict(player_home_id) do nothing;
  select * into strict settings_row from public.home_social_settings source_settings
  where source_settings.player_home_id=home.id for update;
  if settings_row.configuration_revision<>p_expected_settings_revision then
    return jsonb_build_object('status','home_visit_conflict','configurationRevision',settings_row.configuration_revision); end if;
  select * into created_session from public.home_visit_sessions existing_session
  where existing_session.player_home_id=home.id and existing_session.status in ('starting','open','closing');
  if found then return jsonb_build_object('status','home_visit_already_hosting','session',private.home_visit_session_json(created_session)); end if;
  insert into public.home_visit_sessions(
    player_home_id,owner_player_profile_id,status,visibility_snapshot,interaction_mode_snapshot,
    maximum_visitors,current_visitor_count,admissions_open,owner_presence_state,safe_metadata
  ) values(home.id,profile.id,'open',settings_row.visibility,settings_row.interaction_mode,
    least(settings_row.maximum_visitors,policy.maximum_visitors),0,
    settings_row.admissions_open and settings_row.visibility<>'private','connected',
    jsonb_build_object('policyVersionId',policy.id,'layoutRevisionId',(
      select layout_head.active_revision_id from public.home_layout_heads layout_head where layout_head.player_home_id=home.id)))
  returning * into created_session;
  insert into public.home_visit_participants(
    visit_session_id,player_home_id,player_profile_id,role,interaction_mode_snapshot,
    capability_snapshot,return_destination,position_x,position_y,facing_direction
  ) values(created_session.id,home.id,profile.id,'owner','allow_helpers',
    private.home_visit_capabilities('allow_helpers'),jsonb_build_object('type','personal_home','homeId',home.id),
    2,2,profile.facing_direction) returning * into owner_participant;
  perform private.home_visit_emit(created_session.id,home.id,owner_participant.id,'home_visit_session_opened',
    jsonb_build_object('visibility',created_session.visibility_snapshot,'interactionMode',created_session.interaction_mode_snapshot,
      'maximumVisitors',created_session.maximum_visitors));
  perform private.home_visit_audit(created_session.id,home.id,profile.id,'owner','session_started','success',p_request_id,
    jsonb_build_object('maximumVisitors',created_session.maximum_visitors));
  response:=jsonb_build_object('status','started','session',private.home_visit_session_json(created_session),
    'participant',private.home_visit_participant_json(owner_participant));
  return private.home_visit_store_replay(profile.id,'start_hosting',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.set_player_home_visit_admissions(
  p_wallet_address text,p_visit_session_id uuid,p_open boolean,p_expected_session_revision integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; session_row public.home_visit_sessions%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_visit_session_id is null or p_open is null or p_expected_session_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_ADMISSIONS'; end if;
  select * into profile from public.player_profiles source_profile where source_profile.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_open,p_expected_session_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'set_admissions',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into session_row from public.home_visit_sessions source_session
  where source_session.id=p_visit_session_id and source_session.owner_player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if session_row.configuration_revision<>p_expected_session_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  if p_open and session_row.visibility_snapshot='private' then return jsonb_build_object('status','home_visit_private'); end if;
  update public.home_visit_sessions set admissions_open=p_open,configuration_revision=configuration_revision+1
  where id=session_row.id returning * into session_row;
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,null,'home_admissions_changed',jsonb_build_object('open',p_open));
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,profile.id,'owner','admissions_changed','success',p_request_id,jsonb_build_object('open',p_open));
  response:=jsonb_build_object('status','updated','session',private.home_visit_session_json(session_row));
  return private.home_visit_store_replay(profile.id,'set_admissions',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function private.close_home_visit_session(
  p_visit_session_id uuid,p_reason text,p_actor_player_id uuid,p_actor_type text,p_request_id text
)
returns public.home_visit_sessions language plpgsql volatile security definer set search_path='' as $$
declare session_row public.home_visit_sessions%rowtype;
begin
  select * into session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id for update;
  if not found then raise exception using errcode='P0002',message='HOME_VISIT_NOT_FOUND'; end if;
  if session_row.status in ('closed','failed') then return session_row; end if;
  update public.home_visit_sessions set status='closed',admissions_open=false,owner_presence_state='absent',
    closing_at=coalesce(closing_at,now()),closed_at=now(),close_reason=p_reason,configuration_revision=configuration_revision+1,
    current_visitor_count=0 where id=session_row.id returning * into session_row;
  update public.home_visit_participants set status=case when role='owner' then 'left' else 'returned' end,
    presence_state='returned',left_at=coalesce(left_at,now()),reconnect_deadline=null,
    social_state='idle',state_version=state_version+1
  where visit_session_id=session_row.id and status in ('active','reconnecting');
  update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
  where visit_session_id=session_row.id and status='occupied';
  update public.home_visit_photo_participants set status='left',left_at=now()
  where visit_session_id=session_row.id and status='active';
  update public.home_visit_invitations set status='revoked',revoked_at=now(),resolved_at=now(),configuration_revision=configuration_revision+1
  where visit_session_id=session_row.id and status in ('pending','accepted');
  update public.home_visit_realtime_sessions set status='closed',closed_at=now(),close_reason=p_reason
  where visit_session_id=session_row.id and status='active';
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,null,'home_visit_session_closed',jsonb_build_object('reason',p_reason));
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,p_actor_player_id,p_actor_type,'session_closed','success',p_request_id,jsonb_build_object('reason',p_reason));
  return session_row;
end;
$$;

create or replace function public.stop_player_home_visit_session(
  p_wallet_address text,p_visit_session_id uuid,p_expected_session_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; session_row public.home_visit_sessions%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  if p_visit_session_id is null or p_expected_session_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_STOP'; end if;
  select * into profile from public.player_profiles source_profile where source_profile.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_expected_session_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'stop_hosting',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into session_row from public.home_visit_sessions source_session
  where source_session.id=p_visit_session_id and source_session.owner_player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if session_row.configuration_revision<>p_expected_session_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  session_row:=private.close_home_visit_session(session_row.id,'owner_ended',profile.id,'owner',p_request_id);
  response:=jsonb_build_object('status','stopped','session',private.home_visit_session_json(session_row));
  return private.home_visit_store_replay(profile.id,'stop_hosting',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.perform_player_home_visit_interaction(
  p_wallet_address text,p_participant_id uuid,p_action text,p_target_id uuid,p_interaction_key text,
  p_expected_participant_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; participant public.home_visit_participants%rowtype;
  session_row public.home_visit_sessions%rowtype; policy public.home_visit_policy_versions%rowtype;
  furniture public.player_home_furniture%rowtype; definition public.cozy_furniture_definitions%rowtype;
  seat_row public.home_visit_seats%rowtype; photo_row public.home_visit_photo_participants%rowtype;
  request_hash text; replay jsonb; response jsonb; required_capability text; selected_slot integer;
begin
  if p_participant_id is null or p_action not in ('emote','sit','stand','join_photo_area','leave_photo_area','inspect_furniture')
     or p_expected_participant_revision<1 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128
     or p_interaction_key is not null and (char_length(p_interaction_key) not between 1 and 80
       or p_interaction_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$') then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_INTERACTION'; end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_participant_id,p_action,p_target_id,p_interaction_key,p_expected_participant_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'visit_interaction',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(profile.id,'interaction',30,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=profile.id for update;
  if not found or participant.status<>'active' then return jsonb_build_object('status','home_visitor_not_found'); end if;
  if participant.state_version<>p_expected_participant_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id
  where active_pointer.singleton_key;
  if not policy.social_interactions_enabled and p_action not in ('inspect_furniture') then
    return jsonb_build_object('status','home_visit_interaction_disabled'); end if;
  required_capability:=case p_action when 'emote' then 'home.emote' when 'sit' then 'home.sit'
    when 'stand' then 'home.sit' when 'join_photo_area' then 'home.photo_area'
    when 'leave_photo_area' then 'home.photo_area' else 'home.inspect' end;
  if participant.role='visitor' and not required_capability=any(participant.capability_snapshot) then
    return jsonb_build_object('status','home_visit_interaction_disabled'); end if;
  if p_action='emote' then
    if p_interaction_key is null or not exists(select 1 from public.player_emote_entitlements entitlement
      join public.cosmetic_emote_definitions emote on emote.emote_key=entitlement.emote_key
      where entitlement.player_profile_id=profile.id and entitlement.emote_key=p_interaction_key
        and emote.lifecycle_status='active') then return jsonb_build_object('status','home_visit_permission_denied'); end if;
    update public.home_visit_participants set social_state='emoting',state_version=state_version+1
    where id=participant.id returning * into participant;
    perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_visitor_emote',
      jsonb_build_object('participantId',participant.id,'emoteKey',p_interaction_key));
  elsif p_action='inspect_furniture' then
    select * into furniture from public.player_home_furniture placement
    where placement.id=p_target_id and placement.player_home_id=session_row.player_home_id and placement.removed_at is null;
    if not found then return jsonb_build_object('status','home_visit_target_invalid'); end if;
    select * into strict definition from public.cozy_furniture_definitions furniture_definition
    where furniture_definition.id=furniture.furniture_definition_id;
    response:=jsonb_build_object('status','completed','action',p_action,'inspection',jsonb_build_object(
      'name',definition.name,'description',definition.description,'category',definition.category,
      'assetRef',definition.asset_ref,'interactionType',definition.interaction_type));
    return private.home_visit_store_replay(profile.id,'visit_interaction',p_idempotency_key,request_hash,response);
  elsif p_action in ('sit','join_photo_area') then
    select * into furniture from public.player_home_furniture placement
    where placement.id=p_target_id and placement.player_home_id=session_row.player_home_id and placement.removed_at is null;
    if not found then return jsonb_build_object('status','home_visit_target_invalid'); end if;
    select * into strict definition from public.cozy_furniture_definitions furniture_definition
    where furniture_definition.id=furniture.furniture_definition_id;
    if not definition.guest_enabled or abs(participant.position_x-furniture.grid_x)>3 or abs(participant.position_y-furniture.grid_y)>3 then
      return jsonb_build_object('status','home_visit_target_invalid'); end if;
    if p_action='sit' then
      if definition.seat_count<1 then return jsonb_build_object('status','home_seat_not_found'); end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-seat:'||session_row.id::text||':'||furniture.id::text,0));
      select candidate.slot into selected_slot from generate_series(1,definition.seat_count) candidate(slot)
      where not exists(select 1 from public.home_visit_seats occupied
        where occupied.visit_session_id=session_row.id and occupied.furniture_instance_id=furniture.id
          and occupied.seat_index=candidate.slot and occupied.status='occupied') order by candidate.slot limit 1;
      if selected_slot is null then return jsonb_build_object('status','home_seat_occupied'); end if;
      update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
      where participant_id=participant.id and status='occupied';
      insert into public.home_visit_seats(visit_session_id,player_home_id,furniture_instance_id,seat_index,participant_id,facing_direction)
      values(session_row.id,session_row.player_home_id,furniture.id,selected_slot,participant.id,
        coalesce(definition.guest_interaction_metadata->>'allowedFacing','south')) returning * into seat_row;
      update public.home_visit_participants set social_state='seated',position_x=furniture.grid_x,
        position_y=furniture.grid_y,state_version=state_version+1 where id=participant.id returning * into participant;
      perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_seat_occupied',
        jsonb_build_object('participantId',participant.id,'furnitureId',furniture.id,'seatIndex',selected_slot));
    else
      if definition.photo_area_capacity<1 then return jsonb_build_object('status','home_photo_area_not_found'); end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-photo:'||session_row.id::text||':'||furniture.id::text,0));
      select candidate.slot into selected_slot from generate_series(1,definition.photo_area_capacity) candidate(slot)
      where not exists(select 1 from public.home_visit_photo_participants occupied
        where occupied.visit_session_id=session_row.id and occupied.photo_area_key=coalesce(definition.guest_interaction_metadata->>'photoAreaKey',definition.slug)
          and occupied.pose_slot=candidate.slot and occupied.status='active') order by candidate.slot limit 1;
      if selected_slot is null then return jsonb_build_object('status','home_photo_area_full'); end if;
      update public.home_visit_photo_participants set status='left',left_at=now() where participant_id=participant.id and status='active';
      insert into public.home_visit_photo_participants(visit_session_id,photo_area_key,participant_id,pose_slot)
      values(session_row.id,coalesce(definition.guest_interaction_metadata->>'photoAreaKey',definition.slug),participant.id,selected_slot)
      returning * into photo_row;
      update public.home_visit_participants set social_state='photo_area',state_version=state_version+1
      where id=participant.id returning * into participant;
      perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_photo_area_joined',
        jsonb_build_object('participantId',participant.id,'photoAreaKey',photo_row.photo_area_key,'poseSlot',selected_slot));
    end if;
  elsif p_action='stand' then
    update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
    where participant_id=participant.id and status='occupied' returning * into seat_row;
    if not found then return jsonb_build_object('status','home_seat_not_found'); end if;
    update public.home_visit_participants set social_state='idle',state_version=state_version+1
    where id=participant.id returning * into participant;
    perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_seat_released',
      jsonb_build_object('participantId',participant.id,'furnitureId',seat_row.furniture_instance_id));
  else
    update public.home_visit_photo_participants set status='left',left_at=now()
    where participant_id=participant.id and status='active' returning * into photo_row;
    if not found then return jsonb_build_object('status','home_photo_area_not_found'); end if;
    update public.home_visit_participants set social_state='idle',state_version=state_version+1
    where id=participant.id returning * into participant;
    perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_photo_area_left',
      jsonb_build_object('participantId',participant.id,'photoAreaKey',photo_row.photo_area_key));
  end if;
  response:=jsonb_build_object('status','completed','action',p_action,
    'participant',private.home_visit_participant_json(participant));
  return private.home_visit_store_replay(profile.id,'visit_interaction',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.write_player_home_guestbook_entry(
  p_wallet_address text,p_participant_id uuid,p_message text,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; participant public.home_visit_participants%rowtype;
  session_row public.home_visit_sessions%rowtype; settings_row public.home_social_settings%rowtype;
  policy public.home_visit_policy_versions%rowtype; entry public.home_guestbook_entries%rowtype;
  request_hash text; replay jsonb; response jsonb; normalized_message text;
begin
  normalized_message:=btrim(regexp_replace(coalesce(p_message,''),'[[:space:]]+',' ','g'));
  if p_participant_id is null or char_length(normalized_message) not between 1 and 300 or octet_length(normalized_message)>600
     or normalized_message ~ '[[:cntrl:]<>]' or normalized_message ~* '(https?://|www\.)'
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    return jsonb_build_object('status','home_guestbook_message_invalid'); end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_participant_id,normalized_message),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'guestbook_write',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=profile.id and source_participant.status='active';
  if not found or participant.role<>'visitor' then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if not 'home.guestbook.write'=any(participant.capability_snapshot) then return jsonb_build_object('status','home_visit_interaction_disabled'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id where active_pointer.singleton_key;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if not settings_row.guestbook_enabled or not policy.guestbook_writes_enabled then return jsonb_build_object('status','home_guestbook_disabled'); end if;
  if private.social_graph_pair_blocked(profile.id,session_row.owner_player_profile_id) then return jsonb_build_object('status','home_visit_blocked'); end if;
  if exists(select 1 from public.multiplayer_chat_mutes mute where mute.player_profile_id=profile.id and mute.status='active' and mute.expires_at>now()) then
    return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if exists(select 1 from public.home_guestbook_entries recent_entry
    where recent_entry.author_player_profile_id=profile.id and recent_entry.player_home_id=session_row.player_home_id
      and recent_entry.created_at>now()-make_interval(secs=>policy.guestbook_cooldown_seconds)) then
    return jsonb_build_object('status','home_guestbook_rate_limited'); end if;
  if (select count(*) from public.home_guestbook_entries daily_entry
    where daily_entry.author_player_profile_id=profile.id and daily_entry.created_at>=current_date)>=policy.guestbook_daily_limit then
    return jsonb_build_object('status','home_guestbook_rate_limited'); end if;
  insert into public.home_guestbook_entries(player_home_id,author_player_profile_id,visit_session_id,message_text)
  values(session_row.player_home_id,profile.id,session_row.id,normalized_message) returning * into entry;
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_guestbook_entry_created',
    jsonb_build_object('entryId',entry.id,'author',private.home_visit_safe_profile(profile),'message',entry.message_text,'createdAt',entry.created_at));
  perform private.home_visit_notify(session_row.owner_player_profile_id,profile.id,'home_guestbook_entry',
    profile.display_name||' signed your home guestbook.','home-guestbook:'||entry.id::text);
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,profile.id,'visitor','guestbook_entry_created','success',p_request_id,jsonb_build_object('entryId',entry.id));
  response:=jsonb_build_object('status','created','entry',jsonb_build_object('id',entry.id,'message',entry.message_text,
    'author',private.home_visit_safe_profile(profile),'moderationStatus',entry.moderation_status,'createdAt',entry.created_at,'stateVersion',entry.state_version));
  return private.home_visit_store_replay(profile.id,'guestbook_write',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.change_player_home_appreciation(
  p_wallet_address text,p_participant_id uuid,p_reaction_key text,p_expected_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; participant public.home_visit_participants%rowtype;
  session_row public.home_visit_sessions%rowtype; settings_row public.home_social_settings%rowtype;
  policy public.home_visit_policy_versions%rowtype; appreciation public.home_appreciations%rowtype;
  request_hash text; replay jsonb; response jsonb; aggregate_counts jsonb;
begin
  if p_participant_id is null or p_reaction_key not in ('cozy','beautiful','creative','welcoming')
     or p_expected_state_version<0 or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_APPRECIATION'; end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_participant_id,p_reaction_key,p_expected_state_version),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'appreciation_change',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(profile.id,'appreciation',10,3600) then return jsonb_build_object('status','home_appreciation_rate_limited'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=profile.id and source_participant.status='active';
  if not found or participant.role<>'visitor' then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if not 'home.appreciate'=any(participant.capability_snapshot) then return jsonb_build_object('status','home_visit_interaction_disabled'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id where active_pointer.singleton_key;
  if not settings_row.appreciation_enabled or not policy.appreciation_enabled then return jsonb_build_object('status','home_appreciation_disabled'); end if;
  select * into appreciation from public.home_appreciations source_appreciation
  where source_appreciation.player_home_id=session_row.player_home_id and source_appreciation.reacting_player_profile_id=profile.id for update;
  if found and appreciation.state_version<>p_expected_state_version then return jsonb_build_object('status','home_visit_conflict'); end if;
  if not found and p_expected_state_version<>0 then return jsonb_build_object('status','home_visit_conflict'); end if;
  insert into public.home_appreciations(player_home_id,reacting_player_profile_id,visit_session_id,reaction_key)
  values(session_row.player_home_id,profile.id,session_row.id,p_reaction_key)
  on conflict(player_home_id,reacting_player_profile_id) do update set
    visit_session_id=excluded.visit_session_id,reaction_key=excluded.reaction_key,state_version=home_appreciations.state_version+1
  returning * into appreciation;
  select coalesce(jsonb_object_agg(reaction.reaction_key,reaction.reaction_count),'{}'::jsonb) into aggregate_counts
  from (select source_appreciation.reaction_key,count(*) reaction_count from public.home_appreciations source_appreciation
    where source_appreciation.player_home_id=session_row.player_home_id group by source_appreciation.reaction_key) reaction;
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_appreciation_changed',
    jsonb_build_object('reactionKey',p_reaction_key,'aggregate',aggregate_counts));
  perform private.home_visit_notify(session_row.owner_player_profile_id,profile.id,'home_appreciation',
    profile.display_name||' appreciated your home.','home-appreciation:'||session_row.player_home_id::text||':'||profile.id::text);
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,profile.id,'visitor','appreciation_changed','success',p_request_id,
    jsonb_build_object('reactionKey',p_reaction_key));
  response:=jsonb_build_object('status','updated','selection',jsonb_build_object('reactionKey',p_reaction_key,'stateVersion',appreciation.state_version),
    'aggregate',aggregate_counts,'reward',null);
  return private.home_visit_store_replay(profile.id,'appreciation_change',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.help_water_player_home_crop(
  p_wallet_address text,p_participant_id uuid,p_crop_instance_id uuid,p_expected_crop_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare helper_profile public.player_profiles%rowtype; owner_profile public.player_profiles%rowtype;
  participant public.home_visit_participants%rowtype; session_row public.home_visit_sessions%rowtype;
  settings_row public.home_social_settings%rowtype; policy public.home_visit_policy_versions%rowtype;
  crop public.player_home_crop_instances%rowtype; tile public.player_home_farming_tiles%rowtype;
  home public.player_homes%rowtype; action_row public.home_helper_actions%rowtype;
  request_hash text; replay jsonb; response jsonb; before_version integer;
begin
  if p_participant_id is null or p_crop_instance_id is null or p_expected_crop_state_version<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_HELPER_ACTION'; end if;
  select * into helper_profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_participant_id,p_crop_instance_id,p_expected_crop_state_version),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(helper_profile.id,'helper_water_crop',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(helper_profile.id,'helper_action',10,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=helper_profile.id and source_participant.status='active';
  if not found or participant.role<>'visitor' then return jsonb_build_object('status','home_helper_action_not_allowed'); end if;
  if not 'home.helper.water_crop'=any(participant.capability_snapshot) then return jsonb_build_object('status','home_visit_helpers_disabled'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  select * into strict settings_row from public.home_social_settings source_settings where source_settings.player_home_id=session_row.player_home_id;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id where active_pointer.singleton_key;
  if session_row.status<>'open' then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if session_row.interaction_mode_snapshot<>'allow_helpers' or not settings_row.helper_actions_enabled or not policy.helper_actions_enabled then
    return jsonb_build_object('status','home_visit_helpers_disabled'); end if;
  if exists(select 1 from public.home_helper_actions existing_action
    where existing_action.helper_player_profile_id=helper_profile.id and existing_action.player_home_id=session_row.player_home_id
      and existing_action.game_day=current_date and existing_action.action_type='water_crop'
      and existing_action.status in ('completed','replayed')) then return jsonb_build_object('status','home_helper_limit_reached'); end if;
  select * into crop from public.player_home_crop_instances source_crop
  where source_crop.id=p_crop_instance_id and source_crop.player_home_id=session_row.player_home_id for update;
  if not found then return jsonb_build_object('status','home_helper_target_invalid'); end if;
  if crop.player_profile_id<>session_row.owner_player_profile_id then return jsonb_build_object('status','home_helper_target_invalid'); end if;
  if crop.state_version<>p_expected_crop_state_version then return jsonb_build_object('status','home_helper_state_conflict'); end if;
  if crop.status<>'planted' or crop.watered_at is not null then return jsonb_build_object('status','crop_not_waterable'); end if;
  select * into strict tile from public.player_home_farming_tiles source_tile where source_tile.id=crop.farming_tile_id for update;
  if abs(participant.position_x-tile.grid_x)>3 or abs(participant.position_y-tile.grid_y)>3 then
    return jsonb_build_object('status','home_helper_too_far'); end if;
  select * into strict home from public.player_homes source_home where source_home.id=session_row.player_home_id for update;
  select * into strict owner_profile from public.player_profiles source_owner where source_owner.id=session_row.owner_player_profile_id;
  before_version:=crop.state_version;
  update public.player_home_crop_instances set status='growing',watered_at=now(),growth_started_at=now(),
    matures_at=now()+make_interval(secs=>growth_duration_seconds),state_version=state_version+1,
    metadata=metadata||jsonb_build_object('helperWateredBy',helper_profile.id,'helperVisitSessionId',session_row.id)
  where id=crop.id returning * into crop;
  update public.player_home_farming_tiles set state='growing',state_version=state_version+1
  where id=tile.id returning * into tile;
  update public.player_homes set farming_state_version=farming_state_version+1,last_farming_action_at=now()
  where id=home.id;
  insert into public.home_helper_actions(
    visit_session_id,player_home_id,owner_player_profile_id,helper_player_profile_id,participant_id,
    action_type,crop_instance_id,status,crop_state_version_before,crop_state_version_after,idempotency_key,
    request_id,safe_metadata,completed_at
  ) values(session_row.id,home.id,owner_profile.id,helper_profile.id,participant.id,'water_crop',crop.id,
    'completed',before_version,crop.state_version,p_idempotency_key,p_request_id,
    jsonb_build_object('visitorReward',false,'ownerRetainsCrop',true,'ownerRetainsHarvestXp',true),now())
  returning * into action_row;
  insert into public.cozy_private_plot_events(player_profile_id,player_home_id,event_key,target_id,payload)
  values(owner_profile.id,home.id,'crop_watered',crop.id,jsonb_build_object(
    'tileId',tile.id,'maturesAt',crop.matures_at,'helperPlayer',private.home_visit_safe_profile(helper_profile),'helperActionId',action_row.id));
  update public.home_visit_participants set social_state='helping',state_version=state_version+1
  where id=participant.id returning * into participant;
  perform private.home_visit_emit(session_row.id,home.id,participant.id,'home_crop_watered_by_helper',jsonb_build_object(
    'helperActionId',action_row.id,'cropId',crop.id,'tileId',tile.id,'helper',private.home_visit_safe_profile(helper_profile),
    'cropStateVersion',crop.state_version));
  perform private.home_visit_notify(owner_profile.id,helper_profile.id,'home_helper_completed',
    helper_profile.display_name||' helped water one of your crops.','home-helper:'||action_row.id::text);
  perform private.home_visit_audit(session_row.id,home.id,helper_profile.id,'visitor','helper_crop_watered','success',p_request_id,
    jsonb_build_object('helperActionId',action_row.id,'cropId',crop.id,'visitorReward',false));
  response:=jsonb_build_object('status','completed','helperActionId',action_row.id,'crop',private.cozy_home_crop_json(crop),
    'participant',private.home_visit_participant_json(participant),'visitorReward',null,
    'announcement','You helped water this crop. The owner keeps crop ownership, harvest output, and progression.');
  return private.home_visit_store_replay(helper_profile.id,'helper_water_crop',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function private.remove_home_visit_participant(
  p_participant_id uuid,p_reason text,p_actor_player_id uuid,p_request_id text
)
returns public.home_visit_participants language plpgsql volatile security definer set search_path='' as $$
declare participant public.home_visit_participants%rowtype; session_row public.home_visit_sessions%rowtype;
begin
  select * into participant from public.home_visit_participants source_participant where source_participant.id=p_participant_id for update;
  if not found then raise exception using errcode='P0002',message='HOME_VISITOR_NOT_FOUND'; end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id for update;
  if participant.status in ('active','reconnecting') then
    update public.home_visit_participants set status='removed',presence_state='returned',removed_at=now(),
      removal_reason=p_reason,reconnect_deadline=null,social_state='idle',state_version=state_version+1
    where id=participant.id returning * into participant;
    update public.home_visit_sessions set current_visitor_count=greatest(current_visitor_count-1,0),
      configuration_revision=configuration_revision+1 where id=session_row.id returning * into session_row;
    update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
    where participant_id=participant.id and status='occupied';
    update public.home_visit_photo_participants set status='left',left_at=now()
    where participant_id=participant.id and status='active';
    update public.home_visit_realtime_sessions set status='closed',closed_at=now(),close_reason='visitor_removed'
    where participant_id=participant.id and status='active';
    perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_visitor_removed',
      jsonb_build_object('participantId',participant.id,'reason',p_reason,'visitorCount',session_row.current_visitor_count));
    perform private.home_visit_notify(participant.player_profile_id,p_actor_player_id,'home_visit_removed',
      'The home owner ended your visit.','home-visit-removed:'||participant.id::text||':'||participant.state_version::text);
    perform private.home_visit_audit(session_row.id,session_row.player_home_id,p_actor_player_id,'owner','visitor_removed','success',p_request_id,
      jsonb_build_object('participantId',participant.id,'reason',p_reason));
  end if;
  return participant;
end;
$$;

create or replace function public.moderate_player_home_visitor(
  p_wallet_address text,p_visit_session_id uuid,p_target_participant_id uuid,p_action text,p_reason text,
  p_expected_session_revision integer,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare owner_profile public.player_profiles%rowtype; session_row public.home_visit_sessions%rowtype;
  target_participant public.home_visit_participants%rowtype; request_hash text; replay jsonb; response jsonb;
begin
  if p_visit_session_id is null or p_target_participant_id is null or p_action not in ('remove','block')
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 160 or p_reason ~ '[[:cntrl:]<>]'
     or p_expected_session_revision<1
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISITOR_MODERATION'; end if;
  select * into owner_profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_target_participant_id,p_action,btrim(p_reason),p_expected_session_revision),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(owner_profile.id,'moderate_visitor',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(owner_profile.id,'visitor_moderation',10,60) then return jsonb_build_object('status','rate_limited'); end if;
  select * into session_row from public.home_visit_sessions source_session
  where source_session.id=p_visit_session_id and source_session.owner_player_profile_id=owner_profile.id for update;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if session_row.configuration_revision<>p_expected_session_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  select * into target_participant from public.home_visit_participants source_participant
  where source_participant.id=p_target_participant_id and source_participant.visit_session_id=session_row.id and source_participant.role='visitor';
  if not found then return jsonb_build_object('status','home_visitor_not_found'); end if;
  target_participant:=private.remove_home_visit_participant(target_participant.id,btrim(p_reason),owner_profile.id,p_request_id);
  if p_action='block' then
    insert into public.multiplayer_chat_player_preferences(player_profile_id,target_player_profile_id,muted,blocked)
    values(owner_profile.id,target_participant.player_profile_id,true,true)
    on conflict(player_profile_id,target_player_profile_id) do update set blocked=true,muted=true;
    update public.home_visit_invitations set status='revoked',revoked_at=now(),resolved_at=now(),configuration_revision=configuration_revision+1
    where player_home_id=session_row.player_home_id and invitee_player_profile_id=target_participant.player_profile_id
      and status in ('pending','accepted');
  end if;
  response:=jsonb_build_object('status',case when p_action='block' then 'blocked' else 'removed' end,
    'participantId',target_participant.id,'returnDestination',target_participant.return_destination);
  return private.home_visit_store_replay(owner_profile.id,'moderate_visitor',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.report_player_home_visit(
  p_wallet_address text,p_visit_session_id uuid,p_reported_participant_id uuid,p_guestbook_entry_id uuid,
  p_category text,p_reason text,p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare reporter public.player_profiles%rowtype; reporter_participant public.home_visit_participants%rowtype;
  reported_participant public.home_visit_participants%rowtype; session_row public.home_visit_sessions%rowtype;
  report_row public.home_visit_reports%rowtype; request_hash text; replay jsonb; response jsonb;
begin
  if p_visit_session_id is null or p_reported_participant_id is null
     or p_category not in ('harassment','hate_or_abuse','spam','inappropriate_home','unsafe_behavior','other')
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_REPORT'; end if;
  select * into reporter from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_visit_session_id,p_reported_participant_id,p_guestbook_entry_id,p_category,btrim(p_reason)),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(reporter.id,'visit_report',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  if not private.home_visit_claim_rate(reporter.id,'visit_report',5,3600) then return jsonb_build_object('status','rate_limited'); end if;
  select * into session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  select * into reporter_participant from public.home_visit_participants source_participant
  where source_participant.visit_session_id=session_row.id and source_participant.player_profile_id=reporter.id;
  if not found then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  select * into reported_participant from public.home_visit_participants source_participant
  where source_participant.id=p_reported_participant_id and source_participant.visit_session_id=session_row.id;
  if not found or reported_participant.player_profile_id=reporter.id then return jsonb_build_object('status','home_visitor_not_found'); end if;
  if p_guestbook_entry_id is not null and not exists(select 1 from public.home_guestbook_entries entry
    where entry.id=p_guestbook_entry_id and entry.visit_session_id=session_row.id and entry.author_player_profile_id=reported_participant.player_profile_id) then
    return jsonb_build_object('status','home_visit_target_invalid'); end if;
  insert into public.home_visit_reports(
    visit_session_id,player_home_id,reporter_player_profile_id,reported_player_profile_id,
    guestbook_entry_id,category,reason,request_id,safe_evidence
  ) values(session_row.id,session_row.player_home_id,reporter.id,reported_participant.player_profile_id,
    p_guestbook_entry_id,p_category,btrim(p_reason),p_request_id,jsonb_build_object(
      'reporterParticipantId',reporter_participant.id,'reportedParticipantId',reported_participant.id,
      'reportedSocialState',reported_participant.social_state,'visitStartedAt',session_row.started_at))
  returning * into report_row;
  if p_guestbook_entry_id is not null then update public.home_guestbook_entries set report_count=report_count+1
    where id=p_guestbook_entry_id; end if;
  perform private.home_visit_audit(session_row.id,session_row.player_home_id,reporter.id,
    case when reporter.id=session_row.owner_player_profile_id then 'owner' else 'visitor' end,
    'visit_report_created','manual_review',p_request_id,jsonb_build_object('reportId',report_row.id,'category',p_category));
  response:=jsonb_build_object('status','reported','reportId',report_row.id);
  return private.home_visit_store_replay(reporter.id,'visit_report',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function public.moderate_player_home_guestbook_entry(
  p_wallet_address text,p_entry_id uuid,p_action text,p_reason text,p_expected_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare profile public.player_profiles%rowtype; entry public.home_guestbook_entries%rowtype;
  home public.player_homes%rowtype; request_hash text; replay jsonb; response jsonb;
begin
  if p_entry_id is null or p_action not in ('author_delete','owner_hide','owner_restore') or p_expected_state_version<1
     or p_reason is null or char_length(btrim(p_reason)) not between 3 and 160 or p_reason ~ '[[:cntrl:]<>]'
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_GUESTBOOK_MODERATION'; end if;
  select * into profile from public.player_profiles profile_row where profile_row.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws('|',p_entry_id,p_action,btrim(p_reason),p_expected_state_version),'UTF8'),'sha256'),'hex');
  replay:=private.home_visit_replay(profile.id,'guestbook_moderate',p_idempotency_key,request_hash);
  if replay is not null then return replay; end if;
  select * into entry from public.home_guestbook_entries source_entry where source_entry.id=p_entry_id for update;
  if not found then return jsonb_build_object('status','home_visit_target_invalid'); end if;
  select * into strict home from public.player_homes source_home where source_home.id=entry.player_home_id;
  if p_action='author_delete' and entry.author_player_profile_id<>profile.id then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if p_action in ('owner_hide','owner_restore') and home.player_profile_id<>profile.id then return jsonb_build_object('status','home_visit_permission_denied'); end if;
  if entry.state_version<>p_expected_state_version then return jsonb_build_object('status','home_visit_conflict'); end if;
  if p_action='author_delete' then
    update public.home_guestbook_entries set moderation_status='author_deleted',deleted_at=now(),state_version=state_version+1
    where id=entry.id returning * into entry;
  elsif p_action='owner_hide' then
    update public.home_guestbook_entries set moderation_status='owner_hidden',hidden_at=now(),
      owner_moderation_reference=gen_random_uuid(),state_version=state_version+1 where id=entry.id returning * into entry;
  else
    if entry.moderation_status<>'owner_hidden' then return jsonb_build_object('status','home_visit_permission_denied'); end if;
    update public.home_guestbook_entries set moderation_status='visible',hidden_at=null,
      owner_moderation_reference=gen_random_uuid(),state_version=state_version+1 where id=entry.id returning * into entry;
  end if;
  perform private.home_visit_emit(entry.visit_session_id,entry.player_home_id,null,
    case when entry.moderation_status='visible' then 'home_guestbook_entry_created' else 'home_guestbook_entry_hidden' end,
    jsonb_build_object('entryId',entry.id,'moderationStatus',entry.moderation_status));
  perform private.home_visit_audit(entry.visit_session_id,entry.player_home_id,profile.id,
    case when home.player_profile_id=profile.id then 'owner' else 'visitor' end,'guestbook_moderated','success',p_request_id,
    jsonb_build_object('entryId',entry.id,'action',p_action,'reason',btrim(p_reason)));
  response:=jsonb_build_object('status','updated','entryId',entry.id,'moderationStatus',entry.moderation_status,'stateVersion',entry.state_version);
  return private.home_visit_store_replay(profile.id,'guestbook_moderate',p_idempotency_key,request_hash,response);
end;
$$;

create or replace function private.home_visit_realtime_snapshot(p_visit_session_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare session_row public.home_visit_sessions%rowtype; home public.player_homes%rowtype;
  home_template public.cozy_home_templates%rowtype; participants_json jsonb; furniture_json jsonb;
  crops_json jsonb; seats_json jsonb; photo_json jsonb; appreciation_json jsonb;
begin
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id;
  select * into strict home from public.player_homes source_home where source_home.id=session_row.player_home_id;
  select * into strict home_template from public.cozy_home_templates source_template where source_template.id=home.template_id;
  select coalesce(jsonb_agg(private.home_visit_participant_json(participant) order by participant.joined_at,participant.id),'[]'::jsonb)
  into participants_json from public.home_visit_participants participant
  where participant.visit_session_id=session_row.id and participant.status in ('active','reconnecting');
  select coalesce(jsonb_agg(jsonb_build_object(
    'instanceId',placement.id,'definitionId',definition.id,'name',definition.name,'description',definition.description,
    'category',definition.category,'assetRef',definition.asset_ref,'x',placement.grid_x,'y',placement.grid_y,
    'rotation',placement.rotation,'blocksMovement',definition.blocks_movement,'guestEnabled',definition.guest_enabled,
    'interactionType',definition.interaction_type,'seatCount',definition.seat_count,
    'photoAreaCapacity',definition.photo_area_capacity,'interactionMetadata',definition.guest_interaction_metadata
  ) order by placement.grid_y,placement.grid_x,placement.id),'[]'::jsonb) into furniture_json
  from public.player_home_furniture placement join public.cozy_furniture_definitions definition
    on definition.id=placement.furniture_definition_id
  where placement.player_home_id=home.id and placement.removed_at is null;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',crop.id,'tileId',tile.id,'cropName',crop.crop_name,'cropSlug',crop.crop_slug,'status',crop.status,
    'growthStage',case when crop.status='planted' then 0 when crop.status='growing' and crop.matures_at>now()
      then least(crop.growth_stage_count-1,greatest(1,floor(extract(epoch from(now()-crop.growth_started_at))/crop.growth_duration_seconds*crop.growth_stage_count)::integer))
      else crop.growth_stage_count-1 end,
    'watered',crop.watered_at is not null,'maturesAt',crop.matures_at,'x',tile.grid_x,'y',tile.grid_y,
    'stateVersion',crop.state_version
  ) order by tile.slot),'[]'::jsonb) into crops_json
  from public.player_home_crop_instances crop join public.player_home_farming_tiles tile on tile.id=crop.farming_tile_id
  where crop.player_home_id=home.id and crop.status<>'harvested';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',seat.id,'furnitureId',seat.furniture_instance_id,'seatIndex',seat.seat_index,
    'participantId',seat.participant_id,'facingDirection',seat.facing_direction
  )),'[]'::jsonb) into seats_json from public.home_visit_seats seat
  where seat.visit_session_id=session_row.id and seat.status='occupied';
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',photo.id,'photoAreaKey',photo.photo_area_key,'participantId',photo.participant_id,'poseSlot',photo.pose_slot
  )),'[]'::jsonb) into photo_json from public.home_visit_photo_participants photo
  where photo.visit_session_id=session_row.id and photo.status='active';
  select coalesce(jsonb_object_agg(reaction.reaction_key,reaction.reaction_count),'{}'::jsonb) into appreciation_json
  from (select source_appreciation.reaction_key,count(*) reaction_count from public.home_appreciations source_appreciation
    where source_appreciation.player_home_id=home.id group by source_appreciation.reaction_key) reaction;
  return jsonb_build_object(
    'session',private.home_visit_session_json(session_row),'owner',private.home_visit_safe_profile(
      (select owner_profile from public.player_profiles owner_profile where owner_profile.id=session_row.owner_player_profile_id)),
    'home',jsonb_build_object('id',home.id,'title','A cozy Starville home','tier',home.home_tier,
      'bounds',jsonb_build_object('minX',home_template.min_x,'minY',home_template.min_y,'maxX',home_template.max_x,'maxY',home_template.max_y),
      'guestSpawn',jsonb_build_object('x',home_template.spawn_x,'y',home_template.spawn_y),
      'exit',jsonb_build_object('x',home_template.exit_x,'y',home_template.exit_y),
      'blockedCells',home_template.blocked_cells),
    'participants',participants_json,'furniture',furniture_json,'crops',crops_json,
    'seats',seats_json,'photoParticipants',photo_json,'appreciation',appreciation_json,'serverTime',now()
  );
end;
$$;

create or replace function public.issue_player_home_visit_realtime_ticket(
  p_access_session_token_hash text,p_ticket_hash text,p_participant_id uuid,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare access_session public.wallet_access_sessions%rowtype; profile public.player_profiles%rowtype;
  participant public.home_visit_participants%rowtype; session_row public.home_visit_sessions%rowtype;
  denial text; expiration timestamptz:=now()+interval '30 seconds';
begin
  if p_access_session_token_hash !~ '^[0-9a-f]{64}$' or p_ticket_hash !~ '^[0-9a-f]{64}$'
     or p_participant_id is null or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_REALTIME_TICKET'; end if;
  select * into access_session from public.wallet_access_sessions source_access
  where source_access.session_token_hash=p_access_session_token_hash;
  if not found then return jsonb_build_object('status','access_revoked'); end if;
  select * into profile from public.player_profiles source_profile where source_profile.wallet_address=access_session.wallet_address;
  if not found then return jsonb_build_object('status','access_revoked'); end if;
  denial:=private.realtime_access_denial(access_session,profile);
  if denial is not null then return jsonb_build_object('status',denial); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=p_participant_id and source_participant.player_profile_id=profile.id
    and source_participant.status in ('active','reconnecting');
  if not found then return jsonb_build_object('status','home_visitor_not_found'); end if;
  select * into strict session_row from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  if session_row.status not in ('open','closing') then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if participant.role='visitor' and private.social_graph_pair_blocked(profile.id,session_row.owner_player_profile_id) then
    return jsonb_build_object('status','home_visit_blocked'); end if;
  delete from public.home_visit_realtime_tickets stale_ticket
  where stale_ticket.player_profile_id=profile.id and stale_ticket.consumed_at is null;
  insert into public.home_visit_realtime_tickets(
    ticket_hash,wallet_access_session_id,participant_id,visit_session_id,player_profile_id,request_id,expires_at
  ) values(p_ticket_hash,access_session.id,participant.id,session_row.id,profile.id,p_request_id,expiration);
  return jsonb_build_object('status','issued','participantId',participant.id,'sessionId',session_row.id,
    'homeId',session_row.player_home_id,'expiresAt',expiration);
end;
$$;

create or replace function public.admit_player_home_visit_realtime_ticket(
  p_ticket_hash text,p_connection_id text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare ticket public.home_visit_realtime_tickets%rowtype; access_session public.wallet_access_sessions%rowtype;
  profile public.player_profiles%rowtype; participant public.home_visit_participants%rowtype;
  session_row public.home_visit_sessions%rowtype; realtime_session public.home_visit_realtime_sessions%rowtype;
  denial text; latest_event bigint;
begin
  if p_ticket_hash !~ '^[0-9a-f]{64}$' or p_connection_id is null or char_length(p_connection_id) not between 1 and 128
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    return jsonb_build_object('status','invalid_ticket'); end if;
  select * into ticket from public.home_visit_realtime_tickets source_ticket where source_ticket.ticket_hash=p_ticket_hash for update;
  if not found or ticket.consumed_at is not null or ticket.expires_at<=now() then return jsonb_build_object('status','invalid_ticket'); end if;
  select * into strict access_session from public.wallet_access_sessions source_access where source_access.id=ticket.wallet_access_session_id;
  select * into strict profile from public.player_profiles source_profile where source_profile.id=ticket.player_profile_id;
  denial:=private.realtime_access_denial(access_session,profile);
  if denial is not null then return jsonb_build_object('status',denial); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=ticket.participant_id and source_participant.player_profile_id=profile.id for update;
  if not found or participant.status not in ('active','reconnecting') then return jsonb_build_object('status','home_visitor_not_found'); end if;
  if participant.status='reconnecting' and participant.reconnect_deadline<=now() then return jsonb_build_object('status','home_visit_reconnect_expired'); end if;
  select * into session_row from public.home_visit_sessions source_session where source_session.id=ticket.visit_session_id for update;
  if not found or session_row.status not in ('open','closing') then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if participant.role='visitor' and private.social_graph_pair_blocked(profile.id,session_row.owner_player_profile_id) then
    return jsonb_build_object('status','home_visit_blocked'); end if;
  select coalesce(max(event.event_number),0) into latest_event from public.home_visit_events event where event.visit_session_id=session_row.id;
  update public.home_visit_realtime_sessions set status='closed',closed_at=now(),close_reason='replaced'
  where participant_id=participant.id and status='active';
  insert into public.home_visit_realtime_sessions(participant_id,visit_session_id,player_profile_id,connection_id,last_event_number)
  values(participant.id,session_row.id,profile.id,p_connection_id,latest_event) returning * into realtime_session;
  update public.home_visit_realtime_tickets set consumed_at=now() where id=ticket.id;
  update public.home_visit_participants set status='active',presence_state='connected',disconnected_at=null,
    reconnect_deadline=null,last_heartbeat_at=now(),state_version=state_version+1 where id=participant.id returning * into participant;
  if participant.role='owner' then
    update public.home_visit_sessions set owner_presence_state='connected',owner_reconnect_deadline=null,
      last_owner_heartbeat_at=now(),admissions_open=case when visibility_snapshot='private' then false else true end,
      configuration_revision=configuration_revision+1 where id=session_row.id returning * into session_row;
  end if;
  perform private.home_visit_emit(session_row.id,session_row.player_home_id,participant.id,'home_visitor_reconnected',
    jsonb_build_object('participantId',participant.id,'role',participant.role));
  return jsonb_build_object('status','admitted','realtimeSessionId',realtime_session.id,
    'visitSessionId',session_row.id,'participantId',participant.id,'homeId',session_row.player_home_id,
    'lastEventNumber',latest_event::text,'snapshot',private.home_visit_realtime_snapshot(session_row.id));
end;
$$;

create or replace function public.get_player_home_visit_realtime_events(
  p_realtime_session_id uuid,p_after_event_number bigint,p_force_snapshot boolean
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare realtime_session public.home_visit_realtime_sessions%rowtype; participant public.home_visit_participants%rowtype;
  visit_session public.home_visit_sessions%rowtype; events_json jsonb; latest_event bigint;
begin
  if p_realtime_session_id is null or p_after_event_number<0 or p_force_snapshot is null then
    return jsonb_build_object('status','invalid_session'); end if;
  select * into realtime_session from public.home_visit_realtime_sessions source_realtime
  where source_realtime.id=p_realtime_session_id and source_realtime.status='active' for update;
  if not found then return jsonb_build_object('status','closed'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=realtime_session.participant_id and source_participant.status='active' for update;
  if not found then return jsonb_build_object('status','home_visitor_not_found'); end if;
  select * into visit_session from public.home_visit_sessions source_session where source_session.id=realtime_session.visit_session_id for update;
  if not found or visit_session.status not in ('open','closing') then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if participant.role='visitor' and private.social_graph_pair_blocked(participant.player_profile_id,visit_session.owner_player_profile_id) then
    return jsonb_build_object('status','home_visit_blocked'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',event.id,'eventNumber',event.event_number::text,
    'eventKey',event.event_key,'payload',event.payload,'createdAt',event.created_at) order by event.event_number),'[]'::jsonb)
  into events_json from (select * from public.home_visit_events source_event
    where source_event.visit_session_id=visit_session.id and source_event.event_number>p_after_event_number
    order by source_event.event_number limit 100) event;
  select coalesce(max((entry->>'eventNumber')::bigint),p_after_event_number) into latest_event from jsonb_array_elements(events_json) entry;
  update public.home_visit_realtime_sessions set last_event_number=greatest(last_event_number,latest_event),last_heartbeat_at=now()
  where id=realtime_session.id;
  update public.home_visit_participants set last_heartbeat_at=now() where id=participant.id;
  if participant.role='owner' then update public.home_visit_sessions set last_owner_heartbeat_at=now(),owner_presence_state='connected'
    where id=visit_session.id; end if;
  if jsonb_array_length(events_json)=0 and not p_force_snapshot then
    return jsonb_build_object('status','no_changes','lastEventNumber',latest_event::text); end if;
  return jsonb_build_object('status','loaded','lastEventNumber',latest_event::text,'events',events_json,
    'snapshot',private.home_visit_realtime_snapshot(visit_session.id));
end;
$$;

create or replace function public.checkpoint_player_home_visit_movement(
  p_realtime_session_id uuid,p_position_x numeric,p_position_y numeric,p_facing_direction text,p_sequence bigint
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare realtime_session public.home_visit_realtime_sessions%rowtype; participant public.home_visit_participants%rowtype;
  visit_session public.home_visit_sessions%rowtype; home public.player_homes%rowtype; home_template public.cozy_home_templates%rowtype;
begin
  if p_realtime_session_id is null or p_position_x is null or p_position_y is null or p_position_x::text='NaN' or p_position_y::text='NaN'
     or p_facing_direction not in ('north','northeast','east','southeast','south','southwest','west','northwest') or p_sequence<0 then
    return jsonb_build_object('status','invalid_position'); end if;
  select * into realtime_session from public.home_visit_realtime_sessions source_realtime
  where source_realtime.id=p_realtime_session_id and source_realtime.status='active';
  if not found then return jsonb_build_object('status','closed'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=realtime_session.participant_id and source_participant.status='active' for update;
  if not found then return jsonb_build_object('status','closed'); end if;
  if p_sequence<=participant.movement_sequence then return jsonb_build_object('status','stale_sequence'); end if;
  if sqrt(power((p_position_x-participant.position_x)::numeric,2)+power((p_position_y-participant.position_y)::numeric,2))>3 then
    return jsonb_build_object('status','invalid_position'); end if;
  select * into strict visit_session from public.home_visit_sessions source_session where source_session.id=participant.visit_session_id;
  select * into strict home from public.player_homes source_home where source_home.id=visit_session.player_home_id;
  select * into strict home_template from public.cozy_home_templates source_template where source_template.id=home.template_id;
  if p_position_x<home_template.min_x or p_position_x>=home_template.max_x
     or p_position_y<home_template.min_y or p_position_y>=home_template.max_y
     or exists(select 1 from jsonb_array_elements(home_template.blocked_cells) cell
       where (cell->>'x')::numeric=floor(p_position_x) and (cell->>'y')::numeric=floor(p_position_y))
     or exists(select 1 from public.player_home_furniture placement join public.cozy_furniture_definitions definition
       on definition.id=placement.furniture_definition_id where placement.player_home_id=home.id
       and placement.removed_at is null and definition.blocks_movement
       and floor(p_position_x) between placement.grid_x and placement.grid_x+definition.footprint_width-1
       and floor(p_position_y) between placement.grid_y and placement.grid_y+definition.footprint_height-1) then
    return jsonb_build_object('status','invalid_position'); end if;
  update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
  where participant_id=participant.id and status='occupied';
  update public.home_visit_photo_participants set status='left',left_at=now()
  where participant_id=participant.id and status='active';
  update public.home_visit_participants set position_x=p_position_x,position_y=p_position_y,
    facing_direction=p_facing_direction,movement_sequence=p_sequence,social_state='moving',
    last_heartbeat_at=now(),state_version=state_version+1 where id=participant.id returning * into participant;
  perform private.home_visit_emit(visit_session.id,home.id,participant.id,'home_visitor_movement',jsonb_build_object(
    'participantId',participant.id,'x',participant.position_x,'y',participant.position_y,
    'facingDirection',participant.facing_direction,'sequence',participant.movement_sequence::text));
  return jsonb_build_object('status','checkpointed','participant',private.home_visit_participant_json(participant));
end;
$$;

create or replace function public.revalidate_player_home_visit_realtime_session(p_realtime_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare realtime_session public.home_visit_realtime_sessions%rowtype; participant public.home_visit_participants%rowtype;
  visit_session public.home_visit_sessions%rowtype;
begin
  select * into realtime_session from public.home_visit_realtime_sessions source_realtime
  where source_realtime.id=p_realtime_session_id and source_realtime.status='active';
  if not found then return jsonb_build_object('status','closed'); end if;
  select * into participant from public.home_visit_participants source_participant
  where source_participant.id=realtime_session.participant_id and source_participant.status='active';
  if not found then return jsonb_build_object('status','home_visitor_not_found'); end if;
  select * into visit_session from public.home_visit_sessions source_session where source_session.id=realtime_session.visit_session_id;
  if not found or visit_session.status not in ('open','closing') then return jsonb_build_object('status','home_visit_session_closing'); end if;
  if participant.role='visitor' and private.social_graph_pair_blocked(participant.player_profile_id,visit_session.owner_player_profile_id) then
    return jsonb_build_object('status','home_visit_blocked'); end if;
  return jsonb_build_object('status','active');
end;
$$;

create or replace function public.close_player_home_visit_realtime_session(
  p_realtime_session_id uuid,p_reason text,p_request_id text
)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare realtime_session public.home_visit_realtime_sessions%rowtype; participant public.home_visit_participants%rowtype;
  visit_session public.home_visit_sessions%rowtype; policy public.home_visit_policy_versions%rowtype;
begin
  if p_realtime_session_id is null or p_reason !~ '^[a-z0-9]+(?:_[a-z0-9]+)*$' or char_length(p_reason) not between 1 and 80
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then return false; end if;
  select * into realtime_session from public.home_visit_realtime_sessions source_realtime
  where source_realtime.id=p_realtime_session_id and source_realtime.status='active' for update;
  if not found then return false; end if;
  update public.home_visit_realtime_sessions set status='closed',closed_at=now(),close_reason=p_reason where id=realtime_session.id;
  select * into participant from public.home_visit_participants source_participant where source_participant.id=realtime_session.participant_id for update;
  select * into visit_session from public.home_visit_sessions source_session where source_session.id=realtime_session.visit_session_id for update;
  select policy_row.* into strict policy from public.home_visit_active_policy active_pointer
  join public.home_visit_policy_versions policy_row on policy_row.id=active_pointer.policy_version_id where active_pointer.singleton_key;
  if participant.status='active' and p_reason not in ('visitor_left','visitor_removed','session_closed','replaced') then
    if participant.role='owner' then
      update public.home_visit_sessions set admissions_open=false,owner_presence_state='reconnecting',
        owner_reconnect_deadline=now()+make_interval(secs=>policy.owner_disconnect_grace_seconds),
        configuration_revision=configuration_revision+1 where id=visit_session.id;
      perform private.home_visit_emit(visit_session.id,visit_session.player_home_id,participant.id,'home_visitor_disconnected',
        jsonb_build_object('participantId',participant.id,'role','owner','reconnectDeadline',now()+make_interval(secs=>policy.owner_disconnect_grace_seconds)));
    else
      update public.home_visit_participants set status='reconnecting',presence_state='reconnecting',disconnected_at=now(),
        reconnect_deadline=now()+make_interval(secs=>policy.visitor_reconnect_grace_seconds),social_state='idle',state_version=state_version+1
      where id=participant.id;
      update public.home_visit_seats set status='released',released_at=now(),state_version=state_version+1
      where participant_id=participant.id and status='occupied';
      update public.home_visit_photo_participants set status='left',left_at=now()
      where participant_id=participant.id and status='active';
      perform private.home_visit_emit(visit_session.id,visit_session.player_home_id,participant.id,'home_visitor_disconnected',
        jsonb_build_object('participantId',participant.id,'role','visitor','reconnectDeadline',now()+make_interval(secs=>policy.visitor_reconnect_grace_seconds)));
    end if;
  end if;
  return true;
end;
$$;

do $$ declare signature regprocedure; begin
  foreach signature in array array[
    'private.home_visit_capabilities(text)'::regprocedure,
    'private.home_visit_safe_profile(public.player_profiles)'::regprocedure,
    'private.home_visit_policy_json()'::regprocedure,
    'private.home_visit_session_json(public.home_visit_sessions)'::regprocedure,
    'private.home_visit_participant_json(public.home_visit_participants)'::regprocedure,
    'private.home_visit_claim_rate(uuid,text,integer,integer)'::regprocedure,
    'private.home_visit_replay(uuid,text,text,text)'::regprocedure,
    'private.home_visit_store_replay(uuid,text,text,text,jsonb)'::regprocedure,
    'private.home_visit_emit(uuid,uuid,uuid,text,jsonb)'::regprocedure,
    'private.home_visit_audit(uuid,uuid,uuid,text,text,text,text,jsonb)'::regprocedure,
    'private.home_visit_notify(uuid,uuid,text,text,text)'::regprocedure,
    'private.home_visit_settings_json(public.home_social_settings)'::regprocedure,
    'private.home_visit_workspace_json(uuid)'::regprocedure,
    'private.close_home_visit_session(uuid,text,uuid,text,text)'::regprocedure,
    'private.remove_home_visit_participant(uuid,text,uuid,text)'::regprocedure,
    'private.home_visit_realtime_snapshot(uuid)'::regprocedure
  ] loop execute format('revoke all on function %s from public,anon,authenticated,service_role',signature); end loop;
end $$;

revoke all on function public.get_player_home_visit_workspace(text,text) from public,anon,authenticated,service_role;
revoke all on function public.update_player_home_social_settings(text,uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.start_player_home_visit_session(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.set_player_home_visit_admissions(text,uuid,boolean,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.stop_player_home_visit_session(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.create_player_home_visit_invitation(text,uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.revoke_player_home_visit_invitation(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.join_player_home_visit(text,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.leave_player_home_visit(text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.perform_player_home_visit_interaction(text,uuid,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.write_player_home_guestbook_entry(text,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.change_player_home_appreciation(text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.help_water_player_home_crop(text,uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.moderate_player_home_visitor(text,uuid,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.report_player_home_visit(text,uuid,uuid,uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.moderate_player_home_guestbook_entry(text,uuid,text,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.issue_player_home_visit_realtime_ticket(text,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.admit_player_home_visit_realtime_ticket(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_home_visit_realtime_events(uuid,bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function public.checkpoint_player_home_visit_movement(uuid,numeric,numeric,text,bigint) from public,anon,authenticated,service_role;
revoke all on function public.revalidate_player_home_visit_realtime_session(uuid) from public,anon,authenticated,service_role;
revoke all on function public.close_player_home_visit_realtime_session(uuid,text,text) from public,anon,authenticated,service_role;

grant execute on function public.get_player_home_visit_workspace(text,text) to service_role;
grant execute on function public.update_player_home_social_settings(text,uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,boolean,integer,text,text) to service_role;
grant execute on function public.start_player_home_visit_session(text,uuid,integer,text,text) to service_role;
grant execute on function public.set_player_home_visit_admissions(text,uuid,boolean,integer,text,text) to service_role;
grant execute on function public.stop_player_home_visit_session(text,uuid,integer,text,text) to service_role;
grant execute on function public.create_player_home_visit_invitation(text,uuid,uuid,text,text,text) to service_role;
grant execute on function public.revoke_player_home_visit_invitation(text,uuid,integer,text,text) to service_role;
grant execute on function public.join_player_home_visit(text,uuid,uuid,integer,text,text) to service_role;
grant execute on function public.leave_player_home_visit(text,uuid,integer,text,text) to service_role;
grant execute on function public.perform_player_home_visit_interaction(text,uuid,text,uuid,text,integer,text,text) to service_role;
grant execute on function public.write_player_home_guestbook_entry(text,uuid,text,text,text) to service_role;
grant execute on function public.change_player_home_appreciation(text,uuid,text,integer,text,text) to service_role;
grant execute on function public.help_water_player_home_crop(text,uuid,uuid,integer,text,text) to service_role;
grant execute on function public.moderate_player_home_visitor(text,uuid,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.report_player_home_visit(text,uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.moderate_player_home_guestbook_entry(text,uuid,text,text,integer,text,text) to service_role;
grant execute on function public.issue_player_home_visit_realtime_ticket(text,text,uuid,text) to service_role;
grant execute on function public.admit_player_home_visit_realtime_ticket(text,text,text) to service_role;
grant execute on function public.get_player_home_visit_realtime_events(uuid,bigint,boolean) to service_role;
grant execute on function public.checkpoint_player_home_visit_movement(uuid,numeric,numeric,text,bigint) to service_role;
grant execute on function public.revalidate_player_home_visit_realtime_session(uuid) to service_role;
grant execute on function public.close_player_home_visit_realtime_session(uuid,text,text) to service_role;
