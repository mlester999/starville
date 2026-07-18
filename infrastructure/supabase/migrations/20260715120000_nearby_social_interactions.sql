-- Starville Phase 8C: nearby public inspect, recipient-approved item gifts, and atomic item trades.
-- DUST transfer remains disabled until a paired reservation/ledger policy is separately approved.

insert into public.admin_permissions (key, name, description, category, is_sensitive, is_system)
values
  ('social_interactions.read', 'Read social interactions', 'Read bounded gift and trade summaries.', 'operations', false, true),
  ('social_interactions.audit.read', 'Read social interaction audit', 'Read protected social transfer receipts and audit events.', 'operations', true, true),
  ('social_interactions.settings.read', 'Read social interaction settings', 'Read transfer distance, expiry, and capacity settings.', 'operations', false, true),
  ('social_interactions.settings.edit', 'Edit social interaction settings', 'Change reviewed social interaction safety settings.', 'operations', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'social_interactions.read'),
    ('game_administrator', 'social_interactions.audit.read'),
    ('game_administrator', 'social_interactions.settings.read'),
    ('game_administrator', 'social_interactions.settings.edit'),
    ('moderator', 'social_interactions.read'),
    ('live_operations_manager', 'social_interactions.read'),
    ('customer_support', 'social_interactions.read'),
    ('read_only_analyst', 'social_interactions.read')
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
where role.key = 'super_admin' and permission.key like 'social_interactions.%'
on conflict (role_id, permission_id) do nothing;

alter table public.cozy_item_definitions
  add column giftable boolean not null default false,
  add column tradable boolean not null default false,
  add column account_bound boolean not null default true,
  add column permanent_tool boolean not null default false,
  add column minimum_transfer_quantity integer not null default 1,
  add column maximum_transfer_quantity integer not null default 1;

update public.cozy_item_definitions
set giftable = category not in ('permanent_tool', 'special'),
    tradable = category not in ('permanent_tool', 'special'),
    account_bound = category in ('permanent_tool', 'special'),
    permanent_tool = category = 'permanent_tool',
    minimum_transfer_quantity = 1,
    maximum_transfer_quantity = case when category in ('permanent_tool', 'special') then 1 else 99 end;

alter table public.cozy_item_definitions
  add constraint cozy_item_transfer_quantity_check check (
    minimum_transfer_quantity between 1 and 999
    and maximum_transfer_quantity between minimum_transfer_quantity and 999
  ),
  add constraint cozy_item_permanent_transfer_check check (
    category <> 'permanent_tool'
    or (permanent_tool and account_bound and not giftable and not tradable)
  );

create or replace function private.cozy_item_json(item public.cozy_item_definitions)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', item.id, 'slug', item.slug, 'name', item.name, 'description', item.description,
    'category', item.category, 'stackable', item.stackable, 'maxStackSize', item.max_stack_size,
    'buyEligible', item.buy_eligible, 'sellEligible', item.sell_eligible,
    'giftable', item.giftable, 'tradable', item.tradable,
    'accountBound', item.account_bound, 'permanentTool', item.permanent_tool,
    'minimumTransferQuantity', item.minimum_transfer_quantity,
    'maximumTransferQuantity', item.maximum_transfer_quantity,
    'defaultBuyPrice', item.default_buy_price, 'defaultSellPrice', item.default_sell_price,
    'assetRef', item.asset_ref, 'assetReadiness', item.asset_readiness,
    'active', item.active, 'contentVersion', item.content_version, 'metadata', item.metadata
  );
$$;

alter table public.player_inventory_history
  drop constraint player_inventory_history_reason_check,
  add constraint player_inventory_history_reason_check check (reason in (
    'starter_grant', 'shop_purchase', 'shop_sale', 'planting', 'harvest',
    'cooking', 'crafting', 'furniture_placement', 'furniture_removal',
    'social_gift', 'social_trade', 'system_refund'
  ));

create table public.social_interaction_settings (
  singleton_key boolean primary key default true check (singleton_key),
  interaction_distance numeric(5,2) not null default 3 check (interaction_distance between 1 and 12),
  request_expiry_seconds integer not null default 90 check (request_expiry_seconds between 30 and 300),
  trade_expiry_seconds integer not null default 600 check (trade_expiry_seconds between 120 and 1800),
  reconnect_grace_seconds integer not null default 30 check (reconnect_grace_seconds between 5 and 120),
  maximum_offer_rows integer not null default 8 check (maximum_offer_rows between 1 and 12),
  maximum_total_quantity integer not null default 999 check (maximum_total_quantity between 1 and 9999),
  receipt_retention_days integer not null default 180 check (receipt_retention_days between 30 and 730),
  audit_retention_days integer not null default 180 check (audit_retention_days between 30 and 730),
  dust_transfer_enabled boolean not null default false check (not dust_transfer_enabled),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
insert into public.social_interaction_settings (singleton_key) values (true);

create table public.social_interaction_requests (
  id uuid primary key default gen_random_uuid(),
  interaction_type text not null check (interaction_type in ('gift', 'trade')),
  sender_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  target_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  world_map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  channel_id uuid not null references public.realtime_channels(id) on delete restrict,
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in (
    'pending', 'negotiating', 'completed', 'declined', 'cancelled', 'expired', 'invalidated', 'failed'
  )),
  revision integer not null default 1 check (revision > 0),
  sender_confirmed_revision integer check (sender_confirmed_revision is null or sender_confirmed_revision > 0),
  target_confirmed_revision integer check (target_confirmed_revision is null or target_confirmed_revision > 0),
  expires_at timestamptz not null,
  reconnect_deadline timestamptz,
  completed_at timestamptz,
  failure_code text check (failure_code is null or failure_code in (
    'player_unavailable', 'too_far_away', 'blocked', 'request_expired', 'item_unavailable',
    'item_restricted', 'inventory_full', 'trade_changed', 'access_changed', 'maintenance',
    'settlement_failed'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sender_profile_id <> target_profile_id),
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  unique (sender_profile_id, client_request_id)
);

create table public.player_gift_items (
  interaction_id uuid primary key references public.social_interaction_requests(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  content_version integer not null check (content_version > 0)
);

create table public.player_trade_offer_items (
  interaction_id uuid not null references public.social_interaction_requests(id) on delete cascade,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  offer_revision integer not null check (offer_revision > 0),
  primary key (interaction_id, player_profile_id, item_definition_id)
);

create table public.player_inventory_reservations (
  interaction_id uuid not null references public.social_interaction_requests(id) on delete cascade,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  offer_revision integer not null check (offer_revision > 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (interaction_id, player_profile_id, item_definition_id)
);

create table public.social_interaction_receipts (
  id uuid primary key default gen_random_uuid(),
  interaction_id uuid not null unique references public.social_interaction_requests(id) on delete restrict,
  interaction_type text not null check (interaction_type in ('gift', 'trade')),
  sender_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  target_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  completed_at timestamptz not null default now()
);

create table public.social_interaction_receipt_items (
  receipt_id uuid not null references public.social_interaction_receipts(id) on delete restrict,
  from_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  to_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  item_definition_id uuid not null references public.cozy_item_definitions(id) on delete restrict,
  quantity integer not null check (quantity between 1 and 999),
  primary key (receipt_id, from_profile_id, item_definition_id)
);

create table public.social_interaction_audit (
  id uuid primary key default gen_random_uuid(),
  entry_number bigint generated always as identity unique,
  interaction_id uuid not null references public.social_interaction_requests(id) on delete restrict,
  actor_profile_id uuid references public.player_profiles(id) on delete restrict,
  action text not null check (action in (
    'gift_requested', 'gift_accepted', 'gift_declined', 'gift_cancelled', 'gift_expired', 'gift_completed',
    'trade_requested', 'trade_accepted', 'trade_declined', 'offer_changed', 'confirmation_added',
    'confirmation_cleared', 'trade_cancelled', 'trade_expired', 'trade_invalidated',
    'settlement_started', 'settlement_completed', 'settlement_failed',
    'reservation_created', 'reservation_released', 'reconnect_paused', 'reconnect_resumed'
  )),
  request_id text not null check (char_length(request_id) between 1 and 128),
  revision integer not null check (revision > 0),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state) = 'object' and octet_length(before_state::text) <= 8192),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state) = 'object' and octet_length(after_state::text) <= 8192),
  result text not null check (result in ('accepted', 'rejected', 'completed', 'released', 'paused', 'resumed')),
  created_at timestamptz not null default now()
);

