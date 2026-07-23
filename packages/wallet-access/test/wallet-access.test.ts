import { describe, expect, it } from 'vitest';

import {
  createCanonicalWalletMessage,
  decimalAmountToRaw,
  parseCanonicalWalletMessage,
  rawAmountToDecimal,
  tokenAccessVerifyRequestSchema,
} from '../src/index';
import {
  generateAccessSessionToken,
  generateWalletNonce,
  hashAccessSessionToken,
  hashesEqual,
  sha256Hex,
} from '../src/server';

const canonicalInput = {
  domain: 'localhost:3000',
  uri: 'http://localhost:3000',
  walletAddress: '11111111111111111111111111111111',
  network: 'solana:devnet',
  nonce: '0123456789abcdef0123456789abcdef',
  issuedAt: '2026-07-10T12:00:00.000Z',
  expiresAt: '2026-07-10T12:05:00.000Z',
  challengeId: '11111111-1111-4111-8111-111111111111',
} as const;

describe('canonical Starville wallet message', () => {
  it('round-trips an exact, human-readable authentication message', () => {
    const message = createCanonicalWalletMessage(canonicalInput);

    expect(message).toContain('does not authorize a blockchain transaction');
    expect(message).toContain('does not authorize a blockchain transaction, transfer tokens');
    expect(parseCanonicalWalletMessage(message)).toEqual(canonicalInput);
  });

  it('rejects changed message bytes and mismatched domain/URI values', () => {
    const message = createCanonicalWalletMessage(canonicalInput);

    expect(() => parseCanonicalWalletMessage(message.replace('Starville', 'Otherville'))).toThrow();
    expect(() =>
      createCanonicalWalletMessage({ ...canonicalInput, domain: 'untrusted.example' }),
    ).toThrow();
  });

  it('round-trips the configured Mainnet identifier without weakening replay protection', () => {
    const input = { ...canonicalInput, network: 'solana:mainnet-beta' } as const;
    const message = createCanonicalWalletMessage(input);

    expect(message).toContain('Network: solana:mainnet-beta');
    expect(parseCanonicalWalletMessage(message)).toEqual(input);
  });

  it('rejects malformed base64 verification signatures', () => {
    expect(() =>
      tokenAccessVerifyRequestSchema.parse({
        challengeId: canonicalInput.challengeId,
        walletAddress: canonicalInput.walletAddress,
        network: canonicalInput.network,
        message: createCanonicalWalletMessage(canonicalInput),
        signature: 'not_base64!',
      }),
    ).toThrow();
  });
});

describe('exact token amounts', () => {
  it.each([
    { decimals: 0, raw: 10_000n },
    { decimals: 6, raw: 10_000_000_000n },
    { decimals: 9, raw: 10_000_000_000_000n },
  ])('converts 10,000 display tokens with $decimals decimals exactly', ({ decimals, raw }) => {
    expect(decimalAmountToRaw('10000', decimals)).toBe(raw);
    expect(rawAmountToDecimal(raw, decimals)).toBe('10000');
  });

  it('preserves thresholds and balances beyond Number.MAX_SAFE_INTEGER', () => {
    const display = '9007199254740993000000';
    const raw = 9_007_199_254_740_993_000_000_000_000n;

    expect(decimalAmountToRaw(display, 6)).toBe(raw);
    expect(rawAmountToDecimal(raw, 6)).toBe(display);
  });

  it('rejects malformed, negative, and unrepresentable thresholds', () => {
    expect(() => decimalAmountToRaw('1.0000001', 6)).toThrow();
    for (const amount of ['-10000', 'NaN', 'Infinity', '10000.1']) {
      expect(() => decimalAmountToRaw(amount, 0)).toThrow();
    }
  });
});

describe('server-only tokens and hashes', () => {
  it('generates independent high-entropy values and hashes tokens with a separate secret', () => {
    const nonce = generateWalletNonce();
    const token = generateAccessSessionToken();
    const hash = hashAccessSessionToken(token, 'a'.repeat(32));

    expect(nonce).not.toBe(token);
    expect(nonce.length).toBeGreaterThanOrEqual(43);
    expect(token.length).toBeGreaterThanOrEqual(43);
    expect(hash).not.toContain(token);
    expect(hashesEqual(hash, hashAccessSessionToken(token, 'a'.repeat(32)))).toBe(true);
    expect(hashesEqual(hash, sha256Hex(token))).toBe(false);
  });
});
