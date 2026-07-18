\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.phase11_lint_assert(condition boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(condition,false) then
    raise exception 'PHASE11_LINT_ASSERTION_FAILED: %',message;
  end if;
end;
$$;

select pg_temp.phase11_lint_assert(
  private.world_game_test_checklist_valid('{"movement":true,"assets_loaded":false}'::jsonb),
  'a bounded object containing boolean checklist entries remains valid'
);

select pg_temp.phase11_lint_assert(
  not private.world_game_test_checklist_valid(null)
  and not private.world_game_test_checklist_valid('[]'::jsonb)
  and not private.world_game_test_checklist_valid('{}'::jsonb)
  and not private.world_game_test_checklist_valid('{"Bad-Key":true}'::jsonb)
  and not private.world_game_test_checklist_valid('{"movement":"yes"}'::jsonb)
  and not private.world_game_test_checklist_valid(
    jsonb_build_object('movement',true,'padding',repeat('x',4097))
  ),
  'null, malformed, empty, non-boolean, and oversized checklist shapes remain rejected'
);

select pg_temp.phase11_lint_assert(
  (select procedure.provolatile='s'
   from pg_catalog.pg_proc as procedure
   join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
   where namespace.nspname='private'
     and procedure.proname='world_game_test_checklist_valid'
     and pg_catalog.pg_get_function_identity_arguments(procedure.oid)='p_checklist jsonb')
  and (select procedure.provolatile='s'
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='pg_catalog'
         and procedure.proname='pg_column_size'
         and pg_catalog.pg_get_function_identity_arguments(procedure.oid)='"any"')
  and (select procedure.provolatile='v'
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='public'
         and procedure.proname='record_admin_world_game_test_evidence'),
  'the checklist volatility matches pg_column_size and its mutating caller remains compatible'
);

select pg_temp.phase11_lint_assert(
  (select count(*)=9
   from pg_catalog.pg_proc as procedure
   join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
   where (namespace.nspname,procedure.proname) in (
     ('public','create_admin_recipe_successor'),
     ('public','transition_admin_progression_version'),
     ('public','request_admin_progression_correction'),
     ('public','run_progression_maintenance'),
     ('private','world_game_test_checklist_valid'),
     ('private','progression_apply_objective_event'),
     ('private','progression_grant_trusted_xp'),
     ('private','housing_progress_event'),
     ('public','save_player_home_layout')
   )
   and procedure.proconfig in (array['search_path='],array['search_path=""']))
  and (select count(*)=8
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
       where (namespace.nspname,procedure.proname) in (
         ('public','create_admin_recipe_successor'),
         ('public','transition_admin_progression_version'),
         ('public','request_admin_progression_correction'),
         ('public','run_progression_maintenance'),
         ('private','progression_apply_objective_event'),
         ('private','progression_grant_trusted_xp'),
         ('private','housing_progress_event'),
         ('public','save_player_home_layout')
       )
       and procedure.prosecdef)
  and (select not procedure.prosecdef
       from pg_catalog.pg_proc as procedure
       join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
       where namespace.nspname='private'
         and procedure.proname='world_game_test_checklist_valid'),
  'all repaired routines retain empty search_path and their original security mode'
);

select pg_temp.phase11_lint_assert(
  not has_function_privilege('anon',
    'public.create_admin_recipe_successor(uuid,uuid,text,uuid,uuid,integer,jsonb,text,text)',
    'EXECUTE')
  and not has_function_privilege('authenticated',
    'public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)',
    'EXECUTE')
  and has_function_privilege('service_role',
    'public.run_progression_maintenance(integer,text)','EXECUTE')
  and not has_function_privilege('service_role',
    'private.progression_apply_objective_event(uuid,text,uuid,uuid,text,integer,bigint,text)',
    'EXECUTE'),
  'existing narrow execution grants remain intact'
);

select pg_temp.phase11_lint_assert(
  pg_catalog.pg_get_functiondef(
    'private.progression_apply_objective_event(uuid,text,uuid,uuid,text,integer,bigint,text)'::regprocedure
  ) ~ '''requestId''\s*,\s*p_request_id'
  and pg_catalog.pg_get_functiondef(
    'private.housing_progress_event(uuid,text,uuid,text,text)'::regprocedure
  ) ~ '''requestId''\s*,\s*p_request_id'
  and pg_catalog.pg_get_functiondef(
    'public.run_progression_maintenance(integer,text)'::regprocedure
  ) ~* 'perform\s+private\.progression_settle_reward'
  and pg_catalog.pg_get_functiondef(
    'public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)'::regprocedure
  ) !~* 'template\s+public\.cozy_home_templates'
  and pg_catalog.pg_get_functiondef(
    'public.save_player_home_layout(text,uuid,integer,integer,integer,integer,integer,jsonb,uuid,text,text)'::regprocedure
  ) !~* 'placement\s+public\.player_home_furniture'
  and pg_catalog.pg_get_functiondef(
    'private.progression_grant_trusted_xp(uuid,text,uuid,text,integer,text)'::regprocedure
  ) !~* 'level_cursor\s+integer',
  'unused parameters and variables are repaired without changing callable contracts'
);

rollback;
