begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(28);

select has_table('public', 'player_profiles', 'player_profiles exists');
select has_table('public', 'player_api_rate_limits', 'player_api_rate_limits exists');
select has_column('public', 'player_profiles', 'wallet_address', 'wallet identity is persisted');
select has_column('public', 'player_profiles', 'appearance_preset', 'appearance preset is persisted');
select has_column('public', 'player_profiles', 'safe_position_x', 'safe x position is persisted');
select has_column('public', 'player_profiles', 'safe_position_y', 'safe y position is persisted');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.player_profiles'::regclass),
  'player_profiles has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.player_api_rate_limits'::regclass),
  'player_api_rate_limits has RLS enabled'
);

select ok(not has_table_privilege('anon', 'public.player_profiles', 'SELECT'), 'anon cannot read profiles');
select ok(not has_table_privilege('authenticated', 'public.player_profiles', 'SELECT'), 'authenticated cannot read profiles directly');
select ok(not has_table_privilege('service_role', 'public.player_profiles', 'SELECT'), 'service role has no direct profile read');
select ok(not has_table_privilege('anon', 'public.player_api_rate_limits', 'SELECT'), 'anon cannot read player rate limits');
select ok(not has_table_privilege('authenticated', 'public.player_api_rate_limits', 'INSERT'), 'authenticated cannot write player rate limits');
select ok(not has_table_privilege('service_role', 'public.player_api_rate_limits', 'INSERT'), 'service role has no direct rate-limit write');

select ok(
  not has_function_privilege('anon', 'public.load_player_profile(text)', 'EXECUTE'),
  'anon cannot load a player profile through the trusted function'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_player_profile(text,text,text,text,integer)', 'EXECUTE'),
  'authenticated users cannot create profiles directly'
);
select ok(
  has_function_privilege('service_role', 'public.load_player_profile(text)', 'EXECUTE'),
  'service role can call the narrow load function'
);
select ok(
  has_function_privilege('service_role', 'public.save_player_game_state(text,text,numeric,numeric,text,integer,text,integer)', 'EXECUTE'),
  'service role can call the narrow state-save function'
);

select is(
  (public.create_player_profile(
    '11111111111111111111111111111111', 'Luna Vale', 'moss', 'phase4-pgtap-create', 10
  ) ->> 'status'),
  'loaded',
  'a valid profile is created'
);
select is(
  (public.create_player_profile(
    '11111111111111111111111111111111', 'Changed Name', 'river', 'phase4-pgtap-idempotent', 10
  ) ->> 'displayName'),
  'Luna Vale',
  'duplicate profile creation is idempotent and does not overwrite the profile'
);
select is(
  (public.load_player_profile('11111111111111111111111111111111') ->> 'appearancePreset'),
  'moss',
  'the trusted load function returns the wallet-owned profile'
);

select throws_ok(
  $$select public.create_player_profile(
    '22222222222222222222222222222222', '<bad>', 'moss', 'phase4-bad-name', 10
  )$$,
  '22023',
  'INVALID_PLAYER_PROFILE_INPUT',
  'markup display names are rejected'
);
select throws_ok(
  $$select public.create_player_profile(
    '22222222222222222222222222222222', 'Valid Name', 'paid', 'phase4-bad-preset', 10
  )$$,
  '22023',
  'INVALID_PLAYER_PROFILE_INPUT',
  'unknown appearance presets are rejected'
);
select throws_ok(
  $$select public.save_player_game_state(
    '11111111111111111111111111111111', 'unknown-map', 12, 7.5, 'south', 1,
    'phase4-bad-state', 60
  )$$,
  '22023',
  'INVALID_PLAYER_STATE_INPUT',
  'unknown map identifiers are rejected'
);

select ok(
  private.claim_player_rate_limit('state_write', '33333333333333333333333333333333', 1, 60),
  'the first durable player rate-limit claim succeeds'
);
select ok(
  not private.claim_player_rate_limit('state_write', '33333333333333333333333333333333', 1, 60),
  'a claim above the durable player rate limit is denied'
);

select ok(
  position('SECURITY DEFINER' in upper(pg_get_functiondef('public.save_player_game_state(text,text,numeric,numeric,text,integer,text,integer)'::regprocedure))) > 0
  and position('SET search_path TO ''''' in pg_get_functiondef('public.save_player_game_state(text,text,numeric,numeric,text,integer,text,integer)'::regprocedure)) > 0,
  'state persistence uses a security-definer function with an empty search path'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in (
    'player_profiles', 'player_api_rate_limits'
  )),
  0,
  'Phase 4 player tables intentionally expose no direct browser RLS policies'
);

select * from finish();
rollback;
