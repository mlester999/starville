import type { AdminDatabaseIdentity } from '../contracts.js';

export interface AdminWorldGateway {
  listWorlds(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  getPublishedTopology(identity: AdminDatabaseIdentity): Promise<unknown>;
  getWorld(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  getDraft(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  createDraft(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  saveDraft(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  validateDraft(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  publishVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  deriveVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  previewVersion(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listAudit(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  listAssets(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface AdminWorldService {
  listWorlds(identity: AdminDatabaseIdentity, query: unknown, requestId: string): Promise<unknown>;
  getPublishedTopology(identity: AdminDatabaseIdentity, requestId: string): Promise<unknown>;
  getWorld(identity: AdminDatabaseIdentity, mapId: unknown, requestId: string): Promise<unknown>;
  getDraft(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    requestId: string,
  ): Promise<unknown>;
  createDraft(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  saveDraft(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  validateDraft(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  publishVersion(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  deriveVersion(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<unknown>;
  previewVersion(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    requestId: string,
  ): Promise<unknown>;
  listAudit(
    identity: AdminDatabaseIdentity,
    mapId: unknown | null,
    query: unknown,
    requestId: string,
  ): Promise<unknown>;
  listAssets(identity: AdminDatabaseIdentity, query: unknown, requestId: string): Promise<unknown>;
}
