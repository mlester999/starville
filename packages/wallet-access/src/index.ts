import { z } from 'zod';

export const SOLANA_NETWORKS = ['solana:devnet', 'solana:mainnet-beta'] as const;
export const walletNetworkSchema = z.enum(SOLANA_NETWORKS);
export type WalletNetwork = z.infer<typeof walletNetworkSchema>;

export const walletAddressSchema = z
  .string()
  .trim()
  .min(32, 'Wallet address is too short')
  .max(44, 'Wallet address is too long')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/u, 'Wallet address must use base58 characters');

const safeLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9 .:_-]+$/u, 'Value contains unsupported characters');
const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/u, 'Nonce format is invalid');
const challengeIdSchema = z.uuid();
const absoluteHttpUrlSchema = z.url().superRefine((value, context) => {
  const parsed = new URL(value);

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    context.addIssue({ code: 'custom', message: 'URI must be an HTTP URL without credentials' });
  }
});

export interface CanonicalWalletMessageInput {
  readonly domain: string;
  readonly uri: string;
  readonly walletAddress: string;
  readonly network: WalletNetwork;
  readonly nonce: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly challengeId: string;
}

const canonicalWalletMessageInputSchema = z
  .object({
    domain: safeLabelSchema,
    uri: absoluteHttpUrlSchema,
    walletAddress: walletAddressSchema,
    network: walletNetworkSchema,
    nonce: nonceSchema,
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    challengeId: challengeIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const uri = new URL(value.uri);

    if (uri.host !== value.domain) {
      context.addIssue({ code: 'custom', path: ['domain'], message: 'Domain must match URI host' });
    }

    if (Date.parse(value.expiresAt) <= Date.parse(value.issuedAt)) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Expiration must be after issue time',
      });
    }
  });

const AUTHENTICATION_STATEMENT =
  'Authenticate access to Starville. This does not authorize a blockchain transaction, transfer tokens, or grant spending authority.';

export function createCanonicalWalletMessage(input: CanonicalWalletMessageInput): string {
  const value = canonicalWalletMessageInputSchema.parse(input);

  return [
    `${value.domain} wants you to sign in to Starville with your Solana account:`,
    value.walletAddress,
    '',
    AUTHENTICATION_STATEMENT,
    '',
    `URI: ${value.uri}`,
    'Version: 1',
    `Network: ${value.network}`,
    `Nonce: ${value.nonce}`,
    `Issued At: ${value.issuedAt}`,
    `Expiration Time: ${value.expiresAt}`,
    `Challenge ID: ${value.challengeId}`,
  ].join('\n');
}

export function parseCanonicalWalletMessage(message: string): CanonicalWalletMessageInput {
  if (message.length > 2_048) {
    throw new Error('Wallet message is too long');
  }

  const lines = message.split('\n');

  if (
    lines.length !== 12 ||
    lines[2] !== '' ||
    lines[3] !== AUTHENTICATION_STATEMENT ||
    lines[4] !== '' ||
    lines[6] !== 'Version: 1'
  ) {
    throw new Error('Wallet message format is invalid');
  }

  const heading =
    /^(?<domain>.+) wants you to sign in to Starville with your Solana account:$/u.exec(
      lines[0] ?? '',
    );
  const field = (line: string | undefined, prefix: string): string => {
    if (line === undefined || !line.startsWith(prefix)) {
      throw new Error('Wallet message format is invalid');
    }

    return line.slice(prefix.length);
  };

  const parsed = canonicalWalletMessageInputSchema.parse({
    domain: heading?.groups?.['domain'],
    walletAddress: lines[1],
    uri: field(lines[5], 'URI: '),
    network: field(lines[7], 'Network: '),
    nonce: field(lines[8], 'Nonce: '),
    issuedAt: field(lines[9], 'Issued At: '),
    expiresAt: field(lines[10], 'Expiration Time: '),
    challengeId: field(lines[11], 'Challenge ID: '),
  });

  if (createCanonicalWalletMessage(parsed) !== message) {
    throw new Error('Wallet message is not canonical');
  }

  return parsed;
}

