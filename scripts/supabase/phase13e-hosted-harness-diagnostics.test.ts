import { describe, expect, it } from 'vitest';

import {
  hostedHarnessStageError,
  runHostedHarnessStage,
  runWithCriticalCleanup,
  sanitizeHostedHarnessError,
  sanitizeHostedHarnessFailure,
} from './phase13e-hosted-harness-diagnostics';

describe('Phase 13E hosted harness diagnostics', () => {
  it('preserves a primary failure when cleanup succeeds', async () => {
    let captured: unknown;
    try {
      await runWithCriticalCleanup(
        async () => {
          throw hostedHarnessStageError(
            'magic-link-first-use-player-b',
            'auth',
            'SUPABASE_AUTH_ERROR',
            { httpStatus: 403 },
          );
        },
        async () => [],
      );
    } catch (error) {
      captured = error;
    }
    expect(sanitizeHostedHarnessFailure(captured)).toEqual({
      status: 'failed',
      harness: 'phase13e-realtime',
      primary: {
        stage: 'magic-link-first-use-player-b',
        category: 'auth',
        code: 'SUPABASE_AUTH_ERROR',
        retryable: false,
        httpStatus: 403,
      },
      cleanup: { began: true, completed: true, status: 'ok', failures: [] },
    });
  });

  it('reports primary and cleanup failures without replacing either', async () => {
    let captured: unknown;
    try {
      await runWithCriticalCleanup(
        async () => {
          throw hostedHarnessStageError('presence-sync', 'timeout', 'STAGE_TIMEOUT', {
            timeoutMilliseconds: 10_000,
          });
        },
        async () => [
          {
            stage: 'cleanup-auth',
            error: hostedHarnessStageError('cleanup-auth', 'cleanup', 'AUTH_CLEANUP_FAILED'),
          },
        ],
      );
    } catch (error) {
      captured = error;
    }
    const report = sanitizeHostedHarnessFailure(captured);
    expect(report.primary?.stage).toBe('presence-sync');
    expect(report.cleanup).toMatchObject({
      began: true,
      completed: true,
      status: 'failed',
    });
    expect(report.cleanup.failures[0]?.stage).toBe('cleanup-auth');
  });

  it('reports cleanup-only failure separately', async () => {
    let captured: unknown;
    try {
      await runWithCriticalCleanup(
        async () => undefined,
        async () => [
          {
            stage: 'cleanup-database',
            error: hostedHarnessStageError(
              'cleanup-database',
              'cleanup',
              'DATABASE_CLEANUP_FAILED',
            ),
          },
        ],
      );
    } catch (error) {
      captured = error;
    }
    const report = sanitizeHostedHarnessFailure(captured);
    expect(report.primary).toBeNull();
    expect(report.cleanup.failures[0]?.code).toBe('DATABASE_CLEANUP_FAILED');
  });

  it('keeps timeout evidence bounded and stage-aware', () => {
    expect(
      sanitizeHostedHarnessError(
        hostedHarnessStageError('presence-sync', 'timeout', 'STAGE_TIMEOUT', {
          timeoutMilliseconds: 12_000,
          retryable: true,
        }),
      ),
    ).toMatchObject({
      stage: 'presence-sync',
      category: 'timeout',
      timeoutMilliseconds: 12_000,
      retryable: true,
    });
  });

  it('classifies Supabase Auth status failures without serializing messages', async () => {
    let captured: unknown;
    try {
      await runHostedHarnessStage('magic-link-first-use', async () => {
        throw {
          name: 'AuthApiError',
          status: 429,
          message: 'token=secret-value@example.test',
        };
      });
    } catch (error) {
      captured = error;
    }
    expect(sanitizeHostedHarnessError(captured)).toMatchObject({
      stage: 'magic-link-first-use',
      category: 'auth',
      code: 'SUPABASE_AUTH_ERROR',
      httpStatus: 429,
      retryable: true,
    });
    expect(JSON.stringify(sanitizeHostedHarnessError(captured))).not.toContain('secret-value');
  });

  it('handles non-Error thrown values without echoing them', async () => {
    let captured: unknown;
    try {
      await runHostedHarnessStage('wrong-player-denial', async () => {
        throw 'jwt.secret.payload';
      });
    } catch (error) {
      captured = error;
    }
    expect(sanitizeHostedHarnessError(captured)).toMatchObject({
      stage: 'wrong-player-denial',
      category: 'non-error',
      code: 'NON_ERROR_THROWN',
    });
    expect(JSON.stringify(sanitizeHostedHarnessError(captured))).not.toContain('jwt.secret');
  });

  it('never serializes secret-shaped messages or arbitrary nested cause fields', () => {
    const secret = new Error(
      'Bearer eyJhbGciOi.test.signature email=user@example.test wallet=private-wallet',
      {
        cause: {
          requestHeaders: { authorization: 'service-role-secret' },
          response: { privateRow: 'complete-player-id' },
        },
      },
    );
    const serialized = JSON.stringify(sanitizeHostedHarnessError(secret, 'target-preflight'));
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('@example.test');
    expect(serialized).not.toContain('service-role-secret');
    expect(serialized).not.toContain('complete-player-id');
  });

  it('preserves the original inner stage through nested stage wrappers', async () => {
    let captured: unknown;
    try {
      await runHostedHarnessStage('outer-stage', () =>
        runHostedHarnessStage('original-stage', async () => {
          throw new Error('private detail');
        }),
      );
    } catch (error) {
      captured = error;
    }
    expect(sanitizeHostedHarnessError(captured).stage).toBe('original-stage');
  });
});
