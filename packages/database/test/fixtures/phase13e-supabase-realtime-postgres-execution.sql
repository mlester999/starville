begin;

create or replace function pg_temp.assert_true(condition boolean, assertion_message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001',
      message = 'PHASE13E_REALTIME_ASSERTION_FAILED: ' || assertion_message;
  end if;
end;
$$;

do $$
declare
  auth_a_id constant uuid := '8e000000-0000-4000-8000-000000000001';
  auth_b_id constant uuid := '8e000000-0000-4000-8000-000000000002';
  anonymous_auth_id constant uuid := '8e000000-0000-4000-8000-000000000005';
  player_a_id constant uuid := '82000000-0000-4000-8000-000000000001';
  player_b_id constant uuid := '82000000-0000-4000-8000-000000000002';
  party_id constant uuid := '8e000000-0000-4000-8000-000000000003';
  public_party_id constant uuid := '8e000000-0000-4000-8000-000000000004';
  result_a jsonb;
  result_b jsonb;
  anonymous_result jsonb;
  presence_a uuid;
  presence_b uuid;
  home_a uuid;
begin
  select public_presence_id into strict presence_a
  from public.player_profiles where id = player_a_id;
  select public_presence_id into strict presence_b
  from public.player_profiles where id = player_b_id;

  insert into auth.users(id, email, is_anonymous)
  values
    (auth_a_id, 'player-' || presence_a::text || '@auth.starville.game', false),
    (auth_b_id, 'player-' || presence_b::text || '@auth.starville.game', false),
    (anonymous_auth_id, null, true)
  on conflict(id) do update
  set email = excluded.email, is_anonymous = excluded.is_anonymous;

  insert into public.supabase_realtime_player_identities(
    auth_user_id, player_profile_id, bound_request_id
  )
  values
    (auth_a_id, player_a_id, 'phase13e-bind-a'),
    (auth_b_id, player_b_id, 'phase13e-bind-b');

  result_a := public.authorize_supabase_realtime_player(
    auth_a_id, repeat('7', 64), 'development', null, 'phase13e-auth-a'
  );
  result_b := public.authorize_supabase_realtime_player(
    auth_b_id, repeat('8', 64), 'development', null, 'phase13e-auth-b'
  );
  anonymous_result := public.authorize_supabase_realtime_player(
    anonymous_auth_id, repeat('7', 64), 'development', null, 'phase13e-auth-anonymous'
  );
  perform pg_temp.assert_true(
    result_a ->> 'status' = 'authorized'
      and result_b ->> 'status' = 'authorized'
      and result_a ->> 'topic' ~
        '^starville:development:world:lantern-square:channel:[0-9a-f-]{36}$',
    'eligible signed-in players bind to their exact wallet-authorized world topic'
  );
  perform pg_temp.assert_true(
    anonymous_result ->> 'status' = 'auth_identity_invalid',
    'anonymous Auth users fail private authorization'
  );

  perform pg_temp.assert_true(
    private.supabase_realtime_topic_authorized(
      auth_a_id, result_a ->> 'topic', 'broadcast'
    )
      and private.supabase_realtime_topic_authorized(
        auth_a_id, result_a ->> 'topic', 'presence'
      ),
    'the correct active member may read and write its exact world channel'
  );
  perform pg_temp.assert_true(
    not private.supabase_realtime_topic_authorized(
      auth_b_id, result_a ->> 'topic', 'broadcast'
    )
      and not private.supabase_realtime_topic_authorized(
        auth_a_id,
        replace(result_a ->> 'topic', 'starville:development:', 'starville:production:'),
        'broadcast'
      )
      and not private.supabase_realtime_topic_authorized(
        auth_a_id, 'starville:development:world:malformed', 'broadcast'
      )
      and not private.supabase_realtime_topic_authorized(
        auth_a_id, result_a ->> 'topic', 'postgres_changes'
      ),
    'wrong user, cross-environment, malformed, and unsupported-extension access fails closed'
  );

  perform pg_temp.assert_true(
    private.supabase_realtime_topic_authorized(
      auth_a_id, 'starville:development:player:' || presence_a, 'broadcast'
    )
      and not private.supabase_realtime_topic_authorized(
        auth_b_id, 'starville:development:player:' || presence_a, 'broadcast'
      ),
    'player topics are self-only'
  );

  insert into public.player_parties(id, public_party_id, leader_profile_id, capacity)
  values(party_id, public_party_id, player_a_id, 4);
  insert into public.player_party_members(party_id, player_profile_id, role)
  values(party_id, player_a_id, 'leader');
  perform pg_temp.assert_true(
    private.supabase_realtime_topic_authorized(
      auth_a_id, 'starville:development:party:' || public_party_id, 'presence'
    )
      and not private.supabase_realtime_topic_authorized(
        auth_b_id, 'starville:development:party:' || public_party_id, 'presence'
      ),
    'party topics require active party membership'
  );

  select id into home_a
  from public.player_homes where player_profile_id = player_a_id
  order by created_at limit 1;
  if home_a is not null then
    perform pg_temp.assert_true(
      private.supabase_realtime_topic_authorized(
        auth_a_id, 'starville:development:home:' || home_a, 'presence'
      )
        and not private.supabase_realtime_topic_authorized(
          auth_b_id, 'starville:development:home:' || home_a, 'presence'
        ),
      'home topics allow owners and deny unrelated players'
    );
  end if;

  update public.supabase_realtime_memberships
  set status = 'expired', closed_at = now(), close_reason = 'authorization_expired'
  where auth_user_id = auth_a_id and status = 'active';
  perform pg_temp.assert_true(
    not private.supabase_realtime_topic_authorized(
      auth_a_id, result_a ->> 'topic', 'broadcast'
    ),
    'expired memberships fail closed'
  );
end;
$$;

rollback;
select 'Phase 13E Supabase realtime execution assertions passed' as result;
