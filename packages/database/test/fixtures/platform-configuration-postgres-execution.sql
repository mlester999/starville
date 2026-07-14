-- Executes Phase 7.5B lifecycle, authorization, immutability, rollback, and RLS assertions.
begin;

create or replace function pg_temp.assert_platform_true(condition boolean, message text)
returns void language plpgsql as $$
begin
  if condition is distinct from true then
    raise exception using errcode = 'P0001', message = 'PLATFORM_CONFIGURATION_ASSERTION_FAILED: ' || message;
  end if;
end;
$$;

do $$
declare
  editor_user constant uuid := 'b5000000-0000-4000-8000-000000000001';
  editor_auth constant uuid := 'b5000000-0000-4000-8000-000000000002';
  editor_session constant uuid := 'b5000000-0000-4000-8000-000000000003';
  reviewer_user constant uuid := 'b5000000-0000-4000-8000-000000000011';
  reviewer_auth constant uuid := 'b5000000-0000-4000-8000-000000000012';
  reviewer_session constant uuid := 'b5000000-0000-4000-8000-000000000013';
  analyst_user constant uuid := 'b5000000-0000-4000-8000-000000000021';
  analyst_auth constant uuid := 'b5000000-0000-4000-8000-000000000022';
  analyst_session constant uuid := 'b5000000-0000-4000-8000-000000000023';
  result jsonb;
  draft_id uuid;
  draft_revision integer;
  active_revision integer;
  original_active_id uuid;
  config jsonb;
  denied boolean := false;
  immutable boolean := false;
