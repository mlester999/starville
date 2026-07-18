-- Starville Phase 10B: authoritative cosmetic ownership, wardrobes, emotes,
-- collections, administration, and a structurally disabled future DUST shop.
-- Additive and forward-only. This migration publishes no avatar cosmetic assets.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('cosmetics.read', 'Read cosmetics', 'Read bounded cosmetic catalog and collection data.', 'cosmetics', false, true),
  ('cosmetics.audit.read', 'Read cosmetic audit', 'Read immutable cosmetic ownership and reward receipts.', 'cosmetics', true, true),
  ('cosmetics.edit', 'Edit cosmetic drafts', 'Create and edit cosmetic collection, emote, and shop-preview drafts.', 'cosmetics', false, true),
  ('cosmetics.review', 'Review cosmetics', 'Review cosmetic catalog lifecycle candidates.', 'cosmetics', true, true),
  ('cosmetics.approve', 'Approve cosmetics', 'Approve validated cosmetic lifecycle candidates.', 'cosmetics', true, true),
  ('cosmetics.activate', 'Activate cosmetics', 'Activate approved cosmetic definitions without enabling purchases.', 'cosmetics', true, true),
  ('cosmetics.grant', 'Grant cosmetics', 'Grant one bounded cosmetic entitlement to one player with a reason.', 'cosmetics', true, true),
  ('cosmetics.revoke', 'Revoke cosmetics', 'Revoke one cosmetic entitlement with safe fallback and a reason.', 'cosmetics', true, true),
  ('cosmetics.settings.read', 'Read cosmetic settings', 'Read wardrobe, emote, collection, and disabled-shop settings.', 'cosmetics', false, true),
  ('cosmetics.settings.edit', 'Edit cosmetic settings', 'Edit bounded non-purchase cosmetic settings.', 'cosmetics', true, true),
  ('cosmetics.shop.read', 'Read cosmetic shop preview', 'Read disabled future DUST cosmetic shop drafts.', 'cosmetics', false, true),
  ('cosmetics.shop.edit', 'Edit cosmetic shop preview', 'Edit disabled future DUST cosmetic shop drafts.', 'cosmetics', true, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles role
cross join public.admin_permissions permission
where role.key = 'super_admin' and permission.key like 'cosmetics.%'
on conflict (role_id, permission_id) do nothing;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'cosmetics.read'),
    ('game_administrator', 'cosmetics.audit.read'),
    ('game_administrator', 'cosmetics.edit'),
    ('game_administrator', 'cosmetics.review'),
    ('game_administrator', 'cosmetics.approve'),
    ('game_administrator', 'cosmetics.activate'),
    ('game_administrator', 'cosmetics.grant'),
    ('game_administrator', 'cosmetics.revoke'),
    ('game_administrator', 'cosmetics.settings.read'),
    ('game_administrator', 'cosmetics.shop.read'),
    ('content_manager', 'cosmetics.read'),
    ('content_manager', 'cosmetics.edit'),
    ('content_manager', 'cosmetics.review'),
    ('customer_support', 'cosmetics.read'),
    ('customer_support', 'cosmetics.grant'),
    ('customer_support', 'cosmetics.revoke'),
    ('customer_support', 'avatar_content.read'),
    ('read_only_analyst', 'cosmetics.read'),
    ('read_only_analyst', 'cosmetics.audit.read'),
    ('read_only_analyst', 'cosmetics.settings.read'),
    ('read_only_analyst', 'cosmetics.shop.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

create table public.cosmetic_acquisition_sources (
  source_key text primary key,
  display_name text not null,
  administrator_only boolean not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cosmetic_acquisition_sources_key_check check (
    char_length(source_key) between 3 and 80
    and source_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint cosmetic_acquisition_sources_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  )
);

insert into public.cosmetic_acquisition_sources
  (source_key, display_name, administrator_only)
values
  ('starter_catalog', 'Starter wardrobe', false),
  ('administrator_grant', 'Administrator grant', true),
  ('collection_reward', 'Collection reward', false),
  ('system_migration', 'System migration', true)
on conflict (source_key) do nothing;

create table public.player_cosmetic_ownership (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  source_key text not null references public.cosmetic_acquisition_sources(source_key) on delete restrict,
  ownership_state text not null default 'owned' check (ownership_state in ('owned', 'revoked')),
  granted_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  revoked_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  acquired_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (player_profile_id, avatar_content_definition_id),
  constraint player_cosmetic_ownership_actor_check check (
    (source_key = 'administrator_grant' and granted_by_admin_id is not null)
    or source_key <> 'administrator_grant'
  ),
  constraint player_cosmetic_ownership_revocation_check check (
    (ownership_state = 'owned' and revoked_at is null and revoked_by_admin_id is null)
    or (ownership_state = 'revoked' and revoked_at is not null and revoked_by_admin_id is not null)
  )
);

create table public.cosmetic_ownership_receipts (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  operation_key text not null check (operation_key in ('grant', 'revoke', 'reward')),
  source_key text not null references public.cosmetic_acquisition_sources(source_key) on delete restrict,
  administrator_user_id uuid references public.admin_users(user_id) on delete restrict,
  admin_session_id uuid references public.admin_sessions(id) on delete restrict,
  reason_category text not null,
  reason text not null,
  fallback_applied boolean not null default false,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  constraint cosmetic_ownership_receipts_reason_check check (
    char_length(reason) between 12 and 500 and reason = btrim(reason)
    and reason !~ '[[:cntrl:]<>]'
  ),
  constraint cosmetic_ownership_receipts_reason_category_check check (
    (operation_key = 'grant' and reason_category in (
      'customer_support', 'event_reward', 'content_recovery',
      'migration_correction', 'development_test'
    ))
    or (operation_key = 'revoke' and reason_category in (
      'content_retired', 'mistaken_administrative_grant', 'policy_violation',
      'asset_rights_issue', 'technical_incompatibility', 'migration_correction'
    ))
    or (operation_key = 'reward' and reason_category = 'collection_completion')
  ),
  constraint cosmetic_ownership_receipts_request_check check (
    char_length(request_id) between 1 and 128
  ),
  constraint cosmetic_ownership_receipts_admin_check check (
    (operation_key in ('grant', 'revoke') and administrator_user_id is not null and admin_session_id is not null)
    or operation_key = 'reward'
  ),
  constraint cosmetic_ownership_receipts_fallback_check check (
    not fallback_applied or operation_key = 'revoke'
  )
);

create or replace function private.valid_cosmetic_selection_shape(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare key_name text;
declare value text;
begin
  if jsonb_typeof(p_value) is distinct from 'object'
     or pg_column_size(p_value) > 32768
     or p_value::text ~* '(https?://|data:|javascript:|<script|<iframe|onerror[[:space:]]*=)'
     or exists (
       select 1 from jsonb_object_keys(p_value) item(key)
       where item.key not in (
         'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
         'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey',
         'accessoryKeys', 'presetKey'
       )
     )
     or jsonb_typeof(p_value -> 'accessoryKeys') is distinct from 'array'
     or jsonb_array_length(p_value -> 'accessoryKeys') > 4 then return false; end if;
  foreach key_name in array array[
    'bodyPresetKey', 'skinPaletteKey', 'faceKey', 'eyesKey', 'eyebrowsKey',
    'hairKey', 'hairPaletteKey', 'topKey', 'bottomKey', 'footwearKey', 'presetKey'
  ] loop
    if p_value ? key_name and jsonb_typeof(p_value -> key_name) not in ('string', 'null') then
      return false;
    end if;
    value := p_value ->> key_name;
    if value is not null and not (
      char_length(value) between 3 and 80
      and value ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    ) then return false; end if;
  end loop;
  if p_value ->> 'bodyPresetKey' is null or exists (
    select 1 from jsonb_array_elements(p_value -> 'accessoryKeys') item
    where jsonb_typeof(item) <> 'string'
       or char_length(item #>> '{}') not between 3 and 80
       or item #>> '{}' !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ) or (select count(*) from jsonb_array_elements_text(p_value -> 'accessoryKeys')) <>
       (select count(distinct item) from jsonb_array_elements_text(p_value -> 'accessoryKeys') item)
  then return false; end if;
  return true;
exception when others then return false;
end;
$$;

create table public.player_cosmetic_loadouts (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  slot_number smallint not null check (slot_number between 1 and 5),
  display_name text not null,
  selection jsonb not null check (private.valid_cosmetic_selection_shape(selection)),
  revision integer not null default 1 check (revision > 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_profile_id, slot_number),
  constraint player_cosmetic_loadouts_name_check check (
    char_length(display_name) between 1 and 40 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  )
);

create unique index player_cosmetic_loadouts_one_active_idx
  on public.player_cosmetic_loadouts(player_profile_id) where is_active;

create table public.cosmetic_emote_definitions (
  id uuid primary key default gen_random_uuid(),
  emote_key text not null,
  version_number integer not null default 1 check (version_number > 0),
  display_name text not null,
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'in_review', 'approved', 'active', 'superseded', 'disabled', 'rejected'
  )),
  duration_ms integer not null check (duration_ms between 250 and 15000),
  interruptible boolean not null default true,
  starter_entitlement boolean not null default false,
  system_defined boolean not null default false,
  configuration jsonb not null default '{}'::jsonb check (
    jsonb_typeof(configuration) = 'object' and pg_column_size(configuration) <= 8192
    and configuration::text !~* '(https?://|data:|javascript:|<script|<iframe)'
  ),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  approved_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  activated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emote_key, version_number),
  constraint cosmetic_emote_definitions_key_check check (
    char_length(emote_key) between 3 and 80
    and emote_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint cosmetic_emote_definitions_name_check check (
    char_length(display_name) between 1 and 80 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  constraint cosmetic_emote_definitions_publication_check check (
    (lifecycle_status in ('approved', 'active', 'superseded', 'disabled')
      and (approved_by_admin_id is not null or system_defined))
    or lifecycle_status not in ('approved', 'active', 'superseded', 'disabled')
  ),
  constraint cosmetic_emote_definitions_activation_check check (
    (lifecycle_status in ('active', 'superseded')
      and (activated_by_admin_id is not null or system_defined))
    or lifecycle_status not in ('active', 'superseded')
  )
);

create unique index cosmetic_emote_definitions_one_active_idx
  on public.cosmetic_emote_definitions(emote_key) where lifecycle_status = 'active';

insert into public.cosmetic_emote_definitions (
  emote_key, display_name, lifecycle_status, duration_ms, interruptible,
  starter_entitlement, system_defined, configuration
)
values
  ('wave', 'Wave', 'active', 1800, true, true, true, '{"motion":"wave"}'),
  ('cheer', 'Cheer', 'active', 2200, true, true, true, '{"motion":"cheer"}'),
  ('nod', 'Nod', 'active', 1200, true, true, true, '{"motion":"nod"}'),
  ('laugh', 'Laugh', 'active', 2400, true, true, true, '{"motion":"laugh"}'),
  ('sit', 'Sit', 'active', 6000, true, true, true, '{"motion":"sit"}'),
  ('dance', 'Dance', 'active', 5000, true, true, true, '{"motion":"dance"}')
on conflict (emote_key, version_number) do nothing;

create table public.player_emote_entitlements (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  emote_key text not null,
  source_key text not null references public.cosmetic_acquisition_sources(source_key) on delete restrict,
  granted_at timestamptz not null default now(),
  primary key (player_profile_id, emote_key),
  constraint player_emote_entitlements_key_check check (
    char_length(emote_key) between 3 and 80
    and emote_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  )
);

create or replace function private.valid_cosmetic_emote_keys(p_value text[])
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select cardinality(p_value) <= 8
    and private.avatar_unique_text_array(p_value)
    and not exists (
      select 1 from unnest(p_value) item(value)
      where char_length(item.value) not between 3 and 80
         or item.value !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
    );
$$;

create table public.player_emote_wheels (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  emote_keys text[] not null default '{}'::text[]
    check (private.valid_cosmetic_emote_keys(emote_keys)),
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table public.player_emote_activations (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  emote_key text not null,
  request_id text not null,
  channel_key text not null,
  duration_ms integer not null check (duration_ms between 250 and 15000),
  interrupted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (player_profile_id, request_id),
  constraint player_emote_activations_emote_key_check check (
    char_length(emote_key) between 3 and 80
    and emote_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint player_emote_activations_request_check check (char_length(request_id) between 1 and 128),
  constraint player_emote_activations_channel_check check (
    char_length(channel_key) between 3 and 80
    and channel_key ~ '^[a-z][a-z0-9]*(?:[._:-][a-z0-9]+)*$'
  )
);

create index player_emote_activations_rate_idx
  on public.player_emote_activations(player_profile_id, created_at desc);

create table public.cosmetic_collection_definitions (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null unique,
  display_name text not null,
  description text not null default '',
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'in_review', 'approved', 'active', 'superseded', 'disabled', 'rejected'
  )),
  reward_avatar_content_definition_id uuid
    references public.avatar_content_definitions(id) on delete restrict,
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cosmetic_collection_definitions_key_check check (
    char_length(collection_key) between 3 and 80
    and collection_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint cosmetic_collection_definitions_name_check check (
    char_length(display_name) between 1 and 100 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  ),
  constraint cosmetic_collection_definitions_description_check check (
    char_length(description) <= 280 and description = btrim(description)
    and description !~ '[[:cntrl:]<>]'
  )
);

create table public.cosmetic_collection_members (
  cosmetic_collection_id uuid not null
    references public.cosmetic_collection_definitions(id) on delete restrict,
  avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  sort_order integer not null check (sort_order between 0 and 1000),
  primary key (cosmetic_collection_id, avatar_content_definition_id),
  unique (cosmetic_collection_id, sort_order)
);

create table public.cosmetic_collection_reward_receipts (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  cosmetic_collection_id uuid not null
    references public.cosmetic_collection_definitions(id) on delete restrict,
  reward_avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  unique (player_profile_id, cosmetic_collection_id),
  constraint cosmetic_collection_reward_receipts_request_check check (
    char_length(request_id) between 1 and 128
  )
);

create table public.cosmetic_shop_settings (
  game_key text primary key check (game_key = 'starville'),
  enabled boolean not null default false check (not enabled),
  lifecycle_status text not null default 'disabled_preview'
    check (lifecycle_status = 'disabled_preview'),
  currency_key text not null default 'DUST' check (currency_key = 'DUST'),
  purchase_available boolean not null default false check (not purchase_available),
  message text not null,
  revision integer not null default 1 check (revision > 0),
  updated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cosmetic_shop_settings_message_check check (
    char_length(message) between 12 and 240 and message = btrim(message)
    and message !~ '[[:cntrl:]<>]'
  )
);

insert into public.cosmetic_shop_settings (game_key, message)
values ('starville', 'Cosmetic offers are preview-only. DUST purchases are disabled in this phase.')
on conflict (game_key) do nothing;

create table public.cosmetic_shop_offer_drafts (
  id uuid primary key default gen_random_uuid(),
  offer_key text not null unique,
  avatar_content_definition_id uuid not null
    references public.avatar_content_definitions(id) on delete restrict,
  display_name text not null,
  dust_price bigint not null check (dust_price between 1 and 1000000000),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'disabled')),
  edit_revision integer not null default 1 check (edit_revision > 0),
  created_by_admin_id uuid not null references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cosmetic_shop_offer_drafts_key_check check (
    char_length(offer_key) between 3 and 80
    and offer_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  constraint cosmetic_shop_offer_drafts_name_check check (
    char_length(display_name) between 1 and 100 and display_name = btrim(display_name)
    and display_name !~ '[[:cntrl:]<>]'
  )
);

create table public.cosmetic_settings (
  game_key text primary key check (game_key = 'starville'),
  wardrobe_enabled boolean not null default true,
  emotes_enabled boolean not null default true,
  collections_enabled boolean not null default true,
  maintenance_mode boolean not null default false,
  max_loadouts integer not null default 5 check (max_loadouts between 1 and 5),
  max_emote_wheel_slots integer not null default 8 check (max_emote_wheel_slots between 1 and 8),
  emote_rate_limit integer not null default 6 check (emote_rate_limit between 1 and 30),
  revision integer not null default 1 check (revision > 0),
  updated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.cosmetic_settings (game_key) values ('starville')
on conflict (game_key) do nothing;

create table public.cosmetic_idempotency (
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  operation text not null check (
    char_length(operation) between 3 and 80 and operation ~ '^[a-z][a-z0-9_]*$'
  ),
  request_id text not null check (char_length(request_id) between 1 and 128),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  response_body jsonb not null check (
    jsonb_typeof(response_body) = 'object' and pg_column_size(response_body) <= 131072
  ),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (subject_key, operation, request_id),
  constraint cosmetic_idempotency_expiration_check check (
    expires_at > created_at and expires_at <= created_at + interval '7 days'
  )
);

create or replace function private.reject_cosmetic_immutable_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'COSMETIC_RECEIPT_IMMUTABLE';
end;
$$;

create trigger cosmetic_ownership_receipts_append_only
before update or delete on public.cosmetic_ownership_receipts
for each row execute function private.reject_cosmetic_immutable_mutation();
create trigger cosmetic_collection_reward_receipts_append_only
before update or delete on public.cosmetic_collection_reward_receipts
for each row execute function private.reject_cosmetic_immutable_mutation();
create trigger player_emote_activations_append_only
before update or delete on public.player_emote_activations
for each row execute function private.reject_cosmetic_immutable_mutation();

create trigger player_cosmetic_ownership_set_updated_at before update on public.player_cosmetic_ownership
for each row execute function private.set_updated_at();
create trigger player_cosmetic_loadouts_set_updated_at before update on public.player_cosmetic_loadouts
for each row execute function private.set_updated_at();
create trigger cosmetic_emote_definitions_set_updated_at before update on public.cosmetic_emote_definitions
for each row execute function private.set_updated_at();
create trigger cosmetic_collection_definitions_set_updated_at before update on public.cosmetic_collection_definitions
for each row execute function private.set_updated_at();
create trigger cosmetic_shop_settings_set_updated_at before update on public.cosmetic_shop_settings
for each row execute function private.set_updated_at();
create trigger cosmetic_shop_offer_drafts_set_updated_at before update on public.cosmetic_shop_offer_drafts
for each row execute function private.set_updated_at();
create trigger cosmetic_settings_set_updated_at before update on public.cosmetic_settings
for each row execute function private.set_updated_at();

-- Every table is RPC-only: RLS is forced and all direct grants are revoked.
do $$
declare relation_name text;
begin
  foreach relation_name in array array[
    'cosmetic_acquisition_sources', 'player_cosmetic_ownership',
    'cosmetic_ownership_receipts', 'player_cosmetic_loadouts',
    'cosmetic_emote_definitions', 'player_emote_entitlements', 'player_emote_wheels',
    'player_emote_activations', 'cosmetic_collection_definitions',
    'cosmetic_collection_members', 'cosmetic_collection_reward_receipts',
    'cosmetic_shop_settings', 'cosmetic_shop_offer_drafts', 'cosmetic_settings',
    'cosmetic_idempotency'
  ] loop
    execute format('alter table public.%I enable row level security', relation_name);
    execute format('alter table public.%I force row level security', relation_name);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      relation_name
    );
  end loop;
end;
$$;

revoke all on function private.valid_cosmetic_selection_shape(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.valid_cosmetic_emote_keys(text[])
  from public, anon, authenticated, service_role;
revoke all on function private.reject_cosmetic_immutable_mutation()
  from public, anon, authenticated, service_role;