create table public.social_interaction_idempotency (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  operation text not null check (operation in (
    'gift_create', 'gift_accept', 'gift_decline', 'gift_cancel', 'trade_create', 'trade_accept',
    'trade_decline', 'trade_offer', 'trade_confirm', 'trade_cancel', 'trade_resume'
  )),
  client_request_id text not null check (client_request_id ~ '^[A-Za-z0-9._:-]{1,64}$'),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null check (jsonb_typeof(response) = 'object' and octet_length(response::text) <= 65536),
  created_at timestamptz not null default now(),
  primary key (player_profile_id, operation, client_request_id)
);

create index social_requests_participant_idx on public.social_interaction_requests(sender_profile_id, target_profile_id, status, expires_at);
create index social_requests_target_idx on public.social_interaction_requests(target_profile_id, status, expires_at);
create index social_reservations_expiry_idx on public.player_inventory_reservations(expires_at);
create index social_receipts_recent_idx on public.social_interaction_receipts(completed_at desc);
create index social_audit_interaction_idx on public.social_interaction_audit(interaction_id, entry_number desc);

create trigger social_settings_updated_at before update on public.social_interaction_settings
for each row execute function private.set_updated_at();
create trigger social_requests_updated_at before update on public.social_interaction_requests
for each row execute function private.set_updated_at();

create or replace function private.reject_social_immutable_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'SOCIAL_EVIDENCE_IMMUTABLE';
end;
$$;
create trigger social_receipts_immutable before update or delete on public.social_interaction_receipts
for each row execute function private.reject_social_immutable_mutation();
create trigger social_receipt_items_immutable before update or delete on public.social_interaction_receipt_items
for each row execute function private.reject_social_immutable_mutation();
create trigger social_audit_immutable before update or delete on public.social_interaction_audit
for each row execute function private.reject_social_immutable_mutation();
create trigger social_idempotency_immutable before update or delete on public.social_interaction_idempotency
for each row execute function private.reject_social_immutable_mutation();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'social_interaction_settings', 'social_interaction_requests', 'player_gift_items',
    'player_trade_offer_items', 'player_inventory_reservations', 'social_interaction_receipts',
    'social_interaction_receipt_items', 'social_interaction_audit', 'social_interaction_idempotency'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', table_name);
  end loop;
end;
$$;
revoke all on sequence public.social_interaction_audit_entry_number_seq from public, anon, authenticated, service_role;

create or replace function private.social_active_session(p_session_id uuid)
returns public.realtime_sessions language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; access_session public.wallet_access_sessions%rowtype;
  profile public.player_profiles%rowtype; denial text;
begin
  select * into session from public.realtime_sessions
  where id = p_session_id and status = 'active' and last_heartbeat_at > now() - interval '30 seconds';
  if not found then raise exception using errcode = '28000', message = 'SOCIAL_ACCESS_CHANGED'; end if;
  select * into strict access_session from public.wallet_access_sessions where id = session.wallet_access_session_id;
  select * into strict profile from public.player_profiles where id = session.player_profile_id;
  denial := private.realtime_access_denial(access_session, profile);
  if denial is not null then
    raise exception using errcode = '28000', message = case when denial = 'maintenance' then 'SOCIAL_MAINTENANCE' else 'SOCIAL_ACCESS_CHANGED' end;
  end if;
  return session;
end;
$$;

create or replace function private.social_target_session(p_presence_id uuid)
returns public.realtime_sessions language plpgsql stable security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype;
begin
  select realtime.* into session
  from public.realtime_sessions realtime
  join public.player_profiles profile on profile.id = realtime.player_profile_id
  where profile.public_presence_id = p_presence_id and realtime.status = 'active'
    and realtime.last_heartbeat_at > now() - interval '30 seconds'
  order by realtime.connected_at desc limit 1;
  if not found then raise exception using errcode = 'P0002', message = 'SOCIAL_PLAYER_UNAVAILABLE'; end if;
  return session;
end;
$$;

create or replace function private.social_pair_error(
  source public.realtime_sessions, target public.realtime_sessions
)
returns text language plpgsql stable security definer set search_path = '' as $$
declare distance_limit numeric; source_profile public.player_profiles%rowtype;
  target_profile public.player_profiles%rowtype;
begin
  select interaction_distance into strict distance_limit from public.social_interaction_settings where singleton_key;
  if source.player_profile_id = target.player_profile_id then return 'player_unavailable'; end if;
  if source.world_map_id <> target.world_map_id or source.world_map_version_id <> target.world_map_version_id
     or source.channel_id <> target.channel_id then return 'player_unavailable'; end if;
  if sqrt(power(source.last_position_x - target.last_position_x, 2) + power(source.last_position_y - target.last_position_y, 2)) > distance_limit
    then return 'too_far_away'; end if;
  if exists (
    select 1 from public.multiplayer_chat_player_preferences preference
    where preference.blocked and (
      (preference.player_profile_id = source.player_profile_id and preference.target_player_profile_id = target.player_profile_id)
      or (preference.player_profile_id = target.player_profile_id and preference.target_player_profile_id = source.player_profile_id)
    )
  ) then return 'blocked'; end if;
  select * into strict source_profile from public.player_profiles where id = source.player_profile_id;
  select * into strict target_profile from public.player_profiles where id = target.player_profile_id;
  if exists (select 1 from public.player_moderation_states moderation
    where moderation.player_profile_id in (source_profile.id, target_profile.id) and moderation.status = 'suspended')
    then return 'access_changed'; end if;
  return null;
end;
$$;

create or replace function private.social_participant_json(profile public.player_profiles)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('presenceId', profile.public_presence_id, 'displayName', profile.display_name);
$$;

create or replace function private.social_offer_items_json(p_interaction_id uuid, p_player_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemSlug', item.slug, 'name', item.name, 'category', item.category,
    'assetRef', item.asset_ref, 'quantity', offer.quantity
  ) order by item.name, item.slug), '[]'::jsonb)
  from public.player_trade_offer_items offer
  join public.cozy_item_definitions item on item.id = offer.item_definition_id
  where offer.interaction_id = p_interaction_id and offer.player_profile_id = p_player_profile_id;
$$;

create or replace function private.social_gift_json(request public.social_interaction_requests)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', request.id, 'kind', 'gift', 'status', request.status,
    'sender', private.social_participant_json(sender),
    'target', private.social_participant_json(target),
    'item', jsonb_build_object('itemSlug', item.slug, 'name', item.name, 'category', item.category,
      'assetRef', item.asset_ref, 'quantity', gift.quantity),
    'createdAt', request.created_at, 'expiresAt', request.expires_at
  )
  from public.player_gift_items gift
  join public.cozy_item_definitions item on item.id = gift.item_definition_id
  join public.player_profiles sender on sender.id = request.sender_profile_id
  join public.player_profiles target on target.id = request.target_profile_id
  where gift.interaction_id = request.id;
$$;

create or replace function private.social_trade_json(request public.social_interaction_requests)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', request.id, 'kind', 'trade', 'status', request.status, 'revision', request.revision,
    'senderOffer', jsonb_build_object('participant', private.social_participant_json(sender),
      'items', private.social_offer_items_json(request.id, sender.id),
      'confirmedRevision', request.sender_confirmed_revision),
    'targetOffer', jsonb_build_object('participant', private.social_participant_json(target),
      'items', private.social_offer_items_json(request.id, target.id),
      'confirmedRevision', request.target_confirmed_revision),
    'createdAt', request.created_at, 'expiresAt', request.expires_at,
    'reconnectDeadline', request.reconnect_deadline
  )
  from public.player_profiles sender, public.player_profiles target
  where sender.id = request.sender_profile_id and target.id = request.target_profile_id;
$$;

