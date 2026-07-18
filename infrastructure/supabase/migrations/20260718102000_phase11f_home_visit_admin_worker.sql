-- Starville Phase 11F: admin inspection, policy successors, moderation,
-- reconciliation, lifecycle hooks, and bounded worker maintenance.

create table public.home_visit_admin_rate_limits (
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  scope text not null check(scope in ('read','configuration_write','moderation_write','session_write','maintenance')),
  attempt_count integer not null check(attempt_count between 1 and 100000),
  window_started_at timestamptz not null,
  window_expires_at timestamptz not null,
  primary key(admin_user_id,scope),
  check(window_expires_at>window_started_at)
);
alter table public.home_visit_admin_rate_limits enable row level security;
alter table public.home_visit_admin_rate_limits force row level security;
revoke all on table public.home_visit_admin_rate_limits from public,anon,authenticated,service_role;

create or replace function private.claim_home_visit_admin_rate_limit(p_admin_user_id uuid,p_scope text,p_limit integer)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare allowed boolean;
begin
  if p_admin_user_id is null or p_scope not in ('read','configuration_write','moderation_write','session_write','maintenance')
     or p_limit not between 1 and 1000 then raise exception using errcode='22023',message='INVALID_HOME_VISIT_ADMIN_RATE_LIMIT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('home-visit-admin:'||p_admin_user_id::text||':'||p_scope,0));
  insert into public.home_visit_admin_rate_limits(admin_user_id,scope,attempt_count,window_started_at,window_expires_at)
  values(p_admin_user_id,p_scope,1,now(),now()+interval '1 minute')
  on conflict(admin_user_id,scope) do update set
    attempt_count=case when home_visit_admin_rate_limits.window_expires_at<=now() then 1 else home_visit_admin_rate_limits.attempt_count+1 end,
    window_started_at=case when home_visit_admin_rate_limits.window_expires_at<=now() then now() else home_visit_admin_rate_limits.window_started_at end,
    window_expires_at=case when home_visit_admin_rate_limits.window_expires_at<=now() then now()+interval '1 minute' else home_visit_admin_rate_limits.window_expires_at end
  returning attempt_count<=p_limit into allowed;
  return allowed;
end;
$$;