begin
  perform pg_temp.assert_platform_true(
    private.valid_platform_configuration(
      (select configuration from public.game_platform_configuration_versions where version_number = 1)
    ),
    'seeded Starville baseline satisfies the database configuration boundary'
  );
  result := public.get_active_platform_configuration('starville');
  original_active_id := (result ->> 'versionId')::uuid;
  active_revision := (result ->> 'revision')::integer;
  perform pg_temp.assert_platform_true(
    result #>> '{configuration,branding,fullGameName}' = 'Starville'
      and result ->> 'fallback' = 'false'
      and result::text !~* '(service_role|database_url|rpc_url|private_key)',
    'public delivery exposes only the exact safe published presentation'
  );

  perform pg_temp.assert_platform_true(
    (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platforms'::regclass)
      and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_versions'::regclass)
      and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_active_configuration'::regclass)
      and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_audit'::regclass)
      and (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.game_platform_configuration_rate_limits'::regclass),
    'all platform configuration tables force RLS'
  );
  perform pg_temp.assert_platform_true(
    not has_table_privilege('anon', 'public.game_platform_configuration_versions', 'select')
      and not has_table_privilege('authenticated', 'public.game_platform_configuration_versions', 'update')
      and not has_table_privilege('service_role', 'public.game_platform_configuration_versions', 'select'),
    'direct table reads and mutations remain revoked'
  );

  insert into auth.users(id, email) values
    (editor_user, 'platform-editor@example.invalid'),
    (reviewer_user, 'platform-reviewer@example.invalid'),
    (analyst_user, 'platform-analyst@example.invalid');
  insert into auth.sessions(id, user_id) values
    (editor_auth, editor_user), (reviewer_auth, reviewer_user), (analyst_auth, analyst_user);
  insert into public.admin_users(user_id, role_id, status, display_name, mfa_required)
  select editor_user, id, 'active', 'Platform Editor', false from public.admin_roles where key = 'super_admin'
  union all
  select reviewer_user, id, 'active', 'Platform Reviewer', false from public.admin_roles where key = 'game_administrator'
  union all
  select analyst_user, id, 'active', 'Platform Analyst', false from public.admin_roles where key = 'read_only_analyst';
  insert into public.admin_sessions(
    id, user_id, auth_session_id, status, expires_at,
    permission_version_snapshot, session_version_snapshot
  )
  select values_to_insert.session_id, admin.user_id, values_to_insert.auth_id, 'active',
    now() + interval '1 hour', admin.permission_version, admin.session_version
  from public.admin_users admin
  join (values
    (editor_user, editor_auth, editor_session),
    (reviewer_user, reviewer_auth, reviewer_session),
    (analyst_user, analyst_auth, analyst_session)
  ) values_to_insert(user_id, auth_id, session_id) on values_to_insert.user_id = admin.user_id;

  perform pg_temp.assert_platform_true(
    (select count(*) = 1 from public.admin_role_permissions role_permission
      join public.admin_roles role on role.id = role_permission.role_id
      join public.admin_permissions permission on permission.id = role_permission.permission_id
      where role.key = 'read_only_analyst' and permission.key like 'platform_configuration.%')
      and exists (
        select 1 from public.admin_role_permissions role_permission
        join public.admin_roles role on role.id = role_permission.role_id
        join public.admin_permissions permission on permission.id = role_permission.permission_id
        where role.key = 'read_only_analyst' and permission.key = 'platform_configuration.read'
      ),
    'Read-only Analyst receives only platform_configuration.read'
  );

  begin
    perform public.create_admin_platform_configuration_draft(
      analyst_user, analyst_auth, 'aal1', 'starville', 'Attempt forbidden mutation.', 'platform-denied-0001'
    );
  exception when insufficient_privilege then denied := true;
  end;
  perform pg_temp.assert_platform_true(denied, 'Read-only Analyst cannot create a draft');

  result := public.create_admin_platform_configuration_draft(
    editor_user, editor_auth, 'aal2', 'starville', 'Prepare presentation validation.', 'platform-create-0001'
  );
  draft_id := (result #>> '{version,id}')::uuid;
  draft_revision := (result #>> '{version,revision}')::integer;
  config := result #> '{version,configuration}';
  config := jsonb_set(config, '{branding,fullGameName}', '"Starville Preview"');
  result := public.update_admin_platform_configuration_draft(
    editor_user, editor_auth, 'aal2', draft_id, draft_revision, config,
    'Update preview name safely.', 'platform-update-0001'
  );
  draft_revision := (result #>> '{version,revision}')::integer;
  perform pg_temp.assert_platform_true(
    public.update_admin_platform_configuration_draft(
      editor_user, editor_auth, 'aal2', draft_id, draft_revision - 1, config,
      'Update preview name safely.', 'platform-update-0001'
    ) ->> 'status' = 'idempotent',
    'duplicate draft update request is idempotent before revision evaluation'
  );
  perform pg_temp.assert_platform_true(
    public.get_active_platform_configuration('starville') ->> 'versionId' = original_active_id::text,
    'draft editing never changes the active presentation'
  );

  result := public.validate_admin_platform_configuration(
    editor_user, editor_auth, 'aal2', draft_id, draft_revision,
    '{"valid":true,"findings":[{"level":"passed","code":"CONFIGURATION_VALID","path":"","message":"Configuration passed all checks."}]}',
    'Validate structured presentation.', 'platform-validate-0001'
  );
  draft_revision := (result #>> '{version,revision}')::integer;
  perform pg_temp.assert_platform_true(
    public.validate_admin_platform_configuration(
      editor_user, editor_auth, 'aal2', draft_id, draft_revision - 1,
      '{"valid":true,"findings":[{"level":"passed","code":"CONFIGURATION_VALID","path":"","message":"Configuration passed all checks."}]}',
      'Validate structured presentation.', 'platform-validate-0001'
    ) ->> 'status' = 'idempotent',
    'duplicate validation request is idempotent before revision evaluation'
  );
  result := public.submit_admin_platform_configuration_review(
    editor_user, editor_auth, 'aal2', draft_id, draft_revision,
    'Submit presentation for review.', 'platform-submit-0001'
  );
  draft_revision := (result #>> '{version,revision}')::integer;
  perform pg_temp.assert_platform_true(
    public.submit_admin_platform_configuration_review(
      editor_user, editor_auth, 'aal2', draft_id, draft_revision - 1,
      'Submit presentation for review.', 'platform-submit-0001'
    ) ->> 'status' = 'idempotent',
    'duplicate review submission is idempotent before lifecycle evaluation'
  );
  result := public.review_admin_platform_configuration(
    reviewer_user, reviewer_auth, 'aal2', draft_id, draft_revision,
    'Approve the reviewed presentation.', 'platform-review-0001'
  );
  draft_revision := (result #>> '{version,revision}')::integer;
  perform pg_temp.assert_platform_true(
    public.review_admin_platform_configuration(
      reviewer_user, reviewer_auth, 'aal2', draft_id, draft_revision - 1,
      'Approve the reviewed presentation.', 'platform-review-0001'
    ) ->> 'status' = 'idempotent',
    'duplicate review approval is idempotent before lifecycle evaluation'
  );

  perform pg_temp.assert_platform_true(
    private.claim_platform_configuration_rate_limit('validate', 'fixture-rate-subject', 1, 60)
      and not private.claim_platform_configuration_rate_limit('validate', 'fixture-rate-subject', 1, 60),
    'mutation rate limiting is atomic and bounded'
  );

  result := public.preview_admin_platform_configuration(
    reviewer_user, reviewer_auth, 'aal2', draft_id, 'starville'
  );
  perform pg_temp.assert_platform_true(
    result #>> '{configuration,branding,fullGameName}' = 'Starville Preview'
      and public.get_active_platform_configuration('starville') ->> 'versionId' = original_active_id::text,
    'authorized exact-version preview does not alter active configuration'
  );

  result := public.publish_admin_platform_configuration(
    reviewer_user, reviewer_auth, 'aal2', draft_id, draft_revision, active_revision,
    'Publish reviewed presentation version.', 'platform-publish-0001'
  );
  perform pg_temp.assert_platform_true(
    result ->> 'status' = 'published'
      and public.get_active_platform_configuration('starville') ->> 'versionId' = draft_id::text,
    'reviewed exact revision publishes atomically'
  );
  perform pg_temp.assert_platform_true(
    public.publish_admin_platform_configuration(
      reviewer_user, reviewer_auth, 'aal2', draft_id, draft_revision, active_revision,
      'Publish reviewed presentation version.', 'platform-publish-0001'
    ) ->> 'status' = 'idempotent',
    'duplicate publication request is idempotent'
  );

  begin
    update public.game_platform_configuration_versions
    set configuration = jsonb_set(configuration, '{branding,fullGameName}', '"Tampered"')
    where id = draft_id;
  exception when insufficient_privilege then immutable := true;
  end;
  perform pg_temp.assert_platform_true(immutable, 'published configuration JSON is immutable');

  active_revision := (public.get_active_platform_configuration('starville') ->> 'revision')::integer;
  result := public.rollback_admin_platform_configuration(
    reviewer_user, reviewer_auth, 'aal2', original_active_id, active_revision,
    'Restore original approved presentation.', 'platform-rollback-0001'
  );
  perform pg_temp.assert_platform_true(
    result ->> 'status' = 'rolled_back'
      and public.get_active_platform_configuration('starville') ->> 'versionId' = original_active_id::text
      and public.get_active_platform_configuration('starville') #>> '{configuration,branding,fullGameName}' = 'Starville',
    'rollback safely reactivates the immutable previous version'
  );

  perform pg_temp.assert_platform_true(
    (select count(*) >= 7 from public.game_platform_configuration_audit where game_platform_id = '75000000-0000-4000-8000-000000000001')
      and (select count(*) = count(distinct request_id || ':' || action) from public.game_platform_configuration_audit),
    'lifecycle events are bounded, append-only, and idempotency keyed'
  );
end;
$$;

rollback;
