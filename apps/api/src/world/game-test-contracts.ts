import type { EnvironmentName } from '@starville/shared-types';
import type { MapManifest, PlayerStateUpdate } from '@starville/game-core';
import type { WorldAssetDelivery } from '@starville/asset-management';

import type { AdminDatabaseIdentity } from '../contracts.js';

export interface WorldGameTestGateway {
  create(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  exchange(input: Readonly<Record<string, unknown>>): Promise<unknown>;
  load(input: Readonly<Record<string, unknown>>): Promise<unknown>;
  statusAdmin(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  exit(input: Readonly<Record<string, unknown>>): Promise<unknown>;
  revoke(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
  recordEvidence(
    identity: AdminDatabaseIdentity,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}

export interface WorldGameTestAdminStatus {
  readonly worldMapId: string;
  readonly worldMapVersionId: string;
  readonly gameTestStatus:
    'passed' | 'failed' | 'blocked' | 'needs_changes' | 'not_tested' | 'test_outdated';
  readonly latestEvidence: {
    readonly id: string;
    readonly result: 'passed' | 'failed' | 'blocked' | 'needs_changes';
    readonly testerAdministratorId: string;
    readonly testerDisplayName: string;
    readonly gameClientBuild: string;
    readonly environment: EnvironmentName;
    readonly recordedAt: string;
  } | null;
  readonly activeSessions: readonly {
    readonly id: string;
    readonly status: 'issued' | 'active';
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly exchangedAt: string | null;
    readonly gameClientBuild: string | null;
  }[];
}

export interface WorldGameTestProjection {
  readonly session: {
    readonly id: string;
    readonly worldMapId: string;
    readonly worldMapVersionId: string;
    readonly environment: EnvironmentName;
    readonly status: 'active';
    readonly returnPath: string;
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly gameClientBuild: string;
  };
  readonly map: {
    readonly id: string;
    readonly slug: MapManifest['slug'];
    readonly displayName: string;
    readonly description: string;
    readonly defaultSpawnId: string;
  };
  readonly version: {
    readonly id: string;
    readonly versionNumber: number;
    readonly editVersion: number;
    readonly checksum: string;
    readonly lifecycleStatus: 'validated' | 'published' | 'superseded';
  };
  readonly manifest: MapManifest;
  readonly assetDeliveries: readonly WorldAssetDelivery[];
  readonly playerState: PlayerStateUpdate;
  readonly previewIdentity: {
    readonly displayName: 'Game Test Administrator';
    readonly appearancePreset: 'moss';
  };
  readonly realtime: {
    readonly mode: 'disabled_private_solo';
    readonly publicChannelJoined: false;
  };
  readonly latestEvidence: {
    readonly id: string;
    readonly result: 'passed' | 'failed' | 'blocked' | 'needs_changes';
    readonly gameClientBuild: string;
    readonly recordedAt: string;
  } | null;
  readonly newerDraftAvailable: boolean;
  readonly restrictions: readonly [
    'no_player_persistence',
    'no_rewards',
    'no_economy',
    'no_inventory',
    'no_social',
    'no_chat',
    'no_public_realtime',
    'no_world_transitions',
  ];
}

export interface WorldGameTestService {
  createAdmin(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<{
    readonly grantToken: string;
    readonly sessionId: string;
    readonly worldMapId: string;
    readonly worldMapVersionId: string;
    readonly environment: EnvironmentName;
    readonly expiresAt: string;
    readonly returnPath: string;
  }>;
  exchange(
    body: unknown,
    requestId: string,
  ): Promise<{
    readonly sessionToken: string;
    readonly projection: WorldGameTestProjection;
  }>;
  load(sessionToken: unknown, requestId: string): Promise<WorldGameTestProjection>;
  statusAdmin(
    identity: AdminDatabaseIdentity,
    mapId: unknown,
    versionId: unknown,
    requestId: string,
  ): Promise<WorldGameTestAdminStatus>;
  exit(sessionToken: unknown, requestId: string): Promise<void>;
  revokeAdmin(
    identity: AdminDatabaseIdentity,
    sessionId: unknown,
    requestId: string,
  ): Promise<{ readonly sessionId: string }>;
  recordEvidence(
    identity: AdminDatabaseIdentity,
    sessionId: unknown,
    body: unknown,
    requestId: string,
  ): Promise<{
    readonly evidenceId: string;
    readonly sessionId: string;
    readonly worldMapVersionId: string;
    readonly result: 'passed' | 'failed' | 'blocked' | 'needs_changes';
    readonly gameClientBuild: string;
    readonly environment: EnvironmentName;
    readonly recordedAt: string;
    readonly publicationReadiness: 'recommended' | 'not_recommended';
  }>;
}
