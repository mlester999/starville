-- Starville Phase 12A: versioned onboarding coordination, bounded daily rhythm,
-- semantic world guidance, recovery evidence, and fail-closed player state.
-- This layer projects canonical Phase 11 systems; it does not replace quests,
-- inventory, DUST, progression, housing, home visits, or notifications.

insert into public.admin_permissions
  (key,name,description,category,is_sensitive,is_system)
values
  ('player_experience.inspect','Inspect player experience','Inspect onboarding adoption, daily rhythm, guidance readiness, recovery, and aggregate telemetry.','analytics',false,true),
  ('player_experience.support','Support player onboarding','Request evidence-preserving onboarding recovery and retry failed settlement without direct progress editing.','player_support',true,true),
  ('player_experience.policy.manage','Manage player experience policy','Create controlled successor onboarding, daily-objective, and guidance policy versions.','live_operations',true,true),
  ('player_experience.reconciliation.manage','Reconcile player experience','Run bounded onboarding and daily-rhythm reconciliation with preserved history.','live_operations',true,true)
on conflict (key) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  is_sensitive=excluded.is_sensitive,is_system=true;

with mapping(role_key,permission_key) as (values
  ('game_administrator','player_experience.inspect'),
  ('game_administrator','player_experience.support'),
  ('game_administrator','player_experience.policy.manage'),
  ('game_administrator','player_experience.reconciliation.manage'),
  ('live_operations_manager','player_experience.inspect'),
  ('live_operations_manager','player_experience.policy.manage'),
  ('live_operations_manager','player_experience.reconciliation.manage'),
  ('customer_support','player_experience.inspect'),
  ('customer_support','player_experience.support'),
  ('read_only_analyst','player_experience.inspect')
)
insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from mapping
join public.admin_roles role on role.key=mapping.role_key
join public.admin_permissions permission on permission.key=mapping.permission_key
on conflict (role_id,permission_id) do nothing;

insert into public.admin_role_permissions(role_id,permission_id)
select role.id,permission.id from public.admin_roles role cross join public.admin_permissions permission
where role.key='super_admin' and permission.key like 'player_experience.%'
on conflict (role_id,permission_id) do nothing;

