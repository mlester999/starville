-- Starville Phase 7.5B: reusable, game-scoped presentation configuration authority.
-- Infrastructure credentials and environment settings are intentionally absent.

insert into public.admin_permissions
  (key, name, description, category, is_sensitive, is_system)
values
  ('platform_configuration.read', 'Read platform configuration', 'Read published presentation configuration and bounded draft summaries.', 'platform_configuration', false, true),
  ('platform_configuration.edit', 'Edit platform configuration', 'Create and edit bounded presentation drafts.', 'platform_configuration', true, true),
  ('platform_configuration.validate', 'Validate platform configuration', 'Run trusted presentation and dependency validation.', 'platform_configuration', true, true),
  ('platform_configuration.review', 'Review platform configuration', 'Submit and approve a validated presentation draft.', 'platform_configuration', true, true),
  ('platform_configuration.publish', 'Publish platform configuration', 'Activate an exact reviewed presentation version.', 'platform_configuration', true, true),
  ('platform_configuration.rollback', 'Roll back platform configuration', 'Reactivate an immutable previously published presentation version.', 'platform_configuration', true, true),
  ('platform_configuration.audit.read', 'Read platform configuration audit', 'Read bounded append-only presentation configuration history.', 'platform_configuration', true, true),
  ('platform_configuration.preview', 'Preview platform configuration', 'Preview an exact draft without changing the active presentation.', 'platform_configuration', false, true)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  is_system = true;

