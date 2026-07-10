import type { EnvironmentName } from '@starville/shared-types';
import type { AdminAssuranceLevel, AdminAuthorizationResult } from '@starville/admin-auth';

export type { LogContext, StructuredLogger as ServiceLogger } from '@starville/logger';

export interface ApiRuntimeConfig {
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly corsAllowedOrigins: readonly string[];
}

export interface VerifiedSupabaseIdentity {
  readonly userId: string;
  readonly authSessionId: string;
  readonly assuranceLevel: AdminAssuranceLevel;
  readonly authenticationMethods: readonly string[];
}

export type AdminAuthorizationDenialReason =
  'ADMIN_ACCESS_DENIED' | 'ADMIN_SESSION_INVALID' | 'MFA_REQUIRED' | 'MISSING_PERMISSION';

export interface AdminAuthGateway {
  verifyBearer(accessToken: string): Promise<VerifiedSupabaseIdentity | undefined>;
  loadAuthorization(identity: VerifiedSupabaseIdentity): Promise<AdminAuthorizationResult>;
  createSession(
    identity: VerifiedSupabaseIdentity,
    expiresAt: Date,
    requestId: string,
  ): Promise<AdminAuthorizationResult>;
  revokeCurrentSession(identity: VerifiedSupabaseIdentity, requestId: string): Promise<boolean>;
  recordDenial(
    identity: VerifiedSupabaseIdentity,
    requestId: string,
    reason: AdminAuthorizationDenialReason,
  ): Promise<void>;
}
