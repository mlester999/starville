begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(51);

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
  and (
    select relrowsecurity
      and relowner <> 'authenticated'::regrole
      and relowner <> 'anon'::regrole
    from pg_class
    where oid = 'realtime.messages'::regclass
  )
  and not (
    select rolbypassrls from pg_roles where rolname = 'authenticated'
  )
  and not (
    select rolbypassrls from pg_roles where rolname = 'anon'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and roles && array['anon', 'public']::name[]
  ),
  'provider-managed Realtime grants remain RLS-gated with no anonymous policy authority'
);
select ok(
  has_schema_privilege('authenticated', 'private', 'usage')
  and has_function_privilege(
    'authenticated',
    'private.supabase_realtime_topic_authorized(uuid,text,text)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.supabase_realtime_membership_is_valid(public.supabase_realtime_memberships)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'private.realtime_access_denial(public.wallet_access_sessions,public.player_profiles)',
    'execute'
  ),
  'authenticated has only the exact helper execute required by policy evaluation'
);
select ok(
  not has_function_privilege(
    'anon',
    'private.supabase_realtime_topic_authorized(uuid,text,text)',
    'execute'
  ),
  'anon cannot execute the private Realtime authorization entry point'
);
select ok(
  not exists (
    select 1
    from pg_proc procedure
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) privilege
    where procedure.oid =
      'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no execute privilege on the private Realtime authorization entry point'
);
select ok(
  not has_function_privilege(
    'service_role',
    'private.supabase_realtime_topic_authorized(uuid,text,text)',
    'execute'
  ),
  'service_role has no unnecessary direct helper execution privilege'
);
select ok(
  not has_table_privilege('authenticated', 'public.supabase_realtime_memberships', 'select')
  and not has_table_privilege('authenticated', 'public.supabase_realtime_memberships', 'insert')
  and not has_table_privilege('authenticated', 'public.supabase_realtime_memberships', 'update')
  and not has_table_privilege('authenticated', 'public.supabase_realtime_memberships', 'delete'),
  'authenticated cannot enumerate or mutate private membership authority'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.supabase_realtime_player_identities',
    'select'
  )
  and not has_table_privilege(
    'authenticated',
    'public.supabase_realtime_player_identities',
    'insert'
  )
  and not has_table_privilege(
    'authenticated',
    'public.supabase_realtime_authorization_audit',
    'select'
  ),
  'the exact helper grant exposes no identity or authorization-audit tables'
);
select ok(
  (
    select prosecdef and provolatile = 's'
    from pg_proc
    where oid = 'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ),
  'the policy helper remains a stable SECURITY DEFINER function'
);
select is(
  (
    select array_to_string(proconfig, ',')
    from pg_proc
    where oid = 'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ),
  'search_path=""',
  'the policy helper retains its exact empty search_path'
);
select ok(
  (
    select pg_get_userbyid(proowner) in ('postgres', 'supabase_admin')
    from pg_proc
    where oid = 'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
  ),
  'the SECURITY DEFINER owner is a trusted migration role, never a client role'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'starville_private_broadcast_read',
        'starville_private_presence_read'
      )
      and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
  ),
  2,
  'Presence and Broadcast SELECT are restricted to authenticated policy evaluation'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname in (
        'starville_private_broadcast_write',
        'starville_private_presence_write'
      )
      and cmd = 'INSERT'
      and roles = array['authenticated']::name[]
  ),
  2,
  'Presence and Broadcast INSERT are restricted to authenticated policy evaluation'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname like 'starville_private_%'
      and (
        coalesce(qual, '') ilike '%payload%'
        or coalesce(with_check, '') ilike '%payload%'
      )
  ),
  'client-controlled payload values never participate in topic authorization'
);
select is(
  (
    select count(*)::integer
    from (
      values
        ('starville_private_broadcast_read', 'r', 'broadcast', 'SELECT'),
        ('starville_private_broadcast_write', 'a', 'broadcast', 'INSERT'),
        ('starville_private_presence_read', 'r', 'presence', 'SELECT'),
        ('starville_private_presence_write', 'a', 'presence', 'INSERT')
    ) expected(policy_name, expression_slot, expected_extension, expected_command)
    join pg_policy policy on policy.polname = expected.policy_name
    join pg_class relation
      on relation.oid = policy.polrelid
     and relation.oid = 'realtime.messages'::regclass
    where policy.polroles = array[('authenticated'::regrole)::oid]
      and case expected.expression_slot
        when 'r' then policy.polqual is not null and policy.polwithcheck is null
        when 'a' then policy.polqual is null and policy.polwithcheck is not null
        else false
      end
      and case expected.expected_command
        when 'SELECT' then policy.polcmd = 'r'
        when 'INSERT' then policy.polcmd = 'a'
        else false
      end
      and pg_get_expr(
        coalesce(policy.polqual, policy.polwithcheck),
        policy.polrelid
      ) like '%' || format('extension = %L::text', expected.expected_extension) || '%'
      and pg_get_expr(
        coalesce(policy.polqual, policy.polwithcheck),
        policy.polrelid
      ) like
        '%private.supabase_realtime_topic_authorized(auth.uid(), realtime.topic(), extension)%'
      and (
        select count(distinct dependency.refobjid)
        from pg_depend dependency
        where dependency.classid = 'pg_policy'::regclass
          and dependency.objid = policy.oid
          and dependency.refclassid = 'pg_proc'::regclass
          and dependency.refobjid in (
            'auth.uid()'::regprocedure,
            'realtime.topic()'::regprocedure,
            'private.supabase_realtime_topic_authorized(uuid,text,text)'::regprocedure
          )
      ) = 3
      and exists (
        select 1
        from pg_depend dependency
        join pg_attribute attribute
          on attribute.attrelid = policy.polrelid
         and attribute.attnum = dependency.refobjsubid
        where dependency.classid = 'pg_policy'::regclass
          and dependency.objid = policy.oid
          and dependency.refclassid = 'pg_class'::regclass
          and dependency.refobjid = policy.polrelid
          and attribute.attname = 'extension'
      )
  ),
  4,
  'all four policies delegate exact user, topic, and extension authority to the trusted helper'
);
select lives_ok(
  $$
    set local role authenticated;
    select private.supabase_realtime_topic_authorized(
      '8e000000-0000-4000-8000-000000000099'::uuid,
      'starville:development:world:malformed',
      'broadcast'
    );
    reset role;
  $$,
  'authenticated can invoke the exact policy entry point and malformed input fails closed'
);
select ok(
  not has_schema_privilege('anon', 'private', 'usage')
  and not has_function_privilege(
    'anon',
    'private.supabase_realtime_topic_authorized(uuid,text,text)',
    'execute'
  ),
  'anon invocation is rejected by both schema and exact function privilege'
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
