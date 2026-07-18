-- Forward-only repair for the hosted Phase 8A through Phase 8D-A database lint warnings.

create or replace function public.cleanup_social_interactions(
  p_batch_size integer,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  interaction public.social_interaction_requests%rowtype;
  processed integer := 0;
  released integer := 0;
begin
  if p_batch_size not between 1 and 10000 or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_CLEANUP';
  end if;
  for interaction in select * from public.social_interaction_requests request
    where request.status in ('pending', 'negotiating')
      and (request.expires_at <= now() or (request.reconnect_deadline is not null and request.reconnect_deadline <= now()))
    order by request.expires_at, request.id limit p_batch_size for update skip locked
  loop
    if exists (select 1 from public.player_inventory_reservations where interaction_id = interaction.id) then
      released := released + 1;
      perform private.social_release_reservations(interaction.id, null, p_request_id);
    end if;
    update public.social_interaction_requests set status = 'expired', failure_code = 'request_expired',
      completed_at = now(), reconnect_deadline = null where id = interaction.id;
    insert into public.social_interaction_audit
      (interaction_id, action, request_id, revision, result)
    values (interaction.id,
      case when interaction.interaction_type = 'gift' then 'gift_expired' else 'trade_expired' end,
      p_request_id, interaction.revision, 'released');
    processed := processed + 1;
  end loop;
  delete from public.social_interaction_idempotency idempotency
    where idempotency.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.social_interaction_requests request
        where request.sender_profile_id = idempotency.player_profile_id
          and request.client_request_id = idempotency.client_request_id
          and request.status in ('pending', 'negotiating'));
  return jsonb_build_object('processed', processed, 'reservationsReleased', released);
end;
$$;

create or replace function public.respond_realtime_party_ready_check(
  p_session_id uuid,
  p_ready_check_id uuid,
  p_expected_revision integer,
  p_response text,
  p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  session public.realtime_sessions%rowtype;
  actor public.player_profiles%rowtype;
  member public.player_party_members%rowtype;
  party public.player_parties%rowtype;
  check_row public.player_party_ready_checks%rowtype;
  replay jsonb;
  response jsonb;
  request_hash text;
  waiting_count integer;
begin
  if p_response not in ('ready', 'not_ready') or p_expected_revision < 1
     or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    raise exception using errcode = '22023', message = 'INVALID_READY_RESPONSE';
  end if;
  session := private.social_graph_active_session(p_session_id);
  select * into strict actor from public.player_profiles where id = session.player_profile_id;
  request_hash := p_ready_check_id::text || ':' || p_expected_revision::text || ':' || p_response;
  replay := private.social_graph_replay(actor.id, 'ready_check_respond', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into member from public.player_party_members where player_profile_id = actor.id and status = 'active';
  if not found then response := private.social_graph_result('party_changed');
  else
    select * into party from public.player_parties where id = member.party_id and status = 'active' for update;
    select * into check_row from public.player_party_ready_checks
    where public_ready_check_id = p_ready_check_id and party_id = party.id and status = 'active' for update;
    if party.revision <> p_expected_revision or not found then response := private.social_graph_result('party_changed');
    elsif check_row.expires_at <= now() then
      update public.player_party_ready_checks set status = 'expired', completed_at = now()
      where id = check_row.id;
      response := private.social_graph_result('party_changed');
    else
      perform 1 from public.player_party_ready_responses
      where ready_check_id = check_row.id and player_profile_id = actor.id for update;
      if not found then response := private.social_graph_result('party_changed');
      else
        update public.player_party_ready_responses
        set state = p_response, responded_at = now() where ready_check_id = check_row.id and player_profile_id = actor.id;
        update public.player_parties set revision = revision + 1 where id = party.id returning * into party;
        update public.player_party_ready_checks set party_revision = party.revision where id = check_row.id returning * into check_row;
        select count(*)::integer into waiting_count from public.player_party_ready_responses
        where ready_check_id = check_row.id and state in ('waiting', 'disconnected');
        if waiting_count = 0 then
          update public.player_party_ready_checks set status = 'completed', completed_at = now()
          where id = check_row.id returning * into check_row;
        end if;
        perform private.social_graph_sync_pending_invitation_revisions(party.id, party.revision);
        insert into public.player_social_audit (
          actor_profile_id, entity_type, entity_id, party_id, action, result, request_id, party_revision
        ) values (
          actor.id, 'ready_check', check_row.public_ready_check_id, party.id, 'ready_check_responded',
          p_response, p_client_request_id, party.revision
        );
        response := private.social_graph_result(
          'updated', null, private.social_graph_party_json(party), null, null,
          private.social_graph_party_presence_ids(party.id)
        );
      end if;
    end if;
  end if;
  perform private.social_graph_store_replay(actor.id, 'ready_check_respond', p_client_request_id, request_hash, response);
  return response;
end;
$$;

create or replace function private.social_graph_ready_check_json(
  check_row public.player_party_ready_checks
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', check_row.public_ready_check_id,
    'status', check_row.status,
    'partyRevision', check_row.party_revision,
    'createdAt', check_row.created_at,
    'expiresAt', check_row.expires_at,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'presenceId', profile.public_presence_id,
        'state', response.state,
        'respondedAt', response.responded_at
      ) order by profile.public_presence_id)
      from public.player_party_ready_responses response
      join public.player_profiles profile on profile.id = response.player_profile_id
      where response.ready_check_id = check_row.id
    ), '[]'::jsonb)
  );
