-- Starville Phase 7C: private starter homes, owned furniture, and read-only admin visibility.
-- Personal homes remain separate from the five public-world map identities.

insert into public.admin_permissions (key, name, description, category, is_system)
values (
  'cozy_gameplay.read',
  'Read cozy gameplay',
  'Read bounded player farm and private-home operational summaries without mutation authority.',
  'gameplay',
  true
)
on conflict (key) do update
set name = excluded.name,
    description = excluded.description,
    category = excluded.category,
    is_system = true;

with mapping(role_key, permission_key) as (values
  ('super_admin', 'cozy_gameplay.read'),
  ('game_administrator', 'cozy_gameplay.read'),
  ('read_only_analyst', 'cozy_gameplay.read')
)
insert into public.admin_role_permissions (role_id, permission_id)
select role.id, permission.id
from mapping
join public.admin_roles role on role.key = mapping.role_key
join public.admin_permissions permission on permission.key = mapping.permission_key
on conflict (role_id, permission_id) do nothing;

alter table public.cozy_gameplay_idempotency
  drop constraint cozy_gameplay_idempotency_operation_check;
alter table public.cozy_gameplay_idempotency
  add constraint cozy_gameplay_idempotency_operation_check check (operation in (
    'bootstrap', 'quickbar_update', 'farm_plant', 'farm_water', 'farm_harvest',
    'recipe_cook', 'recipe_craft', 'shop_buy', 'shop_sell',
    'home_enter', 'home_exit', 'furniture_place', 'furniture_move',
    'furniture_rotate', 'furniture_remove'
  ));

alter table public.cozy_gameplay_rate_limits
  drop constraint cozy_gameplay_rate_limits_scope_check;
alter table public.cozy_gameplay_rate_limits
  add constraint cozy_gameplay_rate_limits_scope_check check (scope in (
    'bootstrap', 'dust_read', 'inventory_read', 'history_read', 'quickbar_write',
    'farm_read', 'farm_write', 'recipe_read', 'recipe_write', 'shop_read', 'shop_write',
    'home_read', 'home_write'
  ));

create or replace function private.claim_cozy_gameplay_rate_limit(
  p_player_profile_id uuid,
  p_scope text,
  p_limit integer
)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare claimed boolean;
begin
  if p_player_profile_id is null
     or p_scope not in (
       'bootstrap','dust_read','inventory_read','history_read','quickbar_write',
       'farm_read','farm_write','recipe_read','recipe_write','shop_read','shop_write',
       'home_read','home_write'
     )
     or p_limit not between 1 and 600 then
    raise exception using errcode='22023',message='INVALID_COZY_RATE_LIMIT';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-rate:'||p_player_profile_id::text||':'||p_scope,0));
  insert into public.cozy_gameplay_rate_limits(
    player_profile_id,scope,attempt_count,window_started_at,window_expires_at,updated_at
  ) values(p_player_profile_id,p_scope,1,now(),now()+interval '1 minute',now())
  on conflict(player_profile_id,scope) do update
  set attempt_count=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then 1 else cozy_gameplay_rate_limits.attempt_count+1 end,
      window_started_at=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then now() else cozy_gameplay_rate_limits.window_started_at end,
      window_expires_at=case when cozy_gameplay_rate_limits.window_expires_at<=now()
        then now()+interval '1 minute' else cozy_gameplay_rate_limits.window_expires_at end,
      updated_at=now()
  where cozy_gameplay_rate_limits.window_expires_at<=now()
     or cozy_gameplay_rate_limits.attempt_count<p_limit
  returning true into claimed;
  return coalesce(claimed,false);
end;
$$;

