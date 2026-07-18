begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;
select no_plan();

select has_table('public', 'player_cosmetic_ownership', 'authoritative cosmetic ownership exists');
select has_table('public', 'cosmetic_ownership_receipts', 'immutable ownership receipts exist');
select has_table('public', 'player_cosmetic_loadouts', 'server-side saved outfits exist');
select has_table('public', 'cosmetic_emote_definitions', 'bounded emote definitions exist');
select has_table('public', 'player_emote_activations', 'authoritative emote activations exist');
select has_table('public', 'cosmetic_collection_definitions', 'cosmetic collections exist');
select has_table(
  'public', 'cosmetic_collection_reward_receipts',
  'exact-once collection reward receipts exist'
);
select has_table('public', 'cosmetic_shop_settings', 'disabled cosmetic shop settings exist');
select has_table('public', 'cosmetic_shop_offer_drafts', 'draft-only cosmetic offers exist');

select has_check(
  'public', 'cosmetic_acquisition_sources', 'cosmetic_acquisition_sources_key_check',
  'acquisition source keys have a stable 3-80 character and format constraint'
);
select has_check(
  'public', 'cosmetic_ownership_receipts', 'cosmetic_ownership_receipts_reason_category_check',
  'grant, revocation, and reward reasons use closed categories'
);
select has_check(
  'public', 'player_cosmetic_loadouts', 'player_cosmetic_loadouts_name_check',
  'saved outfit names are bounded and non-executable'
);
select has_check(
  'public', 'cosmetic_emote_definitions', 'cosmetic_emote_definitions_key_check',
  'emote keys have the canonical 3-80 character boundary'
);
select has_check(
  'public', 'player_emote_entitlements', 'player_emote_entitlements_key_check',
  'owned emote keys retain the canonical boundary'
);
select has_check(
  'public', 'cosmetic_collection_definitions', 'cosmetic_collection_definitions_key_check',
  'collection keys retain the canonical boundary'
);
select has_check(
  'public', 'cosmetic_shop_offer_drafts', 'cosmetic_shop_offer_drafts_key_check',
  'draft offer keys retain the canonical boundary'
);

select ok(
  not exists (
    select 1 from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'cosmetic_acquisition_sources', 'player_cosmetic_ownership',
        'cosmetic_ownership_receipts', 'player_cosmetic_loadouts',
        'cosmetic_emote_definitions', 'player_emote_entitlements', 'player_emote_wheels',
        'player_emote_activations', 'cosmetic_collection_definitions',
        'cosmetic_collection_members', 'cosmetic_collection_reward_receipts',
        'cosmetic_shop_settings', 'cosmetic_shop_offer_drafts', 'cosmetic_settings',
        'cosmetic_idempotency'
      )
      and (not relation.relrowsecurity or not relation.relforcerowsecurity)
  ),
  'all Phase 10B tables force RLS'
);

select is(
  (select provolatile::text
   from pg_proc
   where oid = 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure),
  's',
  'cosmetic selection validator is truthfully STABLE'
);
select is(
  (select provolatile::text
   from pg_proc
   where oid = 'pg_catalog.pg_column_size("any")'::regprocedure),
  's',
  'cosmetic selection validator STABLE dependency is cataloged STABLE'
);
select ok(
  (select proisstrict and prosecdef and proconfig @> array['search_path=""']
   from pg_proc
   where oid = 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure)
    and not has_function_privilege(
      'service_role', 'private.valid_cosmetic_selection_shape(jsonb)', 'execute'
    ),
  'cosmetic selection validator retains strictness, SECURITY DEFINER, safe search path, and grants'
);
select ok(
  not exists (
    select 1
    from pg_proc routine
    where routine.prokind = 'f'
      and routine.oid <> 'private.valid_cosmetic_selection_shape(jsonb)'::regprocedure
      and position('private.valid_cosmetic_selection_shape' in pg_get_functiondef(routine.oid)) > 0
  ),
  'no function caller has a volatility declaration to repair'
);
select ok(
  private.valid_cosmetic_selection_shape(
    '{"bodyPresetKey":"meadow-frame","accessoryKeys":["phase10b-starter-hat"]}'::jsonb
  )
    and not private.valid_cosmetic_selection_shape(
      '{"bodyPresetKey":"https://invalid.example","accessoryKeys":[]}'::jsonb
    )
    and private.valid_cosmetic_selection_shape(null::jsonb) is null
    and not private.valid_cosmetic_selection_shape('null'::jsonb)
    and not private.valid_cosmetic_selection_shape('[]'::jsonb)
    and not private.valid_cosmetic_selection_shape(
      '{"bodyPresetKey":"meadow-frame"}'::jsonb
    )
    and not private.valid_cosmetic_selection_shape(
      '{"bodyPresetKey":"meadow-frame","accessoryKeys":[{}]}'::jsonb
    ),
  'cosmetic selection validation preserves valid, invalid, null, and malformed behavior'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.get_player_cosmetic_wardrobe(text,text,text)', 'execute'
  )
    and has_function_privilege(
      'service_role', 'public.get_player_cosmetic_wardrobe(text,text,text)', 'execute'
    ),
  'Wardrobe reads are available only through the trusted service boundary'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text)',
      'execute'
    ),
  'admin grants have one narrow service-role signature'
);
select ok(
  (select count(*) = 1
   from pg_proc routine
   join pg_namespace namespace on namespace.oid = routine.pronamespace
   where namespace.nspname = 'public' and routine.proname = 'grant_admin_player_cosmetic')
    and (select provolatile = 'v' and prosecdef and proconfig @> array['search_path=""']
         from pg_proc
         where oid =
           'public.grant_admin_player_cosmetic(uuid,uuid,text,uuid,text,text,text,text,text)'::regprocedure),
  'grant RPC is uniquely volatile, SECURITY DEFINER, and uses an empty search path'
);
select ok(
  not exists (
    select 1 from pg_proc routine
    join pg_namespace namespace on namespace.oid = routine.pronamespace
    where namespace.nspname = 'public'
      and routine.proname ~ '(purchase|buy).*cosmetic|cosmetic.*(purchase|buy)'
  ),
  'no cosmetic purchase RPC exists'
);
select ok(
  (select not enabled and lifecycle_status = 'disabled_preview'
          and currency_key = 'DUST' and not purchase_available
   from public.cosmetic_shop_settings where game_key = 'starville')
    and not exists (
      select 1 from public.cosmetic_shop_offer_drafts where lifecycle_status <> 'draft'
    ),
  'the DUST cosmetic shop is disabled with no published offers'
);
select ok(
  (select count(*) = 6 from public.cosmetic_emote_definitions
   where lifecycle_status = 'active' and starter_entitlement and system_defined)
    and not exists (
      select 1 from public.cosmetic_emote_definitions
      where char_length(emote_key) not between 3 and 80
    ),
  'six bounded starter emotes remain active'
);
select ok(
  not exists (
    select 1 from public.cosmetic_acquisition_sources
    where char_length(source_key) not between 3 and 80
  ),
  'all seeded acquisition source keys satisfy their canonical boundary'
);

select * from finish();
rollback;
