import { z } from 'zod';

import {
  walletAddressSchema as syntacticWalletAddressSchema,
  walletNetworkSchema,
} from '@starville/wallet-access';

export const TOKEN_CLAIM_ARCHITECTURE_VERSION = 1 as const;
export const TOKEN_CLAIM_ARCHITECTURE_MODE = 'phase_9b_a_architecture' as const;
export const TOKEN_CLAIMS_ENABLED = false as const;
export const OFFLINE_SIMULATION_LABEL = 'OFFLINE SIMULATION' as const;
export const NO_BLOCKCHAIN_ACTION_NOTICE = 'NO BLOCKCHAIN TRANSACTION WAS SENT' as const;
export const ARCHITECTURE_DISABLED_NOTICE = 'TOKEN CLAIMS DISABLED' as const;
export const MAX_TOKEN_BASE_UNITS = 18_446_744_073_709_551_615n;
export const MAX_SOL_LAMPORTS = 18_446_744_073_709_551_615n;

export const fixtureMintAddress = 'So11111111111111111111111111111111111111112' as const;
export const fixtureRecipientWallet = '11111111111111111111111111111111' as const;
export const fixtureTreasuryAddress = 'SysvarRent111111111111111111111111111111111' as const;

export const timestampSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => new Date(value).toISOString() === value, 'Timestamp must use normalized UTC.');
export const safeText = (minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .refine((value) => !/[<>\p{Cc}]/u.test(value), 'Text contains unsupported markup or controls');

function boundedIntegerString(maximum: bigint, allowZero: boolean) {
  return z
    .string()
    .regex(allowZero ? /^\d+$/u : /^[1-9]\d*$/u)
    .refine((value) => BigInt(value) <= maximum, `Value must not exceed ${maximum.toString()}`);
}

export const tokenBaseUnitsSchema = boundedIntegerString(MAX_TOKEN_BASE_UNITS, false);
export const nonnegativeTokenBaseUnitsSchema = boundedIntegerString(MAX_TOKEN_BASE_UNITS, true);
export const lamportsSchema = boundedIntegerString(MAX_SOL_LAMPORTS, true);
export const positiveLamportsSchema = boundedIntegerString(MAX_SOL_LAMPORTS, false);
export const tokenDecimalsSchema = z.number().int().min(0).max(18);
export const tokenProgramTypeSchema = z.enum(['spl-token', 'spl-token-2022']);
export type TokenProgramType = z.infer<typeof tokenProgramTypeSchema>;

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function decodedBase58Length(input: string): number {
  let value = 0n;
  for (const character of input) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return -1;
    value = value * 58n + BigInt(digit);
  }
  let significantBytes = 0;
  for (let remaining = value; remaining > 0n; remaining >>= 8n) significantBytes += 1;
  let leadingZeroBytes = 0;
  while (input[leadingZeroBytes] === '1') leadingZeroBytes += 1;
  return leadingZeroBytes + significantBytes;
}

export const walletAddressSchema = syntacticWalletAddressSchema.refine(
  (value) => decodedBase58Length(value) === 32,
  'Wallet address must decode to exactly 32 bytes.',
);

function encodeFixtureAddress(bytes: readonly number[]): string {
  if (bytes.length !== 32) throw new Error('Fixture address input must contain exactly 32 bytes.');
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) + BigInt(byte);
  let encoded = '';
  while (value > 0n) {
    const remainder = Number(value % 58n);
    encoded = `${BASE58_ALPHABET[remainder] ?? '1'}${encoded}`;
    value /= 58n;
  }
  let leadingZeroBytes = 0;
  while (bytes[leadingZeroBytes] === 0) leadingZeroBytes += 1;
  return `${'1'.repeat(leadingZeroBytes)}${encoded}`;
}

export const publicEligibilityIdSchema = z.string().regex(/^ELIG-MOCK-[A-F0-9]{32}$/u);
export const publicClaimIdSchema = z.string().regex(/^CLAIM-MOCK-[A-F0-9]{32}$/u);
export const publicAuthorizationIdSchema = z.string().regex(/^AUTH-MOCK-[A-F0-9]{32}$/u);
export const publicEpochIdSchema = z.string().regex(/^EPOCH-MOCK-[A-F0-9]{16}$/u);
export const publicQuarantineIdSchema = z.string().regex(/^QUAR-MOCK-[A-F0-9]{24}$/u);
export const publicDisputeIdSchema = z.string().regex(/^DISP-MOCK-[A-F0-9]{24}$/u);
export const safePlayerIdSchema = z.string().regex(/^PLAYER-MOCK-[A-F0-9]{20}$/u);
export const sourceReceiptIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$/u);
export const sourceReceiptDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/u);
export const auditCorrelationSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/u);
export const policyVersionSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-v[1-9]\d*$/u);
export const campaignIdSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const treasuryIdentifierSchema = z
  .string()
  .min(3)
  .max(80)
  .regex(/^fixture-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u);
export const mockNonceSchema = z.string().regex(/^NONCE-MOCK-[A-F0-9]{32}$/u);

export { walletNetworkSchema };

export function toBaseUnits(value: string): bigint {
  return BigInt(nonnegativeTokenBaseUnitsSchema.parse(value));
}

export function fromBaseUnits(value: bigint): string {
  if (value < 0n || value > MAX_TOKEN_BASE_UNITS) {
    throw new Error('Base-unit value is outside the supported unsigned range.');
  }
  return value.toString();
}

export function immutableArchitectureCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => immutableArchitectureCopy(entry))) as T;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, entry]) => [
      key,
      immutableArchitectureCopy(entry),
    ]);
    return Object.freeze(Object.fromEntries(entries)) as T;
  }
  return value;
}

function fixtureHashLane(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (const character of input) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619) >>> 0;
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

/**
 * Stable fixture identifier helper. This is deliberately non-cryptographic and must never be
 * treated as authorization evidence.
 */
export function deterministicFixtureDigest(domain: string, fields: readonly string[]): string {
  const canonical = [domain, ...fields]
    .map((value) => `${value.length.toString(10)}:${value}`)
    .join('|');
  return [2_166_136_261, 2_654_435_761, 2_246_822_519, 3_266_489_917]
    .map((seed) => fixtureHashLane(canonical, seed).toString(16).padStart(8, '0'))
    .join('')
    .toUpperCase();
}

export function createDeterministicFixtureAddress(sequence: number): string {
  const boundedSequence = z.number().int().min(1).max(10_000_000).parse(sequence);
  const digest = deterministicFixtureDigest('starville.mock.address.v1', [
    boundedSequence.toString(),
  ]);
  const bytes = Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(digest.slice((index % 16) * 2, (index % 16) * 2 + 2), 16),
  );
  return walletAddressSchema.parse(encodeFixtureAddress(bytes));
}
