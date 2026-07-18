import type { EnvironmentName } from '@starville/shared-types';

export type { LogContext, StructuredLogger as ServiceLogger } from '@starville/logger';

export interface RealtimeRuntimeConfig {
  readonly environment: EnvironmentName;
  readonly host: string;
  readonly port: number;
  readonly allowedOrigins: readonly string[];
  readonly connectionLimit: number;
  readonly ticketSecret: string;
  readonly authenticationTimeoutMs: number;
  readonly checkpointIntervalMs: number;
  readonly revalidationIntervalMs: number;
  readonly idleTimeoutMs: number;
  readonly chatNearbyDistance?: number;
  readonly chatRateLimits?: {
    readonly shortWindowMessages: number;
    readonly minuteMessages: number;
    readonly hourlyReports: number;
    readonly minuteSafetyActions: number;
    readonly malformedMessages: number;
  };
  readonly socialRateLimits?: {
    readonly inspectPerMinute: number;
    readonly requestsPerMinute: number;
    readonly responsesPerMinute: number;
    readonly offersPerMinute: number;
    readonly confirmationsPerMinute: number;
    readonly cancellationsPerMinute: number;
  };
  readonly socialGraphRateLimits?: {
    readonly friendRequestsPerMinute: number;
    readonly friendResponsesPerMinute: number;
    readonly friendRemovalsPerMinute: number;
    readonly partyCreationsPerHour: number;
    readonly partyInvitationsPerMinute: number;
    readonly partyResponsesPerMinute: number;
    readonly partyMembershipActionsPerMinute: number;
    readonly readyChecksPerMinute: number;
    readonly readyResponsesPerMinute: number;
  };
}
