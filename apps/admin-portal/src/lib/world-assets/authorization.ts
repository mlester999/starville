import 'server-only';

import {
  hasAdminPermission,
  isAuthorizedAdmin,
  type AdminAuthorizationContext,
  type AdminPermissionKey,
} from '@starville/admin-auth';

import { getCurrentAdminAuthorization, requireAuthorizedAdmin } from '../auth/authorization';
import type { AssetManagerCapabilities } from './contracts';

export type AssetManagerPermission = Extract<AdminPermissionKey, `assets.${string}`>;

export function requireAssetManagerPermission(permission: AssetManagerPermission) {
  return requireAuthorizedAdmin(permission);
}

export async function isAssetManagerRequestAuthorized(
  permission: AssetManagerPermission,
): Promise<boolean> {
  try {
    const result = await getCurrentAdminAuthorization();
    return isAuthorizedAdmin(result) && hasAdminPermission(result.context, permission);
  } catch {
    return false;
  }
}

export function assetManagerCapabilities(
  context: AdminAuthorizationContext,
): AssetManagerCapabilities {
  const canReview = hasAdminPermission(context, 'assets.review');
  return {
    canUpload: hasAdminPermission(context, 'assets.upload'),
    canEdit: hasAdminPermission(context, 'assets.edit'),
    canValidate: hasAdminPermission(context, 'assets.validate'),
    canReview,
    // Approval is deliberately a compound capability at every boundary. A
    // custom role with only assets.approve must not be presented as a reviewer.
    canApprove: canReview && hasAdminPermission(context, 'assets.approve'),
    canActivate: hasAdminPermission(context, 'assets.activate'),
    canDeprecate: hasAdminPermission(context, 'assets.deprecate'),
    canReadAudit: hasAdminPermission(context, 'assets.audit.read'),
  };
}
