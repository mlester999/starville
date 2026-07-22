import { describe, expect, it } from 'vitest';

import {
  createPhase13aLocalFixture,
  createPhase13aPerformanceFixture,
  GAMEPLAY_CAPABILITY_STATUSES,
  PHASE13A_AUTHORITATIVE_STATE_MAP,
  PHASE13A_EXACT_ONCE_CASES,
  PHASE13A_EXACT_ONCE_MUTATIONS,
  PHASE13A_FAILURE_MATRIX,
  PHASE13A_GAMEPLAY_CAPABILITIES,
  PHASE13A_LOCAL_FIXTURES,
  PHASE13A_NEW_PLAYER_JOURNEY,
  PHASE13A_RETURNING_PLAYER_JOURNEY,
  runPhase13aExactOnceScenario,
  runPhase13aJourney,
  summarizePhase13aGameplayHealth,
} from '../src';

describe('Phase 13A gameplay integration audit', () => {
  it('uses only the approved capability statuses and records the complete evidence shape', () => {
    expect(PHASE13A_GAMEPLAY_CAPABILITIES.length).toBeGreaterThanOrEqual(19);
    for (const entry of PHASE13A_GAMEPLAY_CAPABILITIES) {
      expect(GAMEPLAY_CAPABILITY_STATUSES).toContain(entry.status);
      expect(entry.playerEntry).not.toHaveLength(0);
      expect(entry.client).not.toHaveLength(0);
      expect(entry.api).not.toHaveLength(0);
      expect(entry.database).not.toHaveLength(0);
      expect(entry.authorization).not.toHaveLength(0);
      expect(entry.rls).not.toHaveLength(0);
      expect(entry.idempotency).not.toHaveLength(0);
      expect(entry.tests.length).toBeGreaterThan(0);
    }
    expect(PHASE13A_GAMEPLAY_CAPABILITIES.find(({ key }) => key === 'animal-care')).toMatchObject({
      status: 'disabled',
      ownerAcceptance: 'not required',
    });
  });

  it('maps every required authoritative state without treating realtime or caches as durable authority', () => {
    expect(PHASE13A_AUTHORITATIVE_STATE_MAP).toHaveLength(30);
    for (const entry of PHASE13A_AUTHORITATIVE_STATE_MAP) {
      expect(entry.database).not.toHaveLength(0);
      expect(entry.api).not.toHaveLength(0);
      expect(entry.clientCache).not.toHaveLength(0);
      expect(entry.invalidation).not.toHaveLength(0);
      expect(entry.conflict).not.toHaveLength(0);
      expect(entry.audit).not.toHaveLength(0);
    }
  });

  it('covers the twenty required failure and recovery classes', () => {
    expect(PHASE13A_FAILURE_MATRIX).toHaveLength(20);
    for (const entry of PHASE13A_FAILURE_MATRIX) {
      expect(entry.rollback).toContain('no partial settlement');
      expect(entry.retry).toContain('authoritative');
      expect(entry.idempotency).toContain('changed payload is rejected');
    }
  });

  it('creates all local-only fixtures including owner plus ten visitors', () => {
    expect(PHASE13A_LOCAL_FIXTURES).toHaveLength(20);
    const visitorFixture = createPhase13aLocalFixture('owner-plus-ten-visitors');
    expect(visitorFixture).toMatchObject({
      participantCount: 11,
      persistence: 'game_test',
      hostedWrites: false,
    });
  });
});

describe('Phase 13A complete player journeys', () => {
  it('runs the exact 26-step new-player path through reconnect and durable projections', () => {
    expect(PHASE13A_NEW_PLAYER_JOURNEY).toHaveLength(26);
    expect(PHASE13A_NEW_PLAYER_JOURNEY.at(0)?.title).toBe('Open Landing');
    expect(PHASE13A_NEW_PLAYER_JOURNEY.at(-1)?.title).toBe('Confirm durable gameplay state');
    expect(runPhase13aJourney('new_player')).toEqual({
      journey: 'new_player',
      completedSteps: 26,
      finalWorld: 'lantern-square',
      inventorySettlements: 4,
      dustSettlements: 1,
      progressionSettlements: 1,
      objectiveSettlements: 1,
      duplicateSettlements: 0,
      restoredAfterReconnect: true,
      persistence: 'game_test',
    });
  });

  it('runs returning-player reconciliation, account switching, and logout cleanup', () => {
    expect(PHASE13A_RETURNING_PLAYER_JOURNEY).toHaveLength(12);
    expect(PHASE13A_RETURNING_PLAYER_JOURNEY.map(({ id }) => id)).toContain('11-account-switch');
    expect(runPhase13aJourney('returning_player')).toMatchObject({
      completedSteps: 12,
      duplicateSettlements: 0,
      restoredAfterReconnect: true,
      persistence: 'game_test',
    });
  });

  it('keeps the deterministic performance fixture bounded and explicitly non-production', () => {
    expect(createPhase13aPerformanceFixture()).toEqual({
      bootstrapRequests: 7,
      duplicateRequests: 0,
      reconnectBurstRequests: 5,
      realtimeListeners: 6,
      participantCount: 11,
      workerDuplicateSettlements: 0,
      logoutResourcesRetained: 0,
      evidence: 'deterministic local fixture; not production timing',
    });
  });
});

describe('Phase 13A exact-once integration framework', () => {
  it.each(PHASE13A_EXACT_ONCE_MUTATIONS)('%s settles once across every retry class', (mutation) => {
    for (const scenario of PHASE13A_EXACT_ONCE_CASES) {
      const result = runPhase13aExactOnceScenario(mutation, scenario);
      expect(result.settlements).toBe(1);
      expect(result.authoritativeValue).toBe(1);
      expect(result.persistence).toBe('game_test');
      expect(result.conflicts).toBe(scenario === 'changed_payload_same_key' ? 1 : 0);
    }
  });

  it('summarizes local evidence without implying hosted health', () => {
    const health = summarizePhase13aGameplayHealth();
    expect(health.evidenceBoundary).toBe('local_repository');
    expect(health.disconnected).toBe(0);
    expect(health.failedIntegrations).toBe(0);
    expect(health.deferredOwnerGates).toBeGreaterThan(0);
    expect(health.phase13bBlockers).toContain('Hosted RLS and role-boundary validation');
  });
});
