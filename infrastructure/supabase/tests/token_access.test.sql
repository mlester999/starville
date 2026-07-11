begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(40);

select has_table('public', 'token_gate_configs', 'token_gate_configs exists');
select has_table('public', 'wallet_auth_challenges', 'wallet_auth_challenges exists');
select has_table('public', 'wallet_auth_rate_limits', 'wallet_auth_rate_limits exists');
select has_table('public', 'wallet_access_sessions', 'wallet_access_sessions exists');
select has_table('public', 'wallet_access_events', 'wallet_access_events exists');
select has_column('public', 'wallet_auth_challenges', 'consumed_at', 'successful consumption is explicit');
select has_column('public', 'wallet_auth_challenges', 'expired_at', 'challenge expiry is distinct from consumption');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.token_gate_configs'::regclass),
  'token_gate_configs has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_auth_challenges'::regclass),
  'wallet_auth_challenges has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_auth_rate_limits'::regclass),
  'wallet_auth_rate_limits has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_access_sessions'::regclass),
  'wallet_access_sessions has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_access_events'::regclass),
  'wallet_access_events has RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.token_gate_configs', 'SELECT'), 'anon cannot read config');
select ok(not has_table_privilege('anon', 'public.wallet_auth_challenges', 'SELECT'), 'anon cannot read challenges');
select ok(not has_table_privilege('anon', 'public.wallet_auth_rate_limits', 'SELECT'), 'anon cannot read rate limits');
select ok(not has_table_privilege('anon', 'public.wallet_access_sessions', 'SELECT'), 'anon cannot read sessions');
select ok(not has_table_privilege('anon', 'public.wallet_access_events', 'SELECT'), 'anon cannot read events');

select ok(not has_table_privilege('authenticated', 'public.token_gate_configs', 'UPDATE'), 'users cannot update config');
select ok(not has_table_privilege('authenticated', 'public.wallet_auth_challenges', 'INSERT'), 'users cannot create challenges');
select ok(not has_table_privilege('authenticated', 'public.wallet_auth_rate_limits', 'INSERT'), 'users cannot create rate limits');
select ok(not has_table_privilege('authenticated', 'public.wallet_access_sessions', 'INSERT'), 'users cannot create sessions');
select ok(not has_table_privilege('authenticated', 'public.wallet_access_events', 'INSERT'), 'users cannot claim access events');

select ok(not has_table_privilege('service_role', 'public.token_gate_configs', 'UPDATE'), 'service role has no direct config write');
select ok(not has_table_privilege('service_role', 'public.wallet_auth_challenges', 'INSERT'), 'service role has no direct challenge write');
select ok(not has_table_privilege('service_role', 'public.wallet_auth_rate_limits', 'INSERT'), 'service role has no direct rate-limit write');
select ok(not has_table_privilege('service_role', 'public.wallet_access_sessions', 'INSERT'), 'service role has no direct session write');
select ok(not has_table_privilege('service_role', 'public.wallet_access_events', 'INSERT'), 'service role has no direct event write');

select ok(
  not has_function_privilege('anon', 'public.get_token_gate_runtime_config(text,text)', 'EXECUTE'),
  'anon cannot call the trusted runtime config function'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_wallet_auth_challenge(uuid,text,text,text,text,text,text,text,timestamp with time zone,timestamp with time zone,text,text,text,integer)', 'EXECUTE'),
  'authenticated users cannot create trusted challenges directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.update_admin_token_gate_config(uuid,uuid,text,text,text,integer,boolean,text,text,text,smallint,text,text,text,integer,integer,bigint,text,text)', 'EXECUTE'),
  'authenticated users cannot bypass the protected administrator API'
);
select ok(
  has_function_privilege('service_role', 'public.get_wallet_access_session(text)', 'EXECUTE'),
  'service role can use the narrow trusted session lookup'
);
select ok(
  has_function_privilege('service_role', 'public.claim_wallet_access_recheck(text,uuid,text,integer,integer,integer)', 'EXECUTE'),
  'service role can atomically claim a balance recheck'
);

select is(
  (select validation_state from public.token_gate_configs where environment_key = 'development' and network = 'solana:devnet'),
  'unconfigured',
  'initial development token access fails closed until a real mint is validated'
);

select ok(
  private.claim_wallet_rate_limit('challenge_ip', 'phase3-pgtap-rate-subject', 1, 60),
  'the first durable rate-limit claim succeeds'
);
select ok(
  not private.claim_wallet_rate_limit('challenge_ip', 'phase3-pgtap-rate-subject', 1, 60),
  'a concurrent-window claim above the durable limit is denied'
);

insert into public.wallet_access_events (event, result, request_id)
values ('wallet.rpc.unavailable', 'error', 'phase3-pgtap');

select throws_ok(
  $$update public.wallet_access_events set result = 'success' where request_id = 'phase3-pgtap'$$,
  'P0001',
  'Wallet access events are append-only',
  'wallet access events reject UPDATE'
);
select throws_ok(
  $$delete from public.wallet_access_events where request_id = 'phase3-pgtap'$$,
  'P0001',
  'Wallet access events are append-only',
  'wallet access events reject DELETE'
);

select ok(
  position('SECURITY DEFINER' in upper(pg_get_functiondef('public.consume_wallet_auth_challenge(uuid,text,text,text,text)'::regprocedure))) > 0
  and position('SET search_path TO ''''' in pg_get_functiondef('public.consume_wallet_auth_challenge(uuid,text,text,text,text)'::regprocedure)) > 0,
  'challenge consumption is a security-definer function with an empty search path'
);
select ok(
  position('config_version = config_version + 1' in pg_get_functiondef('public.update_admin_token_gate_config(uuid,uuid,text,text,text,integer,boolean,text,text,text,smallint,text,text,text,integer,integer,bigint,text,text)'::regprocedure)) > 0,
  'administrator config updates increment the trusted config version'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'token_gate_configs', 'wallet_auth_challenges', 'wallet_auth_rate_limits',
    'wallet_access_sessions', 'wallet_access_events'
  )),
  0,
  'Phase 3 tables intentionally expose no direct browser RLS policies'
);

select * from finish();
rollback;
