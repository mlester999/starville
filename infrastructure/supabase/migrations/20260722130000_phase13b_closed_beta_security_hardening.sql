-- Starville Phase 13B: remove the only broad service-role table grants found by
-- the closed-beta catalog audit. API and worker access remains available only
-- through the existing exact-signature SECURITY DEFINER RPCs.

alter table public.admin_roles force row level security;
alter table public.admin_permissions force row level security;
alter table public.admin_role_permissions force row level security;
alter table public.admin_users force row level security;
alter table public.admin_sessions force row level security;
alter table public.admin_audit_logs force row level security;
alter table public.wallet_auth_challenges force row level security;
alter table public.wallet_auth_rate_limits force row level security;
alter table public.wallet_access_sessions force row level security;
alter table public.wallet_access_events force row level security;
alter table public.token_gate_configs force row level security;
alter table public.player_profiles force row level security;
alter table public.player_api_rate_limits force row level security;
alter table public.player_moderation_states force row level security;
alter table public.player_operation_audit_logs force row level security;
alter table public.admin_player_operation_rate_limits force row level security;
alter table public.world_maps force row level security;
alter table public.world_map_versions force row level security;
alter table public.world_audit_events force row level security;
alter table public.world_operation_rate_limits force row level security;

revoke select, insert, update, delete on table
  public.player_experience_onboarding_versions,
  public.player_experience_active_onboarding,
  public.player_experience_onboarding_steps,
  public.player_onboarding_states,
  public.player_onboarding_step_evidence,
  public.player_experience_acknowledgements,
  public.player_experience_daily_policy_versions,
  public.player_experience_active_daily_policy,
  public.player_experience_daily_objective_definitions,
  public.player_daily_assignments,
  public.player_daily_objective_progress,
  public.player_daily_objective_contributions,
  public.player_experience_guidance_targets,
  public.player_experience_recovery_queue,
  public.player_experience_owner_events,
  public.player_experience_telemetry_events,
  public.player_experience_rate_limits,
  public.player_experience_admin_audit_events,
  public.player_experience_admin_rate_limits
from service_role;

revoke all on function private.claim_progression_admin_rate_limit(uuid, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.ensure_player_progression(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_admin_audit(uuid, uuid, text, text, uuid, text, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_apply_unlocks(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_enforce_crop_unlock()
  from public, anon, authenticated, service_role;
revoke all on function private.progression_evaluate_achievements(uuid, text, uuid, uuid, text, integer, bigint, text)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_level_for_xp(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_level_state(uuid, bigint)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_process_legacy_quest_event()
  from public, anon, authenticated, service_role;
revoke all on function private.progression_process_private_plot_event()
  from public, anon, authenticated, service_role;
revoke all on function private.progression_process_quest_completion()
  from public, anon, authenticated, service_role;
revoke all on function private.progression_process_shop_event()
  from public, anon, authenticated, service_role;
revoke all on function private.progression_quest_available(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_quest_json(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_settle_reward(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_unlock_requirement_met(uuid, public.progression_unlock_versions)
  from public, anon, authenticated, service_role;
revoke all on function private.progression_workspace_json(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.protect_progression_append_only()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_progression_version_immutability()
  from public, anon, authenticated, service_role;