create table public.cozy_furniture_definitions (
  id uuid primary key,
  slug text not null unique check (
    char_length(slug) between 1 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  item_definition_id uuid not null unique
    references public.cozy_item_definitions(id) on delete restrict,
  name text not null check (
    char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'
  ),
  footprint_width integer not null check (footprint_width between 1 and 8),
  footprint_height integer not null check (footprint_height between 1 and 8),
  supported_rotations integer[] not null check (
    cardinality(supported_rotations) between 1 and 4
    and supported_rotations <@ array[0,90,180,270]
  ),
  blocks_movement boolean not null,
  asset_ref text check (
    asset_ref is null or (
      char_length(asset_ref) between 1 and 80
      and asset_ref ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ),
  asset_readiness text not null check (
    asset_readiness in ('approved', 'development_marker', 'missing')
  ),
  active boolean not null default true,
  content_version integer not null check (content_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (asset_readiness <> 'approved' or asset_ref is not null)
);

create table public.cozy_home_templates (
  id uuid primary key,
  slug text not null unique check (
    char_length(slug) between 1 and 80
    and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  name text not null check (
    char_length(name) between 1 and 80 and name = btrim(name) and name !~ '[[:cntrl:]<>]'
  ),
  template_version integer not null check (template_version > 0),
  min_x integer not null,
  min_y integer not null,
  max_x integer not null,
  max_y integer not null,
  spawn_x integer not null,
  spawn_y integer not null,
  exit_x integer not null,
  exit_y integer not null,
  blocked_cells jsonb not null check (
    jsonb_typeof(blocked_cells) = 'array'
    and jsonb_array_length(blocked_cells) <= 256
  ),
  development_art boolean not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (min_x < max_x and min_y < max_y),
  check (spawn_x >= min_x and spawn_x < max_x and spawn_y >= min_y and spawn_y < max_y),
  check (exit_x >= min_x and exit_x < max_x and exit_y >= min_y and exit_y < max_y)
);

create table public.cozy_home_entrances (
  id uuid primary key,
  template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  interaction_id text not null unique check (
    char_length(interaction_id) between 1 and 80
    and interaction_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  ),
  world_map_id uuid not null references public.world_maps(id) on delete restrict,
  map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  position_x numeric(8,4) not null,
  position_y numeric(8,4) not null,
  interaction_range numeric(5,2) not null check (interaction_range > 0 and interaction_range <= 4),
  active boolean not null default true,
  content_version integer not null check (content_version > 0)
);

create table public.player_homes (
  id uuid primary key default gen_random_uuid(),
  player_profile_id uuid not null unique
    references public.player_profiles(id) on delete restrict,
  template_id uuid not null references public.cozy_home_templates(id) on delete restrict,
  return_world_map_id uuid not null references public.world_maps(id) on delete restrict,
  return_map_version_id uuid not null references public.world_map_versions(id) on delete restrict,
  return_position_x numeric(8,4) not null,
  return_position_y numeric(8,4) not null,
  return_facing_direction text not null check (return_facing_direction in (
    'north', 'northeast', 'east', 'southeast',
    'south', 'southwest', 'west', 'northwest'
  )),
  inside_home boolean not null default false,
  starter_furniture_granted_at timestamptz,
  state_version integer not null default 1 check (state_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_home_furniture (
  id uuid primary key default gen_random_uuid(),
  player_home_id uuid not null references public.player_homes(id) on delete cascade,
  furniture_definition_id uuid not null
    references public.cozy_furniture_definitions(id) on delete restrict,
  grid_x integer not null,
  grid_y integer not null,
  rotation integer not null check (rotation in (0,90,180,270)),
  state_version integer not null default 1 check (state_version > 0),
  placed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_home_furniture_home_idx
  on public.player_home_furniture(player_home_id, updated_at desc, id);
create index player_homes_updated_idx on public.player_homes(updated_at desc, id);

create trigger cozy_furniture_definitions_set_updated_at
before update on public.cozy_furniture_definitions
for each row execute function private.set_updated_at();
create trigger cozy_home_templates_set_updated_at
before update on public.cozy_home_templates
for each row execute function private.set_updated_at();
create trigger player_homes_set_updated_at
before update on public.player_homes
for each row execute function private.set_updated_at();
create trigger player_home_furniture_set_updated_at
before update on public.player_home_furniture
for each row execute function private.set_updated_at();

insert into public.cozy_furniture_definitions (
  id, slug, item_definition_id, name, footprint_width, footprint_height,
  supported_rotations, blocks_movement, asset_ref, asset_readiness, active, content_version
) values
  ('75000000-0000-4000-8000-000000000001','willow-chair','71000000-0000-4000-8000-000000000015','Willow Chair',1,1,array[0,90,180,270],true,'phase7-dev-willow-chair','development_marker',true,1),
  ('75000000-0000-4000-8000-000000000002','hearth-table','71000000-0000-4000-8000-000000000016','Hearth Table',2,2,array[0,90,180,270],true,'phase7-dev-hearth-table','development_marker',true,1),
  ('75000000-0000-4000-8000-000000000003','moonwoven-rug','71000000-0000-4000-8000-000000000017','Moonwoven Rug',2,3,array[0,90,180,270],false,'phase7-dev-moonwoven-rug','development_marker',true,1),
  ('75000000-0000-4000-8000-000000000004','lantern-floor-lamp','71000000-0000-4000-8000-000000000018','Lantern Floor Lamp',1,1,array[0,90,180,270],true,'phase7-dev-lantern-floor-lamp','development_marker',true,1),
  ('75000000-0000-4000-8000-000000000005','meadow-shelf','71000000-0000-4000-8000-000000000019','Meadow Shelf',2,1,array[0,90,180,270],true,'phase7-dev-meadow-shelf','development_marker',true,1),
  ('75000000-0000-4000-8000-000000000006','round-leaf-planter','71000000-0000-4000-8000-000000000020','Round-leaf Planter',1,1,array[0,90,180,270],true,'phase7-dev-round-leaf-planter','development_marker',true,1)
on conflict (id) do nothing;

insert into public.cozy_home_templates (
  id, slug, name, template_version, min_x, min_y, max_x, max_y,
  spawn_x, spawn_y, exit_x, exit_y, blocked_cells, development_art, active
) values (
  '76000000-0000-4000-8000-000000000001',
  'starter-cottage-interior',
  'Starter Cottage',
  1, 0, 0, 10, 8, 5, 6, 5, 7,
  '[{"x":0,"y":0},{"x":9,"y":0},{"x":0,"y":7},{"x":9,"y":7}]'::jsonb,
  true,
  true
)
on conflict (id) do nothing;

insert into public.cozy_home_entrances (
  id, template_id, interaction_id, world_map_id, map_version_id,
  position_x, position_y, interaction_range, active, content_version
)
select
  '78000000-0000-4000-8000-000000000004',
  '76000000-0000-4000-8000-000000000001',
  'phase7-home-entrance',
  map.id,
  '79000000-0000-4000-8000-000000000001',
  19, 8, 1.5, true, 1
from public.world_maps map
where map.slug = 'lantern-square'
on conflict (id) do nothing;

create or replace function private.cozy_home_template_json(template public.cozy_home_templates)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', template.id,
    'slug', template.slug,
    'name', template.name,
    'templateVersion', template.template_version,
    'bounds', jsonb_build_object(
      'minX', template.min_x, 'minY', template.min_y,
      'maxX', template.max_x, 'maxY', template.max_y
    ),
    'spawn', jsonb_build_object('x', template.spawn_x, 'y', template.spawn_y),
    'exit', jsonb_build_object('x', template.exit_x, 'y', template.exit_y),
    'blockedCells', template.blocked_cells,
    'developmentArt', template.development_art,
    'active', template.active
  );
$$;

create or replace function private.cozy_placed_furniture_json(placement public.player_home_furniture)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', placement.id,
    'furnitureSlug', furniture.slug,
    'x', placement.grid_x,
    'y', placement.grid_y,
    'rotation', placement.rotation,
    'stateVersion', placement.state_version,
    'placedAt', placement.placed_at,
    'updatedAt', placement.updated_at
  )
  from public.cozy_furniture_definitions furniture
  where furniture.id = placement.furniture_definition_id;
$$;

create or replace function private.cozy_player_home_json(home public.player_homes)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', home.id,
    'ownerPlayerId', home.player_profile_id,
    'template', private.cozy_home_template_json(template),
    'placements', coalesce((
      select jsonb_agg(private.cozy_placed_furniture_json(placement)
        order by placement.updated_at, placement.id)
      from public.player_home_furniture placement
      where placement.player_home_id = home.id
    ), '[]'::jsonb),
    'returnDestination', jsonb_build_object(
      'mapId', return_map.slug,
      'mapVersionId', home.return_map_version_id,
      'x', home.return_position_x,
      'y', home.return_position_y,
      'facingDirection', home.return_facing_direction
    ),
    'stateVersion', home.state_version,
    'createdAt', home.created_at,
    'updatedAt', home.updated_at
  )
  from public.cozy_home_templates template, public.world_maps return_map
  where template.id = home.template_id and return_map.id = home.return_world_map_id;
$$;

create or replace function private.ensure_player_home(p_player_profile_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  profile public.player_profiles%rowtype;
  home public.player_homes%rowtype;
  starter_furniture public.cozy_furniture_definitions%rowtype;
  grant_key text;
begin
  select * into strict profile
  from public.player_profiles where id = p_player_profile_id for update;
  insert into public.player_homes (
    player_profile_id, template_id, return_world_map_id, return_map_version_id,
    return_position_x, return_position_y, return_facing_direction
  )
  select profile.id, template.id, map.id,
    coalesce(profile.current_map_version_id, map.active_published_version_id),
    profile.safe_position_x, profile.safe_position_y, profile.facing_direction
  from public.cozy_home_templates template
  join public.world_maps map on map.slug = profile.current_map_id
  where template.slug = 'starter-cottage-interior' and template.active
  on conflict (player_profile_id) do nothing;

  select * into strict home
  from public.player_homes where player_profile_id = profile.id for update;
  if home.starter_furniture_granted_at is null then
    select * into strict starter_furniture
    from public.cozy_furniture_definitions where slug = 'willow-chair';
    grant_key := 'phase7-starter-furniture:' || profile.id::text;
    if not private.cozy_add_item(
      profile.id, starter_furniture.item_definition_id, 1,
      'starter_grant', home.id::text, grant_key, grant_key
    ) then
      raise exception using errcode = '23514', message = 'STARTER_FURNITURE_GRANT_FAILED';
    end if;
    update public.player_homes
    set starter_furniture_granted_at = now(), state_version = state_version + 1
    where id = home.id;
  end if;
end;
$$;

create or replace function private.cozy_furniture_placement_valid(
  p_home_id uuid,
  p_excluded_placement_id uuid,
  p_furniture_definition_id uuid,
  p_x integer,
  p_y integer,
  p_rotation integer
)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  home public.player_homes%rowtype;
  template public.cozy_home_templates%rowtype;
  furniture public.cozy_furniture_definitions%rowtype;
  width integer;
  height integer;
  blocked jsonb;
  existing record;
  existing_width integer;
  existing_height integer;
begin
  select * into strict home from public.player_homes where id = p_home_id;
  select * into strict template from public.cozy_home_templates where id = home.template_id;
  select * into strict furniture
  from public.cozy_furniture_definitions where id = p_furniture_definition_id and active;
  if not (p_rotation = any(furniture.supported_rotations)) then return false; end if;
  width := case when p_rotation in (90,270) then furniture.footprint_height else furniture.footprint_width end;
  height := case when p_rotation in (90,270) then furniture.footprint_width else furniture.footprint_height end;
  if p_x < template.min_x or p_y < template.min_y
     or p_x + width > template.max_x or p_y + height > template.max_y then
    return false;
  end if;
  -- Keep template blocks and the three-cell spawn/exit corridor clear.
  for blocked in select value from jsonb_array_elements(template.blocked_cells) loop
    if (blocked ->> 'x')::integer >= p_x and (blocked ->> 'x')::integer < p_x + width
       and (blocked ->> 'y')::integer >= p_y and (blocked ->> 'y')::integer < p_y + height then
      return false;
    end if;
  end loop;
  if template.spawn_x >= p_x and template.spawn_x < p_x + width
     and template.spawn_y >= p_y and template.spawn_y < p_y + height then return false; end if;
  if template.exit_x >= p_x and template.exit_x < p_x + width
     and template.exit_y >= p_y and template.exit_y < p_y + height then return false; end if;
  if template.exit_x >= p_x and template.exit_x < p_x + width
     and template.exit_y - 2 >= p_y and template.exit_y - 2 < p_y + height then return false; end if;

  for existing in
    select placement.*, definition.footprint_width, definition.footprint_height
    from public.player_home_furniture placement
    join public.cozy_furniture_definitions definition
      on definition.id = placement.furniture_definition_id
    where placement.player_home_id = p_home_id
      and (p_excluded_placement_id is null or placement.id <> p_excluded_placement_id)
  loop
    existing_width := case when existing.rotation in (90,270)
      then existing.footprint_height else existing.footprint_width end;
    existing_height := case when existing.rotation in (90,270)
      then existing.footprint_width else existing.footprint_height end;
    if p_x < existing.grid_x + existing_width and p_x + width > existing.grid_x
       and p_y < existing.grid_y + existing_height and p_y + height > existing.grid_y then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

alter function public.bootstrap_player_cozy_gameplay(text,text,text)
  rename to bootstrap_player_cozy_gameplay_phase7b;
revoke all on function public.bootstrap_player_cozy_gameplay_phase7b(text,text,text)
  from public, anon, authenticated, service_role;

create or replace function public.bootstrap_player_cozy_gameplay(
  p_wallet_address text, p_idempotency_key text, p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare result jsonb; player_id uuid;
begin
  result := public.bootstrap_player_cozy_gameplay_phase7b(
    p_wallet_address, p_idempotency_key, p_request_id
  );
  if result ->> 'status' = 'loaded' then
    select id into strict player_id from public.player_profiles where wallet_address = p_wallet_address;
    perform private.ensure_player_home(player_id);
    result := jsonb_set(result, '{inventory}', private.cozy_inventory_json(player_id));
    result := jsonb_set(result, '{quickbar}', private.cozy_quickbar_json(player_id));
  end if;
  return result;
end;
$$;

create or replace function public.get_player_home(p_wallet_address text, p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; config public.cozy_gameplay_config%rowtype;
begin
  if p_wallet_address is null or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_READ_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  if not private.cozy_player_bootstrapped(profile.id) then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_read',config.read_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  select * into home from public.player_homes where player_profile_id=profile.id;
  if not found then return jsonb_build_object('status','bootstrap_required'); end if;
  return jsonb_build_object(
    'status','loaded','home',private.cozy_player_home_json(home),
    'location',case when home.inside_home then 'personal_home' else 'public_world' end
  );
end;
$$;

create or replace function private.cozy_home_access(
  p_wallet_address text,
  p_operation text,
  p_expected_home_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; entrance public.cozy_home_entrances%rowtype;
  receipt public.cozy_gameplay_idempotency%rowtype; config public.cozy_gameplay_config%rowtype;
  request_hash text; response jsonb;
begin
  if p_operation not in ('home_enter','home_exit') or p_expected_home_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_ACCESS_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into home from public.player_homes where player_profile_id=profile.id for update;
  if not found then return jsonb_build_object('status','bootstrap_required'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(
    p_operation||':'||p_expected_home_state_version::text,'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':'||p_operation||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation=p_operation and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  if home.state_version<>p_expected_home_state_version then return jsonb_build_object('status','state_conflict'); end if;

  if p_operation='home_enter' then
    if home.inside_home then return jsonb_build_object('status','state_conflict'); end if;
    select * into entrance from public.cozy_home_entrances
    where template_id=home.template_id and active;
    if not found or profile.current_map_id<>(select slug from public.world_maps where id=entrance.world_map_id)
       or profile.current_map_version_id is distinct from entrance.map_version_id
       or sqrt(power(profile.safe_position_x-entrance.position_x,2)+power(profile.safe_position_y-entrance.position_y,2))>entrance.interaction_range
      then return jsonb_build_object('status','home_access_denied'); end if;
    update public.player_homes set
      return_world_map_id=entrance.world_map_id,
      return_map_version_id=profile.current_map_version_id,
      return_position_x=profile.safe_position_x,
      return_position_y=profile.safe_position_y,
      return_facing_direction=profile.facing_direction,
      inside_home=true,
      state_version=state_version+1
    where id=home.id returning * into home;
  else
    if not home.inside_home then return jsonb_build_object('status','state_conflict'); end if;
    update public.player_homes set inside_home=false,state_version=state_version+1
    where id=home.id returning * into home;
  end if;
  response:=jsonb_build_object(
    'status','updated','home',private.cozy_player_home_json(home),
    'location',case when home.inside_home then 'personal_home' else 'public_world' end,
    'replayed',false
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,p_operation,p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.enter_player_home(
  p_wallet_address text,p_expected_home_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_home_access(
    p_wallet_address,'home_enter',p_expected_home_state_version,p_idempotency_key,p_request_id
  );
$$;

create or replace function public.exit_player_home(
  p_wallet_address text,p_expected_home_state_version integer,p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_home_access(
    p_wallet_address,'home_exit',p_expected_home_state_version,p_idempotency_key,p_request_id
  );
$$;

create or replace function private.cozy_furniture_mutation(
  p_wallet_address text,
  p_operation text,
  p_home_id uuid,
  p_placement_id uuid,
  p_inventory_stack_id uuid,
  p_furniture_slug text,
  p_x integer,
  p_y integer,
  p_rotation integer,
  p_expected_home_state_version integer,
  p_expected_placement_state_version integer,
  p_idempotency_key text,
  p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare profile public.player_profiles%rowtype; moderation public.player_moderation_states%rowtype;
  selected_rows record; home public.player_homes%rowtype; furniture public.cozy_furniture_definitions%rowtype;
  placement public.player_home_furniture%rowtype; stack public.player_inventory_stacks%rowtype;
  inventory_state public.player_inventory_state%rowtype; receipt public.cozy_gameplay_idempotency%rowtype;
  config public.cozy_gameplay_config%rowtype; request_hash text; response jsonb;
begin
  if p_operation not in ('furniture_place','furniture_move','furniture_rotate','furniture_remove')
     or p_home_id is null or p_expected_home_state_version < 1
     or p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
     or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]+$'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_FURNITURE_REQUEST'; end if;
  select p as profile_row,m as moderation_row into selected_rows
  from public.player_profiles p join public.player_moderation_states m on m.player_profile_id=p.id
  where p.wallet_address=p_wallet_address for update of p,m;
  if not found then return jsonb_build_object('status','not_found'); end if;
  profile:=selected_rows.profile_row;moderation:=selected_rows.moderation_row;
  if moderation.status='suspended' then return jsonb_build_object('status','suspended'); end if;
  if moderation.rename_required then return jsonb_build_object('status','rename_required'); end if;
  select * into home from public.player_homes
  where id=p_home_id and player_profile_id=profile.id for update;
  if not found or not home.inside_home then return jsonb_build_object('status','home_access_denied'); end if;
  select * into strict config from public.cozy_gameplay_config where id=1;
  if not private.claim_cozy_gameplay_rate_limit(profile.id,'home_write',config.mutation_rate_limit)
    then return jsonb_build_object('status','rate_limited'); end if;
  request_hash:=encode(extensions.digest(convert_to(concat_ws(':',
    p_operation,p_home_id,p_placement_id,p_inventory_stack_id,p_furniture_slug,
    p_x,p_y,p_rotation,p_expected_home_state_version,p_expected_placement_state_version
  ),'UTF8'),'sha256'),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cozy-idem:'||profile.id::text||':'||p_operation||':'||p_idempotency_key,0));
  select * into receipt from public.cozy_gameplay_idempotency
  where player_profile_id=profile.id and operation=p_operation and idempotency_key=p_idempotency_key;
  if found then
    if receipt.request_hash<>request_hash then return jsonb_build_object('status','request_already_processed'); end if;
    return jsonb_set(jsonb_set(receipt.response,'{status}','"replayed"'::jsonb),'{replayed}','true'::jsonb);
  end if;
  if home.state_version<>p_expected_home_state_version then return jsonb_build_object('status','state_conflict'); end if;

  if p_operation='furniture_place' then
    if p_inventory_stack_id is null or p_furniture_slug is null or p_x is null or p_y is null
       or p_rotation not in (0,90,180,270) then return jsonb_build_object('status','invalid_placement'); end if;
    select * into furniture from public.cozy_furniture_definitions
    where slug=p_furniture_slug and active;
    if not found then return jsonb_build_object('status','item_unavailable'); end if;
    select * into stack from public.player_inventory_stacks
    where id=p_inventory_stack_id and player_profile_id=profile.id
      and item_definition_id=furniture.item_definition_id for update;
    if not found then return jsonb_build_object('status','item_unavailable'); end if;
    if not private.cozy_furniture_placement_valid(home.id,null,furniture.id,p_x,p_y,p_rotation)
      then return jsonb_build_object('status','invalid_placement'); end if;
    if not private.cozy_remove_item(profile.id,furniture.item_definition_id,1,
      'furniture_placement',home.id::text,p_operation||':'||p_idempotency_key,p_request_id)
      then return jsonb_build_object('status','item_unavailable'); end if;
    insert into public.player_home_furniture(
      player_home_id,furniture_definition_id,grid_x,grid_y,rotation
    ) values(home.id,furniture.id,p_x,p_y,p_rotation) returning * into placement;
  else
    if p_placement_id is null or p_expected_placement_state_version is null
      then return jsonb_build_object('status','invalid_placement'); end if;
    select * into placement from public.player_home_furniture
    where id=p_placement_id and player_home_id=home.id for update;
    if not found then return jsonb_build_object('status','invalid_placement'); end if;
    if placement.state_version<>p_expected_placement_state_version
      then return jsonb_build_object('status','state_conflict'); end if;
    select * into strict furniture from public.cozy_furniture_definitions
    where id=placement.furniture_definition_id;
    if p_operation='furniture_move' then
      if p_x is null or p_y is null or not private.cozy_furniture_placement_valid(
        home.id,placement.id,furniture.id,p_x,p_y,placement.rotation
      ) then return jsonb_build_object('status','invalid_placement'); end if;
      update public.player_home_furniture
      set grid_x=p_x,grid_y=p_y,state_version=state_version+1
      where id=placement.id returning * into placement;
    elsif p_operation='furniture_rotate' then
      if p_rotation not in (0,90,180,270) or not private.cozy_furniture_placement_valid(
        home.id,placement.id,furniture.id,placement.grid_x,placement.grid_y,p_rotation
      ) then return jsonb_build_object('status','invalid_placement'); end if;
      update public.player_home_furniture
      set rotation=p_rotation,state_version=state_version+1
      where id=placement.id returning * into placement;
    else
      if not private.cozy_can_add_item(profile.id,furniture.item_definition_id,1)
        then return jsonb_build_object('status','inventory_full'); end if;
      delete from public.player_home_furniture where id=placement.id;
      if not private.cozy_add_item(profile.id,furniture.item_definition_id,1,
        'furniture_removal',home.id::text,p_operation||':'||p_idempotency_key,p_request_id)
        then raise exception 'FURNITURE_RETURN_FAILED'; end if;
    end if;
  end if;
  update public.player_homes set state_version=state_version+1
  where id=home.id returning * into home;
  select * into strict inventory_state from public.player_inventory_state
  where player_profile_id=profile.id;
  response:=jsonb_build_object(
    'status','updated','home',private.cozy_player_home_json(home),
    'inventoryStateVersion',inventory_state.state_version,'replayed',false
  );
  insert into public.cozy_gameplay_idempotency(
    player_profile_id,operation,idempotency_key,request_hash,response,request_id
  ) values(profile.id,p_operation,p_idempotency_key,request_hash,response,p_request_id);
  return response;
end;
$$;

create or replace function public.place_player_home_furniture(
  p_wallet_address text,p_home_id uuid,p_inventory_stack_id uuid,p_furniture_slug text,
  p_x integer,p_y integer,p_rotation integer,p_expected_home_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_furniture_mutation(p_wallet_address,'furniture_place',p_home_id,null,
    p_inventory_stack_id,p_furniture_slug,p_x,p_y,p_rotation,p_expected_home_state_version,
    null,p_idempotency_key,p_request_id);
$$;

create or replace function public.move_player_home_furniture(
  p_wallet_address text,p_home_id uuid,p_placement_id uuid,p_x integer,p_y integer,
  p_expected_home_state_version integer,p_expected_placement_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_furniture_mutation(p_wallet_address,'furniture_move',p_home_id,p_placement_id,
    null,null,p_x,p_y,null,p_expected_home_state_version,p_expected_placement_state_version,
    p_idempotency_key,p_request_id);
$$;

create or replace function public.rotate_player_home_furniture(
  p_wallet_address text,p_home_id uuid,p_placement_id uuid,p_rotation integer,
  p_expected_home_state_version integer,p_expected_placement_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_furniture_mutation(p_wallet_address,'furniture_rotate',p_home_id,p_placement_id,
    null,null,null,null,p_rotation,p_expected_home_state_version,p_expected_placement_state_version,
    p_idempotency_key,p_request_id);
$$;

create or replace function public.remove_player_home_furniture(
  p_wallet_address text,p_home_id uuid,p_placement_id uuid,
  p_expected_home_state_version integer,p_expected_placement_state_version integer,
  p_idempotency_key text,p_request_id text
)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select private.cozy_furniture_mutation(p_wallet_address,'furniture_remove',p_home_id,p_placement_id,
    null,null,null,null,null,p_expected_home_state_version,p_expected_placement_state_version,
    p_idempotency_key,p_request_id);
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'cozy_furniture_definitions','cozy_home_templates','cozy_home_entrances',
    'player_homes','player_home_furniture'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('alter table public.%I force row level security',table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role',table_name);
  end loop;
end;
$$;

revoke all on function private.cozy_home_template_json(public.cozy_home_templates) from public,anon,authenticated,service_role;
revoke all on function private.cozy_placed_furniture_json(public.player_home_furniture) from public,anon,authenticated,service_role;
revoke all on function private.cozy_player_home_json(public.player_homes) from public,anon,authenticated,service_role;
revoke all on function private.ensure_player_home(uuid) from public,anon,authenticated,service_role;
revoke all on function private.cozy_furniture_placement_valid(uuid,uuid,uuid,integer,integer,integer) from public,anon,authenticated,service_role;
revoke all on function private.cozy_home_access(text,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function private.cozy_furniture_mutation(text,text,uuid,uuid,uuid,text,integer,integer,integer,integer,integer,text,text) from public,anon,authenticated,service_role;

revoke all on function public.bootstrap_player_cozy_gameplay(text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_player_home(text,text) from public,anon,authenticated,service_role;
revoke all on function public.enter_player_home(text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.exit_player_home(text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.place_player_home_furniture(text,uuid,uuid,text,integer,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.move_player_home_furniture(text,uuid,uuid,integer,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.rotate_player_home_furniture(text,uuid,uuid,integer,integer,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.remove_player_home_furniture(text,uuid,uuid,integer,integer,text,text) from public,anon,authenticated,service_role;

grant execute on function public.bootstrap_player_cozy_gameplay(text,text,text) to service_role;
grant execute on function public.get_player_home(text,text) to service_role;
grant execute on function public.enter_player_home(text,integer,text,text) to service_role;
grant execute on function public.exit_player_home(text,integer,text,text) to service_role;
grant execute on function public.place_player_home_furniture(text,uuid,uuid,text,integer,integer,integer,integer,text,text) to service_role;
grant execute on function public.move_player_home_furniture(text,uuid,uuid,integer,integer,integer,integer,text,text) to service_role;
grant execute on function public.rotate_player_home_furniture(text,uuid,uuid,integer,integer,integer,text,text) to service_role;
grant execute on function public.remove_player_home_furniture(text,uuid,uuid,integer,integer,text,text) to service_role;

create or replace function private.cozy_furniture_definition_json(
  furniture public.cozy_furniture_definitions
)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',furniture.id,'slug',furniture.slug,'itemSlug',item.slug,'name',furniture.name,
    'footprintWidth',furniture.footprint_width,'footprintHeight',furniture.footprint_height,
    'supportedRotations',to_jsonb(furniture.supported_rotations),
    'blocksMovement',furniture.blocks_movement,'assetRef',furniture.asset_ref,
    'assetReadiness',furniture.asset_readiness,'active',furniture.active,
    'contentVersion',furniture.content_version
  ) from public.cozy_item_definitions item where item.id=furniture.item_definition_id;
$$;

create or replace function public.get_admin_player_economy(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_player_profile_id uuid,p_page integer,p_page_size integer
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account public.player_dust_accounts%rowtype; total_count integer;
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'players.read');
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'economy.read');
  if p_page<1 or p_page_size not in (10,50,100) then
    raise exception using errcode='22023',message='INVALID_ADMIN_COZY_PAGE'; end if;
  if not exists(select 1 from public.player_profiles where id=p_player_profile_id)
    then return jsonb_build_object('status','not_found'); end if;
  select * into account from public.player_dust_accounts where player_profile_id=p_player_profile_id;
  if not found then
    return jsonb_build_object('status','loaded','initialized',false,'account',null,
      'items','[]'::jsonb,'pagination',jsonb_build_object(
        'page',p_page,'pageSize',p_page_size,'total',0,'totalPages',0));
  end if;
  select count(*) into total_count from public.player_dust_ledger
  where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'status','loaded','initialized',true,'account',private.cozy_dust_account_json(account),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',entry.id,'delta',entry.delta,'resultingBalance',entry.resulting_balance,
      'reason',entry.reason,'referenceType',entry.reference_type,'referenceId',entry.reference_id,
      'createdAt',entry.created_at
    ) order by entry.entry_number desc)
      from (select * from public.player_dust_ledger
        where player_profile_id=p_player_profile_id order by entry_number desc
        limit p_page_size offset (p_page-1)*p_page_size) entry),'[]'::jsonb),
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total_count,
      'totalPages',case when total_count=0 then 0 else ceil(total_count::numeric/p_page_size)::integer end)
  );
end;
$$;

create or replace function public.get_admin_player_inventory(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,
  p_player_profile_id uuid,p_page integer,p_page_size integer
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare total_count integer;
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'players.read');
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'inventories.read');
  if p_page<1 or p_page_size not in (10,50,100) then
    raise exception using errcode='22023',message='INVALID_ADMIN_COZY_PAGE'; end if;
  if not exists(select 1 from public.player_profiles where id=p_player_profile_id)
    then return jsonb_build_object('status','not_found'); end if;
  if not exists(select 1 from public.player_inventory_state where player_profile_id=p_player_profile_id)
    then return jsonb_build_object('status','loaded','initialized',false,'inventory',null,
      'items','[]'::jsonb,'pagination',jsonb_build_object(
        'page',p_page,'pageSize',p_page_size,'total',0,'totalPages',0)); end if;
  select count(*) into total_count from public.player_inventory_history
  where player_profile_id=p_player_profile_id;
  return jsonb_build_object(
    'status','loaded','initialized',true,'inventory',private.cozy_inventory_json(p_player_profile_id),
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',entry.id,'itemSlug',item.slug,'delta',entry.delta,
      'resultingQuantity',entry.resulting_quantity,'reason',entry.reason,
      'referenceId',entry.reference_id,'createdAt',entry.created_at
    ) order by entry.entry_number desc)
      from (select * from public.player_inventory_history
        where player_profile_id=p_player_profile_id order by entry_number desc
        limit p_page_size offset (p_page-1)*p_page_size) entry
      join public.cozy_item_definitions item on item.id=entry.item_definition_id),'[]'::jsonb),
    'pagination',jsonb_build_object('page',p_page,'pageSize',p_page_size,'total',total_count,
      'totalPages',case when total_count=0 then 0 else ceil(total_count::numeric/p_page_size)::integer end)
  );
end;
$$;

create or replace function public.get_admin_player_cozy_gameplay(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_player_profile_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare home public.player_homes%rowtype; last_update timestamptz;
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'players.read');
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'cozy_gameplay.read');
  if not exists(select 1 from public.player_profiles where id=p_player_profile_id)
    then return jsonb_build_object('status','not_found'); end if;
  select * into home from public.player_homes where player_profile_id=p_player_profile_id;
  select greatest(
    coalesce((select max(updated_at) from public.player_farm_plots where player_profile_id=p_player_profile_id),'epoch'),
    coalesce(home.updated_at,'epoch')
  ) into last_update;
  return jsonb_build_object(
    'status','loaded','initialized',home.id is not null,
    'farm',jsonb_build_object(
      'total',(select count(*) from public.player_farm_plots where player_profile_id=p_player_profile_id),
      'ready',(select count(*) from public.player_farm_plots
        where player_profile_id=p_player_profile_id and ready_at is not null and ready_at<=now()),
      'occupied',(select count(*) from public.player_farm_plots
        where player_profile_id=p_player_profile_id and state<>'empty')
    ),
    'home',case when home.id is null then null else jsonb_build_object(
      'templateName',(select name from public.cozy_home_templates where id=home.template_id),
      'templateVersion',(select template_version from public.cozy_home_templates where id=home.template_id),
      'placedFurnitureCount',(select count(*) from public.player_home_furniture where player_home_id=home.id),
      'insideHome',home.inside_home
    ) end,
    'lastGameplayUpdate',case when last_update='epoch' then null else last_update end
  );
end;
$$;

create or replace function public.get_admin_gameplay_content(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'items.read');
  return jsonb_build_object(
    'status','loaded','contentVersion',1,
    'items',(select jsonb_agg(private.cozy_item_json(item) order by item.category,item.name)
      from public.cozy_item_definitions item),
    'crops',(select jsonb_agg(private.cozy_crop_json(crop) order by crop.name)
      from public.cozy_crop_definitions crop),
    'recipes',(select jsonb_agg(private.cozy_recipe_json(recipe) order by recipe.kind,recipe.name)
      from public.cozy_recipe_definitions recipe),
    'shops',(select jsonb_agg(private.cozy_shop_json(shop) order by shop.name)
      from public.cozy_shop_definitions shop),
    'offers',(select jsonb_agg(private.cozy_shop_offer_json(offer) order by offer.id)
      from public.cozy_shop_offers offer),
    'furniture',(select jsonb_agg(private.cozy_furniture_definition_json(furniture) order by furniture.name)
      from public.cozy_furniture_definitions furniture),
    'homeTemplates',(select jsonb_agg(private.cozy_home_template_json(template) order by template.name)
      from public.cozy_home_templates template)
  );
end;
$$;

revoke all on function private.cozy_furniture_definition_json(public.cozy_furniture_definitions) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_economy(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_inventory(uuid,uuid,text,uuid,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_player_cozy_gameplay(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_admin_gameplay_content(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_admin_player_economy(uuid,uuid,text,uuid,integer,integer) to service_role;
grant execute on function public.get_admin_player_inventory(uuid,uuid,text,uuid,integer,integer) to service_role;
grant execute on function public.get_admin_player_cozy_gameplay(uuid,uuid,text,uuid) to service_role;
grant execute on function public.get_admin_gameplay_content(uuid,uuid,text) to service_role;
