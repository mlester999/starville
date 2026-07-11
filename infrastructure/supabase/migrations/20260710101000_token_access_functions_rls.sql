-- Starville Phase 3: narrow trusted token-access functions and administrator controls.

create or replace function private.assert_verified_admin_permission(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_permission_key text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authorization_result jsonb;
begin
  authorization_result := private.evaluate_admin_authorization(
    p_user_id,
    p_auth_session_id,
    p_assurance_level
  );

  if authorization_result ->> 'outcome' <> 'authorized' then
    raise exception using errcode = '42501', message = 'ADMIN_ACCESS_DENIED';
  end if;

  if not ((authorization_result -> 'context' -> 'permissionKeys') ? p_permission_key) then
    raise exception using errcode = '42501', message = 'MISSING_PERMISSION';
  end if;

  return (authorization_result -> 'context' ->> 'adminSessionId')::uuid;
end;
$$;

create or replace function private.claim_wallet_rate_limit(
  p_scope text,
  p_subject_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  if p_scope not in (
       'challenge_ip', 'challenge_wallet', 'verification_ip', 'verification_wallet',
       'verification_challenge', 'recheck_wallet', 'recheck_session'
     )
     or char_length(p_subject_key) not between 1 and 128
     or p_limit not between 1 and 1000
     or p_window_seconds not between 1 and 600 then
    raise exception using errcode = '22023', message = 'INVALID_WALLET_RATE_LIMIT_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wallet-rate:' || p_scope || ':' || p_subject_key, 0)
  );

  insert into public.wallet_auth_rate_limits (
    scope, subject_key, attempt_count, window_started_at, window_expires_at, updated_at
  ) values (
    p_scope, p_subject_key, 1, now(), now() + make_interval(secs => p_window_seconds), now()
  )
  on conflict (scope, subject_key) do update
  set attempt_count = case
        when wallet_auth_rate_limits.window_expires_at <= now() then 1
        else wallet_auth_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when wallet_auth_rate_limits.window_expires_at <= now() then now()
        else wallet_auth_rate_limits.window_started_at
      end,
      window_expires_at = case
        when wallet_auth_rate_limits.window_expires_at <= now()
          then now() + make_interval(secs => p_window_seconds)
        else wallet_auth_rate_limits.window_expires_at
      end,
      updated_at = now()
  where wallet_auth_rate_limits.window_expires_at <= now()
     or wallet_auth_rate_limits.attempt_count < p_limit
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.get_token_gate_runtime_config(
  p_environment_key text,
  p_network text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', config.id,
        'environmentKey', config.environment_key,
        'network', config.network,
        'mintAddress', config.mint_address,
        'tokenProgram', config.token_program,
        'symbol', config.symbol,
        'decimals', config.decimals,
        'requiredAmountRaw', config.required_amount_raw::text,
        'requiredAmount', config.required_display_amount,
        'enabled', config.enabled,
        'availability', case
          when not config.enabled then 'disabled'
          when config.validation_state = 'validated' then 'available'
          else 'unconfigured'
        end,
        'commitment', config.commitment,
        'sessionTtlSeconds', config.session_ttl_seconds,
        'recheckIntervalSeconds', config.recheck_interval_seconds,
        'configVersion', config.config_version,
        'lastValidatedAt', config.last_validated_at,
        'lastValidatedSlot', config.last_validated_slot::text
      )
      from public.token_gate_configs as config
      where config.environment_key = p_environment_key
        and config.network = p_network
    ),
    jsonb_build_object('availability', 'unconfigured')
  );
$$;