create or replace function public.get_admin_home_visit_workspace(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_search text,p_limit integer,p_offset integer,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; bounded_limit integer; active_sessions jsonb; invitations jsonb;
  guestbook jsonb; appreciation jsonb; helpers jsonb; reports jsonb; reconciliation jsonb; audit_history jsonb;
  authorization_result jsonb; permission_keys jsonb;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.inspect');
  if p_search is null or p_search<>btrim(p_search) or char_length(p_search)>128
     or p_limit not between 1 and 100 or p_offset not between 0 and 10000
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_ADMIN_QUERY'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'read',120) then return jsonb_build_object('status','rate_limited'); end if;
  bounded_limit:=least(p_limit,100);
  authorization_result:=private.evaluate_admin_authorization(p_user_id,p_auth_session_id,p_assurance_level);
  permission_keys:=authorization_result#>'{context,permissionKeys}';
  select coalesce(jsonb_agg(jsonb_build_object(
    'session',private.home_visit_session_json(session_row),'owner',private.home_visit_safe_profile(owner_profile),
    'homeTier',home.home_tier,'participants',coalesce((select jsonb_agg(private.home_visit_participant_json(participant)
      order by participant.joined_at,participant.id) from public.home_visit_participants participant
      where participant.visit_session_id=session_row.id and participant.status in ('active','reconnecting')),'[]'::jsonb),
    'integrityWarnings',jsonb_build_array(
      case when session_row.current_visitor_count<>(select count(*) from public.home_visit_participants participant
        where participant.visit_session_id=session_row.id and participant.role='visitor' and participant.status in ('active','reconnecting'))
        then 'visitor_count_mismatch' end,
      case when session_row.owner_presence_state<>'connected' then 'owner_reconnecting' end)
  ) order by session_row.started_at desc),'[]'::jsonb) into active_sessions
  from (select * from public.home_visit_sessions source_session
    where source_session.status in ('starting','open','closing')
      and (p_search='' or source_session.id::text ilike '%'||p_search||'%')
    order by source_session.started_at desc limit bounded_limit offset p_offset) session_row
  join public.player_profiles owner_profile on owner_profile.id=session_row.owner_player_profile_id
  join public.player_homes home on home.id=session_row.player_home_id;
  select case when permission_keys ? 'home_visits.inspect' then coalesce(jsonb_agg(jsonb_build_object(
    'id',invitation.id,'sessionId',invitation.visit_session_id,'homeId',invitation.player_home_id,
    'owner',private.home_visit_safe_profile(owner_profile),'invitee',private.home_visit_safe_profile(invitee_profile),
    'type',invitation.invitation_type,'status',invitation.status,'createdAt',invitation.created_at,
    'expiresAt',invitation.expires_at,'configurationRevision',invitation.configuration_revision
  ) order by invitation.created_at desc),'[]'::jsonb) else '[]'::jsonb end into invitations
  from (select * from public.home_visit_invitations source_invitation order by source_invitation.created_at desc limit bounded_limit) invitation
  join public.player_profiles owner_profile on owner_profile.id=invitation.owner_player_profile_id
  join public.player_profiles invitee_profile on invitee_profile.id=invitation.invitee_player_profile_id;
  select case when permission_keys ? 'home_visits.guestbooks.inspect' then coalesce(jsonb_agg(jsonb_build_object(
    'id',entry.id,'homeId',entry.player_home_id,'sessionId',entry.visit_session_id,
    'author',private.home_visit_safe_profile(author_profile),'message',entry.message_text,
    'moderationStatus',entry.moderation_status,'reportCount',entry.report_count,'stateVersion',entry.state_version,
    'createdAt',entry.created_at
  ) order by entry.created_at desc),'[]'::jsonb) else '[]'::jsonb end into guestbook
  from (select * from public.home_guestbook_entries source_entry order by source_entry.created_at desc limit bounded_limit) entry
  join public.player_profiles author_profile on author_profile.id=entry.author_player_profile_id;
  select coalesce(jsonb_agg(jsonb_build_object('homeId',summary.player_home_id,'reactionKey',summary.reaction_key,
    'count',summary.reaction_count) order by summary.reaction_count desc),'[]'::jsonb) into appreciation
  from (select source_appreciation.player_home_id,source_appreciation.reaction_key,count(*) reaction_count
    from public.home_appreciations source_appreciation group by source_appreciation.player_home_id,source_appreciation.reaction_key
    order by count(*) desc limit bounded_limit) summary;
  select case when permission_keys ? 'home_visits.helper_activity.inspect' then coalesce(jsonb_agg(jsonb_build_object(
    'id',helper.id,'homeId',helper.player_home_id,'sessionId',helper.visit_session_id,'actionType',helper.action_type,
    'owner',private.home_visit_safe_profile(owner_profile),'helper',private.home_visit_safe_profile(helper_profile),
    'cropId',helper.crop_instance_id,'status',helper.status,'gameDay',helper.game_day,'createdAt',helper.created_at,
    'visitorReward',false
  ) order by helper.created_at desc),'[]'::jsonb) else '[]'::jsonb end into helpers
  from (select * from public.home_helper_actions source_helper order by source_helper.created_at desc limit bounded_limit) helper
  join public.player_profiles owner_profile on owner_profile.id=helper.owner_player_profile_id
  join public.player_profiles helper_profile on helper_profile.id=helper.helper_player_profile_id;
  select case when permission_keys ? 'home_visits.reports.inspect' then coalesce(jsonb_agg(jsonb_build_object(
    'id',report.id,'sessionId',report.visit_session_id,'homeId',report.player_home_id,
    'reporter',private.home_visit_safe_profile(reporter_profile),'reported',private.home_visit_safe_profile(reported_profile),
    'guestbookEntryId',report.guestbook_entry_id,'category',report.category,'reason',report.reason,
    'status',report.status,'stateVersion',report.state_version,'createdAt',report.created_at
  ) order by report.created_at desc),'[]'::jsonb) else '[]'::jsonb end into reports
  from (select * from public.home_visit_reports source_report order by source_report.created_at desc limit bounded_limit) report
  join public.player_profiles reporter_profile on reporter_profile.id=report.reporter_player_profile_id
  join public.player_profiles reported_profile on reported_profile.id=report.reported_player_profile_id;
  select case when permission_keys ? 'home_visits.reconciliation.manage' then coalesce(jsonb_agg(to_jsonb(queue_row)
    order by queue_row.created_at desc),'[]'::jsonb) else '[]'::jsonb end into reconciliation
  from (select * from public.home_visit_reconciliation_queue source_queue order by source_queue.created_at desc limit bounded_limit) queue_row;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',audit.id,'sessionId',audit.visit_session_id,'homeId',audit.player_home_id,
    'actorType',audit.actor_type,'eventKey',audit.event_key,'result',audit.result_category,
    'requestId',audit.request_id,'createdAt',audit.created_at
  ) order by audit.created_at desc),'[]'::jsonb) into audit_history
  from (select * from public.home_visit_audit_events source_audit order by source_audit.created_at desc limit bounded_limit) audit;
  return jsonb_build_object('status','loaded','requestId',p_request_id,'adminSessionId',trusted_session_id,
    'policy',private.home_visit_policy_json(),'activeSessions',active_sessions,'invitations',invitations,
    'guestbook',guestbook,'appreciation',appreciation,'helpers',helpers,'reports',reports,
    'reconciliation',reconciliation,'audit',audit_history,'telemetry',jsonb_build_object(
      'activeSessions',(select count(*) from public.home_visit_sessions source_session where source_session.status in ('starting','open','closing')),
      'activeVisitors',(select count(*) from public.home_visit_participants source_participant where source_participant.role='visitor' and source_participant.status in ('active','reconnecting')),
      'guestbookEntries7d',(select count(*) from public.home_guestbook_entries source_entry where source_entry.created_at>now()-interval '7 days'),
      'appreciations',(select count(*) from public.home_appreciations),
      'helperWaterings7d',(select count(*) from public.home_helper_actions source_helper where source_helper.status in ('completed','replayed') and source_helper.created_at>now()-interval '7 days'),
      'openReports',(select count(*) from public.home_visit_reports source_report where source_report.status in ('open','under_review'))));
