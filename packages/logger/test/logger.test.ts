import { describe, expect, it } from 'vitest';

import { createLogger, redactLogValue } from '../src/index';

function captureLogger(level: 'debug' | 'info' = 'debug') {
  const lines: string[] = [];
  const logger = createLogger({
    service: 'api',
    environment: 'test',
    level,
    clock: () => new Date('2026-01-02T03:04:05.000Z'),
    destination: { write: (line) => lines.push(line) },
  });

  return { logger, lines };
}

describe('structured logging', () => {
  it('writes consistent metadata and request bindings', () => {
    const { logger, lines } = captureLogger();

    logger.child({ requestId: 'request-123' }).info('request completed', { statusCode: 200 });

    expect(JSON.parse(lines[0] ?? '{}')).toEqual({
      requestId: 'request-123',
      statusCode: 200,
      level: 'info',
      timestamp: '2026-01-02T03:04:05.000Z',
      service: 'api',
      environment: 'test',
      message: 'request completed',
    });
  });

  it('honors the configured minimum level', () => {
    const { logger, lines } = captureLogger('info');

    logger.debug('not emitted');
    logger.warn('emitted');

    expect(lines).toHaveLength(1);
  });
});

describe('secret redaction', () => {
  it('redacts nested credentials and privileged URLs', () => {
    const secrets = {
      password: 'password-value',
      authorization: 'Bearer auth-value',
      token: 'generic-auth-token',
      apiKey: 'api-key-value',
      credentials: 'credential-value',
      nested: {
        walletCredentials: 'wallet-credential-value',
        privateKey: 'private-key-value',
        seedPhrase: 'twelve sensitive seed words belong here',
        supabaseServiceRoleKey: 'service-role-value',
        databaseUrl: 'postgresql://user:password@database/starville',
        solanaRpcUrl: 'https://rpc.example/?api-key=sensitive',
      },
    };

    const serialized = JSON.stringify(redactLogValue(secrets));

    for (const secret of [
      'password-value',
      'auth-value',
      'generic-auth-token',
      'api-key-value',
      'credential-value',
      'wallet-credential-value',
      'private-key-value',
      'twelve sensitive seed words belong here',
      'service-role-value',
      'postgresql://user:password@database/starville',
      'https://rpc.example/?api-key=sensitive',
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(serialized).toContain('[REDACTED]');
  });

  it('serializes errors while removing secrets from messages and fields', () => {
    const error = new Error('request failed with Bearer very-secret-token');
    Object.assign(error, { accessToken: 'another-secret' });
    const { logger, lines } = captureLogger();

    logger.error('operation failed', { error });

    const output = lines[0] ?? '';
    expect(output).toContain('operation failed');
    expect(output).toContain('Bearer [REDACTED]');
    expect(output).not.toContain('very-secret-token');
    expect(output).not.toContain('another-secret');
  });
});
