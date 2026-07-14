begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_catalog;

select plan(35);

select has_table('public', 'game_platforms', 'game platform registry exists');
select has_table('public', 'game_platform_configuration_versions', 'version authority exists');
select has_table('public', 'game_platform_active_configuration', 'active pointer exists');
select has_table('public', 'game_platform_configuration_audit', 'append-only audit exists');
select has_table('public', 'game_platform_configuration_rate_limits', 'mutation rate-limit authority exists');
select has_function('public', 'get_active_platform_configuration', 'public runtime delivery exists');
select has_function('public', 'get_admin_platform_configuration', 'admin directory RPC exists');
select has_function('public', 'preview_admin_platform_configuration', 'exact preview RPC exists');
select has_function('public', 'create_admin_platform_configuration_draft', 'draft creation RPC exists');
select has_function('public', 'update_admin_platform_configuration_draft', 'draft update RPC exists');
select has_function('public', 'validate_admin_platform_configuration', 'validation RPC exists');
select has_function('public', 'publish_admin_platform_configuration', 'publication RPC exists');
select has_function('public', 'rollback_admin_platform_configuration', 'rollback RPC exists');
select has_function('private', 'claim_platform_configuration_rate_limit', 'trusted mutation rate limiter exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platforms'::regclass), 'game platforms force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_versions'::regclass), 'versions force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_active_configuration'::regclass), 'active pointers force RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_audit'::regclass), 'configuration audit forces RLS');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_rate_limits'::regclass), 'rate limits force RLS');
select is((select count(*)::integer from public.admin_permissions where key like 'platform_configuration.%'), 8, 'exact platform permission catalog is seeded');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'read_only_analyst' and permission.key like 'platform_configuration.%'), 1, 'Read-only Analyst receives one platform permission');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'read_only_analyst' and permission.key like 'platform_configuration.%' and permission.key <> 'platform_configuration.read'), 0, 'Read-only Analyst cannot mutate or read sensitive platform audit');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'game_administrator' and permission.key like 'platform_configuration.%'), 8, 'Game Administrator retains the full platform lifecycle');
select is((select count(*)::integer from public.admin_role_permissions mapping join public.admin_roles role on role.id = mapping.role_id join public.admin_permissions permission on permission.id = mapping.permission_id where role.key = 'content_manager' and permission.key in ('platform_configuration.publish', 'platform_configuration.rollback')), 0, 'Content Manager cannot publish or roll back');
select is(public.get_active_platform_configuration('starville') #>> '{configuration,branding,fullGameName}', 'Starville', 'published baseline preserves the Starville name');
select is((select count(*)::integer from public.game_platform_configuration_versions where lifecycle_status = 'published'), 1, 'exactly one initial version is published');
select is((select count(*)::integer from public.game_platform_active_configuration), 1, 'exactly one active pointer exists');
select is((select provolatile::text from pg_proc routine join pg_namespace namespace on namespace.oid = routine.pronamespace where namespace.nspname = 'private' and routine.proname = 'valid_platform_configuration'), 'i', 'CHECK validator is truthfully immutable');
select has_trigger('public', 'game_platform_configuration_versions', 'platform_configuration_version_immutable', 'published configuration content has an immutability trigger');
select has_trigger('public', 'game_platform_configuration_audit', 'platform_configuration_audit_immutable', 'audit history is append-only');
select ok(not has_table_privilege('anon', 'public.game_platform_configuration_versions', 'select') and not has_table_privilege('authenticated', 'public.game_platform_configuration_versions', 'update') and not has_table_privilege('service_role', 'public.game_platform_configuration_versions', 'select'), 'direct table access is revoked from browser and service roles');
select ok(not has_table_privilege('anon', 'public.game_platform_configuration_rate_limits', 'select') and not has_table_privilege('authenticated', 'public.game_platform_configuration_rate_limits', 'insert') and not has_table_privilege('service_role', 'public.game_platform_configuration_rate_limits', 'update'), 'rate-limit state has no direct role access');
select ok(not has_function_privilege('anon', 'public.get_active_platform_configuration(text)', 'execute') and has_function_privilege('service_role', 'public.get_active_platform_configuration(text)', 'execute'), 'published runtime delivery is mediated by the trusted API service');
select ok(not has_function_privilege('anon', 'public.preview_admin_platform_configuration(uuid,uuid,text,uuid,text)', 'execute'), 'anonymous callers cannot preview drafts');
select ok(exists (select 1 from pg_constraint where conname = 'world_assets_asset_type_check' and pg_get_constraintdef(oid) like '%brand_logo%' and pg_get_constraintdef(oid) like '%social_share_image%') and exists (select 1 from pg_constraint where conname = 'world_assets_category_check' and pg_get_constraintdef(oid) like '%branding%'), 'six strict branding profiles and the branding category are registered');

select * from finish();
rollback;