create or replace function private.social_receipt_json(receipt public.social_interaction_receipts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', receipt.id, 'interactionId', receipt.interaction_id, 'kind', receipt.interaction_type,
    'status', 'completed',
    'participants', jsonb_build_array(private.social_participant_json(sender), private.social_participant_json(target)),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'itemSlug', item.slug, 'name', item.name, 'category', item.category, 'assetRef', item.asset_ref,
      'quantity', receipt_item.quantity, 'fromPresenceId', from_profile.public_presence_id,
      'toPresenceId', to_profile.public_presence_id
    ) order by item.name, from_profile.public_presence_id)
    from public.social_interaction_receipt_items receipt_item
    join public.cozy_item_definitions item on item.id = receipt_item.item_definition_id
    join public.player_profiles from_profile on from_profile.id = receipt_item.from_profile_id
    join public.player_profiles to_profile on to_profile.id = receipt_item.to_profile_id
    where receipt_item.receipt_id = receipt.id), '[]'::jsonb),
    'completedAt', receipt.completed_at
  )
  from public.player_profiles sender, public.player_profiles target
  where sender.id = receipt.sender_profile_id and target.id = receipt.target_profile_id;
$$;

create or replace function private.social_inventory_json(p_player_profile_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'itemSlug', owned.slug, 'name', owned.name, 'category', owned.category, 'assetRef', owned.asset_ref,
    'availableQuantity', owned.quantity, 'reservedQuantity', owned.reserved,
    'minimumTransferQuantity', owned.minimum_transfer_quantity,
    'maximumTransferQuantity', owned.maximum_transfer_quantity,
    'giftable', owned.giftable, 'tradable', owned.tradable
  ) order by owned.name, owned.slug), '[]'::jsonb)
  from (
    select item.slug, item.name, item.category, item.asset_ref,
      sum(stack.quantity)::integer quantity,
      coalesce((select sum(reservation.quantity)::integer from public.player_inventory_reservations reservation
        where reservation.player_profile_id = p_player_profile_id
          and reservation.item_definition_id = item.id and reservation.expires_at > now()), 0) reserved,
      item.minimum_transfer_quantity, item.maximum_transfer_quantity, item.giftable, item.tradable
    from public.player_inventory_stacks stack
    join public.cozy_item_definitions item on item.id = stack.item_definition_id
    where stack.player_profile_id = p_player_profile_id
    group by item.id
  ) owned;
$$;

