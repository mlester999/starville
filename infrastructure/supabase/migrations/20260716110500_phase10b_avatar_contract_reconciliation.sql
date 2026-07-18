-- Starville Phase 10B: reconcile the already-hosted Phase 10A definition shape
-- with the category and layer fields consumed by the current shared contracts.
--
-- The hosted 20260716100000 migration predates these two columns, while the
-- current local migration text already contains them. Keep the applied file
-- immutable and make this migration safe in both histories. Public cosmetic
-- naming remains definition-owned through avatar_content_definitions.display_name;
-- this migration deliberately does not add avatar_content_versions.public_name.

alter table public.avatar_content_definitions
  add column if not exists category text,
  add column if not exists content_layer text;

update public.avatar_content_definitions
set
  category = coalesce(category, case content_type
    when 'base_body' then 'body'
    when 'skin_tone' then 'skin'
    when 'face' then 'face'
    when 'eyes' then 'face'
    when 'eyebrows' then 'face'
    when 'hair' then 'hair'
    when 'top' then 'outfit'
    when 'bottom' then 'outfit'
    when 'footwear' then 'footwear'
    when 'accessory' then 'accessory'
    when 'activity_override' then 'activity'
    when 'shadow' then 'rendering'
  end),
  content_layer = coalesce(content_layer, case content_type
    when 'base_body' then 'base_body'
    when 'skin_tone' then 'skin_tone'
    when 'face' then 'face'
    when 'eyes' then 'eyes'
    when 'eyebrows' then 'eyebrows'
    when 'hair' then 'hair_front'
    when 'top' then 'top'
    when 'bottom' then 'bottom'
    when 'footwear' then 'footwear'
    when 'accessory' then 'head_accessory'
    when 'activity_override' then 'activity_override'
    when 'shadow' then 'shadow'
  end)
where category is null or content_layer is null;

alter table public.avatar_content_definitions
  alter column category set not null,
  alter column content_layer set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avatar_content_definitions'::regclass
      and conname = 'avatar_content_definitions_category_check'
  ) then
    alter table public.avatar_content_definitions
      add constraint avatar_content_definitions_category_check check (category in (
        'body', 'skin', 'face', 'hair', 'outfit', 'footwear', 'accessory',
        'activity', 'rendering'
      ));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avatar_content_definitions'::regclass
      and conname = 'avatar_content_definitions_content_layer_check'
  ) then
    alter table public.avatar_content_definitions
      add constraint avatar_content_definitions_content_layer_check check (content_layer in (
        'base_body', 'skin_tone', 'face', 'eyes', 'eyebrows', 'hair_back', 'hair_front',
        'top', 'bottom', 'footwear', 'head_accessory', 'face_accessory',
        'back_accessory', 'handheld_visual', 'activity_override', 'shadow'
      ));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.avatar_content_definitions'::regclass
      and conname = 'avatar_content_definitions_layer_type_check'
  ) then
    alter table public.avatar_content_definitions
      add constraint avatar_content_definitions_layer_type_check check (
        (content_layer = 'base_body' and content_type = 'base_body' and category = 'body')
        or (content_layer = 'skin_tone' and content_type = 'skin_tone' and category = 'skin')
        or (content_layer in ('face', 'eyes', 'eyebrows')
            and content_type = content_layer and category = 'face')
        or (content_layer in ('hair_back', 'hair_front')
            and content_type = 'hair' and category = 'hair')
        or (content_layer in ('top', 'bottom')
            and content_type = content_layer and category = 'outfit')
        or (content_layer = 'footwear'
            and content_type = 'footwear' and category = 'footwear')
        or (content_layer in (
              'head_accessory', 'face_accessory', 'back_accessory', 'handheld_visual'
            ) and content_type = 'accessory' and category = 'accessory')
        or (content_layer = 'activity_override'
            and content_type = 'activity_override' and category = 'activity')
        or (content_layer = 'shadow'
            and content_type = 'shadow' and category = 'rendering')
      );
  end if;
end;
$$;

comment on column public.avatar_content_definitions.category is
  'Stable Phase 10B wardrobe grouping owned by the cosmetic definition.';
comment on column public.avatar_content_definitions.content_layer is
  'Stable avatar composition layer owned by the cosmetic definition.';

-- The hosted Phase 10A settings row used the earlier creator/editor flags.
-- Add the current authoritative fields without rewriting the applied migration,
-- and preserve an explicit hosted disable when those legacy columns exist.
alter table public.avatar_settings
  add column if not exists customization_enabled boolean not null default true,
  add column if not exists creator_required_for_new_players boolean not null default true;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'avatar_settings'
      and column_name = 'creator_enabled'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'avatar_settings'
      and column_name = 'editor_enabled'
  ) then
    execute $reconcile$
      update public.avatar_settings
      set customization_enabled = creator_enabled and editor_enabled,
          creator_required_for_new_players = creator_enabled
    $reconcile$;
  end if;
end;
$$;

comment on column public.avatar_settings.customization_enabled is
  'Authoritative shared switch for avatar creation and later cosmetic appearance edits.';
comment on column public.avatar_settings.creator_required_for_new_players is
  'Requires the canonical avatar creator before first playable-world entry.';
