-- Starville Phase 11D: authoritative skills, XP, levels, unlocks, quest chains,
-- achievements, titles, badges, rewards, and progression operations.
--
-- This migration extends the Phase 11A-C quest, inventory, recipe, shop, DUST,
-- and trusted gameplay-event foundations. It intentionally creates no second
-- player profile, inventory, DUST ledger, recipe catalog, or quest engine.

insert into public.admin_permissions
  (key,name,description,category,is_sensitive,is_system)
values
  ('progression.skills.inspect','Inspect progression skills','Inspect skills, active versions, XP curves, and player distributions.','gameplay',false,true),
  ('progression.skills.manage','Manage progression skills','Create and activate reviewed successor skill configurations.','gameplay',true,true),
  ('progression.curves.manage','Manage progression curves','Create, validate, simulate, and activate XP curve successors.','gameplay',true,true),
  ('progression.xp_rules.manage','Manage progression XP rules','Manage bounded trusted-event XP rule versions.','gameplay',true,true),
  ('progression.unlocks.inspect','Inspect progression unlocks','Inspect unlock requirements, targets, and grant counts.','gameplay',false,true),
  ('progression.unlocks.manage','Manage progression unlocks','Manage versioned unlock requirements and grandfathering.','gameplay',true,true),
  ('progression.quests.inspect','Inspect progression quests','Inspect quest chains, objective progress, and rewards.','gameplay',false,true),
  ('progression.quests.manage','Manage progression quests','Manage quest-chain successor configurations.','gameplay',true,true),
  ('progression.achievements.inspect','Inspect achievements','Inspect achievement definitions and aggregate progress.','gameplay',false,true),
  ('progression.achievements.manage','Manage achievements','Manage versioned non-repeatable achievement configurations.','gameplay',true,true),
  ('progression.titles.manage','Manage progression titles','Manage title and badge presentation without deleting ownership.','gameplay',true,true),
  ('progression.players.inspect','Inspect player progression','Inspect bounded private player progression and settlement evidence.','players',true,true),
  ('progression.corrections.manage','Manage progression corrections','Request AAL2 compensating XP corrections with impact review.','gameplay',true,true),
  ('progression.reconciliation.manage','Manage progression reconciliation','Request and process bounded progression reconciliation.','gameplay',true,true),
  ('progression.live_ops.manage','Manage progression live ops','Pause grants or activate bounded reviewed XP multipliers.','live_operations',true,true),
  ('progression.telemetry.read','Read progression telemetry','Read bounded aggregate progression telemetry without private quest detail.','analytics',false,true)
on conflict (key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  is_sensitive=excluded.is_sensitive,is_system=true;

with mapping(role_key,permission_key) as (
  values
    ('game_administrator','progression.skills.inspect'),('game_administrator','progression.skills.manage'),
    ('game_administrator','progression.curves.manage'),('game_administrator','progression.xp_rules.manage'),
    ('game_administrator','progression.unlocks.inspect'),('game_administrator','progression.unlocks.manage'),
    ('game_administrator','progression.quests.inspect'),('game_administrator','progression.quests.manage'),
    ('game_administrator','progression.achievements.inspect'),('game_administrator','progression.achievements.manage'),
    ('game_administrator','progression.titles.manage'),('game_administrator','progression.players.inspect'),
    ('game_administrator','progression.corrections.manage'),('game_administrator','progression.reconciliation.manage'),
    ('game_administrator','progression.live_ops.manage'),('game_administrator','progression.telemetry.read'),
    ('live_operations_manager','progression.skills.inspect'),('live_operations_manager','progression.unlocks.inspect'),
    ('live_operations_manager','progression.quests.inspect'),('live_operations_manager','progression.achievements.inspect'),
    ('live_operations_manager','progression.players.inspect'),('live_operations_manager','progression.live_ops.manage'),
    ('live_operations_manager','progression.telemetry.read'),
    ('content_manager','progression.skills.inspect'),('content_manager','progression.skills.manage'),
    ('content_manager','progression.curves.manage'),('content_manager','progression.xp_rules.manage'),
    ('content_manager','progression.unlocks.inspect'),('content_manager','progression.unlocks.manage'),
    ('content_manager','progression.quests.inspect'),('content_manager','progression.quests.manage'),
    ('content_manager','progression.achievements.inspect'),('content_manager','progression.achievements.manage'),
    ('content_manager','progression.titles.manage'),
    ('customer_support','progression.skills.inspect'),('customer_support','progression.players.inspect'),
    ('customer_support','progression.quests.inspect'),
    ('read_only_analyst','progression.telemetry.read')
)
insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict do nothing;

alter table public.cozy_gameplay_rate_limits drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
  'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
  'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
  'home_read','home_write','vertical_slice_read','plot_provision','home_farm_write',
  'starter_quest_write','workstation_read','workstation_write','workstation_collect',
  'workstation_tutorial_write','shop_workspace_read','shop_transaction_write',
  'shop_receipt_read','shop_tutorial_write','shop_event_read',
  'progression_read','progression_write','quest_read','achievement_read','title_write','progression_event_read'
));

insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from public.admin_roles role
cross join public.admin_permissions permission
where role.key='super_admin' and permission.key like 'progression.%'
on conflict do nothing;

alter table public.player_profiles
  drop constraint if exists player_profiles_public_level_check,
  add constraint player_profiles_public_level_check check (public_level between 1 and 20),
  add column equipped_title_key text check (
    equipped_title_key is null or equipped_title_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  ),
  add column selected_badge_key text check (
    selected_badge_key is null or selected_badge_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  );

comment on column public.player_profiles.public_level is
  'Safe public projection of the authoritative Phase 11D player-level record; never a write authority.';