create table public.player_experience_onboarding_versions (
  id uuid primary key,
  version_key text not null unique check(version_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  version_number integer not null unique check(version_number between 1 and 10000),
  status text not null check(status in ('draft','validated','active','superseded','archived')),
  starter_quest_chain_key text not null check(starter_quest_chain_key='starville-beginnings'),
  skippable_optional_only boolean not null default true check(skippable_optional_only),
  configuration_revision integer not null default 1 check(configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  reason text not null check(char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check((status='active' and activated_at is not null) or status<>'active')
);

create table public.player_experience_active_onboarding (
  singleton_key boolean primary key default true check(singleton_key),
  onboarding_version_id uuid not null unique references public.player_experience_onboarding_versions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.player_experience_onboarding_steps (
  id uuid primary key,
  onboarding_version_id uuid not null references public.player_experience_onboarding_versions(id) on delete restrict,
  step_key text not null check(step_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  chapter_key text not null check(chapter_key in (
    'welcome','your_home','first_harvest','make_something','general_store',
    'grow_your_starvillian','make_it_home','starville_together','daily_rhythm'
  )),
  sequence_number integer not null check(sequence_number between 1 and 100),
  title text not null check(char_length(title) between 2 and 100 and title=btrim(title) and title !~ '[[:cntrl:]<>]'),
  instruction text not null check(char_length(instruction) between 2 and 240 and instruction=btrim(instruction) and instruction !~ '[[:cntrl:]<>]'),
  authoritative_event_key text not null check(authoritative_event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  required_count integer not null default 1 check(required_count between 1 and 10000),
  optional boolean not null default false,
  semantic_target_key text check(semantic_target_key is null or semantic_target_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'),
  recovery_hint text not null check(char_length(recovery_hint) between 2 and 240 and recovery_hint=btrim(recovery_hint) and recovery_hint !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  unique(onboarding_version_id,step_key),
  unique(onboarding_version_id,sequence_number)
);

create table public.player_onboarding_states (
  player_profile_id uuid primary key references public.player_profiles(id) on delete restrict,
  onboarding_version_id uuid not null references public.player_experience_onboarding_versions(id) on delete restrict,
  status text not null default 'not_started' check(status in ('not_started','active','paused','completed','skipped','migrated','blocked')),
  current_step_key text not null,
  current_chapter_key text not null check(current_chapter_key in (
    'welcome','your_home','first_harvest','make_something','general_store',
    'grow_your_starvillian','make_it_home','starville_together','daily_rhythm'
  )),
  migrated_existing_player boolean not null default false,
  reward_settlement_state text not null default 'not_ready' check(reward_settlement_state in ('not_ready','pending','settled','blocked')),
  guide_minimized boolean not null default false,
  reduced_guidance boolean not null default false,
  state_revision integer not null default 1 check(state_revision>0),
  started_at timestamptz,
  last_progressed_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  blocked_reason_code text check(blocked_reason_code is null or blocked_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check((status='completed')=(completed_at is not null)),
  check((status='blocked')=(blocked_reason_code is not null)),
  check(status<>'skipped' or skipped_at is not null)
);

create table public.player_onboarding_step_evidence (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  onboarding_version_id uuid not null references public.player_experience_onboarding_versions(id) on delete restrict,
  onboarding_step_id uuid not null references public.player_experience_onboarding_steps(id) on delete restrict,
  source_event_key text not null check(source_event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  source_entity_id uuid not null,
  source_table text not null check(source_table in (
    'player_profiles','player_game_states','player_quest_events','cozy_private_plot_events',
    'economy_shop_events','progression_owner_events','housing_owner_events','home_visit_owner_events',
    'player_experience_acknowledgements','player_daily_objective_progress'
  )),
  quantity integer not null default 1 check(quantity between 1 and 1000000),
  request_id text not null check(char_length(request_id) between 1 and 128),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(player_profile_id,onboarding_step_id,source_event_key,source_entity_id)
);
create index player_onboarding_step_evidence_player_idx
  on public.player_onboarding_step_evidence(player_profile_id,created_at desc);

create table public.player_experience_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  acknowledgement_key text not null check(acknowledgement_key in ('inventory_reviewed','progression_reviewed','home_visit_settings_reviewed')),
  onboarding_version_id uuid not null references public.player_experience_onboarding_versions(id) on delete restrict,
  request_id text not null check(char_length(request_id) between 1 and 128),
  idempotency_key_hash text not null check(char_length(idempotency_key_hash)=64),
  created_at timestamptz not null default now(),
  unique(player_profile_id,onboarding_version_id,acknowledgement_key)
);

create table public.player_experience_daily_policy_versions (
  id uuid primary key,
  policy_key text not null unique check(policy_key ~ '^starville_daily_rhythm_v[1-9][0-9]*$'),
  version_number integer not null unique check(version_number between 1 and 10000),
  status text not null check(status in ('draft','validated','active','superseded','archived')),
  game_day_timezone text not null default 'UTC' check(game_day_timezone='UTC'),
  objective_count integer not null default 3 check(objective_count=3),
  maximum_social_objectives integer not null default 1 check(maximum_social_objectives=1),
  reward_policy text not null default 'non_economic_completion_progress' check(reward_policy='non_economic_completion_progress'),
  completion_bonus_policy text not null default 'non_economic_completion_mark' check(completion_bonus_policy='non_economic_completion_mark'),
  configuration_revision integer not null default 1 check(configuration_revision>0),
  effective_at timestamptz not null,
  activated_at timestamptz,
  reason text not null check(char_length(reason) between 12 and 500 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check((status='active' and activated_at is not null) or status<>'active')
);

create table public.player_experience_active_daily_policy (
  singleton_key boolean primary key default true check(singleton_key),
  policy_version_id uuid not null unique references public.player_experience_daily_policy_versions(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.player_experience_daily_objective_definitions (
  id uuid primary key,
  policy_version_id uuid not null references public.player_experience_daily_policy_versions(id) on delete restrict,
  objective_key text not null check(objective_key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'),
  category text not null check(category in ('farming','production','general_store','progression','housing','social')),
  title text not null check(char_length(title) between 2 and 100 and title=btrim(title) and title !~ '[[:cntrl:]<>]'),
  description text not null check(char_length(description) between 2 and 240 and description=btrim(description) and description !~ '[[:cntrl:]<>]'),
  authoritative_event_key text not null check(authoritative_event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  required_count integer not null check(required_count between 1 and 1000000),
  solo_safe boolean not null,
  social boolean not null,
  minimum_player_level integer not null default 1 check(minimum_player_level between 1 and 50),
  required_feature_key text,
  semantic_target_key text check(semantic_target_key is null or semantic_target_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'),
  enabled boolean not null default true,
  configuration_revision integer not null default 1 check(configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(policy_version_id,objective_key),
  check(not social or category='social'),
  check(not social or solo_safe)
);

create table public.player_daily_assignments (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  policy_version_id uuid not null references public.player_experience_daily_policy_versions(id) on delete restrict,
  game_day_key date not null,
  game_day_timezone text not null default 'UTC' check(game_day_timezone='UTC'),
  status text not null default 'active' check(status in ('active','completed','expired','blocked')),
  assignment_revision integer not null default 1 check(assignment_revision>0),
  generated_at timestamptz not null default now(),
  completed_at timestamptz,
  completion_settled_at timestamptz,
  generation_evidence jsonb not null check(jsonb_typeof(generation_evidence)='object' and pg_column_size(generation_evidence)<=4096),
  unique(player_profile_id,game_day_key),
  check(status<>'completed' or completed_at is not null)
);
create index player_daily_assignments_rollover_idx
  on public.player_daily_assignments(status,game_day_key,id);

create table public.player_daily_objective_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.player_daily_assignments(id) on delete restrict,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  objective_definition_id uuid not null references public.player_experience_daily_objective_definitions(id) on delete restrict,
  sequence_number integer not null check(sequence_number between 1 and 3),
  current_count integer not null default 0 check(current_count between 0 and 1000000),
  required_count integer not null check(required_count between 1 and 1000000),
  status text not null default 'active' check(status in ('active','completed','settled','blocked')),
  progress_revision integer not null default 1 check(progress_revision>0),
  completed_at timestamptz,
  settled_at timestamptz,
  last_source_event_key text,
  last_source_entity_id uuid,
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  unique(assignment_id,objective_definition_id),
  unique(assignment_id,sequence_number),
  check(status in ('completed','settled')=(completed_at is not null)),
  check((status='settled')=(settled_at is not null))
);

create table public.player_daily_objective_contributions (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  progress_id uuid not null references public.player_daily_objective_progress(id) on delete restrict,
  source_event_key text not null,
  source_entity_id uuid not null,
  progress_delta integer not null check(progress_delta between 1 and 1000000),
  created_at timestamptz not null default now(),
  primary key(player_profile_id,progress_id,source_event_key,source_entity_id)
);

create table public.player_experience_guidance_targets (
  id uuid primary key,
  semantic_key text not null unique check(semantic_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'),
  label text not null check(char_length(label) between 2 and 80 and label=btrim(label) and label !~ '[[:cntrl:]<>]'),
  semantic_object_key text not null check(char_length(semantic_object_key) between 2 and 120),
  world_key text not null check(char_length(world_key) between 2 and 120),
  severity text not null check(severity in ('blocking','warning','optional')),
  fallback_hint text not null check(char_length(fallback_hint) between 2 and 240 and fallback_hint=btrim(fallback_hint) and fallback_hint !~ '[[:cntrl:]<>]'),
  enabled boolean not null default true,
  configuration_revision integer not null default 1 check(configuration_revision>0),
  safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object' and pg_column_size(safe_metadata)<=4096),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_experience_recovery_queue (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  onboarding_version_id uuid not null references public.player_experience_onboarding_versions(id) on delete restrict,
  reason_code text not null check(reason_code in (
    'starter_seed_missing','inventory_full','crop_target_invalid','starter_recipe_unavailable',
    'shop_unavailable','guidance_target_missing','state_out_of_sync'
  )),
  status text not null default 'pending' check(status in ('pending','processing','resolved','investigation_required','rejected')),
  expected_state_revision integer not null check(expected_state_revision>0),
  request_id text not null check(char_length(request_id) between 1 and 128),
  idempotency_key_hash text not null check(char_length(idempotency_key_hash)=64),
  evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object' and pg_column_size(evidence)<=8192),
  attempt_count integer not null default 0 check(attempt_count between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(player_profile_id,idempotency_key_hash)
);
create index player_experience_recovery_pending_idx
  on public.player_experience_recovery_queue(status,created_at,id) where status in ('pending','processing');

create table public.player_experience_owner_events (
  event_number bigint generated always as identity primary key,
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  event_key text not null check(event_key in (
    'onboarding_started','onboarding_resumed','onboarding_paused','onboarding_step_completed',
    'onboarding_completed','onboarding_optional_skipped','onboarding_migrated','onboarding_blocked',
    'guide_preferences_updated','daily_objectives_generated','daily_objective_progressed',
    'daily_objective_completed','daily_set_completed','recovery_requested','recovery_resolved'
  )),
  priority text not null default 'progress' check(priority in ('critical','action_required','progress','social','informational')),
  related_entity_id uuid,
  title text not null check(char_length(title) between 2 and 100 and title=btrim(title) and title !~ '[[:cntrl:]<>]'),
  message text not null check(char_length(message) between 2 and 280 and message=btrim(message) and message !~ '[[:cntrl:]<>]'),
  safe_payload jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_payload)='object' and pg_column_size(safe_payload)<=4096),
  created_at timestamptz not null default now()
);
create index player_experience_owner_events_player_idx
  on public.player_experience_owner_events(player_profile_id,event_number desc);

create table public.player_experience_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid references public.player_profiles(id) on delete set null,
  event_key text not null check(event_key ~ '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'),
  onboarding_version_key text,
  chapter_key text,
  step_key text,
  game_day_key date,
  environment text not null default 'normal' check(environment='normal'),
  safe_dimensions jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_dimensions)='object' and pg_column_size(safe_dimensions)<=4096),
  occurred_at timestamptz not null default now()
);
create index player_experience_telemetry_time_idx
  on public.player_experience_telemetry_events(occurred_at desc,event_key);

create table public.player_experience_rate_limits (
  player_profile_id uuid not null references public.player_profiles(id) on delete restrict,
  scope text not null check(scope in ('start','resume','pause','preference','acknowledge','skip','recovery','daily_refresh')),
  attempt_count integer not null check(attempt_count between 1 and 10000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key(player_profile_id,scope),
  check(window_expires_at>window_started_at)
);

create table public.player_experience_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  admin_session_id uuid not null references public.admin_sessions(id) on delete restrict,
  action_key text not null check(action_key ~ '^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$'),
  target_type text not null,
  target_id uuid,
  reason text not null check(char_length(reason) between 12 and 1000 and reason=btrim(reason) and reason !~ '[[:cntrl:]<>]'),
  request_id text not null check(char_length(request_id) between 1 and 128),
  before_state jsonb not null default '{}'::jsonb check(jsonb_typeof(before_state)='object' and pg_column_size(before_state)<=8192),
  after_state jsonb not null default '{}'::jsonb check(jsonb_typeof(after_state)='object' and pg_column_size(after_state)<=8192),
  created_at timestamptz not null default now(),
  unique(actor_user_id,request_id)
);

insert into public.player_experience_onboarding_versions(
  id,version_key,version_number,status,starter_quest_chain_key,effective_at,activated_at,reason,safe_metadata
) values(
  '12000000-0000-4000-8000-000000000001','starville_core_onboarding_v1',1,'active',
  'starville-beginnings',now(),now(),'Phase 12A initial integrated Starville onboarding.',
  '{"canonicalQuestEngine":"progression","exactOnceRewards":"canonical-systems","optionalSkipOnly":true}'::jsonb
);
insert into public.player_experience_active_onboarding(singleton_key,onboarding_version_id)
values(true,'12000000-0000-4000-8000-000000000001');

insert into public.player_experience_onboarding_steps(
  id,onboarding_version_id,step_key,chapter_key,sequence_number,title,instruction,
  authoritative_event_key,optional,semantic_target_key,recovery_hint
) values
  ('12000000-0000-4000-8000-000000000101','12000000-0000-4000-8000-000000000001','enter_lantern_square','welcome',1,'Welcome to Starville','Take in Lantern Square and find the glowing objective marker.','player_entered_lantern_square',false,'location.lantern_square_spawn','Reload the published world to return to the safe Lantern Square spawn.'),
  ('12000000-0000-4000-8000-000000000102','12000000-0000-4000-8000-000000000001','practice_movement','welcome',2,'Stretch your legs','Move with WASD, arrow keys, or the touch movement controls.','player_movement_verified',false,'interactable.willow_guide','Open the Guide for keyboard and touch movement controls.'),
  ('12000000-0000-4000-8000-000000000103','12000000-0000-4000-8000-000000000001','interact_with_guide','welcome',3,'Meet Willow Guide','Move near Willow Guide and use the Interact prompt.','npc_interacted',false,'interactable.willow_guide','The quest tracker remains available if the guide marker is unavailable.'),
  ('12000000-0000-4000-8000-000000000104','12000000-0000-4000-8000-000000000001','enter_personal_home','your_home',4,'Find your home','Follow the home marker and enter your personal home plot.','player_entered_personal_home',false,'interactable.home_entrance','Use Open Guide to locate the canonical home entrance.'),
  ('12000000-0000-4000-8000-000000000105','12000000-0000-4000-8000-000000000001','inspect_inventory','your_home',5,'Check your starter kit','Open Inventory and review your hoe, watering can, seeds, and starter furniture.','inventory_reviewed',false,'interactable.farm_plot','Starter recovery only restores verified missing eligible items and never duplicates grants.'),
  ('12000000-0000-4000-8000-000000000106','12000000-0000-4000-8000-000000000001','plant_first_crop','first_harvest',6,'Plant a Moonbean','Prepare a garden tile, select a Moonbean Seed, and plant it.','crop_planted',false,'interactable.farm_plot','Choose another eligible tile or request bounded starter-seed recovery.'),
  ('12000000-0000-4000-8000-000000000107','12000000-0000-4000-8000-000000000001','water_first_crop','first_harvest',7,'Water your crop','Select the watering can and water the planted Moonbean once.','crop_watered',false,'interactable.farm_plot','Refresh the home state if the crop no longer needs water.'),
  ('12000000-0000-4000-8000-000000000108','12000000-0000-4000-8000-000000000001','harvest_first_crop','first_harvest',8,'Harvest your Moonbean','Growth uses server time. Explore while it grows, then return when it is ready.','crop_harvested',false,'interactable.farm_plot','The objective waits safely through reconnects and shows remaining growth time.'),
  ('12000000-0000-4000-8000-000000000109','12000000-0000-4000-8000-000000000001','collect_first_recipe','make_something',9,'Make something useful','Start and collect Garden Soup or Garden Twine at a home workstation.','workstation_job_collected',false,'interactable.cooking_hearth','Use the compatible starter recipe or free inventory capacity before collection.'),
  ('12000000-0000-4000-8000-000000000110','12000000-0000-4000-8000-000000000001','complete_store_transaction','general_store',10,'Trade at the General Store','Inspect prices and complete one safe purchase or sale.','shop_transaction_completed',false,'interactable.general_store','If the shop is paused, continue another activity and return after live ops resumes.'),
  ('12000000-0000-4000-8000-000000000111','12000000-0000-4000-8000-000000000001','review_progression','grow_your_starvillian',11,'Review your progress','Open My Journey to see Player Level, skill XP, quests, achievements, and unlocks.','progression_reviewed',false,'control.progression','The Guide explains locked content when progression is temporarily unavailable.'),
  ('12000000-0000-4000-8000-000000000112','12000000-0000-4000-8000-000000000001','save_first_layout','make_it_home',12,'Make it home','Enter Decoration Mode, place your Willow Chair, and save the layout.','decoration_layout_saved',false,'control.decoration_mode','Free inventory or storage space and retry the exact saved-layout revision.'),
  ('12000000-0000-4000-8000-000000000113','12000000-0000-4000-8000-000000000001','review_home_visits','starville_together',13,'Starville together','Review visibility and interaction modes. This solo-safe step never requires another player.','home_visit_settings_reviewed',true,'control.home_visits','Settings review remains available when visits or social systems are paused.'),
  ('12000000-0000-4000-8000-000000000114','12000000-0000-4000-8000-000000000001','complete_daily_objective','daily_rhythm',14,'Begin your daily rhythm','Complete one server-assigned daily objective and review the next reset time.','daily_objective_completed',false,'control.daily_rhythm','Daily assignments regenerate lazily after the UTC boundary without losing earned history.');

insert into public.player_experience_daily_policy_versions(
  id,policy_key,version_number,status,effective_at,activated_at,reason,safe_metadata
) values(
  '12000000-0000-4000-8000-000000000201','starville_daily_rhythm_v1',1,'active',now(),now(),
  'Phase 12A initial conservative UTC daily-rhythm policy.',
  '{"candidate":"balanced-combination","candidatePublished":false,"dustReward":0,"xpReward":0,"soloSafe":true}'::jsonb
);
insert into public.player_experience_active_daily_policy(singleton_key,policy_version_id)
values(true,'12000000-0000-4000-8000-000000000201');

insert into public.player_experience_daily_objective_definitions(
  id,policy_version_id,objective_key,category,title,description,authoritative_event_key,required_count,
  solo_safe,social,minimum_player_level,required_feature_key,semantic_target_key
) values
  ('12000000-0000-4000-8000-000000000301','12000000-0000-4000-8000-000000000201','daily-plant-crop','farming','Plant for tomorrow','Plant one eligible crop on your personal home plot.','crop_planted',1,true,false,1,'farming','interactable.farm_plot'),
  ('12000000-0000-4000-8000-000000000302','12000000-0000-4000-8000-000000000201','daily-water-crop','farming','A little water','Water one eligible crop that still needs care.','crop_watered',1,true,false,1,'farming','interactable.farm_plot'),
  ('12000000-0000-4000-8000-000000000303','12000000-0000-4000-8000-000000000201','daily-harvest-crop','farming','Gather the harvest','Harvest one mature crop from your personal plot.','crop_harvested',1,true,false,1,'farming','interactable.farm_plot'),
  ('12000000-0000-4000-8000-000000000304','12000000-0000-4000-8000-000000000201','daily-collect-output','production','Make something','Collect one completed cooking or crafting output.','workstation_job_collected',1,true,false,1,'production','interactable.cooking_hearth'),
  ('12000000-0000-4000-8000-000000000305','12000000-0000-4000-8000-000000000201','daily-store-transaction','general_store','Visit the General Store','Complete one eligible purchase or sale.','shop_transaction_completed',1,true,false,1,'general_store','interactable.general_store'),
  ('12000000-0000-4000-8000-000000000306','12000000-0000-4000-8000-000000000201','daily-gain-xp','progression','Grow your Starvillian','Gain 10 trusted XP through normal gameplay.','trusted_xp_gained',10,true,false,1,'progression','control.progression'),
  ('12000000-0000-4000-8000-000000000307','12000000-0000-4000-8000-000000000201','daily-save-layout','housing','Tend your home','Save one valid Decoration Mode layout revision.','decoration_layout_saved',1,true,false,1,'housing','control.decoration_mode'),
  ('12000000-0000-4000-8000-000000000308','12000000-0000-4000-8000-000000000201','daily-social-readiness','social','Open your visitor guide','Review home-visit readiness or participate in one live visit.','home_visit_settings_reviewed',1,true,true,1,'home_visits','control.home_visits');

insert into public.player_experience_guidance_targets(
  id,semantic_key,label,semantic_object_key,world_key,severity,fallback_hint
) values
  ('12000000-0000-4000-8000-000000000401','location.lantern_square_spawn','Safe arrival','default','lantern-square','blocking','You are at the safe Lantern Square arrival point.'),
  ('12000000-0000-4000-8000-000000000402','interactable.willow_guide','Willow Guide','phase11-willow-guide','lantern-square','blocking','Find Willow Guide near the central plaza.'),
  ('12000000-0000-4000-8000-000000000403','interactable.home_entrance','Personal home entrance','phase7-home-entrance','lantern-square','blocking','Follow the home marker at the edge of Lantern Square.'),
  ('12000000-0000-4000-8000-000000000404','interactable.farm_plot','Home farm plot','home-tile-*','personal-home','blocking','Enter your home and approach one of the eight garden tiles.'),
  ('12000000-0000-4000-8000-000000000405','interactable.cooking_hearth','Cooking Hearth','phase7-cooking-hearth-object','personal-home','blocking','The Cooking Hearth is inside your personal home plot.'),
  ('12000000-0000-4000-8000-000000000406','interactable.crafting_workbench','Crafting Workbench','phase7-crafting-workbench-object','personal-home','warning','The Crafting Workbench is inside your personal home plot.'),
  ('12000000-0000-4000-8000-000000000407','interactable.general_store','General Store','phase7-general-store','lantern-square','blocking','Follow the store marker in Lantern Square.'),
  ('12000000-0000-4000-8000-000000000408','control.progression','My Journey','hud.player-progression','game-client','blocking','Open My Journey from the player status dock.'),
  ('12000000-0000-4000-8000-000000000409','control.decoration_mode','Decoration Mode','housing.decoration-mode','personal-home','blocking','Open Housing while inside your personal home.'),
  ('12000000-0000-4000-8000-000000000410','control.home_visits','Home visit settings','home-visits.settings','personal-home','warning','Open Home Visits from your housing workspace.'),
  ('12000000-0000-4000-8000-000000000411','control.daily_rhythm','Daily Rhythm','player-experience.daily','game-client','blocking','Open the Guide and choose Daily Rhythm.');

create or replace function private.protect_player_experience_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or old.status in ('active','superseded','archived') then
    raise exception using errcode='55000',message='PLAYER_EXPERIENCE_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;
create or replace function private.protect_player_experience_append_only()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception using errcode='55000',message='PLAYER_EXPERIENCE_HISTORY_APPEND_ONLY';
end;
$$;
create or replace function private.protect_player_experience_versioned_child()
returns trigger language plpgsql set search_path='' as $$
declare parent_status text; parent_id uuid;
begin
  parent_id:=case when tg_table_name='player_experience_onboarding_steps'
    then (coalesce(to_jsonb(new),to_jsonb(old))->>'onboarding_version_id')::uuid
    else (coalesce(to_jsonb(new),to_jsonb(old))->>'policy_version_id')::uuid end;
  if tg_table_name='player_experience_onboarding_steps' then
    select status into strict parent_status from public.player_experience_onboarding_versions where id=parent_id;
  else
    select status into strict parent_status from public.player_experience_daily_policy_versions where id=parent_id;
  end if;
  if parent_status<>'draft' then
    raise exception using errcode='55000',message='PLAYER_EXPERIENCE_VERSION_CHILD_IMMUTABLE';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger player_experience_onboarding_versions_immutable
  before update or delete on public.player_experience_onboarding_versions
  for each row execute function private.protect_player_experience_immutable();
create trigger player_experience_daily_policy_versions_immutable
  before update or delete on public.player_experience_daily_policy_versions
  for each row execute function private.protect_player_experience_immutable();
create trigger player_experience_onboarding_steps_immutable
  before insert or update or delete on public.player_experience_onboarding_steps
  for each row execute function private.protect_player_experience_versioned_child();
create trigger player_experience_daily_objectives_immutable
  before insert or update or delete on public.player_experience_daily_objective_definitions
  for each row execute function private.protect_player_experience_versioned_child();
create trigger player_onboarding_step_evidence_append_only
  before update or delete on public.player_onboarding_step_evidence
  for each row execute function private.protect_player_experience_append_only();
create trigger player_daily_contributions_append_only
  before update or delete on public.player_daily_objective_contributions
  for each row execute function private.protect_player_experience_append_only();
create trigger player_experience_admin_audit_append_only
  before update or delete on public.player_experience_admin_audit_events
  for each row execute function private.protect_player_experience_append_only();

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'player_experience_onboarding_versions','player_experience_active_onboarding',
    'player_experience_onboarding_steps','player_onboarding_states','player_onboarding_step_evidence',
    'player_experience_acknowledgements','player_experience_daily_policy_versions',
    'player_experience_active_daily_policy','player_experience_daily_objective_definitions',
    'player_daily_assignments','player_daily_objective_progress','player_daily_objective_contributions',
    'player_experience_guidance_targets','player_experience_recovery_queue',
    'player_experience_owner_events','player_experience_telemetry_events',
    'player_experience_rate_limits','player_experience_admin_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on table public.%I to service_role',table_name);
  end loop;
end $$;

revoke all on function private.protect_player_experience_immutable() from public,anon,authenticated,service_role;
revoke all on function private.protect_player_experience_append_only() from public,anon,authenticated,service_role;
revoke all on function private.protect_player_experience_versioned_child() from public,anon,authenticated,service_role;

comment on table public.player_onboarding_states is
  'One server-authoritative, version-pinned Phase 12A onboarding projection per player.';
comment on table public.player_daily_assignments is
  'Lazy UTC daily-rhythm assignment sets; no per-player midnight job is required.';
comment on table public.player_experience_daily_policy_versions is
  'Initial v1 daily rewards are deliberately non-economic so Candidate D remains unchanged.';
