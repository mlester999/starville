begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(36);

select has_table('public', 'supabase_realtime_settings', 'environment-scoped realtime settings exist');
select has_table(
  'public',
  'supabase_realtime_player_identities',
  'wallet-bound non-anonymous player identities exist'
);
select has_table('public', 'supabase_realtime_memberships', 'private realtime memberships exist');
select has_table('public', 'supabase_realtime_authorization_audit', 'authorization audit exists');
select has_table('public', 'scheduled_job_definitions', 'repository schedule definitions exist');
select has_table('public', 'scheduled_job_runs', 'scheduled run evidence exists');
select has_function('public', 'authorize_supabase_realtime_player', 'trusted authorization RPC exists');
select has_function(
  'public',
  'prepare_supabase_realtime_player_identity',
  'trusted player Auth preparation RPC exists'
);
select has_function(
  'public',
  'bind_supabase_realtime_player_identity',
  'trusted player Auth binding RPC exists'
);
select has_function('public', 'close_supabase_realtime_membership', 'trusted close RPC exists');
select has_function('public', 'run_scheduled_social_interaction_cleanup', 'bounded cron proof exists');
select ok(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.supabase_realtime_memberships'::regclass),
  'memberships force RLS'
);
select ok(
  not has_table_privilege('anon', 'public.supabase_realtime_memberships', 'select')
  and not has_table_privilege('authenticated', 'public.supabase_realtime_memberships', 'select')
  and not has_table_privilege('service_role', 'public.supabase_realtime_memberships', 'insert'),
  'membership storage is RPC-only'
);
select ok(
  not has_table_privilege('anon', 'public.supabase_realtime_player_identities', 'select')
  and not has_table_privilege(
    'authenticated',
    'public.supabase_realtime_player_identities',
    'select'
  )
  and not has_table_privilege(
    'service_role',
    'public.supabase_realtime_player_identities',
    'insert'
  ),
  'player Auth identity storage is function-owned'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)',
    'execute'
  ),
  'only service role can bind browser auth to wallet access'
);
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'realtime' and tablename = 'messages'
     and policyname like 'starville_private_%'),
  4,
  'exact broadcast and presence read/write policies exist'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'realtime' and tablename = 'messages'
      and (qual = 'true' or with_check = 'true')
  ),
  'no permissive private-channel policy exists'
);
select ok(
  has_table_privilege('authenticated', 'realtime.messages', 'select')
  and has_table_privilege('authenticated', 'realtime.messages', 'insert')
  and not has_table_privilege('anon', 'realtime.messages', 'select'),
  'authenticated clients have only RLS-gated Realtime access'
);
select is(
  (select environment_key from public.supabase_realtime_settings where singleton_key),
  'development',
  'local realtime environment defaults safely'
);
select is(
  (select count(*)::integer from public.supabase_realtime_memberships),
  0,
  'migration seeds no fake memberships'
);
select is(
  (select enabled from public.scheduled_job_definitions
   where job_key = 'social-interaction-expiry-cleanup'),
  false,
  'Cron proof is not enabled by migration'
);
select is(
  (select batch_size from public.scheduled_job_definitions
   where job_key = 'social-interaction-expiry-cleanup'),
  1000,
  'Cron proof has a bounded batch'
);
select is(
  (select migration_state from public.scheduled_job_definitions
   where job_key = 'social-interaction-expiry-cleanup'),
  'proof-disabled',
  'Cron proof remains a migration foundation'
);
select ok(
  not has_table_privilege('authenticated', 'public.scheduled_job_runs', 'select')
  and not has_table_privilege('service_role', 'public.scheduled_job_runs', 'insert'),
  'run evidence is function-owned'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.run_scheduled_social_interaction_cleanup(integer,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.run_scheduled_social_interaction_cleanup(integer,text)',
    'execute'
  ),
  'scheduled proof is never browser callable'
);
select is(
  (select count(*)::integer from public.scheduled_job_runs),
  0,
  'migration records no fake job runs'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%candidate.auth_user_id = p_auth_user_id%',
  'topic authority binds the exact authenticated user'
);
select ok(
  pg_get_functiondef(
    'public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)'::regprocedure
  ) like '%not coalesce(is_anonymous, false)%'
  and pg_get_functiondef(
    'public.authorize_supabase_realtime_player(uuid,text,text,uuid,text)'::regprocedure
  ) like '%public.supabase_realtime_player_identities%',
  'anonymous or wallet-unbound Auth users fail authorization'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.bind_supabase_realtime_player_identity(uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.bind_supabase_realtime_player_identity(uuid,text,text)',
    'execute'
  ),
  'only the service role can bind player Auth identities'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%topic_parts[2] <> membership.environment_key%',
  'cross-environment topics fail closed'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%authorization_expires_at > now()%',
  'expired memberships fail closed'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_membership_is_valid(public.supabase_realtime_memberships)'::regprocedure
  ) like '%private.realtime_access_denial(access_session, profile) is null%',
  'revoked, moderated, maintenance, and unavailable-world identities fail closed'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%profile.public_presence_id = topic_identifier::uuid%',
  'player topics are self-only'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%party_member.status = ''active''%',
  'party topics require active membership'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%participant.status in (''active'', ''reconnecting'')%',
  'home topics admit only live visit participants'
);
select ok(
  pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%invitation.status in (''pending'', ''accepted'')%'
  and pg_get_functiondef(
    'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ) like '%invitation.expires_at > now()%',
  'home invitations must be eligible and unexpired'
);

select * from finish();
rollback;