create or replace function private.social_store_idempotency(
  p_player_profile_id uuid, p_operation text, p_client_request_id text, p_request_hash text, p_response jsonb
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.social_interaction_idempotency
    (player_profile_id, operation, client_request_id, request_hash, response)
  values (p_player_profile_id, p_operation, p_client_request_id, p_request_hash, p_response);
end;
$$;

create or replace function private.social_replay(
  p_player_profile_id uuid, p_operation text, p_client_request_id text, p_request_hash text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare replay public.social_interaction_idempotency%rowtype;
begin
  select * into replay from public.social_interaction_idempotency
  where player_profile_id = p_player_profile_id and operation = p_operation
    and client_request_id = p_client_request_id;
  if not found then return null; end if;
  if replay.request_hash <> p_request_hash then
    raise exception using errcode = '22023', message = 'SOCIAL_IDEMPOTENCY_CONFLICT';
  end if;
  return replay.response;
end;
$$;

create or replace function private.social_release_reservations(p_interaction_id uuid, p_actor_profile_id uuid, p_request_id text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare released_count integer; current_revision integer;
begin
  select revision into strict current_revision from public.social_interaction_requests where id = p_interaction_id;
  delete from public.player_inventory_reservations where interaction_id = p_interaction_id;
  get diagnostics released_count = row_count;
  if released_count > 0 then
    insert into public.social_interaction_audit
      (interaction_id, actor_profile_id, action, request_id, revision, after_state, result)
    values (p_interaction_id, p_actor_profile_id, 'reservation_released', p_request_id,
      current_revision, jsonb_build_object('rows', released_count), 'released');
  end if;
end;
$$;

create or replace function private.social_trade_inventory_fits(p_player_profile_id uuid, p_interaction_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with trade as (
    select * from public.social_interaction_requests where id = p_interaction_id
  ), current_items as (
    select stack.item_definition_id, sum(stack.quantity)::integer quantity
    from public.player_inventory_stacks stack where stack.player_profile_id = p_player_profile_id
    group by stack.item_definition_id
  ), outgoing as (
    select item_definition_id, quantity from public.player_trade_offer_items
    where interaction_id = p_interaction_id and player_profile_id = p_player_profile_id
  ), incoming as (
    select offer.item_definition_id, offer.quantity
    from public.player_trade_offer_items offer, trade
    where offer.interaction_id = p_interaction_id
      and offer.player_profile_id <> p_player_profile_id
  ), item_ids as (
    select item_definition_id from current_items union select item_definition_id from incoming
  )
  select coalesce(sum(ceil(greatest(0,
    coalesce(current_items.quantity, 0) - coalesce(outgoing.quantity, 0) + coalesce(incoming.quantity, 0)
  )::numeric / item.max_stack_size)), 0) <= state.capacity
  from public.player_inventory_state state
  cross join item_ids ids
  join public.cozy_item_definitions item on item.id = ids.item_definition_id
  left join current_items on current_items.item_definition_id = ids.item_definition_id
  left join outgoing on outgoing.item_definition_id = ids.item_definition_id
  left join incoming on incoming.item_definition_id = ids.item_definition_id
  where state.player_profile_id = p_player_profile_id
  group by state.capacity;
$$;

create or replace function private.social_interaction_json(request public.social_interaction_requests)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when request.interaction_type = 'gift'
    then private.social_gift_json(request)
    else private.social_trade_json(request)
  end;
$$;

create or replace function public.get_realtime_social_bootstrap(p_session_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.social_interaction_settings%rowtype;
  active_trade public.social_interaction_requests%rowtype;
begin
  session := private.social_active_session(p_session_id);
  select * into strict settings from public.social_interaction_settings where singleton_key;

  update public.social_interaction_requests request set reconnect_deadline = null
  where request.interaction_type = 'trade' and request.status = 'negotiating'
    and request.reconnect_deadline > now()
    and session.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    and request.world_map_id = session.world_map_id and request.channel_id = session.channel_id;

  select * into active_trade from public.social_interaction_requests request
  where request.interaction_type = 'trade' and request.status = 'negotiating'
    and session.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    and request.expires_at > now()
  order by request.updated_at desc limit 1;

  return jsonb_build_object(
    'inventory', private.social_inventory_json(session.player_profile_id),
    'pendingRequests', coalesce((select jsonb_agg(private.social_interaction_json(request) order by request.created_at)
      from (select * from public.social_interaction_requests source
        where source.status = 'pending'
          and session.player_profile_id in (source.sender_profile_id, source.target_profile_id)
          and source.expires_at > now()
        order by source.created_at desc limit 20) request), '[]'::jsonb),
    'activeTrade', case when active_trade.id is null then null else private.social_trade_json(active_trade) end,
    'recentReceipts', coalesce((select jsonb_agg(private.social_receipt_json(receipt) order by receipt.completed_at)
      from (select * from public.social_interaction_receipts source
        where session.player_profile_id in (source.sender_profile_id, source.target_profile_id)
        order by source.completed_at desc limit 10) receipt), '[]'::jsonb),
    'interactionDistance', settings.interaction_distance,
    'dustTransferEnabled', false
  );
end;
$$;

create or replace function public.inspect_realtime_social_player(
  p_session_id uuid, p_target_presence_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare source public.realtime_sessions%rowtype; target public.realtime_sessions%rowtype;
  target_profile public.player_profiles%rowtype; map public.world_maps%rowtype; channel public.realtime_channels%rowtype;
  pair_error text;
begin
  source := private.social_active_session(p_session_id);
  target := private.social_target_session(p_target_presence_id);
  pair_error := private.social_pair_error(source, target);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  select * into strict target_profile from public.player_profiles where id = target.player_profile_id;
  select * into strict map from public.world_maps where id = target.world_map_id;
  select * into strict channel from public.realtime_channels where id = target.channel_id;
  return jsonb_build_object('status', 'ok', 'profile', jsonb_build_object(
    'presenceId', target_profile.public_presence_id,
    'displayName', target_profile.display_name,
    'level', target_profile.public_level,
    'appearancePreset', target_profile.appearance_preset,
    'worldId', map.slug,
    'worldName', map.display_name,
    'channelNumber', channel.channel_number
  ));
exception
  when sqlstate 'P0002' then return jsonb_build_object('status', 'player_unavailable');
  when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.create_realtime_social_gift(
  p_session_id uuid, p_target_presence_id uuid, p_item_slug text, p_quantity integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare source public.realtime_sessions%rowtype; target public.realtime_sessions%rowtype;
  item public.cozy_item_definitions%rowtype; request public.social_interaction_requests%rowtype;
  settings public.social_interaction_settings%rowtype; request_hash text; replay jsonb; response jsonb;
  pair_error text; available integer;
begin
  source := private.social_active_session(p_session_id);
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' or p_quantity not between 1 and 999 then
    return jsonb_build_object('status', 'item_restricted');
  end if;
  request_hash := encode(extensions.digest(convert_to(
    p_target_presence_id::text || ':' || p_item_slug || ':' || p_quantity::text, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(source.player_profile_id, 'gift_create', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  target := private.social_target_session(p_target_presence_id);
  pair_error := private.social_pair_error(source, target);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  select * into item from public.cozy_item_definitions where slug = p_item_slug and active;
  if not found or not item.giftable or item.account_bound or item.permanent_tool
     or p_quantity not between item.minimum_transfer_quantity and item.maximum_transfer_quantity then
    response := jsonb_build_object('status', 'item_restricted');
    perform private.social_store_idempotency(source.player_profile_id, 'gift_create', p_client_request_id, request_hash, response);
    return response;
  end if;
  select private.cozy_owned_quantity(source.player_profile_id, item.id)
    - coalesce((select sum(reservation.quantity) from public.player_inventory_reservations reservation
      where reservation.player_profile_id = source.player_profile_id and reservation.item_definition_id = item.id
        and reservation.expires_at > now()), 0) into available;
  if available < p_quantity then
    response := jsonb_build_object('status', 'item_unavailable');
    perform private.social_store_idempotency(source.player_profile_id, 'gift_create', p_client_request_id, request_hash, response);
    return response;
  end if;
  if exists (select 1 from public.social_interaction_requests existing
    where existing.interaction_type = 'gift' and existing.status = 'pending'
      and existing.expires_at > now()
      and existing.sender_profile_id = source.player_profile_id
      and existing.target_profile_id = target.player_profile_id) then
    response := jsonb_build_object('status', 'interaction_active');
    perform private.social_store_idempotency(source.player_profile_id, 'gift_create', p_client_request_id, request_hash, response);
    return response;
  end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
  insert into public.social_interaction_requests (
    interaction_type, sender_profile_id, target_profile_id, world_map_id, world_map_version_id,
    channel_id, client_request_id, request_hash, expires_at
  ) values ('gift', source.player_profile_id, target.player_profile_id, source.world_map_id,
    source.world_map_version_id, source.channel_id, p_client_request_id, request_hash,
    now() + make_interval(secs => settings.request_expiry_seconds)) returning * into request;
  insert into public.player_gift_items (interaction_id, item_definition_id, quantity, content_version)
  values (request.id, item.id, p_quantity, item.content_version);
  insert into public.social_interaction_audit
    (interaction_id, actor_profile_id, action, request_id, revision, after_state, result)
  values (request.id, source.player_profile_id, 'gift_requested', p_client_request_id, request.revision,
    jsonb_build_object('itemSlug', item.slug, 'quantity', p_quantity), 'accepted');
  response := jsonb_build_object('status', 'created', 'interaction', private.social_gift_json(request),
    'senderPresenceId', (select public_presence_id from public.player_profiles where id = source.player_profile_id),
    'targetPresenceId', p_target_presence_id);
  perform private.social_store_idempotency(source.player_profile_id, 'gift_create', p_client_request_id, request_hash, response);
  return response;
exception
  when sqlstate 'P0002' then return jsonb_build_object('status', 'player_unavailable');
  when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.respond_realtime_social_gift(
  p_session_id uuid, p_interaction_id uuid, p_action text, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; sender public.realtime_sessions%rowtype;
  target public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  gift public.player_gift_items%rowtype; item public.cozy_item_definitions%rowtype;
  receipt public.social_interaction_receipts%rowtype; request_hash text; replay jsonb; response jsonb;
  pair_error text; available integer;
begin
  actor := private.social_active_session(p_session_id);
  if p_action not in ('accept', 'decline') or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    return jsonb_build_object('status', 'request_changed');
  end if;
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':' || p_action, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'gift_' || p_action, p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'gift' or actor.player_profile_id <> request.target_profile_id then
    return jsonb_build_object('status', 'request_changed');
  end if;
  if request.status = 'completed' then
    select * into strict receipt from public.social_interaction_receipts where interaction_id = request.id;
    return jsonb_build_object('status', 'completed', 'interaction', private.social_gift_json(request),
      'receipt', private.social_receipt_json(receipt));
  end if;
  if request.status <> 'pending' then return jsonb_build_object('status', 'request_changed'); end if;
  if request.expires_at <= now() then
    update public.social_interaction_requests set status = 'expired', failure_code = 'request_expired' where id = request.id returning * into request;
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'gift_expired', p_client_request_id, request.revision, 'rejected');
    return jsonb_build_object('status', 'request_expired', 'interaction', private.social_gift_json(request));
  end if;
  if p_action = 'decline' then
    update public.social_interaction_requests set status = 'declined', completed_at = now() where id = request.id returning * into request;
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'gift_declined', p_client_request_id, request.revision, 'accepted');
    response := jsonb_build_object('status', 'declined', 'interaction', private.social_gift_json(request));
    perform private.social_store_idempotency(actor.player_profile_id, 'gift_decline', p_client_request_id, request_hash, response);
    return response;
  end if;
  select * into strict gift from public.player_gift_items where interaction_id = request.id;
  select * into strict item from public.cozy_item_definitions where id = gift.item_definition_id;
  select * into sender from public.realtime_sessions where player_profile_id = request.sender_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  select * into target from public.realtime_sessions where player_profile_id = request.target_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  if sender.id is null or target.id is null then return jsonb_build_object('status', 'player_unavailable'); end if;
  pair_error := private.social_pair_error(sender, target);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  perform 1 from public.player_inventory_state state
    where state.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    order by state.player_profile_id for update;
  if not item.active or not item.giftable or item.account_bound or item.permanent_tool
     or item.content_version <> gift.content_version then return jsonb_build_object('status', 'item_restricted'); end if;
  select private.cozy_owned_quantity(request.sender_profile_id, item.id)
    - coalesce((select sum(reservation.quantity) from public.player_inventory_reservations reservation
      where reservation.player_profile_id = request.sender_profile_id and reservation.item_definition_id = item.id
        and reservation.expires_at > now()), 0) into available;
  if available < gift.quantity then return jsonb_build_object('status', 'item_unavailable'); end if;
  if not private.cozy_can_add_item(request.target_profile_id, item.id, gift.quantity) then
    return jsonb_build_object('status', 'inventory_full');
  end if;
  if not private.cozy_remove_item(request.sender_profile_id, item.id, gift.quantity, 'social_gift', request.id::text,
    'gift-out:' || request.id::text, p_client_request_id) then
    return jsonb_build_object('status', 'item_unavailable');
  end if;
  if not private.cozy_add_item(request.target_profile_id, item.id, gift.quantity, 'social_gift', request.id::text,
    'gift-in:' || request.id::text, p_client_request_id) then
    raise exception using errcode = '40001', message = 'SOCIAL_GIFT_CAPACITY_CHANGED';
  end if;
  update public.social_interaction_requests set status = 'completed', completed_at = now() where id = request.id returning * into request;
  insert into public.social_interaction_receipts
    (interaction_id, interaction_type, sender_profile_id, target_profile_id)
  values (request.id, 'gift', request.sender_profile_id, request.target_profile_id) returning * into receipt;
  insert into public.social_interaction_receipt_items
    (receipt_id, from_profile_id, to_profile_id, item_definition_id, quantity)
  values (receipt.id, request.sender_profile_id, request.target_profile_id, item.id, gift.quantity);
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, after_state, result)
  values (request.id, actor.player_profile_id, 'gift_completed', p_client_request_id, request.revision,
    jsonb_build_object('receiptId', receipt.id, 'itemSlug', item.slug, 'quantity', gift.quantity), 'completed');
  response := jsonb_build_object('status', 'completed', 'interaction', private.social_gift_json(request),
    'receipt', private.social_receipt_json(receipt));
  perform private.social_store_idempotency(actor.player_profile_id, 'gift_accept', p_client_request_id, request_hash, response);
  return response;
exception
  when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
  when serialization_failure then return jsonb_build_object('status', 'settlement_failed');
end;
$$;

create or replace function public.cancel_realtime_social_gift(
  p_session_id uuid, p_interaction_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  actor := private.social_active_session(p_session_id);
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':cancel', 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'gift_cancel', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'gift' or request.sender_profile_id <> actor.player_profile_id
     or request.status <> 'pending' then return jsonb_build_object('status', 'request_changed'); end if;
  update public.social_interaction_requests set status = 'cancelled', completed_at = now() where id = request.id returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'gift_cancelled', p_client_request_id, request.revision, 'accepted');
  response := jsonb_build_object('status', 'cancelled', 'interaction', private.social_gift_json(request));
  perform private.social_store_idempotency(actor.player_profile_id, 'gift_cancel', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.create_realtime_social_trade(
  p_session_id uuid, p_target_presence_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare source public.realtime_sessions%rowtype; target public.realtime_sessions%rowtype;
  request public.social_interaction_requests%rowtype; settings public.social_interaction_settings%rowtype;
  request_hash text; replay jsonb; response jsonb; pair_error text;
begin
  source := private.social_active_session(p_session_id);
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then return jsonb_build_object('status', 'request_changed'); end if;
  request_hash := encode(extensions.digest(convert_to(p_target_presence_id::text, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(source.player_profile_id, 'trade_create', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  target := private.social_target_session(p_target_presence_id);
  pair_error := private.social_pair_error(source, target);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'social-pair:' || least(source.player_profile_id::text, target.player_profile_id::text)
      || ':' || greatest(source.player_profile_id::text, target.player_profile_id::text), 0));
  if exists (select 1 from public.social_interaction_requests existing
    where existing.interaction_type = 'trade' and existing.status in ('pending', 'negotiating')
      and existing.expires_at > now()
      and source.player_profile_id in (existing.sender_profile_id, existing.target_profile_id)) then
    response := jsonb_build_object('status', 'interaction_active');
    perform private.social_store_idempotency(source.player_profile_id, 'trade_create', p_client_request_id, request_hash, response);
    return response;
  end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
  insert into public.social_interaction_requests (
    interaction_type, sender_profile_id, target_profile_id, world_map_id, world_map_version_id,
    channel_id, client_request_id, request_hash, expires_at
  ) values ('trade', source.player_profile_id, target.player_profile_id, source.world_map_id,
    source.world_map_version_id, source.channel_id, p_client_request_id, request_hash,
    now() + make_interval(secs => settings.request_expiry_seconds)) returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, source.player_profile_id, 'trade_requested', p_client_request_id, request.revision, 'accepted');
  response := jsonb_build_object('status', 'created', 'interaction', private.social_trade_json(request),
    'senderPresenceId', (select public_presence_id from public.player_profiles where id = source.player_profile_id),
    'targetPresenceId', p_target_presence_id);
  perform private.social_store_idempotency(source.player_profile_id, 'trade_create', p_client_request_id, request_hash, response);
  return response;
exception
  when sqlstate 'P0002' then return jsonb_build_object('status', 'player_unavailable');
  when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.respond_realtime_social_trade(
  p_session_id uuid, p_interaction_id uuid, p_action text, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  settings public.social_interaction_settings%rowtype; request_hash text; replay jsonb; response jsonb;
  sender_session public.realtime_sessions%rowtype; target_session public.realtime_sessions%rowtype; pair_error text;
begin
  actor := private.social_active_session(p_session_id);
  if p_action not in ('accept', 'decline') or p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' then
    return jsonb_build_object('status', 'request_changed');
  end if;
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':' || p_action, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'trade_' || p_action, p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'trade' or request.target_profile_id <> actor.player_profile_id
     or request.status <> 'pending' then return jsonb_build_object('status', 'request_changed'); end if;
  if request.expires_at <= now() then
    update public.social_interaction_requests set status = 'expired', failure_code = 'request_expired' where id = request.id returning * into request;
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'trade_expired', p_client_request_id, request.revision, 'rejected');
    return jsonb_build_object('status', 'request_expired', 'interaction', private.social_trade_json(request));
  end if;
  if p_action = 'decline' then
    update public.social_interaction_requests set status = 'declined', completed_at = now() where id = request.id returning * into request;
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'trade_declined', p_client_request_id, request.revision, 'accepted');
    response := jsonb_build_object('status', 'declined', 'interaction', private.social_trade_json(request));
    perform private.social_store_idempotency(actor.player_profile_id, 'trade_decline', p_client_request_id, request_hash, response);
    return response;
  end if;
  select * into sender_session from public.realtime_sessions where player_profile_id = request.sender_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  select * into target_session from public.realtime_sessions where player_profile_id = request.target_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  if sender_session.id is null or target_session.id is null then return jsonb_build_object('status', 'player_unavailable'); end if;
  pair_error := private.social_pair_error(sender_session, target_session);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
  update public.social_interaction_requests set status = 'negotiating', revision = revision + 1,
    expires_at = now() + make_interval(secs => settings.trade_expiry_seconds), reconnect_deadline = null
  where id = request.id returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'trade_accepted', p_client_request_id, request.revision, 'accepted');
  response := jsonb_build_object('status', 'opened', 'interaction', private.social_trade_json(request));
  perform private.social_store_idempotency(actor.player_profile_id, 'trade_accept', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.update_realtime_social_trade_offer(
  p_session_id uuid, p_interaction_id uuid, p_expected_revision integer,
  p_items jsonb, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  settings public.social_interaction_settings%rowtype; offered record; item public.cozy_item_definitions%rowtype;
  request_hash text; replay jsonb; response jsonb; available integer; total_quantity integer := 0;
  next_revision integer; confirmations_cleared boolean;
begin
  actor := private.social_active_session(p_session_id);
  if p_client_request_id !~ '^[A-Za-z0-9._:-]{1,64}$' or p_expected_revision < 1
     or jsonb_typeof(p_items) <> 'array' then return jsonb_build_object('status', 'trade_changed'); end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
  if jsonb_array_length(p_items) > settings.maximum_offer_rows
     or exists (select 1 from jsonb_array_elements(p_items) value
       where jsonb_typeof(value) <> 'object'
         or (select array_agg(key order by key) from jsonb_object_keys(value) key) <> array['itemSlug','quantity']::text[]
         or value->>'itemSlug' !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
         or jsonb_typeof(value->'quantity') <> 'number')
     or (select count(*) from jsonb_array_elements(p_items)) <>
        (select count(distinct value->>'itemSlug') from jsonb_array_elements(p_items) value) then
    return jsonb_build_object('status', 'item_restricted');
  end if;
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':' || p_expected_revision::text || ':' || p_items::text, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'trade_offer', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'trade' or request.status <> 'negotiating'
     or actor.player_profile_id not in (request.sender_profile_id, request.target_profile_id) then
    return jsonb_build_object('status', 'request_changed');
  end if;
  if request.revision <> p_expected_revision then return jsonb_build_object('status', 'trade_changed', 'interaction', private.social_trade_json(request)); end if;
  if request.expires_at <= now() or (request.reconnect_deadline is not null and request.reconnect_deadline <= now()) then
    perform private.social_release_reservations(request.id, actor.player_profile_id, p_client_request_id);
    update public.social_interaction_requests set status = 'expired', failure_code = 'request_expired' where id = request.id returning * into request;
    return jsonb_build_object('status', 'request_expired', 'interaction', private.social_trade_json(request));
  end if;
  if request.reconnect_deadline is not null then return jsonb_build_object('status', 'trade_paused'); end if;
  perform 1 from public.player_inventory_state where player_profile_id = actor.player_profile_id for update;
  for offered in select value->>'itemSlug' item_slug, (value->>'quantity')::integer quantity from jsonb_array_elements(p_items) value
  loop
    if offered.quantity not between 1 and 999 then return jsonb_build_object('status', 'item_restricted'); end if;
    total_quantity := total_quantity + offered.quantity;
    if total_quantity > settings.maximum_total_quantity then return jsonb_build_object('status', 'item_restricted'); end if;
    select * into item from public.cozy_item_definitions where slug = offered.item_slug and active;
    if not found or not item.tradable or item.account_bound or item.permanent_tool
       or offered.quantity not between item.minimum_transfer_quantity and item.maximum_transfer_quantity then
      return jsonb_build_object('status', 'item_restricted');
    end if;
    select private.cozy_owned_quantity(actor.player_profile_id, item.id)
      - coalesce((select sum(reservation.quantity) from public.player_inventory_reservations reservation
        where reservation.player_profile_id = actor.player_profile_id and reservation.item_definition_id = item.id
          and reservation.interaction_id <> request.id and reservation.expires_at > now()), 0) into available;
    if available < offered.quantity then return jsonb_build_object('status', 'item_unavailable'); end if;
  end loop;
  confirmations_cleared := request.sender_confirmed_revision is not null or request.target_confirmed_revision is not null;
  next_revision := request.revision + 1;
  delete from public.player_trade_offer_items where interaction_id = request.id and player_profile_id = actor.player_profile_id;
  delete from public.player_inventory_reservations where interaction_id = request.id and player_profile_id = actor.player_profile_id;
  for offered in select value->>'itemSlug' item_slug, (value->>'quantity')::integer quantity from jsonb_array_elements(p_items) value
  loop
    select * into strict item from public.cozy_item_definitions where slug = offered.item_slug;
    insert into public.player_trade_offer_items (interaction_id, player_profile_id, item_definition_id, quantity, offer_revision)
    values (request.id, actor.player_profile_id, item.id, offered.quantity, next_revision);
    insert into public.player_inventory_reservations
      (interaction_id, player_profile_id, item_definition_id, quantity, offer_revision, expires_at)
    values (request.id, actor.player_profile_id, item.id, offered.quantity, next_revision, request.expires_at);
  end loop;
  update public.social_interaction_requests set revision = next_revision,
    sender_confirmed_revision = null, target_confirmed_revision = null
  where id = request.id returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, after_state, result)
  values (request.id, actor.player_profile_id, 'offer_changed', p_client_request_id, request.revision,
    jsonb_build_object('itemRows', jsonb_array_length(p_items), 'totalQuantity', total_quantity), 'accepted');
  if confirmations_cleared then
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'confirmation_cleared', p_client_request_id, request.revision, 'accepted');
  end if;
  response := jsonb_build_object('status', 'updated', 'interaction', private.social_trade_json(request));
  perform private.social_store_idempotency(actor.player_profile_id, 'trade_offer', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.confirm_realtime_social_trade(
  p_session_id uuid, p_interaction_id uuid, p_expected_revision integer, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  sender_session public.realtime_sessions%rowtype; target_session public.realtime_sessions%rowtype;
  request_hash text; replay jsonb; response jsonb; pair_error text; offered record;
  receipt public.social_interaction_receipts%rowtype; remove_ok boolean; add_ok boolean;
  sender_count integer; target_count integer; reservation_count integer; offer_count integer;
begin
  actor := private.social_active_session(p_session_id);
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':' || p_expected_revision::text, 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'trade_confirm', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'trade'
     or actor.player_profile_id not in (request.sender_profile_id, request.target_profile_id) then
    return jsonb_build_object('status', 'request_changed');
  end if;
  if request.status = 'completed' then
    select * into strict receipt from public.social_interaction_receipts where interaction_id = request.id;
    return jsonb_build_object('status', 'completed', 'interaction', private.social_trade_json(request),
      'receipt', private.social_receipt_json(receipt));
  end if;
  if request.status <> 'negotiating' then return jsonb_build_object('status', 'request_changed'); end if;
  if request.revision <> p_expected_revision then return jsonb_build_object('status', 'trade_changed', 'interaction', private.social_trade_json(request)); end if;
  if request.reconnect_deadline is not null then return jsonb_build_object('status', 'trade_paused'); end if;
  select count(*) into sender_count from public.player_trade_offer_items
    where interaction_id = request.id and player_profile_id = request.sender_profile_id;
  select count(*) into target_count from public.player_trade_offer_items
    where interaction_id = request.id and player_profile_id = request.target_profile_id;
  if sender_count = 0 or target_count = 0 then return jsonb_build_object('status', 'item_unavailable'); end if;
  if actor.player_profile_id = request.sender_profile_id then
    update public.social_interaction_requests set sender_confirmed_revision = revision where id = request.id returning * into request;
  else
    update public.social_interaction_requests set target_confirmed_revision = revision where id = request.id returning * into request;
  end if;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'confirmation_added', p_client_request_id, request.revision, 'accepted');
  if request.sender_confirmed_revision is distinct from request.revision
     or request.target_confirmed_revision is distinct from request.revision then
    response := jsonb_build_object('status', 'confirmed', 'interaction', private.social_trade_json(request));
    perform private.social_store_idempotency(actor.player_profile_id, 'trade_confirm', p_client_request_id, request_hash, response);
    return response;
  end if;

  select * into sender_session from public.realtime_sessions where player_profile_id = request.sender_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  select * into target_session from public.realtime_sessions where player_profile_id = request.target_profile_id
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  if sender_session.id is null or target_session.id is null then return jsonb_build_object('status', 'player_unavailable'); end if;
  pair_error := private.social_pair_error(sender_session, target_session);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;

  perform 1 from public.player_inventory_state state
    where state.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    order by state.player_profile_id for update;
  perform 1 from public.player_inventory_stacks stack
    where stack.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    order by stack.player_profile_id, stack.id for update;

  select count(*) into reservation_count from public.player_inventory_reservations
    where interaction_id = request.id and expires_at > now();
  select count(*) into offer_count from public.player_trade_offer_items where interaction_id = request.id;
  if reservation_count <> offer_count or exists (
    select 1 from public.player_trade_offer_items offer
    left join public.player_inventory_reservations reservation
      on reservation.interaction_id = offer.interaction_id
     and reservation.player_profile_id = offer.player_profile_id
     and reservation.item_definition_id = offer.item_definition_id
     and reservation.quantity = offer.quantity
    join public.cozy_item_definitions item on item.id = offer.item_definition_id
    where offer.interaction_id = request.id and (
      reservation.interaction_id is null or not item.active or not item.tradable
      or item.account_bound or item.permanent_tool
      or private.cozy_owned_quantity(offer.player_profile_id, item.id) < (
        select coalesce(sum(all_reservations.quantity), 0)
        from public.player_inventory_reservations all_reservations
        where all_reservations.player_profile_id = offer.player_profile_id
          and all_reservations.item_definition_id = item.id and all_reservations.expires_at > now()
      )
    )
  ) then return jsonb_build_object('status', 'item_unavailable'); end if;
  if not coalesce(private.social_trade_inventory_fits(request.sender_profile_id, request.id), false)
     or not coalesce(private.social_trade_inventory_fits(request.target_profile_id, request.id), false) then
    return jsonb_build_object('status', 'inventory_full');
  end if;

  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'settlement_started', p_client_request_id, request.revision, 'accepted');
  begin
    for offered in select * from public.player_trade_offer_items where interaction_id = request.id
      order by player_profile_id, item_definition_id
    loop
      remove_ok := private.cozy_remove_item(offered.player_profile_id, offered.item_definition_id,
        offered.quantity, 'social_trade', request.id::text,
        'trade-out:' || request.id::text || ':' || offered.player_profile_id::text || ':' || offered.item_definition_id::text,
        p_client_request_id);
      if not remove_ok then raise exception using errcode = '40001', message = 'SOCIAL_TRADE_REMOVE_FAILED'; end if;
    end loop;
    for offered in select offer.*,
      case when offer.player_profile_id = request.sender_profile_id then request.target_profile_id else request.sender_profile_id end recipient_id
      from public.player_trade_offer_items offer where offer.interaction_id = request.id
      order by offer.player_profile_id, offer.item_definition_id
    loop
      add_ok := private.cozy_add_item(offered.recipient_id, offered.item_definition_id,
        offered.quantity, 'social_trade', request.id::text,
        'trade-in:' || request.id::text || ':' || offered.recipient_id::text || ':' || offered.item_definition_id::text,
        p_client_request_id);
      if not add_ok then raise exception using errcode = '40001', message = 'SOCIAL_TRADE_ADD_FAILED'; end if;
    end loop;
  exception when others then
    update public.social_interaction_requests set status = 'failed', failure_code = 'settlement_failed', completed_at = now()
      where id = request.id returning * into request;
    perform private.social_release_reservations(request.id, actor.player_profile_id, p_client_request_id);
    insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (request.id, actor.player_profile_id, 'settlement_failed', p_client_request_id, request.revision, 'rejected');
    response := jsonb_build_object('status', 'settlement_failed', 'interaction', private.social_trade_json(request));
    perform private.social_store_idempotency(actor.player_profile_id, 'trade_confirm', p_client_request_id, request_hash, response);
    return response;
  end;

  update public.social_interaction_requests set status = 'completed', completed_at = now(), reconnect_deadline = null
    where id = request.id returning * into request;
  insert into public.social_interaction_receipts
    (interaction_id, interaction_type, sender_profile_id, target_profile_id)
  values (request.id, 'trade', request.sender_profile_id, request.target_profile_id) returning * into receipt;
  insert into public.social_interaction_receipt_items
    (receipt_id, from_profile_id, to_profile_id, item_definition_id, quantity)
  select receipt.id, offer.player_profile_id,
    case when offer.player_profile_id = request.sender_profile_id then request.target_profile_id else request.sender_profile_id end,
    offer.item_definition_id, offer.quantity
  from public.player_trade_offer_items offer where offer.interaction_id = request.id;
  perform private.social_release_reservations(request.id, actor.player_profile_id, p_client_request_id);
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, after_state, result)
  values (request.id, actor.player_profile_id, 'settlement_completed', p_client_request_id, request.revision,
    jsonb_build_object('receiptId', receipt.id, 'itemRows', offer_count), 'completed');
  response := jsonb_build_object('status', 'completed', 'interaction', private.social_trade_json(request),
    'receipt', private.social_receipt_json(receipt));
  perform private.social_store_idempotency(actor.player_profile_id, 'trade_confirm', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.cancel_realtime_social_trade(
  p_session_id uuid, p_interaction_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  request_hash text; replay jsonb; response jsonb;
begin
  actor := private.social_active_session(p_session_id);
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':cancel', 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'trade_cancel', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'trade' or request.status not in ('pending', 'negotiating')
     or actor.player_profile_id not in (request.sender_profile_id, request.target_profile_id) then
    return jsonb_build_object('status', 'request_changed');
  end if;
  perform private.social_release_reservations(request.id, actor.player_profile_id, p_client_request_id);
  update public.social_interaction_requests set status = 'cancelled', completed_at = now(), reconnect_deadline = null
    where id = request.id returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'trade_cancelled', p_client_request_id, request.revision, 'accepted');
  response := jsonb_build_object('status', 'cancelled', 'interaction', private.social_trade_json(request));
  perform private.social_store_idempotency(actor.player_profile_id, 'trade_cancel', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.resume_realtime_social_trade(
  p_session_id uuid, p_interaction_id uuid, p_client_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; request public.social_interaction_requests%rowtype;
  other_session public.realtime_sessions%rowtype; request_hash text; replay jsonb; response jsonb; pair_error text;
begin
  actor := private.social_active_session(p_session_id);
  request_hash := encode(extensions.digest(convert_to(p_interaction_id::text || ':resume', 'UTF8'), 'sha256'), 'hex');
  replay := private.social_replay(actor.player_profile_id, 'trade_resume', p_client_request_id, request_hash);
  if replay is not null then return replay; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id for update;
  if not found or request.interaction_type <> 'trade' or request.status <> 'negotiating'
     or actor.player_profile_id not in (request.sender_profile_id, request.target_profile_id) then
    return jsonb_build_object('status', 'request_changed');
  end if;
  if request.reconnect_deadline is null then
    response := jsonb_build_object('status', 'resumed', 'interaction', private.social_trade_json(request));
    perform private.social_store_idempotency(actor.player_profile_id, 'trade_resume', p_client_request_id, request_hash, response);
    return response;
  end if;
  if request.reconnect_deadline <= now() then
    perform private.social_release_reservations(request.id, actor.player_profile_id, p_client_request_id);
    update public.social_interaction_requests set status = 'expired', failure_code = 'request_expired', completed_at = now()
      where id = request.id returning * into request;
    return jsonb_build_object('status', 'request_expired', 'interaction', private.social_trade_json(request));
  end if;
  select * into other_session from public.realtime_sessions where player_profile_id = case
    when actor.player_profile_id = request.sender_profile_id then request.target_profile_id else request.sender_profile_id end
    and status = 'active' and last_heartbeat_at > now() - interval '30 seconds' order by connected_at desc limit 1;
  if other_session.id is null then return jsonb_build_object('status', 'trade_paused'); end if;
  pair_error := private.social_pair_error(actor, other_session);
  if pair_error is not null then return jsonb_build_object('status', pair_error); end if;
  update public.social_interaction_requests set reconnect_deadline = null where id = request.id returning * into request;
  insert into public.social_interaction_audit (interaction_id, actor_profile_id, action, request_id, revision, result)
  values (request.id, actor.player_profile_id, 'reconnect_resumed', p_client_request_id, request.revision, 'resumed');
  response := jsonb_build_object('status', 'resumed', 'interaction', private.social_trade_json(request));
  perform private.social_store_idempotency(actor.player_profile_id, 'trade_resume', p_client_request_id, request_hash, response);
  return response;
exception when sqlstate '28000' then return jsonb_build_object('status', 'access_changed');
end;
$$;

create or replace function public.handle_realtime_social_disconnect(
  p_session_id uuid, p_reason text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare session public.realtime_sessions%rowtype; settings public.social_interaction_settings%rowtype;
  interaction public.social_interaction_requests%rowtype; changed jsonb := '[]'::jsonb;
begin
  select * into session from public.realtime_sessions where id = p_session_id;
  if not found then return jsonb_build_object('interactions', changed); end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
  for interaction in select * from public.social_interaction_requests request
    where request.status in ('pending', 'negotiating')
      and session.player_profile_id in (request.sender_profile_id, request.target_profile_id)
    order by request.id for update
  loop
    if interaction.interaction_type = 'trade' and interaction.status = 'negotiating'
       and p_reason in ('connection_lost', 'replaced', 'server_shutdown', 'idle_timeout') then
      update public.social_interaction_requests set reconnect_deadline = least(expires_at,
        now() + make_interval(secs => settings.reconnect_grace_seconds))
      where id = interaction.id returning * into interaction;
      insert into public.social_interaction_audit
        (interaction_id, actor_profile_id, action, request_id, revision, result)
      values (interaction.id, session.player_profile_id, 'reconnect_paused', p_request_id,
        interaction.revision, 'paused');
      changed := changed || jsonb_build_array(private.social_trade_json(interaction));
    elsif p_reason in ('channel_switch', 'world_transition', 'access_revoked', 'player_suspended',
      'rename_required', 'maintenance', 'authorization_failed') then
      perform private.social_release_reservations(interaction.id, session.player_profile_id, p_request_id);
      update public.social_interaction_requests set status = 'invalidated', failure_code = case
        when p_reason = 'maintenance' then 'maintenance' else 'access_changed' end,
        completed_at = now(), reconnect_deadline = null
      where id = interaction.id returning * into interaction;
      insert into public.social_interaction_audit
        (interaction_id, actor_profile_id, action, request_id, revision, result)
      values (interaction.id, session.player_profile_id,
        case when interaction.interaction_type = 'trade' then 'trade_invalidated' else 'gift_cancelled' end,
        p_request_id, interaction.revision, 'released');
      changed := changed || jsonb_build_array(private.social_interaction_json(interaction));
    end if;
  end loop;
  return jsonb_build_object('interactions', changed);
end;
$$;

create or replace function public.invalidate_realtime_social_pair(
  p_session_id uuid, p_target_presence_id uuid, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare actor public.realtime_sessions%rowtype; target_player_profile_id uuid;
  interaction public.social_interaction_requests%rowtype; changed jsonb := '[]'::jsonb;
begin
  actor := private.social_active_session(p_session_id);
  select id into target_player_profile_id from public.player_profiles where public_presence_id = p_target_presence_id;
  if target_player_profile_id is null then return jsonb_build_object('interactions', changed); end if;
  for interaction in select * from public.social_interaction_requests request
    where request.status in ('pending', 'negotiating') and (
      (request.sender_profile_id = actor.player_profile_id and request.target_profile_id = target_player_profile_id)
      or (request.sender_profile_id = target_player_profile_id and request.target_profile_id = actor.player_profile_id)
    ) order by request.id for update
  loop
    perform private.social_release_reservations(interaction.id, actor.player_profile_id, p_request_id);
    update public.social_interaction_requests set status = 'invalidated', failure_code = 'blocked',
      completed_at = now(), reconnect_deadline = null where id = interaction.id returning * into interaction;
    insert into public.social_interaction_audit
      (interaction_id, actor_profile_id, action, request_id, revision, result)
    values (interaction.id, actor.player_profile_id,
      case when interaction.interaction_type = 'trade' then 'trade_invalidated' else 'gift_cancelled' end,
      p_request_id, interaction.revision, 'released');
    changed := changed || jsonb_build_array(private.social_interaction_json(interaction));
  end loop;
  return jsonb_build_object('interactions', changed);
exception when sqlstate '28000' then return jsonb_build_object('interactions', changed);
end;
$$;

create or replace function public.cleanup_social_interactions(p_batch_size integer, p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare interaction public.social_interaction_requests%rowtype; processed integer := 0;
  released integer := 0; settings public.social_interaction_settings%rowtype;
begin
  if p_batch_size not between 1 and 10000 or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_CLEANUP';
  end if;
  select * into strict settings from public.social_interaction_settings where singleton_key;
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

create or replace function private.social_admin_authorized(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_permission text
)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(authz.result ->> 'outcome' = 'authorized'
    and (authz.result -> 'context' -> 'permissionKeys') ? p_permission, false)
  from (select private.evaluate_admin_authorization(p_user_id, p_auth_session_id, p_assurance_level) result) authz;
$$;

create or replace function public.get_admin_social_interactions(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text,
  p_type text, p_status text, p_search text, p_page integer, p_page_size integer
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare total integer;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_interactions.read')
    then raise exception using errcode = '42501', message = 'SOCIAL_INTERACTIONS_ACCESS_DENIED'; end if;
  if p_type not in ('all', 'gift', 'trade') or p_status not in (
    'all', 'pending', 'negotiating', 'completed', 'declined', 'cancelled', 'expired', 'invalidated', 'failed'
  ) or p_page < 1 or p_page_size not in (10, 50, 100) or char_length(coalesce(p_search, '')) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_SOCIAL_INTERACTION_QUERY';
  end if;
  select count(*)::integer into total from public.social_interaction_requests request
  join public.player_profiles sender on sender.id = request.sender_profile_id
  join public.player_profiles target on target.id = request.target_profile_id
  where (p_type = 'all' or request.interaction_type = p_type)
    and (p_status = 'all' or request.status = p_status)
    and (coalesce(p_search, '') = '' or request.id::text = p_search
      or sender.display_name ilike '%' || p_search || '%' or target.display_name ilike '%' || p_search || '%');
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', page.id, 'kind', page.interaction_type, 'status', page.status,
      'sender', private.social_participant_json(sender), 'target', private.social_participant_json(target),
      'revision', page.revision, 'createdAt', page.created_at, 'expiresAt', page.expires_at,
      'completedAt', page.completed_at, 'failureCode', page.failure_code
    ) order by page.created_at desc, page.id desc)
    from (select * from public.social_interaction_requests request
      where (p_type = 'all' or request.interaction_type = p_type)
        and (p_status = 'all' or request.status = p_status)
        and (coalesce(p_search, '') = '' or request.id::text = p_search
          or exists (select 1 from public.player_profiles profile
            where profile.id in (request.sender_profile_id, request.target_profile_id)
              and profile.display_name ilike '%' || p_search || '%'))
      order by request.created_at desc, request.id desc
      limit p_page_size offset (p_page - 1) * p_page_size) page
    join public.player_profiles sender on sender.id = page.sender_profile_id
    join public.player_profiles target on target.id = page.target_profile_id), '[]'::jsonb),
    'page', p_page, 'pageSize', p_page_size, 'total', total,
    'totalPages', ceil(total::numeric / p_page_size)::integer
  );
end;
$$;

create or replace function public.get_admin_social_interaction(
  p_user_id uuid, p_auth_session_id uuid, p_assurance_level text, p_interaction_id uuid
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare request public.social_interaction_requests%rowtype; receipt public.social_interaction_receipts%rowtype;
begin
  if not private.social_admin_authorized(p_user_id, p_auth_session_id, p_assurance_level, 'social_interactions.audit.read')
    then raise exception using errcode = '42501', message = 'SOCIAL_INTERACTION_AUDIT_DENIED'; end if;
  select * into request from public.social_interaction_requests where id = p_interaction_id;
  if not found then raise exception using errcode = 'P0002', message = 'SOCIAL_INTERACTION_NOT_FOUND'; end if;
  select * into receipt from public.social_interaction_receipts where interaction_id = request.id;
  return jsonb_build_object(
    'interaction', private.social_interaction_json(request),
    'receipt', case when receipt.id is null then null else private.social_receipt_json(receipt) end,
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
      'id', audit.id, 'action', audit.action, 'revision', audit.revision,
      'result', audit.result, 'createdAt', audit.created_at
    ) order by audit.entry_number desc) from (
      select * from public.social_interaction_audit source
      where source.interaction_id = request.id order by source.entry_number desc limit 100
    ) audit), '[]'::jsonb)
  );
end;
$$;

do $$
declare signature text;
begin
  foreach signature in array array[
    'private.reject_social_immutable_mutation()',
    'private.social_active_session(uuid)',
    'private.social_target_session(uuid)',
    'private.social_pair_error(public.realtime_sessions,public.realtime_sessions)',
    'private.social_participant_json(public.player_profiles)',
    'private.social_offer_items_json(uuid,uuid)',
    'private.social_gift_json(public.social_interaction_requests)',
    'private.social_trade_json(public.social_interaction_requests)',
    'private.social_receipt_json(public.social_interaction_receipts)',
    'private.social_inventory_json(uuid)',
    'private.social_store_idempotency(uuid,text,text,text,jsonb)',
    'private.social_replay(uuid,text,text,text)',
    'private.social_release_reservations(uuid,uuid,text)',
    'private.social_trade_inventory_fits(uuid,uuid)',
    'private.social_interaction_json(public.social_interaction_requests)',
    'private.social_admin_authorized(uuid,uuid,text,text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', signature);
  end loop;
end;
$$;

revoke all on function public.get_realtime_social_bootstrap(uuid) from public,anon,authenticated,service_role;
revoke all on function public.inspect_realtime_social_player(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.create_realtime_social_gift(uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_realtime_social_gift(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_realtime_social_gift(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.create_realtime_social_trade(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_realtime_social_trade(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.update_realtime_social_trade_offer(uuid,uuid,integer,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.confirm_realtime_social_trade(uuid,uuid,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.cancel_realtime_social_trade(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.resume_realtime_social_trade(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.handle_realtime_social_disconnect(uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.invalidate_realtime_social_pair(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.cleanup_social_interactions(integer,text) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_interactions(uuid,uuid,text,text,text,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_social_interaction(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;

grant execute on function public.get_realtime_social_bootstrap(uuid) to service_role;
grant execute on function public.inspect_realtime_social_player(uuid,uuid) to service_role;
grant execute on function public.create_realtime_social_gift(uuid,uuid,text,integer,text) to service_role;
grant execute on function public.respond_realtime_social_gift(uuid,uuid,text,text) to service_role;
grant execute on function public.cancel_realtime_social_gift(uuid,uuid,text) to service_role;
grant execute on function public.create_realtime_social_trade(uuid,uuid,text) to service_role;
grant execute on function public.respond_realtime_social_trade(uuid,uuid,text,text) to service_role;
grant execute on function public.update_realtime_social_trade_offer(uuid,uuid,integer,jsonb,text) to service_role;
grant execute on function public.confirm_realtime_social_trade(uuid,uuid,integer,text) to service_role;
grant execute on function public.cancel_realtime_social_trade(uuid,uuid,text) to service_role;
grant execute on function public.resume_realtime_social_trade(uuid,uuid,text) to service_role;
grant execute on function public.handle_realtime_social_disconnect(uuid,text,text) to service_role;
grant execute on function public.invalidate_realtime_social_pair(uuid,uuid,text) to service_role;
grant execute on function public.cleanup_social_interactions(integer,text) to service_role;
grant execute on function public.get_admin_social_interactions(uuid,uuid,text,text,text,text,integer,integer) to service_role;
grant execute on function public.get_admin_social_interaction(uuid,uuid,text,uuid) to service_role;
