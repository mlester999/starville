import { describe, expect, it } from 'vitest';

import {
  environmentNameSchema,
  httpUrlSchema,
  hostSchema,
  originAllowlistSchema,
  portSchema,
  publicApplicationUrlsSchema,
  webSocketUrlSchema,
} from '../src/index';

describe('environment validation', () => {
  it('accepts only supported environments', () => {
    expect(environmentNameSchema.parse('development')).toBe('development');
    expect(() => environmentNameSchema.parse('staging')).toThrow();
  });
});

describe('URL validation', () => {
  it('accepts HTTP application URLs and rejects unrelated protocols', () => {
    expect(httpUrlSchema.parse('https://starville.example')).toBe('https://starville.example');
    expect(() => httpUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(() => httpUrlSchema.parse('not-a-url')).toThrow();
    expect(() => httpUrlSchema.parse('https://user:password@example.com')).toThrow();
  });

  it('accepts only WebSocket protocols for real-time URLs', () => {
    expect(webSocketUrlSchema.parse('wss://realtime.starville.example')).toBe(
      'wss://realtime.starville.example',
    );
    expect(() => webSocketUrlSchema.parse('https://realtime.starville.example')).toThrow();
  });

  it('rejects an invalid required URL in the public URL group', () => {
    expect(() =>
      publicApplicationUrlsSchema.parse({
        landingUrl: 'http://localhost:3000',
        gameUrl: 'http://localhost:3001',
        adminUrl: 'invalid',
        apiUrl: 'http://localhost:4000',
        realtimeUrl: 'ws://localhost:4001',
      }),
    ).toThrow();
  });
});

describe('port validation', () => {
  it.each(['1', 4000, '65535'])('accepts valid port %s', (value) => {
    expect(portSchema.parse(value)).toBe(Number(value));
  });

  it.each([0, '0', 65_536, '4.5', 'not-a-port', ''])('rejects invalid port %s', (value) => {
    expect(() => portSchema.parse(value)).toThrow();
  });
});

describe('bind host validation', () => {
  it.each(['127.0.0.1', '0.0.0.0', 'localhost', 'service.internal', '::1'])(
    'accepts host %s',
    (host) => {
      expect(hostSchema.parse(host)).toBe(host);
    },
  );

  it.each(['http://localhost', 'host/path', 'host name', ''])('rejects host %s', (host) => {
    expect(() => hostSchema.parse(host)).toThrow();
  });
});

describe('origin allowlists', () => {
  it('parses, normalizes, and de-duplicates comma-separated origins', () => {
    expect(
      originAllowlistSchema.parse(
        'http://localhost:3000, https://starville.example, http://localhost:3000',
      ),
    ).toEqual(['http://localhost:3000', 'https://starville.example']);
  });

  it('rejects origins containing paths', () => {
    expect(() => originAllowlistSchema.parse('https://starville.example/private')).toThrow();
  });
});
