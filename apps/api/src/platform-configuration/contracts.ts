import type {
  ActivePlatformConfiguration,
  AdminPlatformConfiguration,
  PlatformConfiguration,
  PlatformMutationResult,
  PlatformVersion,
  ValidationResult,
} from '@starville/platform-configuration';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface PlatformConfigurationGateway {
  getActive(platformKey: string): Promise<unknown>;
  getAdmin(identity: AdminDatabaseIdentity, platformKey: string): Promise<unknown>;
  preview(
    identity: AdminDatabaseIdentity,
    platformKey: string,
    versionId: string,
  ): Promise<unknown>;
  createDraft(
    identity: AdminDatabaseIdentity,
    platformKey: string,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    configuration: PlatformConfiguration,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  validate(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    validation: ValidationResult,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  submitReview(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  review(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  publish(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedRevision: number,
    expectedActiveRevision: number,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
  rollback(
    identity: AdminDatabaseIdentity,
    versionId: string,
    expectedActiveRevision: number,
    reason: string,
    requestId: string,
  ): Promise<unknown>;
}

export interface PlatformConfigurationService {
  getActive(platformKey: unknown, requestId: string): Promise<ActivePlatformConfiguration>;
  getAdmin(
    identity: AdminDatabaseIdentity,
    platformKey: unknown,
    requestId: string,
  ): Promise<AdminPlatformConfiguration>;
  preview(
    identity: AdminDatabaseIdentity,
    platformKey: unknown,
    versionId: unknown,
    requestId: string,
  ): Promise<PlatformVersion>;
  createDraft(
    identity: AdminDatabaseIdentity,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  updateDraft(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  validate(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  submitReview(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  review(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  publish(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  rollback(
    identity: AdminDatabaseIdentity,
    versionId: unknown,
    input: unknown,
    requestId: string,
  ): Promise<PlatformMutationResult>;
  invalidate(platformKey: string): void;
}
