export const HOSTED_DATABASE_TEST_ALLOWLIST = [
  'admin_authorization.test.sql',
  'token_access.test.sql',
  'player_vertical_slice.test.sql',
  'secure_player_operations.test.sql',
  'world_management.test.sql',
  'live_operations.test.sql',
  'cozy_gameplay.test.sql',
  'economy.test.sql',
  'world_asset_manager.test.sql',
  'platform_configuration.test.sql',
  'realtime_presence.test.sql',
  'multiplayer_chat.test.sql',
  'social_interactions.test.sql',
  'social_graph.test.sql',
  'cooperative_activities.test.sql',
  'phase13e_supabase_first_foundation.test.sql',
] as const;

export type HostedDatabaseTestSuite = (typeof HOSTED_DATABASE_TEST_ALLOWLIST)[number];

export function selectHostedDatabaseTestSuites(
  arguments_: readonly string[],
): readonly HostedDatabaseTestSuite[] {
  const normalized = arguments_[0] === '--' ? arguments_.slice(1) : arguments_;
  if (normalized.length === 0) return HOSTED_DATABASE_TEST_ALLOWLIST;
  if (normalized.length !== 2 || normalized[0] !== '--suite') {
    throw new Error('Hosted database tests accept only --suite <reviewed-suite>');
  }

  const requested = normalized[1];
  if (
    requested === undefined ||
    requested.includes('/') ||
    requested.includes('\\') ||
    requested.includes('..')
  ) {
    throw new Error('Hosted database test suite path is not allowed');
  }
  if (!HOSTED_DATABASE_TEST_ALLOWLIST.includes(requested as HostedDatabaseTestSuite)) {
    throw new Error('Hosted database test suite is not in the reviewed allowlist');
  }
  return [requested as HostedDatabaseTestSuite];
}