create table public.progression_curve_versions (
  id uuid primary key,
  curve_key text not null check (curve_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  version_number integer not null check (version_number between 1 and 10000),
  curve_kind text not null check (curve_kind in ('skill','player')),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  public_name text not null check (char_length(public_name) between 3 and 80 and public_name=btrim(public_name) and public_name !~ '[[:cntrl:]<>]'),
  maximum_level integer not null check (maximum_level between 2 and 50),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=8192),
  created_at timestamptz not null default now(),
  unique(curve_key,version_number),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

create table public.progression_curve_thresholds (
  curve_version_id uuid not null references public.progression_curve_versions(id) on delete restrict,
  level integer not null check (level between 1 and 50),
  cumulative_xp bigint not null check (cumulative_xp between 0 and 9000000000000000),
  primary key(curve_version_id,level),
  unique(curve_version_id,cumulative_xp)
);

create table public.progression_active_curve_versions (
  curve_key text primary key check (curve_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  curve_version_id uuid not null unique references public.progression_curve_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.progression_skill_definitions (
  id uuid primary key,
  skill_key text not null unique check (skill_key in ('farming','cooking','crafting','foraging','fishing','animal_care','social','exploration')),
  display_name text not null check (char_length(display_name) between 3 and 40 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 12 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  icon_ref text not null check (icon_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category text not null check (category in ('gathering','production','social','exploration')),
  enabled boolean not null,
  released boolean not null,
  tutorial_visible boolean not null default true,
  display_order integer not null unique check (display_order between 1 and 100),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (released or not enabled)
);

create table public.progression_skill_versions (
  id uuid primary key,
  skill_definition_id uuid not null references public.progression_skill_definitions(id) on delete restrict,
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  curve_version_id uuid not null references public.progression_curve_versions(id) on delete restrict,
  maximum_level integer not null check (maximum_level between 2 and 50),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(skill_definition_id,version_number),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

create table public.progression_active_skill_versions (
  skill_definition_id uuid primary key references public.progression_skill_definitions(id) on delete restrict,
  skill_version_id uuid not null unique references public.progression_skill_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.progression_xp_rule_versions (
  id uuid primary key,
  rule_key text not null check (rule_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  source_event_key text not null check (source_event_key in (
    'soil_prepared','crop_planted','crop_watered','crop_harvested',
    'cooking_job_collected','crafting_job_collected','quest_completed'
  )),
  skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  base_xp integer not null check (base_xp between 0 and 10000),
  per_unit_xp integer not null default 0 check (per_unit_xp between 0 and 10000),
  event_xp_cap integer not null check (event_xp_cap between 1 and 10000),
  daily_warning_threshold integer check (daily_warning_threshold between 1 and 1000000),
  anti_repeat_policy text not null check (anti_repeat_policy in ('unique_source','once_per_crop','once_per_job','once_per_quest')),
  enabled boolean not null default true,
  filter_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(filter_payload)='object' and pg_column_size(filter_payload)<=4096),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(rule_key,version_number),
  check ((source_event_key='quest_completed')=(skill_definition_id is null)),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

create table public.progression_active_xp_rules (
  rule_key text primary key check (rule_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  xp_rule_version_id uuid not null unique references public.progression_xp_rule_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.player_skill_progress (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  skill_definition_id uuid not null references public.progression_skill_definitions(id) on delete restrict,
  skill_version_id uuid not null references public.progression_skill_versions(id) on delete restrict,
  total_xp bigint not null default 0 check (total_xp between 0 and 9000000000000000),
  current_level integer not null default 1 check (current_level between 1 and 50),
  xp_in_level bigint not null default 0 check (xp_in_level between 0 and 9000000000000000),
  xp_for_next_level bigint check (xp_for_next_level between 1 and 9000000000000000),
  progression_revision integer not null default 1 check (progression_revision>0),
  last_xp_event_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(player_profile_id,skill_definition_id)
);

create table public.player_level_progress (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  curve_version_id uuid not null references public.progression_curve_versions(id) on delete restrict,
  total_xp bigint not null default 0 check (total_xp between 0 and 9000000000000000),
  skill_contribution_xp bigint not null default 0 check (skill_contribution_xp between 0 and 9000000000000000),
  milestone_xp bigint not null default 0 check (milestone_xp between 0 and 9000000000000000),
  current_level integer not null default 1 check (current_level between 1 and 50),
  xp_in_level bigint not null default 0 check (xp_in_level between 0 and 9000000000000000),
  xp_for_next_level bigint check (xp_for_next_level between 1 and 9000000000000000),
  progression_revision integer not null default 1 check (progression_revision>0),
  last_xp_event_at timestamptz,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_xp=skill_contribution_xp+milestone_xp)
);

create table public.progression_xp_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  xp_rule_version_id uuid references public.progression_xp_rule_versions(id) on delete restrict,
  xp_delta integer not null check (xp_delta between -10000 and 10000 and xp_delta<>0),
  player_xp_delta integer not null check (player_xp_delta between -10000 and 10000),
  previous_total_xp bigint not null check (previous_total_xp between 0 and 9000000000000000),
  resulting_total_xp bigint not null check (resulting_total_xp between 0 and 9000000000000000),
  previous_level integer not null check (previous_level between 1 and 50),
  resulting_level integer not null check (resulting_level between 1 and 50),
  source_event_key text not null check (source_event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  source_entity_id uuid not null,
  source_table text not null check (source_table in (
    'cozy_private_plot_events','player_quest_instances','progression_corrections'
  )),
  request_id text not null check (char_length(request_id) between 1 and 128),
  idempotency_key text not null check (char_length(idempotency_key) between 16 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'),
  environment text not null default 'normal_gameplay' check (environment in ('normal_gameplay','admin_correction')),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(player_profile_id,source_event_key,source_entity_id,skill_definition_id),
  unique(player_profile_id,idempotency_key),
  check (resulting_total_xp=previous_total_xp+xp_delta)
);

create table public.progression_level_up_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  xp_event_id uuid not null references public.progression_xp_events(id) on delete restrict,
  level_type text not null check (level_type in ('skill','player')),
  skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  previous_level integer not null check (previous_level between 1 and 50),
  reached_level integer not null check (reached_level between 2 and 50 and reached_level>previous_level),
  created_at timestamptz not null default now(),
  unique(player_profile_id,level_type,skill_definition_id,reached_level),
  check ((level_type='skill')=(skill_definition_id is not null))
);

create table public.progression_unlock_definitions (
  id uuid primary key,
  unlock_key text not null unique check (unlock_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 3 and 80 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 8 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  unlock_type text not null check (unlock_type in ('recipe','crop','seed','shop_catalog_entry','quest','achievement','title','badge','cosmetic','area_access','home_upgrade_foundation','feature','inventory_capacity_foundation')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progression_unlock_versions (
  id uuid primary key,
  unlock_definition_id uuid not null references public.progression_unlock_definitions(id) on delete restrict,
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  target_reference_id uuid,
  target_reference_key text check (target_reference_key is null or target_reference_key ~ '^[a-z][a-z0-9]*(?:[-_][a-z0-9]+)*$'),
  required_skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  required_skill_level integer check (required_skill_level between 1 and 50),
  required_player_level integer check (required_player_level between 1 and 50),
  required_quest_definition_id uuid references public.cozy_quest_definitions(id) on delete restrict,
  required_achievement_definition_id uuid,
  required_previous_unlock_definition_id uuid references public.progression_unlock_definitions(id) on delete restrict,
  visible_before_unlock boolean not null default true,
  notify_on_grant boolean not null default true,
  grandfather_policy text not null default 'permanent' check (grandfather_policy in ('permanent','manual_review_only')),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(unlock_definition_id,version_number),
  check ((required_skill_definition_id is null)=(required_skill_level is null)),
  check (target_reference_id is not null or target_reference_key is not null),
  check (required_previous_unlock_definition_id is distinct from unlock_definition_id),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

create table public.progression_active_unlock_versions (
  unlock_definition_id uuid primary key references public.progression_unlock_definitions(id) on delete restrict,
  unlock_version_id uuid not null unique references public.progression_unlock_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.player_progression_unlocks (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  unlock_definition_id uuid not null references public.progression_unlock_definitions(id) on delete restrict,
  unlock_version_id uuid not null references public.progression_unlock_versions(id) on delete restrict,
  source_type text not null check (source_type in ('skill_level','player_level','quest_completion','achievement_completion','tutorial_completion','admin_grant_foundation','reconciliation')),
  source_reference_id uuid not null,
  granted_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  primary key(player_profile_id,unlock_definition_id)
);

create table public.progression_quest_chains (
  id uuid primary key,
  chain_key text not null unique check (chain_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  public_name text not null check (char_length(public_name) between 3 and 80 and public_name=btrim(public_name) and public_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 12 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progression_quest_chain_versions (
  id uuid primary key,
  quest_chain_id uuid not null references public.progression_quest_chains(id) on delete restrict,
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  reward_summary text not null check (char_length(reward_summary) between 3 and 280 and reward_summary=btrim(reward_summary) and reward_summary !~ '[[:cntrl:]<>]'),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(quest_chain_id,version_number),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

create table public.progression_active_quest_chain_versions (
  quest_chain_id uuid primary key references public.progression_quest_chains(id) on delete restrict,
  quest_chain_version_id uuid not null unique references public.progression_quest_chain_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.progression_quest_chain_entries (
  quest_chain_version_id uuid not null references public.progression_quest_chain_versions(id) on delete restrict,
  quest_definition_id uuid not null references public.cozy_quest_definitions(id) on delete restrict,
  sequence_number integer not null check (sequence_number between 1 and 32),
  prerequisite_quest_definition_id uuid references public.cozy_quest_definitions(id) on delete restrict,
  required_player_level integer check (required_player_level between 1 and 50),
  required_skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  required_skill_level integer check (required_skill_level between 1 and 50),
  required_unlock_definition_id uuid references public.progression_unlock_definitions(id) on delete restrict,
  required_achievement_definition_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  primary key(quest_chain_version_id,quest_definition_id),
  unique(quest_chain_version_id,sequence_number),
  check ((required_skill_definition_id is null)=(required_skill_level is null)),
  check (prerequisite_quest_definition_id is distinct from quest_definition_id)
);

alter table public.cozy_quest_versions
  drop constraint cozy_quest_versions_kind_payload_check,
  drop constraint cozy_quest_versions_quest_kind_check,
  drop constraint cozy_quest_versions_lifecycle_status_check,
  add column configuration_revision integer not null default 1 check (configuration_revision>0),
  add column safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  add constraint cozy_quest_versions_lifecycle_status_check check (lifecycle_status in ('draft','validated','active','published','superseded','retired','archived')),
  add constraint cozy_quest_versions_quest_kind_check check (quest_kind in ('farming_tutorial','workstation_tutorial','shop_tutorial','progression_chapter')),
  add constraint cozy_quest_versions_kind_payload_check check (
    (quest_kind='farming_tutorial'
      and starter_seed_quantity is not null and delivery_quantity is not null
      and starter_hoe_item_definition_id is not null and starter_watering_can_item_definition_id is not null
      and starter_seed_item_definition_id is not null and delivery_item_definition_id is not null
      and required_quest_definition_id is null and tutorial_cooking_recipe_definition_id is null
      and tutorial_crafting_recipe_definition_id is null
      and required_purchase_item_definition_id is null and required_sale_item_definition_id is null
      and tutorial_shop_definition_id is null)
    or (quest_kind='workstation_tutorial'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null and delivery_item_definition_id is null
      and required_quest_definition_id is not null and tutorial_cooking_recipe_definition_id is not null
      and tutorial_crafting_recipe_definition_id is not null
      and required_purchase_item_definition_id is null and required_sale_item_definition_id is null
      and tutorial_shop_definition_id is null)
    or (quest_kind='shop_tutorial'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null and delivery_item_definition_id is null
      and required_quest_definition_id is not null and tutorial_cooking_recipe_definition_id is null
      and tutorial_crafting_recipe_definition_id is null
      and required_purchase_item_definition_id is not null and required_sale_item_definition_id is not null
      and tutorial_shop_definition_id is not null)
    or (quest_kind='progression_chapter'
      and starter_seed_quantity is null and delivery_quantity is null
      and starter_hoe_item_definition_id is null and starter_watering_can_item_definition_id is null
      and starter_seed_item_definition_id is null and delivery_item_definition_id is null
      and tutorial_cooking_recipe_definition_id is null and tutorial_crafting_recipe_definition_id is null
      and required_purchase_item_definition_id is null and required_sale_item_definition_id is null
      and tutorial_shop_definition_id is null)
  );

alter table public.cozy_quest_objectives
  drop constraint cozy_quest_objectives_objective_key_check,
  drop constraint cozy_quest_objectives_quest_version_id_objective_key_key,
  add column target_reference_id uuid,
  add column target_reference_key text check (target_reference_key is null or char_length(target_reference_key) between 1 and 120),
  add column safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  add constraint cozy_quest_objectives_objective_key_check check (objective_key in (
    'meet_guide','receive_starter_kit','enter_home_plot','prepare_soil','plant_crops','water_crops',
    'harvest_crop','deliver_produce','receive_reward','speak_with_guide','unlock_cooking_recipe',
    'collect_cooked_item','unlock_crafting_recipe','collect_crafted_item','return_to_guide',
    'interact_with_shopkeeper','open_shop','buy_catalog_item','sell_catalog_item',
    'inspect_shop_receipt','return_to_shopkeeper','reach_player_level','reach_skill_level',
    'earn_skill_xp','collect_cooking_recipe','collect_crafting_recipe','buy_shop_item',
    'sell_shop_item','earn_dust_from_shop_sales','own_unlock','complete_achievement',
    'interact_with_npc','visit_world','complete_quest'
  ));

alter table public.player_quest_instances
  add column chain_version_id uuid references public.progression_quest_chain_versions(id) on delete restrict,
  add column tracked boolean not null default false,
  add column completion_event_id uuid,
  add column reward_state text not null default 'settled' check (reward_state in ('not_ready','pending','settled','blocked'));

alter table public.player_quest_instances drop constraint player_quest_completion_check;
alter table public.player_quest_instances add constraint player_quest_completion_check check (
  (status='active' and completed_at is null and reward_settled_at is null
    and reward_ledger_entry_id is null and completion_event_id is null)
  or (status='reward_claimed' and completed_at is not null and reward_settled_at is not null
    and (reward_ledger_entry_id is not null or completion_event_id is not null))
  or status='archived'
);

create unique index player_quest_one_tracked_idx on public.player_quest_instances(player_profile_id) where tracked and status='active';

create table public.progression_achievement_definitions (
  id uuid primary key,
  achievement_key text not null unique check (achievement_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 3 and 80 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 8 and 280 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  category text not null check (category in ('farming','cooking','crafting','economy','home','progression')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progression_achievement_versions (
  id uuid primary key,
  achievement_definition_id uuid not null references public.progression_achievement_definitions(id) on delete restrict,
  version_number integer not null check (version_number between 1 and 10000),
  lifecycle_status text not null check (lifecycle_status in ('draft','validated','active','superseded','archived')),
  criteria_type text not null check (criteria_type in ('trusted_event_count','cumulative_quantity','skill_level','player_level','quest_completed','dust_earned','unique_recipe','unique_crop')),
  source_event_key text,
  target_value bigint not null check (target_value between 1 and 1000000000),
  target_reference_id uuid,
  target_reference_key text,
  hidden boolean not null default false,
  progress_visible boolean not null default true,
  repeatable boolean not null default false check (not repeatable),
  icon_ref text not null check (icon_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  configuration_revision integer not null default 1 check (configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  created_by uuid references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(achievement_definition_id,version_number),
  check ((lifecycle_status='active' and activated_at is not null) or lifecycle_status<>'active')
);

alter table public.progression_unlock_versions
  add constraint progression_unlock_versions_achievement_fk foreign key(required_achievement_definition_id)
    references public.progression_achievement_definitions(id) on delete restrict;
alter table public.progression_quest_chain_entries
  add constraint progression_quest_chain_entries_achievement_fk foreign key(required_achievement_definition_id)
    references public.progression_achievement_definitions(id) on delete restrict;

create table public.progression_active_achievement_versions (
  achievement_definition_id uuid primary key references public.progression_achievement_definitions(id) on delete restrict,
  achievement_version_id uuid not null unique references public.progression_achievement_versions(id) on delete restrict,
  activated_at timestamptz not null default now()
);

create table public.player_achievement_progress (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  achievement_definition_id uuid not null references public.progression_achievement_definitions(id) on delete restrict,
  achievement_version_id uuid not null references public.progression_achievement_versions(id) on delete restrict,
  current_progress bigint not null default 0 check (current_progress between 0 and 1000000000),
  target_value bigint not null check (target_value between 1 and 1000000000),
  status text not null default 'in_progress' check (status in ('locked','in_progress','completed','rewarded')),
  completed_at timestamptz,
  rewarded_at timestamptz,
  reward_settlement_reference uuid,
  progression_revision integer not null default 1 check (progression_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(player_profile_id,achievement_definition_id),
  check ((status in ('completed','rewarded'))=(completed_at is not null)),
  check ((status='rewarded')=(rewarded_at is not null))
);

create table public.player_achievement_event_contributions (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  achievement_definition_id uuid not null references public.progression_achievement_definitions(id) on delete restrict,
  source_event_key text not null check (source_event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  source_entity_id uuid not null,
  progress_delta bigint not null check (progress_delta between 1 and 1000000000),
  created_at timestamptz not null default now(),
  primary key(player_profile_id,achievement_definition_id,source_event_key,source_entity_id)
);

create table public.progression_titles (
  id uuid primary key,
  title_key text not null unique check (title_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 40 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 8 and 200 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  source_category text not null check (source_category in ('quest','achievement','progression','event_foundation')),
  rarity text not null check (rarity in ('common','uncommon','rare')),
  enabled boolean not null default true,
  visible boolean not null default true,
  configuration_revision integer not null default 1 check (configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_progression_titles (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  title_id uuid not null references public.progression_titles(id) on delete restrict,
  source_type text not null check (source_type in ('quest','achievement','unlock','admin_grant_foundation')),
  source_reference_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key(player_profile_id,title_id)
);

create table public.progression_badges (
  id uuid primary key,
  badge_key text not null unique check (badge_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  display_name text not null check (char_length(display_name) between 2 and 40 and display_name=btrim(display_name) and display_name !~ '[[:cntrl:]<>]'),
  description text not null check (char_length(description) between 8 and 200 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  icon_ref text not null check (icon_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  enabled boolean not null default true,
  visible boolean not null default true,
  configuration_revision integer not null default 1 check (configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_progression_badges (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  badge_id uuid not null references public.progression_badges(id) on delete restrict,
  source_type text not null check (source_type in ('quest','achievement','unlock','admin_grant_foundation')),
  source_reference_id uuid not null,
  granted_at timestamptz not null default now(),
  primary key(player_profile_id,badge_id)
);

create table public.player_progression_preferences (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  equipped_title_id uuid references public.progression_titles(id) on delete restrict,
  selected_badge_id uuid references public.progression_badges(id) on delete restrict,
  progression_revision integer not null default 1 check (progression_revision>0),
  updated_at timestamptz not null default now()
);

create table public.progression_reward_definitions (
  id uuid primary key,
  source_type text not null check (source_type in ('quest','achievement')),
  source_version_id uuid not null,
  reward_type text not null check (reward_type in ('dust','item','unlock','title','badge','cosmetic_foundation')),
  target_reference_id uuid,
  amount bigint not null default 1 check (amount between 1 and 10000),
  display_label text not null check (char_length(display_label) between 2 and 100 and display_label=btrim(display_label) and display_label !~ '[[:cntrl:]<>]'),
  enabled boolean not null default true,
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(source_type,source_version_id,reward_type,target_reference_id)
);

create table public.player_progression_rewards (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  reward_definition_id uuid not null references public.progression_reward_definitions(id) on delete restrict,
  source_completion_id uuid not null,
  status text not null default 'pending' check (status in ('pending','settling','settled','blocked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  settlement_reference_id uuid,
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  next_attempt_at timestamptz,
  progression_revision integer not null default 1 check (progression_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique(player_profile_id,reward_definition_id,source_completion_id),
  check ((status='settled')=(settled_at is not null)),
  check ((status in ('pending','settling')) or failure_code is not null or status='settled')
);

create table public.progression_owner_events (
  event_number bigint generated always as identity primary key,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  event_key text not null check (event_key in (
    'skill_xp_gained','skill_level_up','player_level_up','unlock_granted','quest_progressed',
    'quest_completed','achievement_progressed','achievement_completed','title_granted',
    'badge_granted','reward_pending','reward_settled','progression_corrected'
  )),
  related_entity_id uuid,
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload)='object' and pg_column_size(safe_payload)<=4096),
  created_at timestamptz not null default now()
);

create table public.progression_live_ops (
  singleton_key boolean primary key default true check (singleton_key),
  xp_grants_enabled boolean not null default true,
  farming_xp_enabled boolean not null default true,
  cooking_xp_enabled boolean not null default true,
  crafting_xp_enabled boolean not null default true,
  level_rewards_enabled boolean not null default true,
  quest_rewards_enabled boolean not null default true,
  achievement_rewards_enabled boolean not null default true,
  unlock_grants_enabled boolean not null default true,
  multiplier numeric(4,2) not null default 1 check (multiplier between 0.5 and 2),
  multiplier_starts_at timestamptz,
  multiplier_ends_at timestamptz,
  configuration_revision integer not null default 1 check (configuration_revision>0),
  maintenance_message text not null default 'Progression is temporarily paused. Earned history remains available.' check (char_length(maintenance_message) between 3 and 280 and maintenance_message=btrim(maintenance_message) and maintenance_message !~ '[[:cntrl:]<>]'),
  updated_at timestamptz not null default now(),
  check ((multiplier_starts_at is null and multiplier_ends_at is null and multiplier=1)
    or (multiplier_starts_at is not null and multiplier_ends_at is not null and multiplier_ends_at>multiplier_starts_at))
);

insert into public.progression_live_ops(singleton_key) values(true);

create table public.progression_corrections (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  skill_definition_id uuid references public.progression_skill_definitions(id) on delete restrict,
  requested_delta integer not null check (requested_delta between -10000 and 10000 and requested_delta<>0),
  status text not null default 'requested' check (status in ('requested','previewed','applied','rejected')),
  expected_progression_revision integer not null check (expected_progression_revision>0),
  reason text not null check (char_length(reason) between 20 and 1000 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  requested_by uuid not null references auth.users(id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  impact_preview jsonb not null default '{}'::jsonb check (jsonb_typeof(impact_preview)='object' and pg_column_size(impact_preview)<=8192),
  applied_event_id uuid references public.progression_xp_events(id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create table public.progression_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.player_profiles(id) on delete restrict,
  reconciliation_type text not null check (reconciliation_type in ('full_player','skill_totals','levels','unlocks','quests','achievements','titles','pending_rewards','velocity')),
  status text not null default 'pending' check (status in ('pending','processing','resolved','investigation','failed')),
  priority integer not null default 50 check (priority between 1 and 100),
  attempt_count integer not null default 0 check (attempt_count between 0 and 1000),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  finding_code text check (finding_code is null or finding_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=8192),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.progression_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  action text not null check (action in ('successor_created','curve_validated','curve_activated','version_validated','version_activated','rule_updated','unlock_updated','quest_chain_updated','achievement_updated','title_updated','presentation_updated','live_ops_updated','correction_requested','correction_applied','reconciliation_requested','reward_retried')),
  target_type text not null check (target_type in ('skill','curve','xp_rule','unlock','quest_chain','achievement','title','badge','live_ops','player','reward')),
  target_id uuid,
  reason text not null check (char_length(reason) between 12 and 1000 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  previous_value jsonb not null default '{}'::jsonb check (jsonb_typeof(previous_value)='object' and pg_column_size(previous_value)<=8192),
  new_value jsonb not null default '{}'::jsonb check (jsonb_typeof(new_value)='object' and pg_column_size(new_value)<=8192),
  request_id text not null check (char_length(request_id) between 1 and 128),
  created_at timestamptz not null default now()
);

create index progression_xp_events_player_created_idx on public.progression_xp_events(player_profile_id,created_at desc,id desc);
create unique index progression_xp_events_source_exact_once_idx
  on public.progression_xp_events(player_profile_id,source_event_key,source_entity_id,coalesce(skill_definition_id,'00000000-0000-0000-0000-000000000000'::uuid));
create index progression_owner_events_player_number_idx on public.progression_owner_events(player_profile_id,event_number);
create index progression_rewards_pending_idx on public.player_progression_rewards(status,next_attempt_at,created_at) where status in ('pending','blocked');
create index progression_reconciliation_pending_idx on public.progression_reconciliation_queue(status,priority desc,available_at,created_at);
create index player_achievement_status_idx on public.player_achievement_progress(player_profile_id,status,updated_at desc);

-- Seed explicit, reviewable cumulative XP thresholds. Level one begins at 0.
insert into public.progression_curve_versions(
  id,curve_key,version_number,curve_kind,lifecycle_status,public_name,maximum_level,
  effective_at,activated_at,reason,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000001','starter-skill-curve',1,'skill','active','Starter Skill Curve',20,now(),now(),'Phase 11D bounded starter skill curve.','{"simulationRequiredForSuccessor":true}'::jsonb),
  ('d1100000-0000-4000-8000-000000000002','starter-player-curve',1,'player','active','Starter Player Curve',20,now(),now(),'Phase 11D bounded hybrid Player Level curve.','{"model":"hybrid","skillContributionRatio":0.5}'::jsonb);

with threshold(level,cumulative_xp) as (values
  (1,0::bigint),(2,40),(3,100),(4,180),(5,280),(6,400),(7,550),(8,730),(9,940),(10,1180),
  (11,1450),(12,1750),(13,2080),(14,2440),(15,2830),(16,3250),(17,3700),(18,4180),(19,4690),(20,5230)
)
insert into public.progression_curve_thresholds(curve_version_id,level,cumulative_xp)
select 'd1100000-0000-4000-8000-000000000001',level,cumulative_xp from threshold;

with threshold(level,cumulative_xp) as (values
  (1,0::bigint),(2,80),(3,190),(4,330),(5,500),(6,700),(7,930),(8,1190),(9,1480),(10,1800),
  (11,2150),(12,2530),(13,2940),(14,3380),(15,3850),(16,4350),(17,4880),(18,5440),(19,6030),(20,6650)
)
insert into public.progression_curve_thresholds(curve_version_id,level,cumulative_xp)
select 'd1100000-0000-4000-8000-000000000002',level,cumulative_xp from threshold;

insert into public.progression_active_curve_versions(curve_key,curve_version_id) values
  ('starter-skill-curve','d1100000-0000-4000-8000-000000000001'),
  ('starter-player-curve','d1100000-0000-4000-8000-000000000002');

insert into public.progression_skill_definitions(
  id,skill_key,display_name,description,icon_ref,category,enabled,released,tutorial_visible,display_order,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000010','farming','Farming','Prepare soil, tend crops, and harvest produce across your private home plot.','skill-farming','gathering',true,true,true,1,'{}'),
  ('d1100000-0000-4000-8000-000000000011','cooking','Cooking','Turn trusted ingredients into collected meals at the Cooking Hearth.','skill-cooking','production',true,true,true,2,'{}'),
  ('d1100000-0000-4000-8000-000000000012','crafting','Crafting','Create useful materials and furnishings at the Crafting Workbench.','skill-crafting','production',true,true,true,3,'{}'),
  ('d1100000-0000-4000-8000-000000000013','foraging','Foraging','A future skill for gathering safe wild materials.','skill-foraging','gathering',false,false,false,4,'{"release":"future"}'),
  ('d1100000-0000-4000-8000-000000000014','fishing','Fishing','A future skill for peaceful fishing activities.','skill-fishing','gathering',false,false,false,5,'{"release":"future"}'),
  ('d1100000-0000-4000-8000-000000000015','animal_care','Animal Care','A future skill for caring for cozy farm animals.','skill-animal-care','gathering',false,false,false,6,'{"release":"future"}'),
  ('d1100000-0000-4000-8000-000000000016','social','Social','A future skill foundation for meaningful social play.','skill-social','social',false,false,false,7,'{"release":"future"}'),
  ('d1100000-0000-4000-8000-000000000017','exploration','Exploration','A future skill foundation for discovering Starville.','skill-exploration','exploration',false,false,false,8,'{"release":"future"}');

insert into public.progression_skill_versions(
  id,skill_definition_id,version_number,lifecycle_status,curve_version_id,maximum_level,
  effective_at,activated_at,reason,safe_metadata
)
select ('d1100000-0000-4000-8000-'||lpad((100+row_number() over(order by display_order))::text,12,'0'))::uuid,
  id,1,'active','d1100000-0000-4000-8000-000000000001',20,now(),now(),
  'Phase 11D initial versioned skill policy.',
  jsonb_build_object('released',released)
from public.progression_skill_definitions;

insert into public.progression_active_skill_versions(skill_definition_id,skill_version_id)
select skill_definition_id,id from public.progression_skill_versions where lifecycle_status='active';

with rules(id,rule_key,source_event_key,skill_key,base_xp,per_unit_xp,event_cap,daily_warning,anti_repeat) as (values
  ('d1100000-0000-4000-8000-000000000201'::uuid,'farming-soil-prepared','soil_prepared','farming',2,0,2,120,'unique_source'),
  ('d1100000-0000-4000-8000-000000000202','farming-crop-planted','crop_planted','farming',3,0,3,180,'once_per_crop'),
  ('d1100000-0000-4000-8000-000000000203','farming-crop-watered','crop_watered','farming',1,0,1,80,'once_per_crop'),
  ('d1100000-0000-4000-8000-000000000204','farming-crop-harvested','crop_harvested','farming',6,2,20,500,'once_per_crop'),
  ('d1100000-0000-4000-8000-000000000205','cooking-job-collected','cooking_job_collected','cooking',10,4,40,600,'once_per_job'),
  ('d1100000-0000-4000-8000-000000000206','crafting-job-collected','crafting_job_collected','crafting',8,4,40,600,'once_per_job')
)
insert into public.progression_xp_rule_versions(
  id,rule_key,version_number,lifecycle_status,source_event_key,skill_definition_id,
  base_xp,per_unit_xp,event_xp_cap,daily_warning_threshold,anti_repeat_policy,
  effective_at,activated_at,reason,safe_metadata
)
select rules.id,rules.rule_key,1,'active',rules.source_event_key,skill.id,
  rules.base_xp,rules.per_unit_xp,rules.event_cap,rules.daily_warning,rules.anti_repeat,
  now(),now(),'Phase 11D development-safe trusted XP source.',
  jsonb_build_object('unpublishedTuning',true)
from rules join public.progression_skill_definitions skill on skill.skill_key=rules.skill_key;

insert into public.progression_xp_rule_versions(
  id,rule_key,version_number,lifecycle_status,source_event_key,skill_definition_id,
  base_xp,per_unit_xp,event_xp_cap,daily_warning_threshold,anti_repeat_policy,
  effective_at,activated_at,reason,safe_metadata
) values(
  'd1100000-0000-4000-8000-000000000207','quest-completed',1,'active','quest_completed',null,
  20,0,20,200,'once_per_quest',now(),now(),
  'Phase 11D bounded milestone Player XP source.','{"unpublishedTuning":true}'::jsonb
);

insert into public.progression_active_xp_rules(rule_key,xp_rule_version_id)
select rule_key,id from public.progression_xp_rule_versions where lifecycle_status='active';

-- Extend the canonical DUST and inventory reason registries for bounded one-time progression rewards.
alter table public.player_dust_ledger drop constraint player_dust_ledger_reason_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reason_check check (reason in (
  'starter_grant','shop_purchase','shop_sale','crafting_fee','system_refund',
  'migration_adjustment','cooperative_activity_reward','administrative_correction',
  'starter_farming_quest_reward','starter_workstation_quest_reward','starter_shop_quest_reward',
  'progression_quest_reward','progression_achievement_reward'
));
alter table public.player_dust_ledger drop constraint player_dust_ledger_reference_type_check;
alter table public.player_dust_ledger add constraint player_dust_ledger_reference_type_check check (reference_type in (
  'player_bootstrap','shop_transaction','recipe_action','system_operation','migration',
  'cooperative_activity','starter_farming_quest','crafting_job','starter_workstation_quest',
  'starter_shop_quest','progression_quest','progression_achievement'
));
alter table public.player_inventory_history drop constraint player_inventory_history_reason_check;
alter table public.player_inventory_history add constraint player_inventory_history_reason_check check (reason in (
  'starter_grant','shop_purchase','shop_sale','planting','harvest',
  'cooking','crafting','furniture_placement','furniture_removal',
  'social_gift','social_trade','system_refund','cooperative_activity_reward',
  'tutorial_delivery','cooking_ingredient_consumed','crafting_ingredient_consumed',
  'cooking_output_collected','crafting_output_collected','crafting_refund',
  'crafting_compensation','tutorial_output_delivered','progression_quest_reward',
  'progression_achievement_reward'
));

insert into public.economy_source_versions(
  id,source_key,version_number,lifecycle_status,operation_key,category,label,description,
  minimum_amount,maximum_amount,repeatable,daily_limit,weekly_limit,account_lifetime_limit,
  wallet_daily_limit,cooldown_seconds,beginner_protected,risk_weight,published_at
) values
  ('d1100000-0000-4000-8000-000000000920','progression-quest-reward',1,'published',
    'progression_quest_reward','gameplay_reward','Progression quest reward',
    'A bounded one-time DUST reward tied to an authoritative progression quest completion.',
    1,100,false,6,20,50,6,0,true,2,now()),
  ('d1100000-0000-4000-8000-000000000921','progression-achievement-reward',1,'published',
    'progression_achievement_reward','gameplay_reward','Progression achievement reward',
    'A bounded non-repeatable DUST reward tied to an authoritative achievement completion.',
    1,50,false,10,30,100,10,0,true,3,now());
insert into public.economy_active_source_versions(source_key,source_version_id) values
  ('progression-quest-reward','d1100000-0000-4000-8000-000000000920'),
  ('progression-achievement-reward','d1100000-0000-4000-8000-000000000921');

-- The generic Phase 11D quest chapters reuse the canonical quest tables.
insert into public.cozy_quest_definitions(id,slug) values
  ('d1100000-0000-4000-8000-000000000301','growing-roots'),
  ('d1100000-0000-4000-8000-000000000302','homegrown-help'),
  ('d1100000-0000-4000-8000-000000000303','a-place-in-starville');

insert into public.cozy_quest_versions(
  id,quest_definition_id,version_number,lifecycle_status,name,description,reward_dust,
  active,published_at,quest_kind,required_quest_definition_id,configuration_revision,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000311','d1100000-0000-4000-8000-000000000301',1,'published','Growing Roots','Grow beyond Moonbeans by reaching Farming Level 2 and tending a newly unlocked Sunroot.',10,true,now(),'progression_chapter','c1100000-0000-4000-8000-000000000210',1,'{"chapter":4}'::jsonb),
  ('d1100000-0000-4000-8000-000000000312','d1100000-0000-4000-8000-000000000302',1,'published','Homegrown Help','Cook, craft, and sell useful village goods through authoritative home and shop actions.',15,true,now(),'progression_chapter','d1100000-0000-4000-8000-000000000301',1,'{"chapter":5}'::jsonb),
  ('d1100000-0000-4000-8000-000000000313','d1100000-0000-4000-8000-000000000303',1,'published','A Place in Starville','Reach the first balanced progression milestone and complete Starville Beginnings.',25,true,now(),'progression_chapter','d1100000-0000-4000-8000-000000000302',1,'{"chapter":6}'::jsonb);

insert into public.cozy_quest_objectives(
  id,quest_version_id,objective_key,sequence_number,label,required_count,target_reference_id,target_reference_key,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000321','d1100000-0000-4000-8000-000000000311','reach_skill_level',1,'Reach Farming Level 2',2,'d1100000-0000-4000-8000-000000000010','farming','{}'),
  ('d1100000-0000-4000-8000-000000000322','d1100000-0000-4000-8000-000000000311','harvest_crop',2,'Harvest three crops',3,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000323','d1100000-0000-4000-8000-000000000311','buy_shop_item',3,'Buy one Sunroot Seed',1,'71000000-0000-4000-8000-000000000002','sunroot-seed','{}'),
  ('d1100000-0000-4000-8000-000000000324','d1100000-0000-4000-8000-000000000311','plant_crops',4,'Plant one Sunroot Seed',1,'71000000-0000-4000-8000-000000000002','sunroot-seed','{}'),
  ('d1100000-0000-4000-8000-000000000325','d1100000-0000-4000-8000-000000000311','harvest_crop',5,'Harvest one Sunroot',1,'71000000-0000-4000-8000-000000000005','sunroot','{"specificTarget":true}'),
  ('d1100000-0000-4000-8000-000000000331','d1100000-0000-4000-8000-000000000312','collect_cooking_recipe',1,'Collect one Garden Soup',1,'b1100000-0000-4000-8000-000000000011','garden-soup','{}'),
  ('d1100000-0000-4000-8000-000000000332','d1100000-0000-4000-8000-000000000312','collect_crafting_recipe',2,'Collect one Garden Twine',1,'73000000-0000-4000-8000-000000000005','garden-twine','{}'),
  ('d1100000-0000-4000-8000-000000000333','d1100000-0000-4000-8000-000000000312','sell_shop_item',3,'Sell one Garden Soup',1,'b1100000-0000-4000-8000-000000000001','garden-soup','{}'),
  ('d1100000-0000-4000-8000-000000000334','d1100000-0000-4000-8000-000000000312','earn_dust_from_shop_sales',4,'Earn 10 DUST from shop sales',10,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000335','d1100000-0000-4000-8000-000000000312','interact_with_npc',5,'Return to Willow Guide',1,'a1100000-0000-4000-8000-000000000021','willow-guide','{}'),
  ('d1100000-0000-4000-8000-000000000341','d1100000-0000-4000-8000-000000000313','reach_player_level',1,'Reach Player Level 3',3,null,'player-level','{}'),
  ('d1100000-0000-4000-8000-000000000342','d1100000-0000-4000-8000-000000000313','reach_skill_level',2,'Reach Farming Level 3',3,'d1100000-0000-4000-8000-000000000010','farming','{}'),
  ('d1100000-0000-4000-8000-000000000343','d1100000-0000-4000-8000-000000000313','reach_skill_level',3,'Reach Cooking Level 2',2,'d1100000-0000-4000-8000-000000000011','cooking','{}'),
  ('d1100000-0000-4000-8000-000000000344','d1100000-0000-4000-8000-000000000313','reach_skill_level',4,'Reach Crafting Level 2',2,'d1100000-0000-4000-8000-000000000012','crafting','{}'),
  ('d1100000-0000-4000-8000-000000000345','d1100000-0000-4000-8000-000000000313','complete_quest',5,'Complete Homegrown Help',1,'d1100000-0000-4000-8000-000000000302','homegrown-help','{}');

insert into public.progression_quest_chains(id,chain_key,public_name,description) values(
  'd1100000-0000-4000-8000-000000000350','starville-beginnings','Starville Beginnings','A connected introduction to farming, cooking, crafting, the General Store, and early progression.'
);
insert into public.progression_quest_chain_versions(
  id,quest_chain_id,version_number,lifecycle_status,reward_summary,effective_at,activated_at,reason,safe_metadata
) values(
  'd1100000-0000-4000-8000-000000000351','d1100000-0000-4000-8000-000000000350',1,'active',
  'Bounded DUST, item, title, badge, and content unlock rewards.',now(),now(),
  'Phase 11D initial Starville Beginnings chain.','{"ordered":true}'::jsonb
);
insert into public.progression_active_quest_chain_versions(quest_chain_id,quest_chain_version_id) values(
  'd1100000-0000-4000-8000-000000000350','d1100000-0000-4000-8000-000000000351'
);
insert into public.progression_quest_chain_entries(
  quest_chain_version_id,quest_definition_id,sequence_number,prerequisite_quest_definition_id,
  required_player_level,required_skill_definition_id,required_skill_level,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000351','a1100000-0000-4000-8000-000000000031',1,null,null,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000351','b1100000-0000-4000-8000-000000000201',2,'a1100000-0000-4000-8000-000000000031',null,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000351','c1100000-0000-4000-8000-000000000210',3,'b1100000-0000-4000-8000-000000000201',null,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000351','d1100000-0000-4000-8000-000000000301',4,'c1100000-0000-4000-8000-000000000210',null,'d1100000-0000-4000-8000-000000000010',2,'{}'),
  ('d1100000-0000-4000-8000-000000000351','d1100000-0000-4000-8000-000000000302',5,'d1100000-0000-4000-8000-000000000301',2,null,null,'{}'),
  ('d1100000-0000-4000-8000-000000000351','d1100000-0000-4000-8000-000000000303',6,'d1100000-0000-4000-8000-000000000302',3,null,null,'{}');

-- Bounded initial achievements and presentation rewards use existing authoritative events.
with achievement(id,key,name,description,category,criteria,event_key,target,ref_id,ref_key,hidden,icon) as (values
  ('d1100000-0000-4000-8000-000000000401'::uuid,'first-harvest','First Harvest','Harvest your first mature crop.','farming','trusted_event_count','crop_harvested',1::bigint,null::uuid,null::text,false,'achievement-first-harvest'),
  ('d1100000-0000-4000-8000-000000000402','growing-gardener','Growing Gardener','Harvest ten crops through trusted home-plot actions.','farming','cumulative_quantity','crop_harvested',10,null,null,false,'achievement-growing-gardener'),
  ('d1100000-0000-4000-8000-000000000403','first-meal','First Meal','Collect your first completed cooking job.','cooking','trusted_event_count','cooking_job_collected',1,null,null,false,'achievement-first-meal'),
  ('d1100000-0000-4000-8000-000000000404','hearth-helper','Hearth Helper','Collect five cooked outputs.','cooking','cumulative_quantity','cooking_job_collected',5,null,null,false,'achievement-hearth-helper'),
  ('d1100000-0000-4000-8000-000000000405','first-craft','First Craft','Collect your first completed crafting job.','crafting','trusted_event_count','crafting_job_collected',1,null,null,false,'achievement-first-craft'),
  ('d1100000-0000-4000-8000-000000000406','handy-helper','Handy Helper','Collect five crafted outputs.','crafting','cumulative_quantity','crafting_job_collected',5,null,null,false,'achievement-handy-helper'),
  ('d1100000-0000-4000-8000-000000000407','first-purchase','First Purchase','Complete your first General Store purchase.','economy','trusted_event_count','shop_purchase_completed',1,null,null,false,'achievement-first-purchase'),
  ('d1100000-0000-4000-8000-000000000408','first-sale','First Sale','Complete your first General Store sale.','economy','trusted_event_count','shop_sale_completed',1,null,null,false,'achievement-first-sale'),
  ('d1100000-0000-4000-8000-000000000409','dust-earner','DUST Earner','Earn 25 DUST through bounded General Store sales.','economy','dust_earned','shop_sale_completed',25,null,null,false,'achievement-dust-earner'),
  ('d1100000-0000-4000-8000-000000000410','home-sweet-home','Home Sweet Home','Enter your personal home plot.','home','trusted_event_count','plot_entered',1,null,null,false,'achievement-home-sweet-home'),
  ('d1100000-0000-4000-8000-000000000411','starville-beginner','Starville Beginner','Complete the first Starville progression chapter.','progression','quest_completed','quest_completed',1,'d1100000-0000-4000-8000-000000000303','a-place-in-starville',true,'achievement-starville-beginner')
)
insert into public.progression_achievement_definitions(id,achievement_key,display_name,description,category)
select id,key,name,description,category from achievement;

with achievement(id,key,criteria,event_key,target,ref_id,ref_key,hidden,icon) as (values
  ('d1100000-0000-4000-8000-000000000501'::uuid,'first-harvest','trusted_event_count','crop_harvested',1::bigint,null::uuid,null::text,false,'achievement-first-harvest'),
  ('d1100000-0000-4000-8000-000000000502','growing-gardener','cumulative_quantity','crop_harvested',10,null,null,false,'achievement-growing-gardener'),
  ('d1100000-0000-4000-8000-000000000503','first-meal','trusted_event_count','cooking_job_collected',1,null,null,false,'achievement-first-meal'),
  ('d1100000-0000-4000-8000-000000000504','hearth-helper','cumulative_quantity','cooking_job_collected',5,null,null,false,'achievement-hearth-helper'),
  ('d1100000-0000-4000-8000-000000000505','first-craft','trusted_event_count','crafting_job_collected',1,null,null,false,'achievement-first-craft'),
  ('d1100000-0000-4000-8000-000000000506','handy-helper','cumulative_quantity','crafting_job_collected',5,null,null,false,'achievement-handy-helper'),
  ('d1100000-0000-4000-8000-000000000507','first-purchase','trusted_event_count','shop_purchase_completed',1,null,null,false,'achievement-first-purchase'),
  ('d1100000-0000-4000-8000-000000000508','first-sale','trusted_event_count','shop_sale_completed',1,null,null,false,'achievement-first-sale'),
  ('d1100000-0000-4000-8000-000000000509','dust-earner','dust_earned','shop_sale_completed',25,null,null,false,'achievement-dust-earner'),
  ('d1100000-0000-4000-8000-000000000510','home-sweet-home','trusted_event_count','plot_entered',1,null,null,false,'achievement-home-sweet-home'),
  ('d1100000-0000-4000-8000-000000000511','starville-beginner','quest_completed','quest_completed',1,'d1100000-0000-4000-8000-000000000303','a-place-in-starville',true,'achievement-starville-beginner')
)
insert into public.progression_achievement_versions(
  id,achievement_definition_id,version_number,lifecycle_status,criteria_type,source_event_key,
  target_value,target_reference_id,target_reference_key,hidden,progress_visible,icon_ref,
  effective_at,activated_at,reason,safe_metadata
)
select achievement.id,definition.id,1,'active',achievement.criteria,achievement.event_key,
  achievement.target,achievement.ref_id,achievement.ref_key,achievement.hidden,not achievement.hidden,
  achievement.icon,now(),now(),'Phase 11D bounded non-repeatable achievement.',
  jsonb_build_object('authoritativeOnly',true)
from achievement join public.progression_achievement_definitions definition on definition.achievement_key=achievement.key;

insert into public.progression_active_achievement_versions(achievement_definition_id,achievement_version_id)
select achievement_definition_id,id from public.progression_achievement_versions where lifecycle_status='active';

insert into public.progression_titles(id,title_key,display_name,description,source_category,rarity) values
  ('d1100000-0000-4000-8000-000000000601','new-neighbor','New Neighbor','A warm title for beginning life in Starville.','progression','common'),
  ('d1100000-0000-4000-8000-000000000602','rooted-neighbor','Rooted Neighbor','Earned by growing beyond the first Moonbean harvest.','quest','uncommon'),
  ('d1100000-0000-4000-8000-000000000603','hearth-helper','Hearth Helper','Earned by helping at the Cooking Hearth.','achievement','uncommon'),
  ('d1100000-0000-4000-8000-000000000604','starville-beginner','Starville Beginner','Marks completion of the Starville Beginnings chapter.','quest','rare');

insert into public.progression_badges(id,badge_key,display_name,description,icon_ref) values
  ('d1100000-0000-4000-8000-000000000611','village-helper','Village Helper','A profile badge for contributing cooked and crafted goods.','badge-village-helper'),
  ('d1100000-0000-4000-8000-000000000612','beginnings-complete','Beginnings Complete','A profile badge for completing the first progression chapter.','badge-beginnings-complete');

-- Unlock definitions reference existing content and use simple AND requirements.
with unlock(id,key,name,description,type,target_id,target_key,skill_key,skill_level,player_level,quest_id,visible,notify,metadata) as (values
  ('d1100000-0000-4000-8000-000000000701'::uuid,'sunroot-crop','Sunroot Growing','Plant and harvest Sunroot on your home plot.','crop','71000000-0000-4000-8000-000000000002'::uuid,'sunroot','farming',2,null::integer,'c1100000-0000-4000-8000-000000000210'::uuid,true,true,'{}'::jsonb),
  ('d1100000-0000-4000-8000-000000000702','sunroot-seed-shop','Sunroot Seeds','Purchase Sunroot Seeds from the General Store.','shop_catalog_entry','71000000-0000-4000-8000-000000000002','sunroot-seed','farming',2,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000703','cloudberry-crop','Cloudberry Growing','Plant and harvest Cloudberries on your home plot.','crop','71000000-0000-4000-8000-000000000003','cloudberry','farming',3,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000704','cloudberry-seed-shop','Cloudberry Seeds','Purchase Cloudberry Seeds from the General Store.','shop_catalog_entry','71000000-0000-4000-8000-000000000003','cloudberry-seed','farming',3,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000705','moonbean-salad-recipe','Moonbean Salad','Prepare Moonbean Salad at the Cooking Hearth.','recipe','73000000-0000-4000-8000-000000000001','moonbean-salad','cooking',2,null,'b1100000-0000-4000-8000-000000000201',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000706','sunroot-soup-recipe','Sunroot Soup','Prepare Sunroot Soup at the Cooking Hearth.','recipe','73000000-0000-4000-8000-000000000002','sunroot-soup','cooking',4,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000707','willow-chair-recipe','Willow Chair','Craft a Willow Chair at the Crafting Workbench.','recipe','73000000-0000-4000-8000-000000000006','willow-chair','crafting',3,null,'b1100000-0000-4000-8000-000000000201',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000708','growing-roots-quest','Growing Roots','Begin the fourth Starville Beginnings quest.','quest','d1100000-0000-4000-8000-000000000301','growing-roots','farming',2,null,'c1100000-0000-4000-8000-000000000210',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000709','moonpetal-north-route-foundation','Moonpetal North Route','Future server-authorized area access foundation.','area_access',null,'moonpetal-north-route',null,null,4,null,false,true,'{"foundationOnly":true,"routeRemainsClosed":true}')
)
insert into public.progression_unlock_definitions(id,unlock_key,display_name,description,unlock_type,enabled)
select id,key,name,description,type,type<>'area_access' from unlock;

with unlock(id,key,target_id,target_key,skill_key,skill_level,player_level,quest_id,visible,notify,metadata) as (values
  ('d1100000-0000-4000-8000-000000000801'::uuid,'sunroot-crop','71000000-0000-4000-8000-000000000002'::uuid,'sunroot','farming',2,null::integer,'c1100000-0000-4000-8000-000000000210'::uuid,true,true,'{}'::jsonb),
  ('d1100000-0000-4000-8000-000000000802','sunroot-seed-shop','71000000-0000-4000-8000-000000000002','sunroot-seed','farming',2,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000803','cloudberry-crop','71000000-0000-4000-8000-000000000003','cloudberry','farming',3,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000804','cloudberry-seed-shop','71000000-0000-4000-8000-000000000003','cloudberry-seed','farming',3,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000805','moonbean-salad-recipe','73000000-0000-4000-8000-000000000001','moonbean-salad','cooking',2,null,'b1100000-0000-4000-8000-000000000201',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000806','sunroot-soup-recipe','73000000-0000-4000-8000-000000000002','sunroot-soup','cooking',4,null,null,true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000807','willow-chair-recipe','73000000-0000-4000-8000-000000000006','willow-chair','crafting',3,null,'b1100000-0000-4000-8000-000000000201',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000808','growing-roots-quest','d1100000-0000-4000-8000-000000000301','growing-roots','farming',2,null,'c1100000-0000-4000-8000-000000000210',true,true,'{}'),
  ('d1100000-0000-4000-8000-000000000809','moonpetal-north-route-foundation',null,'moonpetal-north-route',null,null,4,null,false,true,'{"foundationOnly":true,"routeRemainsClosed":true}')
)
insert into public.progression_unlock_versions(
  id,unlock_definition_id,version_number,lifecycle_status,target_reference_id,target_reference_key,
  required_skill_definition_id,required_skill_level,required_player_level,required_quest_definition_id,
  visible_before_unlock,notify_on_grant,effective_at,activated_at,reason,safe_metadata
)
select unlock.id,definition.id,1,'active',unlock.target_id,unlock.target_key,
  skill.id,unlock.skill_level,unlock.player_level,unlock.quest_id,
  unlock.visible,unlock.notify,now(),now(),'Phase 11D initial authoritative unlock requirement.',unlock.metadata
from unlock
join public.progression_unlock_definitions definition on definition.unlock_key=unlock.key
left join public.progression_skill_definitions skill on skill.skill_key=unlock.skill_key;

insert into public.progression_active_unlock_versions(unlock_definition_id,unlock_version_id)
select unlock_definition_id,id from public.progression_unlock_versions where lifecycle_status='active';

-- Quest/achievement rewards are definitions first; settlement is handled by the next migration.
insert into public.progression_reward_definitions(
  id,source_type,source_version_id,reward_type,target_reference_id,amount,display_label,safe_metadata
) values
  ('d1100000-0000-4000-8000-000000000901','quest','d1100000-0000-4000-8000-000000000311','dust',null,10,'10 DUST','{}'),
  ('d1100000-0000-4000-8000-000000000902','quest','d1100000-0000-4000-8000-000000000311','title','d1100000-0000-4000-8000-000000000602',1,'Rooted Neighbor title','{}'),
  ('d1100000-0000-4000-8000-000000000903','quest','d1100000-0000-4000-8000-000000000312','dust',null,15,'15 DUST','{}'),
  ('d1100000-0000-4000-8000-000000000904','quest','d1100000-0000-4000-8000-000000000312','item','71000000-0000-4000-8000-000000000008',2,'2 Willow Timber','{}'),
  ('d1100000-0000-4000-8000-000000000905','quest','d1100000-0000-4000-8000-000000000312','badge','d1100000-0000-4000-8000-000000000611',1,'Village Helper badge','{}'),
  ('d1100000-0000-4000-8000-000000000906','quest','d1100000-0000-4000-8000-000000000313','dust',null,25,'25 DUST','{}'),
  ('d1100000-0000-4000-8000-000000000907','quest','d1100000-0000-4000-8000-000000000313','title','d1100000-0000-4000-8000-000000000604',1,'Starville Beginner title','{}'),
  ('d1100000-0000-4000-8000-000000000908','quest','d1100000-0000-4000-8000-000000000313','badge','d1100000-0000-4000-8000-000000000612',1,'Beginnings Complete badge','{}'),
  ('d1100000-0000-4000-8000-000000000909','achievement','d1100000-0000-4000-8000-000000000504','title','d1100000-0000-4000-8000-000000000603',1,'Hearth Helper title','{}');

-- Active configuration and earned history are immutable/append-only.
create or replace function private.protect_progression_version_immutability()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.lifecycle_status in ('active','superseded','archived') then
    raise exception using errcode='55000',message='PROGRESSION_VERSION_IMMUTABLE';
  end if;
  return coalesce(new,old);
end;
$$;

create or replace function private.protect_progression_append_only()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='PROGRESSION_HISTORY_APPEND_ONLY';
end;
$$;

create trigger progression_curves_immutable before update or delete on public.progression_curve_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_skills_immutable before update or delete on public.progression_skill_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_xp_rules_immutable before update or delete on public.progression_xp_rule_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_unlocks_immutable before update or delete on public.progression_unlock_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_chains_immutable before update or delete on public.progression_quest_chain_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_achievements_immutable before update or delete on public.progression_achievement_versions
for each row execute function private.protect_progression_version_immutability();
create trigger progression_xp_history_append_only before update or delete on public.progression_xp_events
for each row execute function private.protect_progression_append_only();
create trigger progression_level_history_append_only before update or delete on public.progression_level_up_events
for each row execute function private.protect_progression_append_only();
create trigger progression_achievement_contributions_append_only before update or delete on public.player_achievement_event_contributions
for each row execute function private.protect_progression_append_only();
create trigger progression_owner_events_append_only before update or delete on public.progression_owner_events
for each row execute function private.protect_progression_append_only();
create trigger progression_admin_audit_append_only before update or delete on public.progression_admin_audit_events
for each row execute function private.protect_progression_append_only();

create trigger progression_skill_definitions_updated before update on public.progression_skill_definitions for each row execute function private.set_updated_at();
create trigger progression_unlock_definitions_updated before update on public.progression_unlock_definitions for each row execute function private.set_updated_at();
create trigger progression_quest_chains_updated before update on public.progression_quest_chains for each row execute function private.set_updated_at();
create trigger progression_achievement_definitions_updated before update on public.progression_achievement_definitions for each row execute function private.set_updated_at();
create trigger progression_titles_updated before update on public.progression_titles for each row execute function private.set_updated_at();
create trigger progression_badges_updated before update on public.progression_badges for each row execute function private.set_updated_at();
create trigger player_progression_preferences_updated before update on public.player_progression_preferences for each row execute function private.set_updated_at();
create trigger player_skill_progress_updated before update on public.player_skill_progress for each row execute function private.set_updated_at();
create trigger player_level_progress_updated before update on public.player_level_progress for each row execute function private.set_updated_at();
create trigger player_achievement_progress_updated before update on public.player_achievement_progress for each row execute function private.set_updated_at();
create trigger player_progression_rewards_updated before update on public.player_progression_rewards for each row execute function private.set_updated_at();
create trigger progression_live_ops_updated before update on public.progression_live_ops for each row execute function private.set_updated_at();
create trigger progression_reconciliation_updated before update on public.progression_reconciliation_queue for each row execute function private.set_updated_at();

-- Fail closed: browser roles receive no direct table privileges; narrow RPCs follow.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'progression_curve_versions','progression_curve_thresholds','progression_active_curve_versions',
    'progression_skill_definitions','progression_skill_versions','progression_active_skill_versions',
    'progression_xp_rule_versions','progression_active_xp_rules','player_skill_progress',
    'player_level_progress','progression_xp_events','progression_level_up_events',
    'progression_unlock_definitions','progression_unlock_versions','progression_active_unlock_versions',
    'player_progression_unlocks','progression_quest_chains','progression_quest_chain_versions',
    'progression_active_quest_chain_versions','progression_quest_chain_entries',
    'progression_achievement_definitions','progression_achievement_versions',
    'progression_active_achievement_versions','player_achievement_progress',
    'player_achievement_event_contributions',
    'progression_titles','player_progression_titles','progression_badges','player_progression_badges','player_progression_preferences',
    'progression_reward_definitions','player_progression_rewards','progression_owner_events',
    'progression_live_ops','progression_corrections','progression_reconciliation_queue',
    'progression_admin_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated,service_role',table_name);
  end loop;
end;
$$;