export const tokenAccessAvailabilitySchema = z.enum(['available', 'disabled', 'unconfigured']);
export type TokenAccessAvailability = z.infer<typeof tokenAccessAvailabilitySchema>;

export const tokenAccessPublicConfigSchema = z
  .object({
    enabled: z.boolean(),
    availability: tokenAccessAvailabilitySchema,
    network: walletNetworkSchema,
    symbol: z.string().trim().min(1).max(16),
    mintAddress: walletAddressSchema.nullable(),
    requiredAmount: z.string().regex(/^\d+(?:\.\d+)?$/u),
    recheckIntervalSeconds: z.number().int().min(30).max(3_600),
  })
  .strict();
export type TokenAccessPublicConfig = z.infer<typeof tokenAccessPublicConfigSchema>;

export const tokenAccessChallengeRequestSchema = z
  .object({ walletAddress: walletAddressSchema, network: walletNetworkSchema })
  .strict();
export type TokenAccessChallengeRequest = z.infer<typeof tokenAccessChallengeRequestSchema>;

export const tokenAccessChallengeSchema = z
  .object({
    challengeId: challengeIdSchema,
    message: z.string().min(1).max(2_048),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export type TokenAccessChallenge = z.infer<typeof tokenAccessChallengeSchema>;

export const tokenAccessVerifyRequestSchema = z
  .object({
    challengeId: challengeIdSchema,
    walletAddress: walletAddressSchema,
    network: walletNetworkSchema,
    message: z.string().min(1).max(2_048),
    signature: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/u, 'Signature must be base64 encoded'),
  })
  .strict();
export type TokenAccessVerifyRequest = z.infer<typeof tokenAccessVerifyRequestSchema>;

export const tokenAccessStateSchema = z.enum([
  'granted',
  'none',
  'expired',
  'revoked',
  'insufficient_balance',
  'configuration_changed',
]);
export type TokenAccessState = z.infer<typeof tokenAccessStateSchema>;

export const tokenAccessSessionViewSchema = z
  .object({
    access: tokenAccessStateSchema,
    walletAddress: walletAddressSchema.optional(),
    network: walletNetworkSchema,
    symbol: z.string().trim().min(1).max(16),
    requiredAmount: z.string().regex(/^\d+(?:\.\d+)?$/u),
    observedAmount: z
      .string()
      .regex(/^\d+(?:\.\d+)?$/u)
      .optional(),
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    recheckAfter: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();
export type TokenAccessSessionView = z.infer<typeof tokenAccessSessionViewSchema>;

export function decimalAmountToRaw(amount: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be an integer between 0 and 18');
  }

  const match = /^(?<whole>\d+)(?:\.(?<fraction>\d+))?$/u.exec(amount.trim());
  const whole = match?.groups?.['whole'];
  const fraction = match?.groups?.['fraction'] ?? '';

  if (whole === undefined || fraction.length > decimals) {
    throw new Error('Token amount cannot be represented exactly with the configured decimals');
  }

  return BigInt(`${whole}${fraction.padEnd(decimals, '0')}`);
}

export function rawAmountToDecimal(rawAmount: bigint | string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new Error('Token decimals must be an integer between 0 and 18');
  }

  const raw = typeof rawAmount === 'string' ? BigInt(rawAmount) : rawAmount;

  if (raw < 0n) {
    throw new Error('Raw token amount cannot be negative');
  }

  if (decimals === 0) {
    return raw.toString();
  }

  const digits = raw.toString().padStart(decimals + 1, '0');
  const whole = digits.slice(0, -decimals);
  const fraction = digits.slice(-decimals).replace(/0+$/u, '');
  return fraction === '' ? whole : `${whole}.${fraction}`;
}