create or replace function public.create_wallet_auth_challenge(
  p_challenge_id uuid,
  p_environment_key text,
  p_wallet_address text,
  p_network text,
  p_nonce_hash text,
  p_message_hash text,
  p_domain text,
  p_uri text,
  p_issued_at timestamptz,
  p_expires_at timestamptz,
  p_request_id text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.token_gate_configs%rowtype;
  ip_allowed boolean;
  wallet_allowed boolean;
begin
  if p_challenge_id is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_network not in ('solana:devnet', 'solana:mainnet-beta')
     or p_nonce_hash !~ '^[0-9a-f]{64}$'
     or p_message_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash !~ '^[0-9a-f]{64}$'
     or (p_user_agent_hash is not null and p_user_agent_hash !~ '^[0-9a-f]{64}$')
     or char_length(p_request_id) not between 1 and 128
     or char_length(p_domain) not between 1 and 253
     or char_length(p_uri) not between 1 and 2048
     or p_rate_limit not between 1 and 60
     or p_issued_at < now() - interval '30 seconds'
     or p_issued_at > now() + interval '30 seconds'
     or p_expires_at <= p_issued_at
     or p_expires_at > p_issued_at + interval '10 minutes' then
    raise exception using errcode = '22023', message = 'INVALID_CHALLENGE_INPUT';
  end if;

  select * into config
  from public.token_gate_configs
  where environment_key = p_environment_key and network = p_network;

  if not found or not config.enabled or config.validation_state <> 'validated' then
    return jsonb_build_object('status', 'configuration_unavailable');
  end if;

  ip_allowed := private.claim_wallet_rate_limit(
    'challenge_ip', p_ip_hash, p_rate_limit, 60
  );
  wallet_allowed := private.claim_wallet_rate_limit(
    'challenge_wallet', p_wallet_address, p_rate_limit, 60
  );

  if not ip_allowed or not wallet_allowed then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  insert into public.wallet_auth_challenges (
    id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    nonce_hash, message_hash, domain, uri, issued_at, expires_at,
    request_id, ip_hash, user_agent_hash
  ) values (
    p_challenge_id, p_wallet_address, p_network, config.id, config.config_version,
    p_nonce_hash, p_message_hash, p_domain, p_uri, p_issued_at, p_expires_at,
    p_request_id, p_ip_hash, p_user_agent_hash
  );

  insert into public.wallet_access_events (
    wallet_address, event, result, token_gate_config_id, config_version,
    challenge_id, request_id
  ) values (
    p_wallet_address, 'wallet.challenge.created', 'success', config.id,
    config.config_version, p_challenge_id, p_request_id
  );

  return jsonb_build_object(
    'status', 'created',
    'challengeId', p_challenge_id,
    'configId', config.id,
    'configVersion', config.config_version
  );
end;
$$;

create or replace function public.load_wallet_auth_challenge(
  p_challenge_id uuid,
  p_wallet_address text,
  p_ip_hash text,
  p_verification_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.wallet_auth_challenges%rowtype;
  challenge_allowed boolean;
  ip_allowed boolean;
  wallet_allowed boolean;
begin
  if p_challenge_id is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_verification_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'INVALID_CHALLENGE_LOOKUP';
  end if;

  select * into challenge
  from public.wallet_auth_challenges
  where id = p_challenge_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if challenge.consumed_at is not null then
    return jsonb_build_object('status', 'used');
  end if;

  if challenge.expired_at is not null or challenge.expires_at <= now() then
    update public.wallet_auth_challenges
    set expired_at = coalesce(expired_at, now())
    where id = challenge.id and expired_at is null;

    if found then
      insert into public.wallet_access_events (
        wallet_address, event, result, reason_code, token_gate_config_id,
        config_version, challenge_id, request_id
      ) values (
        challenge.wallet_address, 'wallet.challenge.expired', 'denied', 'CHALLENGE_EXPIRED',
        challenge.token_gate_config_id, challenge.config_version_snapshot,
        challenge.id, challenge.request_id
      );
    end if;

    return jsonb_build_object('status', 'expired');
  end if;

  ip_allowed := private.claim_wallet_rate_limit(
    'verification_ip', p_ip_hash, p_verification_limit, 300
  );
  wallet_allowed := private.claim_wallet_rate_limit(
    'verification_wallet', challenge.wallet_address, p_verification_limit, 300
  );
  challenge_allowed := private.claim_wallet_rate_limit(
    'verification_challenge', challenge.id::text, p_verification_limit, 300
  );

  if not ip_allowed
     or not wallet_allowed
     or not challenge_allowed
     or challenge.verification_attempts >= p_verification_limit then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.wallet_auth_challenges
  set verification_attempts = verification_attempts + 1
  where id = challenge.id;

  if challenge.wallet_address <> p_wallet_address then
    return jsonb_build_object('status', 'rejected');
  end if;

  return jsonb_build_object(
    'status', 'loaded',
    'challengeId', challenge.id,
    'walletAddress', challenge.wallet_address,
    'network', challenge.network,
    'configId', challenge.token_gate_config_id,
    'configVersion', challenge.config_version_snapshot,
    'nonceHash', challenge.nonce_hash,
    'messageHash', challenge.message_hash,
    'domain', challenge.domain,
    'uri', challenge.uri,
    'issuedAt', challenge.issued_at,
    'expiresAt', challenge.expires_at
  );
end;
$$;

create or replace function public.claim_admin_token_gate_validation_slot(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_request_id text,
  p_rate_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'token_gate.configure'
  );

  if char_length(p_request_id) not between 1 and 128 or p_rate_limit not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_ADMIN_RATE_LIMIT_INPUT';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('token-gate-validate:' || p_user_id::text, 0)
  );

  if (
    select count(*) >= p_rate_limit
    from public.admin_audit_logs
    where actor_user_id = p_user_id
      and event_key = 'token_gate.configuration.validation_requested'
      and created_at >= now() - interval '1 minute'
  ) then
    return false;
  end if;

  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'token_gate.configuration.validation_requested', p_user_id, admin_session_id,
    p_request_id, 'success', jsonb_build_object('operation', 'validate_mint')
  );

  return true;