with mapping(role_key, permission_key) as (
  values
    ('game_administrator', 'platform_configuration.read'),
    ('game_administrator', 'platform_configuration.edit'),
    ('game_administrator', 'platform_configuration.validate'),
    ('game_administrator', 'platform_configuration.review'),
    ('game_administrator', 'platform_configuration.publish'),
    ('game_administrator', 'platform_configuration.rollback'),
    ('game_administrator', 'platform_configuration.audit.read'),
    ('game_administrator', 'platform_configuration.preview'),
    ('content_manager', 'platform_configuration.read'),
    ('content_manager', 'platform_configuration.edit'),
    ('content_manager', 'platform_configuration.validate'),
    ('content_manager', 'platform_configuration.preview'),
    ('world_designer', 'platform_configuration.read'),
    ('live_operations_manager', 'platform_configuration.read'),
    ('live_operations_manager', 'platform_configuration.preview'),
    ('read_only_analyst', 'platform_configuration.read'),
    ('customer_support', 'platform_configuration.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles as role on role.key = mapping.role_key
join public.admin_permissions as permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from public.admin_roles as role
cross join public.admin_permissions as permission
where role.key = 'super_admin'
  and permission.key like 'platform_configuration.%'
on conflict (role_id, permission_id) do nothing;

-- Extend the secured Phase 7.5A intake profiles for presentation assets.
alter table public.world_assets drop constraint world_assets_asset_type_check;
alter table public.world_assets add constraint world_assets_asset_type_check check (asset_type in (
  'building', 'shop', 'cooking_station', 'crafting_station', 'home_entrance',
  'decoration', 'tree', 'rock', 'fence', 'lamp', 'sign', 'terrain_tile', 'bridge',
  'farm_plot', 'crop_stage', 'furniture', 'home_interior_object', 'interaction_marker',
  'item_icon', 'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon',
  'brand_logo', 'brand_mark', 'favicon', 'admin_login_background',
  'landing_hero_background', 'social_share_image'
));
alter table public.world_assets drop constraint world_assets_category_check;
alter table public.world_assets add constraint world_assets_category_check check (category in (
  'terrain', 'structure', 'nature', 'boundary', 'lighting', 'signage', 'farming',
  'crop', 'furniture', 'interior', 'interaction', 'inventory', 'recipe', 'shop', 'branding'
));

create table public.game_platforms (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (
    char_length(key) between 2 and 48 and key ~ '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$'
  ),
  default_name text not null check (
    char_length(default_name) between 2 and 80 and default_name = btrim(default_name)
    and default_name !~ '[[:cntrl:]<>]'
  ),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function private.valid_platform_configuration(p_value jsonb)
returns boolean
language plpgsql
immutable
strict
security definer
set search_path = ''
as $$
declare
  required_key text;
  known_modules constant text[] := array[
    'authentication', 'administrator_authorization', 'audit', 'security_settings',
    'platform_configuration', 'operations', 'players', 'world_management', 'world_assets',
    'cozy_gameplay', 'content_management', 'economy', 'blockchain', 'support', 'reporting'
  ];
  required_modules constant text[] := array[
    'authentication', 'administrator_authorization', 'audit', 'security_settings',
    'platform_configuration'
  ];
begin
  if jsonb_typeof(p_value) is distinct from 'object'
     or octet_length(p_value::text) > 131072
     or p_value ->> 'schemaVersion' is distinct from '1'
     or jsonb_typeof(p_value -> 'branding') is distinct from 'object'
     or jsonb_typeof(p_value -> 'brandingAssets') is distinct from 'object'
     or jsonb_typeof(p_value -> 'theme') is distinct from 'object'
     or jsonb_typeof(p_value -> 'typography') is distinct from 'object'
     or jsonb_typeof(p_value -> 'adminLogin') is distinct from 'object'
     or jsonb_typeof(p_value -> 'landing' -> 'sections') is distinct from 'array'
     or jsonb_typeof(p_value -> 'navigation' -> 'items') is distinct from 'array'
     or jsonb_typeof(p_value -> 'modules') is distinct from 'array'
     or jsonb_array_length(p_value -> 'landing' -> 'sections') not between 2 and 20
     or jsonb_array_length(p_value -> 'navigation' -> 'items') > 32
     or jsonb_array_length(p_value -> 'modules') not between 5 and 32
     or p_value::text ~* '(javascript:|<script|<style|<iframe|onerror[[:space:]]*=)'
  then return false; end if;

  if (select count(*) from jsonb_object_keys(p_value)) <> 9
     or (select count(*) from jsonb_object_keys(p_value -> 'branding')) <> 15
     or (select count(*) from jsonb_object_keys(p_value -> 'brandingAssets')) <> 6
     or (select count(*) from jsonb_object_keys(p_value -> 'theme')) <> 2
     or (select count(*) from jsonb_object_keys(p_value -> 'typography')) <> 4
     or (select count(*) from jsonb_object_keys(p_value -> 'adminLogin')) <> 11
     or (select count(*) from jsonb_object_keys(p_value -> 'landing')) <> 1
     or (select count(*) from jsonb_object_keys(p_value -> 'navigation')) <> 2
  then return false; end if;

  if char_length(coalesce(p_value #>> '{branding,fullGameName}', '')) not between 2 and 80
     or char_length(coalesce(p_value #>> '{branding,shortGameName}', '')) not between 2 and 32
     or char_length(coalesce(p_value #>> '{branding,administrationName}', '')) not between 2 and 80
     or char_length(coalesce(p_value #>> '{branding,tagline}', '')) not between 2 and 140
     or char_length(coalesce(p_value #>> '{branding,shortDescription}', '')) not between 2 and 320
     or char_length(coalesce(p_value #>> '{branding,copyrightText}', '')) not between 2 and 160
     or (
       p_value #>> '{branding,supportEmail}' is not null
       and p_value #>> '{branding,supportEmail}' !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     )
  then return false; end if;

  foreach required_key in array array[
    'primaryWebsiteUrl', 'documentationUrl', 'legalUrl', 'privacyUrl', 'termsUrl'
  ] loop
    if p_value -> 'branding' ->> required_key is not null
       and (
         p_value -> 'branding' ->> required_key !~ '^/[A-Za-z0-9/_?&=.#%-]*$'
         or p_value -> 'branding' ->> required_key ~ '^//'
       )
       and p_value -> 'branding' ->> required_key !~* '^https://[^[:space:]@/]+(?:/[^[:space:]]*)?$'
    then return false; end if;
  end loop;
  foreach required_key in array array['discordUrl', 'xUrl', 'communityUrl'] loop
    if p_value -> 'branding' ->> required_key is not null
       and p_value -> 'branding' ->> required_key !~* '^https://[^[:space:]@/]+(?:/[^[:space:]]*)?$'
    then return false; end if;
  end loop;

  if exists (
    select 1 from jsonb_each(p_value -> 'brandingAssets') selection
    where jsonb_typeof(selection.value) not in ('null', 'string')
      or (
        jsonb_typeof(selection.value) = 'string'
        and selection.value #>> '{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      )
  ) then return false; end if;

  if p_value #>> '{theme,preset}' not in ('starville_twilight', 'cozy_light', 'custom')
     or jsonb_typeof(p_value #> '{theme,tokens}') is distinct from 'object'
     or p_value #>> '{adminLogin,eyebrow}' is null
     or p_value #>> '{adminLogin,title}' is null
     or p_value #>> '{adminLogin,subtitle}' is null
     or p_value #>> '{adminLogin,supportingDescription}' is null
     or (p_value #>> '{adminLogin,backgroundFocalPointX}')::numeric not between 0 and 100
     or (p_value #>> '{adminLogin,backgroundFocalPointY}')::numeric not between 0 and 100
     or (p_value #>> '{adminLogin,overlayStrength}')::numeric not between 0.2 and 0.9
  then return false; end if;

  if p_value -> 'typography' ->> 'display' not in ('system_display', 'system_sans', 'system_mono')
     or p_value -> 'typography' ->> 'heading' not in ('system_display', 'system_sans', 'system_mono')
     or p_value -> 'typography' ->> 'body' not in ('system_display', 'system_sans', 'system_mono')
     or p_value -> 'typography' ->> 'monospace' not in ('system_display', 'system_sans', 'system_mono')
  then return false; end if;

  if exists (
    select 1 from jsonb_each_text(p_value -> 'theme' -> 'tokens') token
    where token.value !~ '^#[0-9A-Fa-f]{6}$'
  ) or (select count(*) from jsonb_each(p_value -> 'theme' -> 'tokens')) <> 18
  then return false; end if;

  if jsonb_array_length(p_value -> 'modules') <> cardinality(known_modules)
  then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_value -> 'modules') module
    where module ->> 'key' <> all(known_modules)
      or jsonb_typeof(module -> 'enabled') is distinct from 'boolean'
      or char_length(coalesce(module ->> 'label', '')) not between 1 and 60
      or module ->> 'label' ~ '[[:cntrl:]<>]'
  ) then return false; end if;

  if (select count(*) from jsonb_array_elements(p_value -> 'modules')) <>
     (select count(distinct module ->> 'key') from jsonb_array_elements(p_value -> 'modules') module)
  then return false; end if;

  foreach required_key in array required_modules loop
    if not exists (
      select 1 from jsonb_array_elements(p_value -> 'modules') module
      where module ->> 'key' = required_key and module ->> 'enabled' = 'true'
    ) then return false; end if;
  end loop;

  if (
    exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'world_assets' and module ->> 'enabled' = 'true')
    and not exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'world_management' and module ->> 'enabled' = 'true')
  ) or (
    exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'cozy_gameplay' and module ->> 'enabled' = 'true')
    and not exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'players' and module ->> 'enabled' = 'true')
  ) or (
    exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' in ('economy', 'support') and module ->> 'enabled' = 'true')
    and not exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'players' and module ->> 'enabled' = 'true')
  ) or (
    exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'blockchain' and module ->> 'enabled' = 'true')
    and not exists (select 1 from jsonb_array_elements(p_value -> 'modules') module where module ->> 'key' = 'security_settings' and module ->> 'enabled' = 'true')
  ) then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
    where navigation ->> 'routeKey' not in (
      'overview', 'operations', 'players', 'token_access', 'worlds', 'world_assets',
      'game_content', 'world_audit', 'platform_settings'
    ) or navigation ->> 'icon' not in (
      'overview', 'operations', 'players', 'access', 'world', 'assets', 'content', 'audit', 'settings'
    ) or navigation ->> 'moduleKey' is distinct from case navigation ->> 'routeKey'
      when 'overview' then 'operations'
      when 'operations' then 'operations'
      when 'players' then 'players'
      when 'token_access' then 'blockchain'
      when 'worlds' then 'world_management'
      when 'world_assets' then 'world_assets'
      when 'game_content' then 'content_management'
      when 'world_audit' then 'audit'
      when 'platform_settings' then 'platform_configuration'
    end
      or jsonb_typeof(navigation -> 'order') is distinct from 'number'
      or char_length(coalesce(navigation ->> 'label', '')) not between 1 and 40
      or char_length(coalesce(navigation ->> 'group', '')) not between 1 and 40
  ) then return false; end if;

  if (select count(*) from jsonb_array_elements(p_value -> 'navigation' -> 'items')) <>
     (select count(distinct navigation ->> 'routeKey')
      from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation)
  then return false; end if;
  if (select count(*) from jsonb_array_elements(p_value -> 'navigation' -> 'items')) <>
     (select count(distinct (navigation ->> 'order')::integer)
      from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation)
     or not exists (
       select 1 from jsonb_array_elements(p_value -> 'navigation' -> 'items') navigation
       where navigation ->> 'routeKey' = 'platform_settings'
     )
  then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_value -> 'landing' -> 'sections') section
    where section ->> 'key' not in (
      'announcement', 'hero', 'features', 'how_to_play', 'world_preview', 'game_systems',
      'wallet_access', 'documentation_cta', 'community_cta', 'token_contract', 'footer'
    ) or jsonb_typeof(section -> 'enabled') is distinct from 'boolean'
      or jsonb_typeof(section -> 'items') is distinct from 'array'
      or jsonb_array_length(section -> 'items') > 8
      or jsonb_typeof(section -> 'order') is distinct from 'number'
      or (section ->> 'ctaLabel' is null) <> (section ->> 'ctaDestination' is null)
  ) then return false; end if;

  if (select count(*) from jsonb_array_elements(p_value -> 'landing' -> 'sections')) <>
     (select count(distinct section ->> 'key')
      from jsonb_array_elements(p_value -> 'landing' -> 'sections') section)
  then return false; end if;
  if (select count(*) from jsonb_array_elements(p_value -> 'landing' -> 'sections')) <>
     (select count(distinct (section ->> 'order')::integer)
      from jsonb_array_elements(p_value -> 'landing' -> 'sections') section)
     or not exists (
       select 1 from jsonb_array_elements(p_value -> 'landing' -> 'sections') section
       where section ->> 'key' = 'hero'
     )
     or not exists (
       select 1 from jsonb_array_elements(p_value -> 'landing' -> 'sections') section
       where section ->> 'key' = 'footer'
     )
  then return false; end if;

  return true;
exception when others then
  return false;
end;
$$;

create table public.game_platform_configuration_versions (
  id uuid primary key default gen_random_uuid(),
  game_platform_id uuid not null references public.game_platforms(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'validated', 'in_review', 'published', 'superseded', 'rolled_back'
  )),
  configuration jsonb not null check (private.valid_platform_configuration(configuration)),
  validation_results jsonb check (
    validation_results is null or (
      jsonb_typeof(validation_results) = 'object'
      and jsonb_typeof(validation_results -> 'valid') = 'boolean'
      and jsonb_typeof(validation_results -> 'findings') = 'array'
      and jsonb_array_length(validation_results -> 'findings') <= 200
      and octet_length(validation_results::text) <= 65536
    )
  ),
  created_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  submitted_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  reviewed_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  published_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  unique (game_platform_id, version_number),
  unique (game_platform_id, id)
);

create table public.game_platform_active_configuration (
  game_platform_id uuid primary key references public.game_platforms(id) on delete restrict,
  configuration_version_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  activated_at timestamptz not null default now(),
  activated_by_admin_id uuid references public.admin_users(user_id) on delete restrict,
  foreign key (game_platform_id, configuration_version_id)
    references public.game_platform_configuration_versions(game_platform_id, id) on delete restrict
);

create table public.game_platform_configuration_audit (
  id uuid primary key default gen_random_uuid(),
  game_platform_id uuid not null references public.game_platforms(id) on delete restrict,
  configuration_version_id uuid references public.game_platform_configuration_versions(id) on delete restrict,
  action text not null check (action in (
    'draft_created', 'draft_edited', 'validation_run', 'validation_failed',
    'validation_passed', 'review_submitted', 'review_approved', 'published', 'rolled_back',
    'module_changed', 'navigation_changed', 'branding_asset_changed', 'theme_changed',
    'login_content_changed', 'landing_content_changed'
  )),
  permission_key text not null check (permission_key like 'platform_configuration.%'),
  actor_admin_user_id uuid references public.admin_users(user_id) on delete restrict,
  request_id text not null check (char_length(request_id) between 1 and 128),
  reason text not null check (
    char_length(reason) between 3 and 500 and reason = btrim(reason) and reason !~ '[[:cntrl:]<>]'
  ),
  before_state jsonb not null default '{}'::jsonb check (
    jsonb_typeof(before_state) = 'object' and octet_length(before_state::text) <= 32768
  ),
  after_state jsonb not null default '{}'::jsonb check (
    jsonb_typeof(after_state) = 'object' and octet_length(after_state::text) <= 32768
  ),
  result text not null check (result in ('succeeded', 'failed', 'idempotent')),
  created_at timestamptz not null default now(),
  unique (game_platform_id, request_id, action)
);

create table public.game_platform_configuration_rate_limits (
  scope text not null check (scope in (
    'draft_create', 'draft_update', 'validate', 'submit_review', 'review', 'publish', 'rollback'
  )),
  subject_key text not null check (char_length(subject_key) between 1 and 128),
  attempt_count integer not null check (attempt_count > 0),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (scope, subject_key),
  check (window_expires_at > window_started_at)
);

create index game_platform_versions_history_idx
  on public.game_platform_configuration_versions(game_platform_id, version_number desc);
create index game_platform_audit_history_idx
  on public.game_platform_configuration_audit(game_platform_id, created_at desc, id desc);

create or replace function private.protect_platform_configuration_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_VERSION_IMMUTABLE';
  end if;
  if old.lifecycle_status in ('published', 'superseded', 'rolled_back') and (
    new.configuration is distinct from old.configuration
    or new.version_number is distinct from old.version_number
    or new.game_platform_id is distinct from old.game_platform_id
    or new.validation_results is distinct from old.validation_results
    or new.created_by_admin_id is distinct from old.created_by_admin_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_VERSION_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger platform_configuration_version_immutable
before update or delete on public.game_platform_configuration_versions
for each row execute function private.protect_platform_configuration_version();

create or replace function private.reject_platform_configuration_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'PLATFORM_CONFIGURATION_AUDIT_IMMUTABLE';
end;
$$;

create trigger platform_configuration_audit_immutable
before update or delete on public.game_platform_configuration_audit
for each row execute function private.reject_platform_configuration_audit_mutation();

alter table public.game_platforms enable row level security;
alter table public.game_platforms force row level security;
alter table public.game_platform_configuration_versions enable row level security;
alter table public.game_platform_configuration_versions force row level security;
alter table public.game_platform_active_configuration enable row level security;
alter table public.game_platform_active_configuration force row level security;
alter table public.game_platform_configuration_audit enable row level security;
alter table public.game_platform_configuration_audit force row level security;
alter table public.game_platform_configuration_rate_limits enable row level security;
alter table public.game_platform_configuration_rate_limits force row level security;

revoke all on table public.game_platforms from public, anon, authenticated, service_role;
revoke all on table public.game_platform_configuration_versions from public, anon, authenticated, service_role;
revoke all on table public.game_platform_active_configuration from public, anon, authenticated, service_role;
revoke all on table public.game_platform_configuration_audit from public, anon, authenticated, service_role;
revoke all on table public.game_platform_configuration_rate_limits from public, anon, authenticated, service_role;
revoke all on function private.valid_platform_configuration(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.protect_platform_configuration_version() from public, anon, authenticated, service_role;
revoke all on function private.reject_platform_configuration_audit_mutation() from public, anon, authenticated, service_role;

insert into public.game_platforms (id, key, default_name, status)
values ('75000000-0000-4000-8000-000000000001', 'starville', 'Starville', 'active')
on conflict (key) do nothing;

insert into public.game_platform_configuration_versions (
  id, game_platform_id, version_number, lifecycle_status, configuration,
  validation_results, published_at, revision
)
values (
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000001',
  1,
  'published',
  $json${
    "schemaVersion":1,
    "branding":{"fullGameName":"Starville","shortGameName":"Starville","administrationName":"Starville Administration","tagline":"Your cozy life beneath the stars","shortDescription":"Build your home, grow your farm, cook with friends, and help a lantern-lit village bloom again.","supportEmail":null,"copyrightText":"Starville. All rights reserved.","primaryWebsiteUrl":"/","documentationUrl":"/docs","discordUrl":null,"xUrl":null,"communityUrl":null,"legalUrl":null,"privacyUrl":null,"termsUrl":null},
    "brandingAssets":{"brand_logo":null,"brand_mark":null,"favicon":null,"admin_login_background":null,"landing_hero_background":null,"social_share_image":null},
    "theme":{"preset":"starville_twilight","tokens":{"background":"#0d1a17","surface":"#172c27","elevatedSurface":"#203a34","textPrimary":"#f8f4e8","textSecondary":"#bdcbc2","primaryAction":"#f4c965","primaryActionText":"#302400","secondaryAction":"#73cbaa","border":"#38534b","success":"#7fd3a7","warning":"#f4c965","danger":"#ff938a","information":"#7fc8f8","focusRing":"#f4c965","navigationBackground":"#11231f","navigationActive":"#f4c965","loginPageOverlay":"#0d1a17","landingHeroOverlay":"#071916"}},
    "typography":{"display":"system_display","heading":"system_display","body":"system_sans","monospace":"system_mono"},
    "adminLogin":{"eyebrow":"Authorized staff","title":"Sign in to Admin","subtitle":"Steward the world with care.","supportingDescription":"Use your assigned Starville staff identity. Player accounts and wallets do not grant access.","backgroundFocalPointX":50,"backgroundFocalPointY":50,"overlayStrength":0.72,"supportLink":null,"documentationLink":null,"securityNotice":"Access is checked server-side and recorded for security review.","footerCopy":"Restricted to authorized Starville staff."},
    "landing":{"sections":[{"key":"announcement","enabled":false,"order":0,"heading":"Village news","description":"A bounded announcement may appear here when explicitly published.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"hero","enabled":true,"order":10,"heading":"STARVILLE","description":"A cozy world to farm, cook, build, and belong.","ctaLabel":"Play now","ctaDestination":"/play","assetVersionId":null,"items":[{"heading":"Your cozy life beneath the stars","description":"Build your home, grow your farm, cook with friends, and help a lantern-lit village bloom again."}]},{"key":"features","enabled":false,"order":20,"heading":"A world made for belonging","description":"Highlight a bounded set of approved game features.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"how_to_play","enabled":false,"order":30,"heading":"How to play","description":"Introduce the first safe steps into the village.","ctaLabel":"Read the guide","ctaDestination":"/how-to-play","assetVersionId":null,"items":[]},{"key":"world_preview","enabled":false,"order":40,"heading":"Explore the village","description":"Preview approved world presentation without exposing unpublished content.","ctaLabel":"Spectate","ctaDestination":"/spectate","assetVersionId":null,"items":[]},{"key":"game_systems","enabled":false,"order":50,"heading":"Cozy systems","description":"Farm, cook, craft, decorate, and help the village grow.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"wallet_access","enabled":true,"order":60,"heading":"Village access","description":"Wallet verification checks eligibility without creating a transaction.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"documentation_cta","enabled":false,"order":70,"heading":"Read the documentation","description":"Learn about Starville through approved public documentation.","ctaLabel":"Open docs","ctaDestination":"/docs","assetVersionId":null,"items":[]},{"key":"community_cta","enabled":false,"order":80,"heading":"Join the community","description":"Find approved community destinations and village updates.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"token_contract","enabled":false,"order":90,"heading":"Token contract","description":"Contract data remains sourced from the server-authoritative access service.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]},{"key":"footer","enabled":true,"order":100,"heading":null,"description":"Starville. All rights reserved.","ctaLabel":null,"ctaDestination":null,"assetVersionId":null,"items":[]}]},
    "navigation":{"collapsedByDefault":false,"items":[{"routeKey":"overview","moduleKey":"operations","label":"Overview","icon":"overview","order":0,"group":"Administration","badgeLabel":null},{"routeKey":"operations","moduleKey":"operations","label":"Operations","icon":"operations","order":10,"group":"Administration","badgeLabel":null},{"routeKey":"players","moduleKey":"players","label":"Players","icon":"players","order":20,"group":"Administration","badgeLabel":null},{"routeKey":"token_access","moduleKey":"blockchain","label":"Token Access","icon":"access","order":30,"group":"Administration","badgeLabel":null},{"routeKey":"worlds","moduleKey":"world_management","label":"Worlds","icon":"world","order":40,"group":"Administration","badgeLabel":null},{"routeKey":"world_assets","moduleKey":"world_assets","label":"World Assets","icon":"assets","order":50,"group":"Administration","badgeLabel":null},{"routeKey":"game_content","moduleKey":"content_management","label":"Game Content","icon":"content","order":60,"group":"Administration","badgeLabel":null},{"routeKey":"world_audit","moduleKey":"audit","label":"World Audit","icon":"audit","order":70,"group":"Administration","badgeLabel":null},{"routeKey":"platform_settings","moduleKey":"platform_configuration","label":"Platform Settings","icon":"settings","order":80,"group":"Platform","badgeLabel":null}]},
    "modules":[{"key":"authentication","enabled":true,"label":"Authentication"},{"key":"administrator_authorization","enabled":true,"label":"Administrator authorization"},{"key":"audit","enabled":true,"label":"Audit"},{"key":"security_settings","enabled":true,"label":"Security settings"},{"key":"platform_configuration","enabled":true,"label":"Platform configuration"},{"key":"operations","enabled":true,"label":"Operations"},{"key":"players","enabled":true,"label":"Players"},{"key":"world_management","enabled":true,"label":"World management"},{"key":"world_assets","enabled":true,"label":"World assets"},{"key":"cozy_gameplay","enabled":true,"label":"Cozy gameplay"},{"key":"content_management","enabled":true,"label":"Content management"},{"key":"economy","enabled":true,"label":"Economy"},{"key":"blockchain","enabled":true,"label":"Blockchain"},{"key":"support","enabled":true,"label":"Support"},{"key":"reporting","enabled":true,"label":"Reporting"}]
  }$json$::jsonb,
  '{"valid":true,"findings":[{"level":"passed","code":"STARVILLE_BASELINE","path":"","message":"Initial Starville presentation baseline."}]}'::jsonb,
  now(),
  1
)
on conflict (game_platform_id, version_number) do nothing;

insert into public.game_platform_active_configuration (
  game_platform_id, configuration_version_id, revision, activated_at
)
values (
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002',
  1,
  now()
)
on conflict (game_platform_id) do nothing;
