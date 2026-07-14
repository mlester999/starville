import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdminDatabaseIdentity } from '../contracts.js';
import type { PlatformConfigurationGateway } from './contracts.js';

export class PlatformConfigurationPersistenceError extends Error {
  public constructor() {
    super('Trusted platform-configuration persistence failed.');
    this.name = 'PlatformConfigurationPersistenceError';
  }
}

async function rpc(
  client: SupabaseClient,
  name: string,
  parameters: Readonly<Record<string, unknown>>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, parameters);
  if (error !== null) throw new PlatformConfigurationPersistenceError();
  return data;
}

function identity(value: AdminDatabaseIdentity) {
  return {
    p_user_id: value.userId,
    p_auth_session_id: value.authSessionId,
    p_assurance_level: value.assuranceLevel,
  };
}

export function createSupabasePlatformConfigurationGateway(
  client: SupabaseClient,
): PlatformConfigurationGateway {
  return {
    getActive: (platformKey) =>
      rpc(client, 'get_active_platform_configuration', { p_platform_key: platformKey }),
    getAdmin: (admin, platformKey) =>
      rpc(client, 'get_admin_platform_configuration', {
        ...identity(admin),
        p_platform_key: platformKey,
      }),
    preview: (admin, platformKey, versionId) =>
      rpc(client, 'preview_admin_platform_configuration', {
        ...identity(admin),
        p_platform_key: platformKey,
        p_version_id: versionId,
      }),
    createDraft: (admin, platformKey, reason, requestId) =>
      rpc(client, 'create_admin_platform_configuration_draft', {
        ...identity(admin),
        p_platform_key: platformKey,
        p_reason: reason,
        p_request_id: requestId,
      }),
    updateDraft: (admin, versionId, expectedRevision, configuration, reason, requestId) =>
      rpc(client, 'update_admin_platform_configuration_draft', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_revision: expectedRevision,
        p_configuration: configuration,
        p_reason: reason,
        p_request_id: requestId,
      }),
    validate: (admin, versionId, expectedRevision, validation, reason, requestId) =>
      rpc(client, 'validate_admin_platform_configuration', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_revision: expectedRevision,
        p_validation_results: validation,
        p_reason: reason,
        p_request_id: requestId,
      }),
    submitReview: (admin, versionId, expectedRevision, reason, requestId) =>
      rpc(client, 'submit_admin_platform_configuration_review', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_revision: expectedRevision,
        p_reason: reason,
        p_request_id: requestId,
      }),
    review: (admin, versionId, expectedRevision, reason, requestId) =>
      rpc(client, 'review_admin_platform_configuration', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_revision: expectedRevision,
        p_reason: reason,
        p_request_id: requestId,
      }),
    publish: (admin, versionId, expectedRevision, expectedActiveRevision, reason, requestId) =>
      rpc(client, 'publish_admin_platform_configuration', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_revision: expectedRevision,
        p_expected_active_revision: expectedActiveRevision,
        p_reason: reason,
        p_request_id: requestId,
      }),
    rollback: (admin, versionId, expectedActiveRevision, reason, requestId) =>
      rpc(client, 'rollback_admin_platform_configuration', {
        ...identity(admin),
        p_version_id: versionId,
        p_expected_active_revision: expectedActiveRevision,
        p_reason: reason,
        p_request_id: requestId,
      }),
  };
}