end;
$$;

create or replace function public.consume_wallet_auth_challenge(
  p_challenge_id uuid,
  p_wallet_address text,
  p_network text,
  p_nonce_hash text,
  p_message_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge public.wallet_auth_challenges%rowtype;
  config public.token_gate_configs%rowtype;
begin
  update public.wallet_auth_challenges
  set consumed_at = now()
  where id = p_challenge_id
    and consumed_at is null
    and expired_at is null
    and expires_at > now()
    and wallet_address = p_wallet_address
    and network = p_network
    and nonce_hash = p_nonce_hash
    and message_hash = p_message_hash
  returning * into challenge;

  if not found then
    return jsonb_build_object('status', 'rejected');
  end if;

  select * into config
  from public.token_gate_configs
  where id = challenge.token_gate_config_id;

  if not found
     or not config.enabled
     or config.validation_state <> 'validated'
     or config.config_version <> challenge.config_version_snapshot then
    return jsonb_build_object('status', 'configuration_changed');
  end if;

  return jsonb_build_object(
    'status', 'consumed',
    'challengeId', challenge.id,
    'walletAddress', challenge.wallet_address,
    'network', challenge.network,
    'configId', config.id,
    'configVersion', config.config_version,
    'mintAddress', config.mint_address,
    'tokenProgram', config.token_program,
    'symbol', config.symbol,
    'decimals', config.decimals,
    'requiredAmountRaw', config.required_amount_raw::text,
    'requiredAmount', config.required_display_amount,
    'commitment', config.commitment,
    'sessionTtlSeconds', config.session_ttl_seconds,
    'recheckIntervalSeconds', config.recheck_interval_seconds
  );
end;
$$;

create or replace function public.create_wallet_access_session(
  p_challenge_id uuid,
  p_wallet_address text,
  p_network text,
  p_config_id uuid,
  p_config_version integer,
  p_session_token_hash text,
  p_observed_balance_raw text,
  p_required_balance_raw text,
  p_checked_slot bigint,
  p_expires_at timestamptz,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  config public.token_gate_configs%rowtype;
  challenge public.wallet_auth_challenges%rowtype;
  session_id uuid;
  observed numeric(78, 0);
  required numeric(78, 0);
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_observed_balance_raw !~ '^[0-9]+$'
     or p_required_balance_raw !~ '^[0-9]+$'
     or p_checked_slot < 0
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SESSION_INPUT';
  end if;

  observed := p_observed_balance_raw::numeric;
  required := p_required_balance_raw::numeric;

  select * into config
  from public.token_gate_configs
  where id = p_config_id
  for update;

  if not found
     or not config.enabled
     or config.validation_state <> 'validated'
     or config.network <> p_network
     or config.config_version <> p_config_version
     or config.required_amount_raw <> required
     or config.last_validated_slot is null
     or p_checked_slot < config.last_validated_slot
     or observed < required
     or p_expires_at <= now()
     or p_expires_at > now() + make_interval(secs => config.session_ttl_seconds + 5) then
    return jsonb_build_object('status', 'configuration_changed');
  end if;

  select * into challenge
  from public.wallet_auth_challenges
  where id = p_challenge_id
  for update;

  if not found
     or challenge.wallet_address <> p_wallet_address
     or challenge.network <> p_network
     or challenge.token_gate_config_id <> p_config_id
     or challenge.config_version_snapshot <> p_config_version
     or challenge.consumed_at is null
     or challenge.expired_at is not null
     or challenge.consumed_at > challenge.expires_at
     or exists (
       select 1 from public.wallet_access_sessions
       where challenge_id = p_challenge_id
     ) then
    return jsonb_build_object('status', 'challenge_invalid');
  end if;

  update public.wallet_access_sessions
  set status = 'revoked', revoked_at = now(), revoke_reason = 'rotated',
      recheck_claim_id = null, recheck_claimed_at = null
  where wallet_address = p_wallet_address and network = p_network and status = 'active';

  insert into public.wallet_access_sessions (
    challenge_id, wallet_address, network, token_gate_config_id, config_version_snapshot,
    session_token_hash, status, observed_balance_raw, required_balance_raw,
    checked_slot, last_balance_check_at, expires_at
  ) values (
    p_challenge_id, p_wallet_address, p_network, p_config_id, p_config_version,
    p_session_token_hash, 'active', observed, required,
    p_checked_slot, now(), p_expires_at
  ) returning id into session_id;

  insert into public.wallet_access_events (
    wallet_address, event, result, token_gate_config_id, config_version,
    observed_balance_raw, required_balance_raw, checked_slot,
    challenge_id, session_id, request_id
  ) values (
    p_wallet_address, 'wallet.access.granted', 'success', p_config_id, p_config_version,
    observed, required, p_checked_slot, p_challenge_id, session_id, p_request_id
  );

  return jsonb_build_object(
    'status', 'created',
    'sessionId', session_id,
    'walletAddress', p_wallet_address,
    'expiresAt', p_expires_at,
    'lastBalanceCheckAt', now()
  );
end;
$$;

create or replace function public.get_wallet_access_session(p_session_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.wallet_access_sessions%rowtype;
  config public.token_gate_configs%rowtype;
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('status', 'none');
  end if;

  select * into session_record
  from public.wallet_access_sessions
  where session_token_hash = p_session_token_hash
  for update;

  if not found then
    return jsonb_build_object('status', 'none');
  end if;

  select * into config from public.token_gate_configs where id = session_record.token_gate_config_id;

  if session_record.status <> 'active' then
    return jsonb_build_object('status', session_record.status);
  end if;

  if session_record.expires_at <= now() then
    update public.wallet_access_sessions
    set status = 'expired', revoked_at = now(), revoke_reason = 'expired',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'expired');
  end if;

  if not found
     or not config.enabled
     or config.validation_state <> 'validated'
     or config.config_version <> session_record.config_version_snapshot then
    update public.wallet_access_sessions
    set status = 'configuration_changed', revoked_at = now(), revoke_reason = 'configuration_changed',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'configuration_changed');
  end if;

  return jsonb_build_object(
    'status', 'active',
    'sessionId', session_record.id,
    'walletAddress', session_record.wallet_address,
    'network', session_record.network,
    'configId', config.id,
    'configVersion', config.config_version,
    'mintAddress', config.mint_address,
    'tokenProgram', config.token_program,
    'symbol', config.symbol,
    'decimals', config.decimals,
    'requiredAmountRaw', session_record.required_balance_raw::text,
    'requiredAmount', config.required_display_amount,
    'observedAmountRaw', session_record.observed_balance_raw::text,
    'checkedSlot', session_record.checked_slot::text,
    'lastBalanceCheckAt', session_record.last_balance_check_at,
    'recheckIntervalSeconds', config.recheck_interval_seconds,
    'recheckDue', session_record.last_balance_check_at + make_interval(secs => config.recheck_interval_seconds) <= now(),
    'expiresAt', session_record.expires_at,
    'commitment', config.commitment
  );
end;
$$;

create or replace function public.claim_wallet_access_recheck(
  p_session_token_hash text,
  p_claim_id uuid,
  p_request_id text,
  p_minimum_interval_seconds integer,
  p_claim_lease_seconds integer,
  p_rate_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.wallet_access_sessions%rowtype;
  config public.token_gate_configs%rowtype;
  session_allowed boolean;
  wallet_allowed boolean;
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_claim_id is null
     or char_length(p_request_id) not between 1 and 128
     or p_minimum_interval_seconds not between 1 and 60
     or p_claim_lease_seconds not between 1 and 180
     or p_rate_limit not between 1 and 60 then
    raise exception using errcode = '22023', message = 'INVALID_RECHECK_CLAIM';
  end if;

  select * into session_record
  from public.wallet_access_sessions
  where session_token_hash = p_session_token_hash
  for update;

  if not found or session_record.status <> 'active' then
    return jsonb_build_object('status', 'none');
  end if;

  if session_record.expires_at <= now() then
    update public.wallet_access_sessions
    set status = 'expired', revoked_at = now(), revoke_reason = 'expired',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'expired');
  end if;

  select * into config
  from public.token_gate_configs
  where id = session_record.token_gate_config_id;

  if not found
     or not config.enabled
     or config.validation_state <> 'validated'
     or config.config_version <> session_record.config_version_snapshot then
    update public.wallet_access_sessions
    set status = 'configuration_changed', revoked_at = now(),
        revoke_reason = 'configuration_changed', recheck_claim_id = null,
        recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'configuration_changed');
  end if;

  if session_record.last_balance_check_at + make_interval(secs => p_minimum_interval_seconds) > now()
     or (
       session_record.recheck_claim_id is not null
       and session_record.recheck_claimed_at + make_interval(secs => p_claim_lease_seconds) > now()
     ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  wallet_allowed := private.claim_wallet_rate_limit(
    'recheck_wallet', session_record.wallet_address, p_rate_limit, 60
  );
  session_allowed := private.claim_wallet_rate_limit(
    'recheck_session', p_session_token_hash, p_rate_limit, 60
  );

  if not wallet_allowed or not session_allowed then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  update public.wallet_access_sessions
  set recheck_claim_id = p_claim_id, recheck_claimed_at = now()
  where id = session_record.id;

  return jsonb_build_object('status', 'claimed', 'claimId', p_claim_id);
end;
$$;

create or replace function public.update_wallet_access_session_balance(
  p_session_token_hash text,
  p_claim_id uuid,
  p_observed_balance_raw text,
  p_checked_slot bigint,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.wallet_access_sessions%rowtype;
  config public.token_gate_configs%rowtype;
  observed numeric(78, 0);
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_claim_id is null
     or p_observed_balance_raw !~ '^[0-9]+$'
     or p_checked_slot < 0
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_RECHECK_INPUT';
  end if;

  observed := p_observed_balance_raw::numeric;
  select * into session_record
  from public.wallet_access_sessions
  where session_token_hash = p_session_token_hash
  for update;

  if not found or session_record.status <> 'active' then
    return jsonb_build_object('status', 'none');
  end if;

  if session_record.recheck_claim_id is distinct from p_claim_id
     or session_record.recheck_claimed_at is null then
    return jsonb_build_object('status', 'claim_invalid');
  end if;

  select * into config
  from public.token_gate_configs
  where id = session_record.token_gate_config_id;

  if not found
     or config.config_version <> session_record.config_version_snapshot
     or not config.enabled
     or config.validation_state <> 'validated' then
    update public.wallet_access_sessions
    set status = 'configuration_changed', revoked_at = now(), revoke_reason = 'configuration_changed',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'configuration_changed');
  end if;

  if p_checked_slot < session_record.checked_slot then
    update public.wallet_access_sessions
    set status = 'revoked', revoked_at = now(), revoke_reason = 'stale_balance_slot',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;
    return jsonb_build_object('status', 'stale_slot');
  end if;

  if observed < session_record.required_balance_raw then
    update public.wallet_access_sessions
    set status = 'insufficient_balance', observed_balance_raw = observed,
        checked_slot = p_checked_slot, last_balance_check_at = now(),
        revoked_at = now(), revoke_reason = 'insufficient_balance',
        recheck_claim_id = null, recheck_claimed_at = null
    where id = session_record.id;

    insert into public.wallet_access_events (
      wallet_address, event, result, reason_code, token_gate_config_id, config_version,
      observed_balance_raw, required_balance_raw, checked_slot, session_id, request_id
    ) values (
      session_record.wallet_address, 'wallet.access.insufficient', 'denied', 'INSUFFICIENT_BALANCE',
      config.id, config.config_version, observed, session_record.required_balance_raw,
      p_checked_slot, session_record.id, p_request_id
    );
    return jsonb_build_object('status', 'insufficient_balance');
  end if;

  update public.wallet_access_sessions
  set observed_balance_raw = observed, checked_slot = p_checked_slot, last_balance_check_at = now(),
      recheck_claim_id = null, recheck_claimed_at = null
  where id = session_record.id;

  insert into public.wallet_access_events (
    wallet_address, event, result, token_gate_config_id, config_version,
    observed_balance_raw, required_balance_raw, checked_slot, session_id, request_id
  ) values (
    session_record.wallet_address, 'wallet.access.rechecked', 'success',
    config.id, config.config_version, observed, session_record.required_balance_raw,
    p_checked_slot, session_record.id, p_request_id
  );

  return jsonb_build_object('status', 'active', 'lastBalanceCheckAt', now());
end;
$$;

create or replace function public.revoke_wallet_access_session(
  p_session_token_hash text,
  p_reason text,
  p_request_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.wallet_access_sessions%rowtype;
begin
  if p_session_token_hash !~ '^[0-9a-f]{64}$'
     or p_reason not in ('disconnect', 'account_changed', 'network_changed', 'administrative') then
    return false;
  end if;

  update public.wallet_access_sessions
  set status = 'revoked', revoked_at = now(), revoke_reason = p_reason,
      recheck_claim_id = null, recheck_claimed_at = null
  where session_token_hash = p_session_token_hash and status = 'active'
  returning * into session_record;

  if found then
    insert into public.wallet_access_events (
      wallet_address, event, result, reason_code, token_gate_config_id,
      config_version, session_id, request_id
    ) values (
      session_record.wallet_address, 'wallet.access.revoked', 'success', upper(p_reason),
      session_record.token_gate_config_id, session_record.config_version_snapshot,
      session_record.id, p_request_id
    );
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.record_wallet_access_event(
  p_wallet_address text,
  p_event text,
  p_result text,
  p_reason_code text,
  p_config_id uuid,
  p_config_version integer,
  p_observed_balance_raw text,
  p_required_balance_raw text,
  p_checked_slot bigint,
  p_challenge_id uuid,
  p_session_id uuid,
  p_request_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 2048
     or p_metadata::text ~* '(signature|signed.?message|nonce|cookie|session.?token|authorization|rpc.?url|private.?key|seed.?phrase)' then
    raise exception using errcode = '22023', message = 'UNSAFE_EVENT_METADATA';
  end if;

  insert into public.wallet_access_events (
    wallet_address, event, result, reason_code, token_gate_config_id, config_version,
    observed_balance_raw, required_balance_raw, checked_slot, challenge_id,
    session_id, request_id, metadata
  ) values (
    p_wallet_address, p_event, p_result, p_reason_code, p_config_id, p_config_version,
    case when p_observed_balance_raw is null then null else p_observed_balance_raw::numeric end,
    case when p_required_balance_raw is null then null else p_required_balance_raw::numeric end,
    p_checked_slot, p_challenge_id, p_session_id, p_request_id, p_metadata
  ) returning id into event_id;

  return event_id;
end;
$$;

create or replace function public.get_admin_token_gate_config(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'token_gate.read'
  );
  return public.get_token_gate_runtime_config(p_environment_key, p_network);
end;
$$;

create or replace function public.update_admin_token_gate_config(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_environment_key text,
  p_network text,
  p_expected_config_version integer,
  p_enabled boolean,
  p_mint_address text,
  p_token_program text,
  p_symbol text,
  p_decimals smallint,
  p_required_amount_raw text,
  p_required_display_amount text,
  p_commitment text,
  p_session_ttl_seconds integer,
  p_recheck_interval_seconds integer,
  p_validated_slot bigint,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  config public.token_gate_configs%rowtype;
  previous jsonb;
begin
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'token_gate.configure'
  );

  if p_expected_config_version < 1
     or p_mint_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_token_program not in ('spl-token', 'spl-token-2022')
     or p_symbol !~ '^[A-Z0-9]{1,16}$'
     or p_decimals not between 0 and 18
     or p_required_amount_raw !~ '^[1-9][0-9]*$'
     or p_required_display_amount !~ '^[0-9]+(\.[0-9]+)?$'
     or p_commitment not in ('confirmed', 'finalized')
     or p_session_ttl_seconds not between 60 and 3600
     or p_recheck_interval_seconds not between 30 and least(1800, p_session_ttl_seconds)
     or p_validated_slot < 0
     or char_length(p_reason) not between 3 and 500
     or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_TOKEN_GATE_UPDATE';
  end if;

  select * into config
  from public.token_gate_configs
  where environment_key = p_environment_key and network = p_network
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'TOKEN_GATE_CONFIG_NOT_FOUND';
  end if;

  if config.config_version <> p_expected_config_version then
    raise exception using errcode = '40001', message = 'CONFIG_VERSION_CONFLICT';
  end if;

  previous := jsonb_build_object(
    'enabled', config.enabled,
    'mintAddress', config.mint_address,
    'tokenProgram', config.token_program,
    'symbol', config.symbol,
    'decimals', config.decimals,
    'requiredAmount', config.required_display_amount,
    'commitment', config.commitment,
    'sessionTtlSeconds', config.session_ttl_seconds,
    'recheckIntervalSeconds', config.recheck_interval_seconds,
    'configVersion', config.config_version
  );

  update public.token_gate_configs
  set enabled = p_enabled,
      mint_address = p_mint_address,
      token_program = p_token_program,
      symbol = p_symbol,
      decimals = p_decimals,
      required_amount_raw = p_required_amount_raw::numeric,
      required_display_amount = p_required_display_amount,
      validation_state = 'validated',
      commitment = p_commitment,
      session_ttl_seconds = p_session_ttl_seconds,
      recheck_interval_seconds = p_recheck_interval_seconds,
      config_version = config_version + 1,
      last_validated_at = now(),
      last_validated_slot = p_validated_slot,
      updated_by = p_user_id
  where id = config.id
  returning * into config;

  update public.wallet_access_sessions
  set status = 'configuration_changed', revoked_at = now(), revoke_reason = 'configuration_changed',
      recheck_claim_id = null, recheck_claimed_at = null
  where token_gate_config_id = config.id and status = 'active';

  insert into public.admin_audit_logs (
    event_key, actor_user_id, admin_session_id, request_id, outcome, metadata
  ) values (
    'token_gate.configuration.updated', p_user_id, admin_session_id, p_request_id, 'success',
    jsonb_build_object(
      'reason', p_reason,
      'before', previous,
      'after', jsonb_build_object(
        'enabled', config.enabled,
        'mintAddress', config.mint_address,
        'tokenProgram', config.token_program,
        'symbol', config.symbol,
        'decimals', config.decimals,
        'requiredAmount', config.required_display_amount,
        'commitment', config.commitment,
        'sessionTtlSeconds', config.session_ttl_seconds,
        'recheckIntervalSeconds', config.recheck_interval_seconds,
        'configVersion', config.config_version
      )
    )
  );

  insert into public.wallet_access_events (
    event, result, token_gate_config_id, config_version, request_id,
    metadata
  ) values (
    'token_gate.configuration.updated', 'success', config.id, config.config_version,
    p_request_id, jsonb_build_object('actorUserId', p_user_id, 'reason', p_reason)
  );

  return public.get_token_gate_runtime_config(p_environment_key, p_network);
end;
$$;

-- Maintenance-only cleanup has no service_role grant. A reviewed scheduler can invoke
-- it as postgres after retention requirements are approved.
create or replace function private.cleanup_expired_token_access_records(p_before timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  challenge_count integer;
  rate_limit_count integer;
  session_count integer;
begin
  if session_user not in ('postgres', 'supabase_admin')
     or p_before > now() - interval '24 hours' then
    raise exception using errcode = '42501', message = 'TOKEN_ACCESS_CLEANUP_DENIED';
  end if;

  delete from public.wallet_access_sessions
  where expires_at < p_before
    and not exists (
      select 1 from public.wallet_access_events as event
      where event.session_id = wallet_access_sessions.id
    );
  get diagnostics session_count = row_count;

  delete from public.wallet_auth_challenges
  where expires_at < p_before
    and not exists (
      select 1 from public.wallet_access_events as event
      where event.challenge_id = wallet_auth_challenges.id
    )
    and not exists (
      select 1 from public.wallet_access_sessions as access_session
      where access_session.challenge_id = wallet_auth_challenges.id
    );
  get diagnostics challenge_count = row_count;

  delete from public.wallet_auth_rate_limits
  where window_expires_at < p_before;
  get diagnostics rate_limit_count = row_count;

  return jsonb_build_object(
    'challengesDeleted', challenge_count,
    'sessionsDeleted', session_count,
    'rateLimitsDeleted', rate_limit_count
  );
end;
$$;

revoke all on function private.assert_verified_admin_permission(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.claim_wallet_rate_limit(text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_expired_token_access_records(timestamptz)
  from public, anon, authenticated, service_role;

revoke all on function public.get_token_gate_runtime_config(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_wallet_auth_challenge(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.load_wallet_auth_challenge(uuid, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.consume_wallet_auth_challenge(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.create_wallet_access_session(uuid, text, text, uuid, integer, text, text, text, bigint, timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_wallet_access_session(text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_wallet_access_recheck(text, uuid, text, integer, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.update_wallet_access_session_balance(text, uuid, text, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function public.revoke_wallet_access_session(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.record_wallet_access_event(text, text, text, text, uuid, integer, text, text, bigint, uuid, uuid, text, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.get_admin_token_gate_config(uuid, uuid, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_admin_token_gate_validation_slot(uuid, uuid, text, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.update_admin_token_gate_config(uuid, uuid, text, text, text, integer, boolean, text, text, text, smallint, text, text, text, integer, integer, bigint, text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.get_token_gate_runtime_config(text, text) to service_role;
grant execute on function public.create_wallet_auth_challenge(uuid, text, text, text, text, text, text, text, timestamptz, timestamptz, text, text, text, integer) to service_role;
grant execute on function public.load_wallet_auth_challenge(uuid, text, text, integer) to service_role;
grant execute on function public.consume_wallet_auth_challenge(uuid, text, text, text, text) to service_role;
grant execute on function public.create_wallet_access_session(uuid, text, text, uuid, integer, text, text, text, bigint, timestamptz, text) to service_role;
grant execute on function public.get_wallet_access_session(text) to service_role;
grant execute on function public.claim_wallet_access_recheck(text, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.update_wallet_access_session_balance(text, uuid, text, bigint, text) to service_role;
grant execute on function public.revoke_wallet_access_session(text, text, text) to service_role;
grant execute on function public.record_wallet_access_event(text, text, text, text, uuid, integer, text, text, bigint, uuid, uuid, text, jsonb) to service_role;
grant execute on function public.get_admin_token_gate_config(uuid, uuid, text, text, text) to service_role;
grant execute on function public.claim_admin_token_gate_validation_slot(uuid, uuid, text, text, integer) to service_role;
grant execute on function public.update_admin_token_gate_config(uuid, uuid, text, text, text, integer, boolean, text, text, text, smallint, text, text, text, integer, integer, bigint, text, text) to service_role;