$$;

create or replace function private.social_graph_party_json(
  party public.player_parties
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  member_rows jsonb;
  active_check public.player_party_ready_checks%rowtype;
  leader_presence_id uuid;
begin
  select public_presence_id into strict leader_presence_id
  from public.player_profiles where id = party.leader_profile_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'presenceId', profile.public_presence_id,
    'displayName', profile.display_name,
    'level', profile.public_level,
    'appearancePreset', profile.appearance_preset,
    'role', member.role,
    'connectionStatus', member.connection_status,
    'worldId', map.slug,
    'worldName', map.display_name,
    'channelNumber', channel.channel_number,
    'readyState', coalesce(response.state, 'waiting'),
    'joinedAt', member.joined_at
  ) order by case member.role when 'leader' then 0 else 1 end, member.joined_at, member.id), '[]'::jsonb)
  into member_rows
  from public.player_party_members member
  join public.player_profiles profile on profile.id = member.player_profile_id
  left join public.world_maps map on map.id = member.last_world_map_id
  left join public.realtime_channels channel on channel.id = member.last_channel_id
  left join public.player_party_ready_checks ready
    on ready.party_id = party.id and ready.status = 'active'
  left join public.player_party_ready_responses response
    on response.ready_check_id = ready.id and response.player_profile_id = member.player_profile_id
  where member.party_id = party.id
    and (member.status = 'active' or party.status <> 'active');

  select * into active_check from public.player_party_ready_checks ready
  where ready.party_id = party.id and ready.status in ('active', 'completed', 'expired')
  order by ready.created_at desc limit 1;

  return jsonb_build_object(
    'partyId', party.public_party_id,
    'revision', party.revision,
    'status', party.status,
    'capacity', party.capacity,
    'leaderPresenceId', leader_presence_id,
    'members', member_rows,
    'pendingInvitationCount', (
      select count(*)::integer from public.player_party_invitations invitation
      where invitation.party_id = party.id and invitation.status = 'pending' and invitation.expires_at > now()
    ),
    'readyCheck', case when active_check.id is null then null else private.social_graph_ready_check_json(active_check) end,
    'leaderReconnectDeadline', party.leader_reconnect_deadline
  );
end;
$$;

create or replace function public.get_admin_social_graph_party(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_public_party_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  party public.player_parties%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_graph.audit.read') then
    raise exception using errcode = '42501', message = 'SOCIAL_GRAPH_AUDIT_DENIED';
  end if;
  select * into party from public.player_parties where public_party_id = p_public_party_id;
  if not found then raise exception using errcode = 'P0002', message = 'SOCIAL_GRAPH_PARTY_NOT_FOUND'; end if;
  return jsonb_build_object(
    'party', private.social_graph_party_json(party),
    'invitations', coalesce((select jsonb_agg(private.social_graph_invitation_json(invitation)
      order by invitation.created_at desc) from (
        select * from public.player_party_invitations source where source.party_id = party.id
        order by source.created_at desc limit 50
      ) invitation), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'id', audit.id,
      'action', audit.action,
      'result', audit.result,
      'partyRevision', audit.party_revision,
      'createdAt', audit.created_at
    ) order by audit.entry_number desc) from (
      select * from public.player_social_audit source where source.party_id = party.id
      order by source.entry_number desc limit 100
    ) audit), '[]'::jsonb)
  );
end;
$$;

revoke all on function private.social_graph_ready_check_json(public.player_party_ready_checks)
  from public, anon, authenticated, service_role;
revoke all on function private.social_graph_party_json(public.player_parties)
  from public, anon, authenticated, service_role;

revoke all on function public.cleanup_social_interactions(integer, text)
  from public, anon, authenticated, service_role;
revoke all on function public.respond_realtime_party_ready_check(uuid, uuid, integer, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_social_graph_party(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.cleanup_social_interactions(integer, text) to service_role;
grant execute on function public.respond_realtime_party_ready_check(uuid, uuid, integer, text, text)
  to service_role;
grant execute on function public.get_admin_social_graph_party(uuid, uuid, text, uuid)
  to service_role;
