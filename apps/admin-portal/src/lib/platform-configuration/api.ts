import 'server-only';

import {
  adminPlatformConfigurationSchema,
  platformMutationResultSchema,
  platformVersionSchema,
  type AdminPlatformConfiguration,
  type PlatformConfiguration,
  type PlatformMutationResult,
  type PlatformVersion,
} from '@starville/platform-configuration';

import { callTrustedAdminApi } from '../admin-api';

export function loadPlatformConfiguration(
  platformKey = 'starville',
): Promise<AdminPlatformConfiguration> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/platform-configuration/${encodeURIComponent(platformKey)}`,
    parser: (value) => adminPlatformConfigurationSchema.parse(value),
  });
}

export function loadPlatformPreview(
  versionId: string,
  platformKey = 'starville',
): Promise<PlatformVersion> {
  return callTrustedAdminApi({
    method: 'GET',
    pathname: `/api/v1/admin/platform-configuration/${encodeURIComponent(platformKey)}/preview/${encodeURIComponent(versionId)}`,
    parser: (value) => platformVersionSchema.parse(value),
  });
}

function mutation(
  pathname: string,
  method: 'POST' | 'PATCH',
  body: Readonly<Record<string, unknown>>,
  requestId: string,
): Promise<PlatformMutationResult> {
  return callTrustedAdminApi({
    method,
    pathname,
    body,
    requestId,
    parser: (value) => platformMutationResultSchema.parse(value),
  });
}

export function createPlatformDraft(reason: string, requestId: string) {
  return mutation(
    '/api/v1/admin/platform-configuration/drafts',
    'POST',
    { platformKey: 'starville', reason },
    requestId,
  );
}

export function updatePlatformDraft(
  versionId: string,
  input: {
    readonly expectedRevision: number;
    readonly configuration: PlatformConfiguration;
    readonly reason: string;
  },
  requestId: string,
) {
  return mutation(
    `/api/v1/admin/platform-configuration/versions/${encodeURIComponent(versionId)}`,
    'PATCH',
    input,
    requestId,
  );
}

export function applyPlatformVersionAction(
  versionId: string,
  action: 'validate' | 'submit-review' | 'review' | 'publish' | 'rollback',
  input: Readonly<Record<string, unknown>>,
  requestId: string,
) {
  return mutation(
    `/api/v1/admin/platform-configuration/versions/${encodeURIComponent(versionId)}/${action}`,
    'POST',
    input,
    requestId,
  );
}
