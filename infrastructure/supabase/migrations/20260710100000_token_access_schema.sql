-- Starville Phase 3: server-authoritative wallet authentication and token access.
-- No player profile, gameplay, economy, reward, or inventory data is introduced here.

create table public.token_gate_configs (
  id uuid primary key default gen_random_uuid(),
  environment_key text not null check (environment_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  network text not null check (network in ('solana:devnet', 'solana:mainnet-beta')),
  mint_address text check (
    mint_address is null
    or (char_length(mint_address) between 32 and 44 and mint_address ~ '^[1-9A-HJ-NP-Za-km-z]+$')
  ),
  token_program text check (token_program is null or token_program in ('spl-token', 'spl-token-2022')),
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,16}$'),
  decimals smallint check (decimals is null or decimals between 0 and 18),
  required_amount_raw numeric(78, 0) check (required_amount_raw is null or required_amount_raw > 0),
  required_display_amount text not null check (required_display_amount ~ '^[0-9]+(\.[0-9]+)?$'),
  enabled boolean not null default true,
  validation_state text not null default 'unconfigured'
    check (validation_state in ('unconfigured', 'validated', 'invalid')),
  commitment text not null default 'confirmed' check (commitment in ('confirmed', 'finalized')),
  session_ttl_seconds integer not null default 900 check (session_ttl_seconds between 60 and 3600),
  recheck_interval_seconds integer not null default 300
    check (recheck_interval_seconds between 30 and 1800),
  config_version integer not null default 1 check (config_version > 0),
  last_validated_at timestamptz,
  last_validated_slot bigint check (last_validated_slot is null or last_validated_slot >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint token_gate_config_validation_check check (
    (
      validation_state = 'validated'
      and mint_address is not null
      and token_program is not null
      and decimals is not null
      and required_amount_raw is not null
      and last_validated_at is not null
      and last_validated_slot is not null
    )
    or validation_state <> 'validated'
  ),
  constraint token_gate_config_recheck_check check (
    recheck_interval_seconds <= session_ttl_seconds
  ),
  unique (environment_key, network)
);

comment on table public.token_gate_configs is
  'Versioned public token-access requirements. RPC credentials are never stored here.';

create table public.wallet_auth_challenges (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null check (
    char_length(wallet_address) between 32 and 44
    and wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]+$'
  ),
  network text not null check (network in ('solana:devnet', 'solana:mainnet-beta')),
  token_gate_config_id uuid not null references public.token_gate_configs(id) on delete restrict,
  config_version_snapshot integer not null check (config_version_snapshot > 0),
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  message_hash text not null check (message_hash ~ '^[0-9a-f]{64}$'),
  domain text not null check (char_length(domain) between 1 and 253),
  uri text not null check (char_length(uri) between 1 and 2048),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  expired_at timestamptz,
  verification_attempts smallint not null default 0 check (verification_attempts between 0 and 10),
  request_id text not null check (char_length(request_id) between 1 and 128),
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent_hash text check (user_agent_hash is null or user_agent_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  constraint wallet_auth_challenge_time_check check (
    expires_at > issued_at and expires_at <= issued_at + interval '10 minutes'
  ),
  constraint wallet_auth_challenge_terminal_state_check check (
    not (consumed_at is not null and expired_at is not null)
    and (consumed_at is null or consumed_at >= issued_at)
    and (expired_at is null or expired_at >= issued_at)
  )
);

comment on table public.wallet_auth_challenges is
  'Short-lived one-time wallet challenges. Nonces and canonical messages are retained only as SHA-256 hashes.';

create index wallet_auth_challenges_wallet_created_idx
  on public.wallet_auth_challenges(wallet_address, created_at desc);
create index wallet_auth_challenges_ip_created_idx
  on public.wallet_auth_challenges(ip_hash, created_at desc);
create index wallet_auth_challenges_expiry_idx
  on public.wallet_auth_challenges(expires_at)
  where consumed_at is null and expired_at is null;

create table public.wallet_auth_rate_limits (
  scope text not null check (scope in (
    'challenge_ip', 'challenge_wallet', 'verification_ip', 'verification_wallet',
    'verification_challenge', 'recheck_wallet', 'recheck_session'
  )),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  attempt_count integer not null check (attempt_count between 1 and 1000000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_key),
  constraint wallet_auth_rate_limit_window_check check (
    window_expires_at > window_started_at
    and window_expires_at <= window_started_at + interval '10 minutes'
  )
);

comment on table public.wallet_auth_rate_limits is
  'Durable fixed-window counters for wallet-authentication and balance-recheck abuse prevention.';

create index wallet_auth_rate_limits_expiry_idx
  on public.wallet_auth_rate_limits(window_expires_at);

create table public.wallet_access_sessions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.wallet_auth_challenges(id) on delete restrict,
  wallet_address text not null check (
    char_length(wallet_address) between 32 and 44
    and wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]+$'
  ),
  network text not null check (network in ('solana:devnet', 'solana:mainnet-beta')),
  token_gate_config_id uuid not null references public.token_gate_configs(id) on delete restrict,
  config_version_snapshot integer not null check (config_version_snapshot > 0),
  session_token_hash text not null unique check (session_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired', 'insufficient_balance', 'configuration_changed')),
  observed_balance_raw numeric(78, 0) not null check (observed_balance_raw >= 0),
  required_balance_raw numeric(78, 0) not null check (required_balance_raw > 0),
  checked_slot bigint not null check (checked_slot >= 0),
  last_balance_check_at timestamptz not null,
  recheck_claim_id uuid,
  recheck_claimed_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text check (
    revoke_reason is null or revoke_reason in (
      'disconnect', 'expired', 'insufficient_balance', 'configuration_changed',
      'account_changed', 'network_changed', 'rotated', 'administrative', 'stale_balance_slot'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_access_session_expiration_check check (
    expires_at > created_at and expires_at <= created_at + interval '1 hour'
  ),
  constraint wallet_access_session_revocation_check check (
    (status = 'active' and revoked_at is null and revoke_reason is null)
    or (status <> 'active' and revoked_at is not null and revoke_reason is not null)
  ),
  constraint wallet_access_session_recheck_claim_check check (
    (recheck_claim_id is null and recheck_claimed_at is null)
    or (recheck_claim_id is not null and recheck_claimed_at is not null)
  )
);

comment on table public.wallet_access_sessions is
  'Revocable wallet access sessions. Only an HMAC of each opaque browser cookie is stored.';

create index wallet_access_sessions_wallet_created_idx
  on public.wallet_access_sessions(wallet_address, created_at desc);
create index wallet_access_sessions_active_expiry_idx
  on public.wallet_access_sessions(expires_at)
  where status = 'active';
create index wallet_access_sessions_config_version_idx
  on public.wallet_access_sessions(token_gate_config_id, config_version_snapshot)
  where status = 'active';

create table public.wallet_access_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text check (
    wallet_address is null
    or (char_length(wallet_address) between 32 and 44 and wallet_address ~ '^[1-9A-HJ-NP-Za-km-z]+$')
  ),
  event text not null check (event in (
    'wallet.challenge.created', 'wallet.challenge.expired', 'wallet.signature.verified',
    'wallet.signature.denied', 'wallet.access.granted', 'wallet.access.insufficient',
    'wallet.access.revoked', 'wallet.access.expired', 'wallet.access.rechecked',
    'wallet.network.mismatch', 'wallet.rpc.unavailable', 'token_gate.configuration.updated'
  )),
  result text not null check (result in ('success', 'denied', 'error')),
  reason_code text check (reason_code is null or reason_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  token_gate_config_id uuid references public.token_gate_configs(id) on delete set null,
  config_version integer check (config_version is null or config_version > 0),
  observed_balance_raw numeric(78, 0) check (observed_balance_raw is null or observed_balance_raw >= 0),
  required_balance_raw numeric(78, 0) check (required_balance_raw is null or required_balance_raw > 0),
  checked_slot bigint check (checked_slot is null or checked_slot >= 0),
  challenge_id uuid references public.wallet_auth_challenges(id) on delete set null,
  session_id uuid references public.wallet_access_sessions(id) on delete set null,
  request_id text check (request_id is null or char_length(request_id) between 1 and 128),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.wallet_access_events is
  'Append-only wallet access audit events. Raw signatures, nonces, messages, cookies, RPC URLs, IPs, and user agents are forbidden.';

create index wallet_access_events_wallet_created_idx
  on public.wallet_access_events(wallet_address, created_at desc)
  where wallet_address is not null;
create index wallet_access_events_event_created_idx
  on public.wallet_access_events(event, created_at desc);
create index wallet_access_events_request_idx
  on public.wallet_access_events(request_id)
  where request_id is not null;

create trigger token_gate_configs_set_updated_at
before update on public.token_gate_configs
for each row execute function private.set_updated_at();

create trigger wallet_access_sessions_set_updated_at
before update on public.wallet_access_sessions
for each row execute function private.set_updated_at();

create or replace function private.protect_wallet_access_event()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Wallet access events are append-only';
end;
$$;

create trigger wallet_access_events_append_only
before update or delete on public.wallet_access_events
for each row execute function private.protect_wallet_access_event();

alter table public.token_gate_configs enable row level security;
alter table public.wallet_auth_challenges enable row level security;
alter table public.wallet_auth_rate_limits enable row level security;
alter table public.wallet_access_sessions enable row level security;
alter table public.wallet_access_events enable row level security;

revoke all on table public.token_gate_configs from anon, authenticated, service_role;
revoke all on table public.wallet_auth_challenges from anon, authenticated, service_role;
revoke all on table public.wallet_auth_rate_limits from anon, authenticated, service_role;
revoke all on table public.wallet_access_sessions from anon, authenticated, service_role;
revoke all on table public.wallet_access_events from anon, authenticated, service_role;
revoke all on function private.protect_wallet_access_event() from public, anon, authenticated, service_role;

insert into public.token_gate_configs (
  environment_key,
  network,
  symbol,
  required_display_amount,
  enabled,
  validation_state,
  commitment,
  session_ttl_seconds,
  recheck_interval_seconds
)
values
  ('development', 'solana:devnet', 'STAR', '1000', true, 'unconfigured', 'confirmed', 900, 300),
  ('development', 'solana:mainnet-beta', 'STAR', '1000', true, 'unconfigured', 'confirmed', 900, 300)
on conflict (environment_key, network) do nothing;
