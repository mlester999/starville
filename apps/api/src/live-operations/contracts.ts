import type {
  AdminLiveOperations,
  AnnouncementMutation,
  MaintenanceMutation,
  PublicLiveOperations,
} from '@starville/live-operations';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface LiveOperationsQuery {
  readonly search: string;
  readonly status: string;
  readonly severity: string;
  readonly presentation: string;
  readonly sort: string;
  readonly direction: string;
  readonly page: number;
  readonly pageSize: number;
  readonly auditPage: number;
  readonly auditPageSize: number;
}

export type LiveOperationsMutationResult =
  | {
      readonly status: 'updated' | 'saved';
      readonly id?: string | undefined;
      readonly revision: number;
    }
  | { readonly status: 'version_conflict' };

export interface LiveOperationsGateway {
  getPublic(): Promise<unknown>;
  getAdmin(identity: AdminDatabaseIdentity, query: LiveOperationsQuery): Promise<unknown>;
  updateMaintenance(
    identity: AdminDatabaseIdentity,
    input: MaintenanceMutation,
    requestId: string,
  ): Promise<unknown>;
  saveAnnouncement(
    identity: AdminDatabaseIdentity,
    input: AnnouncementMutation,
    requestId: string,
  ): Promise<unknown>;
  setAnnouncementStatus(
    identity: AdminDatabaseIdentity,
    id: string,
    revision: number,
    action: 'publish' | 'deactivate' | 'archive',
    reason: string,
    requestId: string,
  ): Promise<unknown>;
}

export interface LiveOperationsService {
  getPublic(requestId: string): Promise<PublicLiveOperations>;
  getAdmin(identity: AdminDatabaseIdentity, query: unknown): Promise<AdminLiveOperations>;
  updateMaintenance(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<LiveOperationsMutationResult>;
  saveAnnouncement(
    identity: AdminDatabaseIdentity,
    body: unknown,
    requestId: string,
  ): Promise<LiveOperationsMutationResult>;
  setAnnouncementStatus(
    identity: AdminDatabaseIdentity,
    id: unknown,
    action: unknown,
    body: unknown,
    requestId: string,
  ): Promise<LiveOperationsMutationResult>;
}