end;
$$;

create or replace function public.transition_admin_home_visit_report(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_report_id uuid,p_action text,
  p_expected_state_version integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; report public.home_visit_reports%rowtype; next_status text;
begin
  trusted_session_id:=private.assert_verified_admin_permission(
    p_user_id,p_auth_session_id,p_assurance_level,'home_visits.manage');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_report_id is null or p_action not in ('start_review','action','dismiss') or p_expected_state_version<1
     or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_REPORT_TRANSITION'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'report_transition',30) then
    return jsonb_build_object('status','rate_limited'); end if;
  select * into report from public.home_visit_reports source_report where source_report.id=p_report_id for update;
  if not found then return jsonb_build_object('status','home_visit_target_invalid'); end if;
  if report.state_version<>p_expected_state_version then return jsonb_build_object('status','home_visit_conflict'); end if;
  next_status:=case p_action when 'start_review' then 'under_review' when 'action' then 'actioned' else 'dismissed' end;
  if (p_action='start_review' and report.status<>'open')
     or (p_action in ('action','dismiss') and report.status not in ('open','under_review')) then
    return jsonb_build_object('status','home_visit_policy_transition_invalid'); end if;
  update public.home_visit_reports set status=next_status,state_version=state_version+1,
    safe_evidence=safe_evidence||jsonb_build_object('lastAdminAction',p_action,'lastAdminReason',btrim(p_reason),
      'lastAdminId',p_user_id,'lastAdminSessionId',trusted_session_id,'lastAdminRequestId',p_request_id)
  where id=report.id returning * into report;
  insert into public.home_visit_audit_events(
    visit_session_id,player_home_id,actor_admin_id,actor_type,event_key,result_category,request_id,safe_payload
  ) values(report.visit_session_id,report.player_home_id,p_user_id,'admin','visit_report_transitioned','success',p_request_id,
    jsonb_build_object('reportId',report.id,'action',p_action,'status',report.status,'reason',btrim(p_reason)));
  return jsonb_build_object('status','updated','reportId',report.id,'reportStatus',report.status,'stateVersion',report.state_version);
end;
$$;

create or replace function public.create_admin_home_visit_policy_successor(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_base_version_id uuid,
  p_configuration jsonb,p_expected_configuration_revision integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; base_policy public.home_visit_policy_versions%rowtype;
  created_policy public.home_visit_policy_versions%rowtype; next_version integer;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.policies.manage');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_base_version_id is null or p_configuration is null or jsonb_typeof(p_configuration)<>'object'
     or pg_column_size(p_configuration)>8192 or p_expected_configuration_revision<1
     or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_POLICY_SUCCESSOR'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'configuration_write',10) then return jsonb_build_object('status','rate_limited'); end if;
  select * into base_policy from public.home_visit_policy_versions source_policy where source_policy.id=p_base_version_id for update;
  if not found then return jsonb_build_object('status','home_visit_policy_not_found'); end if;
  if base_policy.configuration_revision<>p_expected_configuration_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  select coalesce(max(policy.version_number),0)+1 into next_version from public.home_visit_policy_versions policy;
  insert into public.home_visit_policy_versions(
    id,version_number,status,maximum_visitors,owner_disconnect_grace_seconds,visitor_reconnect_grace_seconds,
    invitation_expiry_seconds,guestbook_cooldown_seconds,guestbook_daily_limit,appreciation_policy,
    helper_waterings_per_visitor_day,visits_enabled,public_discovery_enabled,invitations_enabled,
    admissions_enabled,social_interactions_enabled,guestbook_writes_enabled,appreciation_enabled,
    helper_actions_enabled,maintenance_message,created_by_admin_id,reason
  ) values(gen_random_uuid(),next_version,'draft',
    least(coalesce((p_configuration->>'maximumVisitors')::integer,base_policy.maximum_visitors),10),
    coalesce((p_configuration->>'ownerDisconnectGraceSeconds')::integer,base_policy.owner_disconnect_grace_seconds),
    coalesce((p_configuration->>'visitorReconnectGraceSeconds')::integer,base_policy.visitor_reconnect_grace_seconds),
    coalesce((p_configuration->>'invitationExpirySeconds')::integer,base_policy.invitation_expiry_seconds),
    coalesce((p_configuration->>'guestbookCooldownSeconds')::integer,base_policy.guestbook_cooldown_seconds),
    coalesce((p_configuration->>'guestbookDailyLimit')::integer,base_policy.guestbook_daily_limit),'persistent_selection',1,
    coalesce((p_configuration->>'visitsEnabled')::boolean,base_policy.visits_enabled),
    coalesce((p_configuration->>'publicDiscoveryEnabled')::boolean,base_policy.public_discovery_enabled),
    coalesce((p_configuration->>'invitationsEnabled')::boolean,base_policy.invitations_enabled),
    coalesce((p_configuration->>'admissionsEnabled')::boolean,base_policy.admissions_enabled),
    coalesce((p_configuration->>'socialInteractionsEnabled')::boolean,base_policy.social_interactions_enabled),
    coalesce((p_configuration->>'guestbookWritesEnabled')::boolean,base_policy.guestbook_writes_enabled),
    coalesce((p_configuration->>'appreciationEnabled')::boolean,base_policy.appreciation_enabled),
    coalesce((p_configuration->>'helperActionsEnabled')::boolean,base_policy.helper_actions_enabled),
    nullif(btrim(p_configuration->>'maintenanceMessage'),''),p_user_id,btrim(p_reason)) returning * into created_policy;
  insert into public.home_visit_audit_events(actor_admin_id,actor_type,event_key,result_category,request_id,safe_payload)
  values(p_user_id,'admin','policy_successor_created','success',p_request_id,jsonb_build_object(
    'baseVersionId',base_policy.id,'versionId',created_policy.id,'version',created_policy.version_number,'adminSessionId',trusted_session_id));
  return jsonb_build_object('status','created','versionId',created_policy.id,'version',created_policy.version_number,
    'configurationRevision',created_policy.configuration_revision);
end;
$$;

create or replace function public.transition_admin_home_visit_policy(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_version_id uuid,p_transition text,
  p_expected_configuration_revision integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; policy public.home_visit_policy_versions%rowtype; prior_policy_id uuid;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.policies.manage');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_version_id is null or p_transition not in ('validate','activate','archive') or p_expected_configuration_revision<1
     or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_POLICY_TRANSITION'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'configuration_write',10) then return jsonb_build_object('status','rate_limited'); end if;
  select * into policy from public.home_visit_policy_versions source_policy where source_policy.id=p_version_id for update;
  if not found then return jsonb_build_object('status','home_visit_policy_not_found'); end if;
  if policy.configuration_revision<>p_expected_configuration_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  if p_transition='validate' then
    if policy.status<>'draft' then return jsonb_build_object('status','home_visit_policy_transition_invalid'); end if;
    update public.home_visit_policy_versions set status='validated',validated_by_admin_id=p_user_id,validated_at=now(),
      configuration_revision=configuration_revision+1 where id=policy.id returning * into policy;
  elsif p_transition='activate' then
    if policy.status<>'validated' or policy.created_by_admin_id=p_user_id then
      return jsonb_build_object('status','home_visit_policy_transition_invalid'); end if;
    select policy_version_id into prior_policy_id from public.home_visit_active_policy where singleton_key for update;
    update public.home_visit_policy_versions set status='archived',archived_at=now(),configuration_revision=configuration_revision+1
    where id=prior_policy_id and id<>policy.id;
    update public.home_visit_policy_versions set status='active',activated_by_admin_id=p_user_id,activated_at=now(),
      configuration_revision=configuration_revision+1 where id=policy.id returning * into policy;
    update public.home_visit_active_policy set policy_version_id=policy.id,updated_at=now() where singleton_key;
    if not policy.admissions_enabled then update public.home_visit_sessions set admissions_open=false,
      configuration_revision=configuration_revision+1 where status='open'; end if;
  else
    if policy.status not in ('draft','validated') then return jsonb_build_object('status','home_visit_policy_transition_invalid'); end if;
    update public.home_visit_policy_versions set status='archived',archived_at=now(),configuration_revision=configuration_revision+1
    where id=policy.id returning * into policy;
  end if;
  insert into public.home_visit_audit_events(actor_admin_id,actor_type,event_key,result_category,request_id,safe_payload)
  values(p_user_id,'admin','policy_'||p_transition,'success',p_request_id,jsonb_build_object(
    'versionId',policy.id,'configurationRevision',policy.configuration_revision,'reason',btrim(p_reason),'adminSessionId',trusted_session_id));
  return jsonb_build_object('status',case p_transition when 'validate' then 'validated' when 'activate' then 'activated' else 'archived' end,
    'versionId',policy.id,'configurationRevision',policy.configuration_revision);
end;
$$;

create or replace function public.close_admin_home_visit_session(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_visit_session_id uuid,
  p_expected_configuration_revision integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; session_row public.home_visit_sessions%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.manage');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_visit_session_id is null or p_expected_configuration_revision<1
     or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_ADMIN_CLOSE'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'session_write',10) then return jsonb_build_object('status','rate_limited'); end if;
  select * into session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id for update;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  if session_row.configuration_revision<>p_expected_configuration_revision then return jsonb_build_object('status','home_visit_conflict'); end if;
  session_row:=private.close_home_visit_session(session_row.id,'admin_closed',null,'system',p_request_id);
  insert into public.home_visit_audit_events(visit_session_id,player_home_id,actor_admin_id,actor_type,event_key,result_category,request_id,safe_payload)
  values(session_row.id,session_row.player_home_id,p_user_id,'admin','admin_session_closed','success',p_request_id,
    jsonb_build_object('reason',btrim(p_reason),'adminSessionId',trusted_session_id));
  return jsonb_build_object('status','closed','session',private.home_visit_session_json(session_row));
end;
$$;

create or replace function public.moderate_admin_home_guestbook_entry(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_entry_id uuid,p_action text,
  p_expected_state_version integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; entry public.home_guestbook_entries%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.guestbooks.moderate');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_entry_id is null or p_action not in ('hide','restore','remove') or p_expected_state_version<1
     or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500 or p_reason ~ '[[:cntrl:]<>]'
     or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_GUESTBOOK_ADMIN_MODERATION'; end if;
  if not private.claim_home_visit_admin_rate_limit(p_user_id,'moderation_write',20) then return jsonb_build_object('status','rate_limited'); end if;
  select * into entry from public.home_guestbook_entries source_entry where source_entry.id=p_entry_id for update;
  if not found then return jsonb_build_object('status','home_visit_target_invalid'); end if;
  if entry.state_version<>p_expected_state_version then return jsonb_build_object('status','home_visit_conflict'); end if;
  if p_action='restore' then
    if entry.moderation_status<>'moderator_hidden' then return jsonb_build_object('status','home_visit_permission_denied'); end if;
    update public.home_guestbook_entries set moderation_status='visible',hidden_at=null,state_version=state_version+1
    where id=entry.id returning * into entry;
  else
    update public.home_guestbook_entries set moderation_status=case when p_action='hide' then 'moderator_hidden' else 'removed' end,
      hidden_at=now(),state_version=state_version+1 where id=entry.id returning * into entry;
  end if;
  perform private.home_visit_emit(entry.visit_session_id,entry.player_home_id,null,'home_guestbook_entry_hidden',
    jsonb_build_object('entryId',entry.id,'moderationStatus',entry.moderation_status));
  insert into public.home_visit_audit_events(visit_session_id,player_home_id,actor_admin_id,actor_type,event_key,result_category,request_id,safe_payload)
  values(entry.visit_session_id,entry.player_home_id,p_user_id,'admin','guestbook_admin_moderated','success',p_request_id,
    jsonb_build_object('entryId',entry.id,'action',p_action,'reason',btrim(p_reason),'adminSessionId',trusted_session_id));
  return jsonb_build_object('status','updated','entryId',entry.id,'moderationStatus',entry.moderation_status,'stateVersion',entry.state_version);
end;
$$;

create or replace function public.request_admin_home_visit_reconciliation(
  p_user_id uuid,p_auth_session_id uuid,p_assurance_level text,p_visit_session_id uuid,p_reconciliation_type text,
  p_priority integer,p_reason text,p_request_id text
)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare trusted_session_id uuid; session_row public.home_visit_sessions%rowtype; queue_row public.home_visit_reconciliation_queue%rowtype;
begin
  trusted_session_id:=private.assert_verified_admin_permission(p_user_id,p_auth_session_id,p_assurance_level,'home_visits.reconciliation.manage');
  if p_assurance_level<>'aal2' then raise exception using errcode='42501',message='AAL2_REQUIRED'; end if;
  if p_visit_session_id is null or p_reconciliation_type not in (
    'active_session_owner_presence','visitor_count','duplicate_participant','stale_seat','stale_invitation',
    'blocked_participant','helper_evidence','appreciation_uniqueness','guestbook_eligibility','preview_exclusion')
     or p_priority not between 1 and 100 or p_reason is null or char_length(btrim(p_reason)) not between 20 and 500
     or p_reason ~ '[[:cntrl:]<>]' or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_RECONCILIATION'; end if;
  select * into session_row from public.home_visit_sessions source_session where source_session.id=p_visit_session_id;
  if not found then return jsonb_build_object('status','home_visit_not_found'); end if;
  insert into public.home_visit_reconciliation_queue(
    visit_session_id,player_home_id,reconciliation_type,priority,evidence,requested_by_admin_id,request_id
  ) values(session_row.id,session_row.player_home_id,p_reconciliation_type,p_priority,
    jsonb_build_object('reason',btrim(p_reason),'requestedAt',now(),'adminSessionId',trusted_session_id),p_user_id,p_request_id)
  returning * into queue_row;
  return jsonb_build_object('status','queued','reconciliationId',queue_row.id);
end;
$$;

create or replace function public.run_home_visit_maintenance(p_limit integer,p_request_id text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare bounded_limit integer; expired_invitations integer:=0; closed_sessions integer:=0;
  released_participants integer:=0; reconciled_counts integer:=0; source_session record; source_participant record;
begin
  if p_limit not between 1 and 500 or p_request_id is null or char_length(p_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='INVALID_HOME_VISIT_MAINTENANCE'; end if;
  bounded_limit:=least(p_limit,500);
  with expired as (select invitation.id from public.home_visit_invitations invitation
    where invitation.status='pending' and invitation.expires_at<=now()
    order by invitation.expires_at,invitation.id for update skip locked limit bounded_limit)
  update public.home_visit_invitations invitation set status='expired',resolved_at=now(),configuration_revision=configuration_revision+1
  from expired where invitation.id=expired.id;
  get diagnostics expired_invitations=row_count;
  for source_session in select session_row.id from public.home_visit_sessions session_row
    where session_row.status in ('open','closing') and session_row.owner_presence_state<>'connected'
      and session_row.owner_reconnect_deadline<=now() order by session_row.owner_reconnect_deadline,session_row.id
    for update skip locked limit bounded_limit loop
    perform private.close_home_visit_session(source_session.id,'owner_disconnect_timeout',null,'worker',p_request_id);
    closed_sessions:=closed_sessions+1;
  end loop;
  for source_participant in select participant.id,participant.visit_session_id from public.home_visit_participants participant
    where participant.status='reconnecting' and participant.reconnect_deadline<=now()
    order by participant.reconnect_deadline,participant.id for update skip locked limit bounded_limit loop
    perform private.remove_home_visit_participant(source_participant.id,'reconnect_timeout',null,p_request_id);
    released_participants:=released_participants+1;
  end loop;
  with counts as (select session_row.id,count(participant.id)::integer expected_count
    from public.home_visit_sessions session_row left join public.home_visit_participants participant
      on participant.visit_session_id=session_row.id and participant.role='visitor' and participant.status in ('active','reconnecting')
    where session_row.status in ('starting','open','closing') group by session_row.id
    having count(participant.id)::integer<>max(session_row.current_visitor_count)
    order by session_row.id limit bounded_limit)
  update public.home_visit_sessions session_row set current_visitor_count=counts.expected_count,
    configuration_revision=configuration_revision+1 from counts where session_row.id=counts.id;
  get diagnostics reconciled_counts=row_count;
  update public.home_visit_seats seat set status='released',released_at=now(),state_version=state_version+1
  where seat.status='occupied' and not exists(select 1 from public.home_visit_participants participant
    where participant.id=seat.participant_id and participant.status='active');
  update public.home_visit_photo_participants photo set status='left',left_at=now()
  where photo.status='active' and not exists(select 1 from public.home_visit_participants participant
    where participant.id=photo.participant_id and participant.status='active');
  perform set_config('starville.home_visit_cleanup','enabled',true);
  delete from public.home_visit_idempotency replay where replay.created_at<now()-interval '24 hours';
  delete from public.home_visit_rate_limits rate where rate.window_expires_at<now()-interval '1 hour';
  perform set_config('starville.home_visit_cleanup','disabled',true);
  return jsonb_build_object('status','completed','expiredInvitations',expired_invitations,
    'closedSessions',closed_sessions,'releasedParticipants',released_participants,'reconciledCounts',reconciled_counts);
end;
$$;

create or replace function private.block_decoration_during_live_visit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.home_visit_sessions session_row
    where session_row.player_home_id=new.player_home_id and session_row.status in ('starting','open','closing')) then
    raise exception using errcode='55000',message='HOME_VISIT_DECORATION_CONFLICT';
  end if;
  return new;
end;
$$;
create trigger housing_decoration_sessions_visit_guard before insert on public.housing_decoration_sessions
for each row execute function private.block_decoration_during_live_visit();

create or replace function private.close_visit_when_owner_leaves()
returns trigger language plpgsql security definer set search_path='' as $$
declare active_session_id uuid;
begin
  if old.inside_home and not new.inside_home then
    select session_row.id into active_session_id from public.home_visit_sessions session_row
    where session_row.player_home_id=new.id and session_row.status in ('starting','open','closing');
    if active_session_id is not null then
      perform private.close_home_visit_session(active_session_id,'owner_left_home',new.player_profile_id,'owner','owner-left-home:'||new.id::text);
    end if;
  end if;
  return new;
end;
$$;
create trigger player_homes_visit_owner_leave after update of inside_home on public.player_homes
for each row execute function private.close_visit_when_owner_leaves();

revoke all on function private.claim_home_visit_admin_rate_limit(uuid,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.block_decoration_during_live_visit() from public,anon,authenticated,service_role;
revoke all on function private.close_visit_when_owner_leaves() from public,anon,authenticated,service_role;
revoke all on function public.get_admin_home_visit_workspace(uuid,uuid,text,text,integer,integer,text) from public,anon,authenticated,service_role;
revoke all on function public.create_admin_home_visit_policy_successor(uuid,uuid,text,uuid,jsonb,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.transition_admin_home_visit_policy(uuid,uuid,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.close_admin_home_visit_session(uuid,uuid,text,uuid,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.moderate_admin_home_guestbook_entry(uuid,uuid,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.request_admin_home_visit_reconciliation(uuid,uuid,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.transition_admin_home_visit_report(uuid,uuid,text,uuid,text,integer,text,text) from public,anon,authenticated,service_role;
revoke all on function public.run_home_visit_maintenance(integer,text) from public,anon,authenticated,service_role;

grant execute on function public.get_admin_home_visit_workspace(uuid,uuid,text,text,integer,integer,text) to service_role;
grant execute on function public.create_admin_home_visit_policy_successor(uuid,uuid,text,uuid,jsonb,integer,text,text) to service_role;
grant execute on function public.transition_admin_home_visit_policy(uuid,uuid,text,uuid,text,integer,text,text) to service_role;
grant execute on function public.close_admin_home_visit_session(uuid,uuid,text,uuid,integer,text,text) to service_role;
grant execute on function public.moderate_admin_home_guestbook_entry(uuid,uuid,text,uuid,text,integer,text,text) to service_role;
grant execute on function public.request_admin_home_visit_reconciliation(uuid,uuid,text,uuid,text,integer,text,text) to service_role;
grant execute on function public.transition_admin_home_visit_report(uuid,uuid,text,uuid,text,integer,text,text) to service_role;
grant execute on function public.run_home_visit_maintenance(integer,text) to service_role;
