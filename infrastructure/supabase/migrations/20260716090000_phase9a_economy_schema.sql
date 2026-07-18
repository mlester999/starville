-- Starville Phase 9A: server-authoritative off-chain DUST economy hardening.
-- This migration is additive. DUST remains non-transferable, off-chain game state.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('economy.audit.read', 'Read economy audit', 'Read bounded DUST ledger, receipt, and reconciliation history.', 'economy', true, true),
  ('economy.risk.read', 'Read economy risk signals', 'Read bounded, explainable economy risk signals.', 'economy', true, true),
  ('economy.risk.review', 'Review economy risk signals', 'Review or resolve an economy risk signal without automatic punishment.', 'economy', true, true),
  ('economy.settings.read', 'Read economy settings', 'Read the published economy policy and source/sink registry.', 'economy', false, true),
  ('economy.settings.edit', 'Edit economy settings', 'Create and edit bounded economy policy drafts.', 'economy', true, true),
  ('economy.settings.publish', 'Publish economy settings', 'Publish an exact reviewed economy policy version.', 'economy', true, true),
  ('economy.shop.read', 'Read economy shops', 'Read published shops and bounded shop-version history.', 'economy', false, true),
  ('economy.shop.edit', 'Edit economy shops', 'Create and edit versioned shop drafts.', 'economy', true, true),
  ('economy.shop.publish', 'Publish economy shops', 'Publish an exact reviewed shop version.', 'economy', true, true),
  ('economy.correction.create', 'Create economy corrections', 'Create an explained, bounded DUST correction request.', 'economy', true, true),
  ('economy.correction.review', 'Review economy corrections', 'Approve or reject DUST corrections under separation-of-duty rules.', 'economy', true, true),
  ('economy.simulation.run', 'Run economy simulations', 'Run isolated deterministic simulations that never mutate player balances.', 'economy', false, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'economy.audit.read'),
    ('game_administrator', 'economy.risk.read'),
    ('game_administrator', 'economy.risk.review'),
    ('game_administrator', 'economy.settings.read'),
    ('game_administrator', 'economy.settings.edit'),
    ('game_administrator', 'economy.settings.publish'),
    ('game_administrator', 'economy.shop.read'),
    ('game_administrator', 'economy.shop.edit'),
    ('game_administrator', 'economy.shop.publish'),
    ('game_administrator', 'economy.correction.create'),
    ('game_administrator', 'economy.correction.review'),
    ('game_administrator', 'economy.simulation.run'),
    ('economy_manager', 'economy.audit.read'),
    ('economy_manager', 'economy.risk.read'),
    ('economy_manager', 'economy.risk.review'),
    ('economy_manager', 'economy.settings.read'),
    ('economy_manager', 'economy.settings.edit'),
    ('economy_manager', 'economy.settings.publish'),
    ('economy_manager', 'economy.shop.read'),
    ('economy_manager', 'economy.shop.edit'),
    ('economy_manager', 'economy.shop.publish'),
    ('economy_manager', 'economy.correction.create'),
    ('economy_manager', 'economy.correction.review'),
    ('economy_manager', 'economy.simulation.run'),
    ('financial_reviewer', 'economy.audit.read'),
    ('financial_reviewer', 'economy.risk.read'),
    ('financial_reviewer', 'economy.settings.read'),
    ('financial_reviewer', 'economy.shop.read'),
    ('financial_reviewer', 'economy.correction.review'),
    ('financial_reviewer', 'economy.simulation.run'),
    ('live_operations_manager', 'economy.audit.read'),
    ('live_operations_manager', 'economy.risk.read'),
    ('live_operations_manager', 'economy.risk.review'),
    ('live_operations_manager', 'economy.settings.read'),
    ('live_operations_manager', 'economy.shop.read'),
    ('content_manager', 'economy.shop.read'),
    ('content_manager', 'economy.shop.edit'),
    ('moderator', 'economy.risk.read'),
    ('customer_support', 'economy.read'),
    ('customer_support', 'economy.correction.create'),
    ('read_only_analyst', 'economy.audit.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles role
cross join public.admin_permissions permission
where role.key = 'super_admin' and permission.key like 'economy.%'
on conflict (role_id, permission_id) do nothing;

create table public.economy_source_versions (
  id uuid primary key,
  source_key text not null check (source_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','in_review','published','superseded','retired')),
  operation_key text not null check (operation_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  category text not null check (category in ('starter_grant','gameplay_reward','activity_reward','administrative_correction','refund','migration_adjustment')),
  label text not null check (char_length(label) between 3 and 80 and label = btrim(label) and label !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 3 and 240 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  minimum_amount bigint not null check (minimum_amount between 1 and 1000000),
  maximum_amount bigint not null check (maximum_amount between 1 and 1000000 and maximum_amount >= minimum_amount),
  repeatable boolean not null,
  daily_limit integer check (daily_limit between 1 and 10000),
  weekly_limit integer check (weekly_limit between 1 and 70000 and (daily_limit is null or weekly_limit >= daily_limit)),
  account_lifetime_limit integer check (account_lifetime_limit between 1 and 1000000),
  wallet_daily_limit integer check (wallet_daily_limit between 1 and 10000),
  cooldown_seconds integer not null check (cooldown_seconds between 0 and 2592000),
  beginner_protected boolean not null,
  risk_weight numeric(5,2) not null check (risk_weight between 0 and 100),
  revision integer not null default 1 check (revision > 0),
  effective_at timestamptz not null default now(),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  unique (source_key, version_number),
  unique (source_key, id)
);

create table public.economy_active_source_versions (
  source_key text primary key,
  source_version_id uuid not null unique,
  activated_at timestamptz not null default now(),
  foreign key (source_key, source_version_id)
    references public.economy_source_versions(source_key, id) on delete restrict
);

create table public.economy_sink_versions (
  id uuid primary key,
  sink_key text not null check (sink_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','in_review','published','superseded','disabled','retired')),
  operation_key text not null check (operation_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  category text not null check (category in ('shop_purchase','crafting_cost','administrative_correction','migration_adjustment')),
  label text not null check (char_length(label) between 3 and 80 and label = btrim(label) and label !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 3 and 240 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  minimum_amount bigint not null check (minimum_amount between 1 and 1000000),
  maximum_amount bigint not null check (maximum_amount between 1 and 1000000 and maximum_amount >= minimum_amount),
  reversible_by_refund boolean not null,
  beginner_protected boolean not null,
  revision integer not null default 1 check (revision > 0),
  effective_at timestamptz not null default now(),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  unique (sink_key, version_number),
  unique (sink_key, id)
);

create table public.economy_active_sink_versions (
  sink_key text primary key,
  sink_version_id uuid not null unique,
  activated_at timestamptz not null default now(),
  foreign key (sink_key, sink_version_id)
    references public.economy_sink_versions(sink_key, id) on delete restrict
);

create table public.economy_policy_versions (
  id uuid primary key,
  version_number integer not null unique check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','in_review','published','superseded')),
  economy_enabled boolean not null default true,
  purchases_enabled boolean not null default true,
  rewards_enabled boolean not null default true,
  corrections_enabled boolean not null default true,
  starter_grant bigint not null check (starter_grant between 0 and 10000),
  beginner_protection_hours integer not null check (beginner_protection_hours between 0 and 720),
  low_value_correction_limit bigint not null check (low_value_correction_limit between 1 and 100000),
  high_value_correction_limit bigint not null check (high_value_correction_limit between 1 and 1000000),
  reconciliation_tolerance bigint not null default 0 check (reconciliation_tolerance = 0),
  purchase_rate_limit_per_minute integer not null check (purchase_rate_limit_per_minute between 1 and 60),
  history_retention_days integer not null check (history_retention_days between 30 and 2555),
  risk_review_threshold numeric(5,2) not null check (risk_review_threshold between 0 and 100),
  revision integer not null default 1 check (revision > 0),
  effective_at timestamptz not null default now(),
  validation_results jsonb check (validation_results is null or (
    jsonb_typeof(validation_results) = 'object' and octet_length(validation_results::text) <= 32768
  )),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  check (low_value_correction_limit < high_value_correction_limit)
);

create table public.economy_active_policy (
  singleton_key boolean primary key default true check (singleton_key),
  policy_version_id uuid not null unique references public.economy_policy_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.economy_shop_versions (
  id uuid primary key,
  shop_definition_id uuid not null references public.cozy_shop_definitions(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','in_review','published','superseded','disabled')),
  name text not null check (char_length(name) between 3 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 3 and 280 and description = btrim(description) and description !~ '[[:cntrl:]<>]'),
  interaction_key text not null check (interaction_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  revision integer not null default 1 check (revision > 0),
  effective_at timestamptz not null default now(),
  validation_results jsonb check (validation_results is null or (
    jsonb_typeof(validation_results) = 'object' and octet_length(validation_results::text) <= 32768
  )),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  unique (shop_definition_id, version_number),
  unique (shop_definition_id, id)
);

create table public.economy_shop_version_offers (
  shop_version_id uuid not null references public.economy_shop_versions(id) on delete restrict,
  offer_id uuid not null references public.cozy_shop_offers(id) on delete restrict,
  unit_price bigint not null check (unit_price between 1 and 1000000),
  maximum_quantity integer not null check (maximum_quantity between 1 and 99),
  daily_limit integer not null check (daily_limit between 1 and 999),
  cooldown_seconds integer not null check (cooldown_seconds between 0 and 86400),
  inventory_capacity_cost integer not null default 1 check (inventory_capacity_cost between 1 and 99),
  protected_item boolean not null default false check (not protected_item),
  enabled boolean not null default true,
  revision integer not null default 1 check (revision > 0),
  primary key (shop_version_id, offer_id)
);

create table public.economy_active_shop_versions (
  shop_definition_id uuid primary key references public.cozy_shop_definitions(id) on delete restrict,
  shop_version_id uuid not null unique,
  activated_at timestamptz not null default now(),
  foreign key (shop_definition_id, shop_version_id)
    references public.economy_shop_versions(shop_definition_id, id) on delete restrict
);

create table public.economy_purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  public_receipt_id text generated always as (
    'SHOP-' || upper(substr(encode(extensions.digest(id::text::bytea, 'sha256'), 'hex'), 1, 20))
  ) stored unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  shop_version_id uuid not null references public.economy_shop_versions(id) on delete restrict,
  offer_id uuid not null references public.cozy_shop_offers(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 99),
  unit_price bigint not null check (unit_price between 1 and 1000000),
  total_price bigint not null check (total_price between 1 and 9000000000000000),
  dust_ledger_entry_id uuid not null unique references public.player_dust_ledger(id) on delete restrict,
  inventory_history_entry_id uuid not null unique references public.player_inventory_history(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  unique (player_profile_id, idempotency_key),
  check (unit_price::numeric * quantity = total_price)
);

create table public.economy_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('player','global')),
  requested_player_profile_id uuid references public.player_profiles(id) on delete restrict,
  status text not null check (status in ('running','completed','failed')),
  checked_count integer not null default 0 check (checked_count >= 0),
  mismatch_count integer not null default 0 check (mismatch_count >= 0 and mismatch_count <= checked_count),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  check ((scope = 'player') = (requested_player_profile_id is not null))
);

create table public.economy_reconciliation_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.economy_reconciliation_runs(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  stored_balance bigint not null check (stored_balance between 0 and 9000000000000000),
  ledger_balance bigint not null check (ledger_balance between 0 and 9000000000000000),
  difference bigint not null check (difference between -9000000000000000 and 9000000000000000),
  status text not null check (status in ('balanced','mismatch','reviewed','resolved')),
  auto_corrected boolean not null default false check (not auto_corrected),
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or (char_length(review_note) between 12 and 1000 and review_note !~ '[[:cntrl:]<>]')),
  created_at timestamptz not null default now(),
  unique (run_id, player_profile_id),
  check (stored_balance - ledger_balance = difference),
  check ((status in ('reviewed','resolved')) = (reviewed_at is not null))
);

create table public.economy_risk_signals (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  signal_type text not null check (signal_type in ('duplicate_request','velocity','reconciliation_mismatch','multi_account_correlation','reward_pattern','correction_pattern')),
  severity text not null check (severity in ('information','low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','reviewing','dismissed','confirmed','resolved')),
  score numeric(5,2) not null check (score between 0 and 100),
  safe_summary text not null check (char_length(safe_summary) between 3 and 240 and safe_summary = btrim(safe_summary) and safe_summary !~ '[[:cntrl:]<>]'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object' and octet_length(evidence::text) <= 16384),
  deduplication_key text not null unique check (char_length(deduplication_key) between 16 and 128 and deduplication_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'open') = (reviewed_at is null))
);

create table public.economy_reward_quarantine (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  source_version_id uuid not null references public.economy_source_versions(id) on delete restrict,
  proposed_delta bigint not null check (proposed_delta between 1 and 1000000),
  reference_type text not null check (reference_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  reference_id text not null check (char_length(reference_id) between 1 and 128 and reference_id = btrim(reference_id) and reference_id !~ '[[:cntrl:]<>]'),
  reason_code text not null check (reason_code in ('economy_disabled','rewards_disabled','risk_review','source_disabled','policy_limit')),
  status text not null default 'held' check (status in ('held','released','rejected','expired')),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  request_id text not null check (char_length(request_id) between 1 and 128),
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_profile_id, source_version_id, idempotency_key),
  check ((status = 'held') = (reviewed_at is null))
);

create table public.economy_correction_requests (
  id uuid primary key default gen_random_uuid(),
  public_receipt_id text generated always as (
    'CORR-' || upper(substr(encode(extensions.digest(id::text::bytea, 'sha256'), 'hex'), 1, 20))
  ) stored unique,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  delta bigint not null check (delta between -1000000 and 1000000 and delta <> 0),
  reason_category text not null check (reason_category in ('support_repair','incident_repair','migration_repair','refund')),
  explanation text not null check (char_length(explanation) between 20 and 1000 and explanation = btrim(explanation) and explanation !~ '[[:cntrl:]<>]'),
  status text not null default 'pending_review' check (status in ('pending_review','approved','rejected','settled','cancelled')),
  balance_before bigint not null check (balance_before between 0 and 9000000000000000),
  balance_after bigint not null check (balance_after between 0 and 9000000000000000),
  requires_second_approval boolean not null,
  created_by_admin_id uuid not null references public.admin_users(user_id) on delete restrict,
  first_approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  second_approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  rejected_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  dust_ledger_entry_id uuid unique references public.player_dust_ledger(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  settled_at timestamptz,
  check (balance_before + delta = balance_after),
  check (first_approved_by_admin_id is null or first_approved_by_admin_id <> created_by_admin_id),
  check (second_approved_by_admin_id is null or second_approved_by_admin_id not in (created_by_admin_id, first_approved_by_admin_id)),
  check (not requires_second_approval or status in ('pending_review','rejected','cancelled') or second_approved_by_admin_id is not null),
  check ((status = 'settled') = (dust_ledger_entry_id is not null and settled_at is not null))
);

create table public.economy_daily_metrics (
  metric_date date primary key,
  dust_created bigint not null check (dust_created >= 0),
  dust_destroyed bigint not null check (dust_destroyed >= 0),
  transaction_count bigint not null check (transaction_count >= 0),
  active_player_count integer not null check (active_player_count >= 0),
  median_balance bigint not null check (median_balance between 0 and 9000000000000000),
  p90_balance bigint not null check (p90_balance between 0 and 9000000000000000),
  calculated_at timestamptz not null default now()
);

create table public.economy_admin_rate_limits (
  admin_user_id uuid not null references public.admin_users(user_id) on delete cascade,
  scope text not null check (scope in (
    'overview_read','ledger_read','reconciliation','correction_create','correction_review',
    'risk_review','simulation_run','policy_mutation','shop_mutation'
  )),
  attempt_count integer not null check (attempt_count between 1 and 10000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (admin_user_id, scope),
  check (window_expires_at > window_started_at)
);

create table public.economy_simulation_runs (
  id uuid primary key default gen_random_uuid(),
  seed integer not null check (seed between 1 and 2147483647),
  player_count integer not null check (player_count in (100,1000,10000)),
  duration_days integer not null check (duration_days in (30,90,180)),
  input jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 16384),
  result jsonb not null check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 32768),
  created_by_admin_id uuid not null references public.admin_users(user_id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now()
);

create table public.star_utility_versions (
  id uuid primary key,
  version_number integer not null unique check (version_number > 0),
  lifecycle_status text not null check (lifecycle_status in ('draft','reviewed','published','superseded')),
  definitions jsonb not null check (jsonb_typeof(definitions) = 'array' and jsonb_array_length(definitions) between 1 and 20 and octet_length(definitions::text) <= 32768),
  boundary_statement text not null check (char_length(boundary_statement) between 20 and 1000 and boundary_statement = btrim(boundary_statement) and boundary_statement !~ '[[:cntrl:]<>]'),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz
);

create table public.star_utility_active_version (
  singleton_key boolean primary key default true check (singleton_key),
  utility_version_id uuid not null unique references public.star_utility_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

-- Seed the exact reviewed policy, source/sink registry, shop snapshot, and utility boundary.
insert into public.economy_source_versions (
  id, source_key, version_number, lifecycle_status, operation_key, category, label, description,
  minimum_amount, maximum_amount, repeatable, daily_limit, weekly_limit, account_lifetime_limit,
  wallet_daily_limit, cooldown_seconds, beginner_protected, risk_weight, published_at
) values
  ('99000000-0000-4000-8000-000000000011','starter-grant',1,'published','starter_grant','starter_grant','Starter grant','One server-issued beginner balance applied during first cozy-game bootstrap.',250,250,false,1,1,1,1,0,true,1,now()),
  ('99000000-0000-4000-8000-000000000012','shop-sale',1,'published','shop_sale','gameplay_reward','Village shop sale','DUST paid by a published system shop for explicitly accepted player items.',1,1000000,true,null,null,null,null,0,false,4,now()),
  ('99000000-0000-4000-8000-000000000013','moonpetal-harvest-help',1,'published','cooperative_activity_reward','activity_reward','Moonpetal Harvest Help','Bounded cooperative reward with contribution, cooldown, and daily limits.',15,15,true,2,14,null,2,300,false,8,now()),
  ('99000000-0000-4000-8000-000000000014','system-refund',1,'published','system_refund','refund','System refund','Server-authorized reversal of a previously settled reversible sink.',1,1000000,true,null,null,null,null,0,true,2,now()),
  ('99000000-0000-4000-8000-000000000015','migration-adjustment-credit',1,'retired','migration_adjustment','migration_adjustment','Historical migration credit','Historical additive migration operation retained only for ledger interpretation.',1,1000000,false,null,null,null,null,0,false,10,now()),
  ('99000000-0000-4000-8000-000000000016','administrative-correction-credit',1,'published','administrative_correction','administrative_correction','Administrative correction credit','Reviewed correction that adds DUST without setting a balance directly.',1,1000000,true,null,null,null,null,0,false,25,now());

insert into public.economy_active_source_versions (source_key, source_version_id)
select source_key, id from public.economy_source_versions where lifecycle_status = 'published';

insert into public.economy_sink_versions (
  id, sink_key, version_number, lifecycle_status, operation_key, category, label, description,
  minimum_amount, maximum_amount, reversible_by_refund, beginner_protected, published_at
) values
  ('99000000-0000-4000-8000-000000000021','village-supply-shop',1,'published','shop_purchase','shop_purchase','Village Supply Shop','Published ordinary-item purchases settled atomically against the DUST ledger.',1,1000000,true,true,now()),
  ('99000000-0000-4000-8000-000000000022','crafting-fee',1,'disabled','crafting_fee','crafting_cost','Crafting fee','Reserved structural sink; all published Phase 7 recipes currently have a zero DUST fee.',1,1000000,true,true,null),
  ('99000000-0000-4000-8000-000000000023','migration-adjustment-debit',1,'retired','migration_adjustment','migration_adjustment','Historical migration debit','Historical subtractive migration operation retained only for ledger interpretation.',1,1000000,false,false,now()),
  ('99000000-0000-4000-8000-000000000024','administrative-correction-debit',1,'published','administrative_correction','administrative_correction','Administrative correction debit','Reviewed correction that removes DUST without setting a balance directly.',1,1000000,true,false,now());

insert into public.economy_active_sink_versions (sink_key, sink_version_id)
select sink_key, id from public.economy_sink_versions where lifecycle_status = 'published';

insert into public.economy_policy_versions (
  id, version_number, lifecycle_status, economy_enabled, purchases_enabled, rewards_enabled,
  corrections_enabled, starter_grant, beginner_protection_hours, low_value_correction_limit,
  high_value_correction_limit, reconciliation_tolerance, purchase_rate_limit_per_minute,
  history_retention_days, risk_review_threshold, revision, validation_results, published_at
) values (
  '99000000-0000-4000-8000-000000000001',1,'published',true,true,true,true,250,24,
  500,5000,0,10,730,60,1,
  '{"valid":true,"checks":["closed-source-sink-catalog","exact-ledger-reconciliation","bounded-corrections","non-transferable-dust"]}'::jsonb,
  now()
);
insert into public.economy_active_policy (singleton_key, policy_version_id)
values (true, '99000000-0000-4000-8000-000000000001');

insert into public.economy_shop_versions (
  id, shop_definition_id, version_number, lifecycle_status, name, description,
  interaction_key, revision, validation_results, published_at
) values (
  '99000000-0000-4000-8000-000000000031','74000000-0000-4000-8000-000000000001',1,
  'published','Village Supply Shop','Ordinary seeds, pantry goods, materials, and furnishings for DUST.',
  'phase7-general-store',1,
  '{"valid":true,"checks":["ordinary-items-only","positive-prices","bounded-quantities","protected-items-excluded"]}'::jsonb,
  now()
);
insert into public.economy_shop_version_offers (
  shop_version_id, offer_id, unit_price, maximum_quantity, daily_limit,
  cooldown_seconds, inventory_capacity_cost, protected_item, enabled, revision
)
select '99000000-0000-4000-8000-000000000031', offer.id, offer.buy_price,
  least(offer.maximum_quantity, 20), 40, 0, 1, false, true, 1
from public.cozy_shop_offers offer
join public.cozy_item_definitions item on item.id = offer.item_definition_id
where offer.shop_definition_id = '74000000-0000-4000-8000-000000000001'
  and offer.buy_price is not null and offer.active and item.active and item.buy_eligible
  and item.category <> 'permanent_tool';
insert into public.economy_active_shop_versions (shop_definition_id, shop_version_id)
values ('74000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000031');

insert into public.star_utility_versions (
  id, version_number, lifecycle_status, definitions, boundary_statement, published_at
) values (
  '99000000-0000-4000-8000-000000000041',1,'published',
  '[{"key":"verified-village-access","status":"current","category":"access","requiresTransaction":false,"transfersValue":false,"changesDustRewards":false,"changesGameplayPower":false,"custodyRequired":false},{"key":"cosmetic-entitlement-signals","status":"future_design","category":"cosmetic_entitlement","requiresTransaction":false,"transfersValue":false,"changesDustRewards":false,"changesGameplayPower":false,"custodyRequired":false},{"key":"dust-reward-multipliers","status":"rejected","category":"community_recognition","requiresTransaction":false,"transfersValue":false,"changesDustRewards":false,"changesGameplayPower":false,"custodyRequired":false}]'::jsonb,
  '$STAR is currently a read-only wallet eligibility signal. Phase 9A creates no transfers, custody, staking, burning, claims, reward multipliers, gameplay power, or play-to-earn behavior.',
  now()
);
insert into public.star_utility_active_version (singleton_key, utility_version_id)
values (true, '99000000-0000-4000-8000-000000000041');

-- Enrich the existing append-only ledger without replacing its canonical identity.
alter table public.player_dust_ledger
  add column balance_before bigint,
  add column operation_key text,
  add column public_receipt_id text,
  add column source_version_id uuid references public.economy_source_versions(id) on delete restrict,
  add column sink_version_id uuid references public.economy_sink_versions(id) on delete restrict,
  add column correlation_id text;

alter table public.player_dust_ledger disable trigger player_dust_ledger_append_only;
update public.player_dust_ledger ledger set
  balance_before = ledger.resulting_balance - ledger.delta,
  operation_key = ledger.reason,
  public_receipt_id = 'DUST-' || upper(substr(encode(extensions.digest(ledger.id::text::bytea, 'sha256'), 'hex'), 1, 20)),
  source_version_id = case when ledger.delta > 0 then coalesce(
    (select active.source_version_id from public.economy_active_source_versions active
      join public.economy_source_versions source on source.id = active.source_version_id
      where source.operation_key = ledger.reason limit 1),
    case when ledger.reason = 'migration_adjustment' then '99000000-0000-4000-8000-000000000015'::uuid end
  ) end,
  sink_version_id = case when ledger.delta < 0 then coalesce(
    (select active.sink_version_id from public.economy_active_sink_versions active
      join public.economy_sink_versions sink on sink.id = active.sink_version_id
      where sink.operation_key = ledger.reason limit 1),
    case when ledger.reason = 'migration_adjustment' then '99000000-0000-4000-8000-000000000023'::uuid end
  ) end,
  correlation_id = ledger.request_id;
alter table public.player_dust_ledger enable trigger player_dust_ledger_append_only;

create or replace function private.economy_prepare_dust_ledger_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.balance_before := coalesce(new.balance_before, new.resulting_balance - new.delta);
  new.operation_key := coalesce(new.operation_key, new.reason);
  new.public_receipt_id := coalesce(new.public_receipt_id,
    'DUST-' || upper(substr(encode(extensions.digest(new.id::text::bytea, 'sha256'), 'hex'), 1, 20)));
  new.correlation_id := coalesce(new.correlation_id, new.request_id);
  if new.delta > 0 and new.source_version_id is null then
    select active.source_version_id into new.source_version_id
    from public.economy_active_source_versions active
    join public.economy_source_versions source on source.id = active.source_version_id
    where source.operation_key = new.reason
    order by source.version_number desc limit 1;
    if new.source_version_id is null and new.reason = 'migration_adjustment' then
      new.source_version_id := '99000000-0000-4000-8000-000000000015';
    end if;
  elsif new.delta < 0 and new.sink_version_id is null then
    select active.sink_version_id into new.sink_version_id
    from public.economy_active_sink_versions active
    join public.economy_sink_versions sink on sink.id = active.sink_version_id
    where sink.operation_key = new.reason
    order by sink.version_number desc limit 1;
    if new.sink_version_id is null and new.reason = 'migration_adjustment' then
      new.sink_version_id := '99000000-0000-4000-8000-000000000023';
    end if;
  end if;
  if (new.delta > 0 and new.source_version_id is null)
     or (new.delta < 0 and new.sink_version_id is null) then
    raise exception using errcode = '23514', message = 'UNKNOWN_ECONOMY_OPERATION';
  end if;
  return new;
end;
$$;

create trigger player_dust_ledger_prepare_economy
before insert on public.player_dust_ledger
for each row execute function private.economy_prepare_dust_ledger_entry();

alter table public.player_dust_ledger
  alter column balance_before set not null,
  alter column operation_key set not null,
  alter column public_receipt_id set not null,
  alter column correlation_id set not null,
  add constraint player_dust_ledger_balance_before_check check (balance_before between 0 and 9000000000000000),
  add constraint player_dust_ledger_arithmetic_check check (balance_before + delta = resulting_balance),
  add constraint player_dust_ledger_operation_key_check check (operation_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  add constraint player_dust_ledger_public_receipt_check check (public_receipt_id ~ '^DUST-[A-F0-9]{20}$'),
  add constraint player_dust_ledger_direction_check check (
    (delta > 0 and source_version_id is not null and sink_version_id is null)
    or (delta < 0 and source_version_id is null and sink_version_id is not null)
  ),
  add constraint player_dust_ledger_correlation_check check (char_length(correlation_id) between 1 and 128),
  add constraint player_dust_ledger_public_receipt_unique unique (public_receipt_id);

alter table public.player_dust_ledger drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reason_check check (reason in (
  'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund',
  'migration_adjustment','cooperative_activity_reward','administrative_correction'
));

create index player_dust_ledger_player_created_idx
  on public.player_dust_ledger(player_profile_id, created_at desc, entry_number desc);
create index economy_purchase_receipts_player_created_idx
  on public.economy_purchase_receipts(player_profile_id, created_at desc);
create index economy_reconciliation_results_status_idx
  on public.economy_reconciliation_results(status, created_at desc);
create index economy_risk_signals_status_score_idx
  on public.economy_risk_signals(status, score desc, created_at desc);
create index economy_reward_quarantine_status_created_idx
  on public.economy_reward_quarantine(status, created_at);
create index economy_correction_requests_status_created_idx
  on public.economy_correction_requests(status, created_at desc);

create or replace function private.economy_protect_immutable_row()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'ECONOMY_RECORD_IMMUTABLE';
end;
$$;

create trigger economy_purchase_receipts_immutable before update or delete on public.economy_purchase_receipts
for each row execute function private.economy_protect_immutable_row();
create trigger economy_simulation_runs_immutable before update or delete on public.economy_simulation_runs
for each row execute function private.economy_protect_immutable_row();
create trigger economy_daily_metrics_immutable before update or delete on public.economy_daily_metrics
for each row execute function private.economy_protect_immutable_row();

create or replace function private.economy_protect_published_version()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.lifecycle_status in ('published','superseded','retired','disabled') then
    raise exception using errcode = '55000', message = 'PUBLISHED_ECONOMY_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger economy_source_versions_published_immutable before update or delete on public.economy_source_versions
for each row execute function private.economy_protect_published_version();
create trigger economy_sink_versions_published_immutable before update or delete on public.economy_sink_versions
for each row execute function private.economy_protect_published_version();
create trigger economy_policy_versions_published_immutable before update or delete on public.economy_policy_versions
for each row execute function private.economy_protect_published_version();
create trigger economy_shop_versions_published_immutable before update or delete on public.economy_shop_versions
for each row execute function private.economy_protect_published_version();
create trigger star_utility_versions_published_immutable before update or delete on public.star_utility_versions
for each row execute function private.economy_protect_published_version();

create or replace function private.economy_protect_published_shop_offer()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare selected_version_id uuid; selected_status text;
begin
  selected_version_id := case when tg_op = 'DELETE' then old.shop_version_id else new.shop_version_id end;
  select lifecycle_status into strict selected_status
  from public.economy_shop_versions where id=selected_version_id;
  if selected_status in ('published','superseded','disabled') then
    raise exception using errcode='55000',message='PUBLISHED_ECONOMY_SHOP_OFFER_IMMUTABLE';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create trigger economy_shop_version_offers_published_immutable
before insert or update or delete on public.economy_shop_version_offers
for each row execute function private.economy_protect_published_shop_offer();

create trigger economy_risk_signals_updated_at before update on public.economy_risk_signals
for each row execute function private.set_updated_at();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'economy_source_versions','economy_active_source_versions','economy_sink_versions',
    'economy_active_sink_versions','economy_policy_versions','economy_active_policy',
    'economy_shop_versions','economy_shop_version_offers','economy_active_shop_versions',
    'economy_purchase_receipts','economy_reconciliation_runs','economy_reconciliation_results',
    'economy_risk_signals','economy_reward_quarantine','economy_correction_requests','economy_daily_metrics',
    'economy_admin_rate_limits',
    'economy_simulation_runs','star_utility_versions','star_utility_active_version'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end;
$$;

revoke all on function private.economy_protect_immutable_row() from public, anon, authenticated, service_role;
revoke all on function private.economy_protect_published_version() from public, anon, authenticated, service_role;
revoke all on function private.economy_prepare_dust_ledger_entry() from public, anon, authenticated, service_role;
revoke all on function private.economy_protect_published_shop_offer() from public, anon, authenticated, service_role;

comment on table public.economy_purchase_receipts is
  'Immutable authoritative DUST purchase receipts; no wallet, token, or on-chain transaction data.';
comment on table public.economy_risk_signals is
  'Explainable review signals only. Rows never suspend players or mutate balances automatically.';
comment on table public.economy_correction_requests is
  'Explained delta-only correction workflow. Direct balance-setting is intentionally unsupported.';
comment on table public.star_utility_versions is
  'Read-only product policy. Phase 9A contains no transfer, custody, staking, burning, claims, multipliers, or P2E.';
