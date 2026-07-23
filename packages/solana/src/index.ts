import { MINT_SIZE, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { PublicKey, type AccountInfo } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { z } from 'zod';

import type { WalletNetwork } from '@starville/wallet-access';

const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const NETWORK_GENESIS_HASHES: Readonly<Record<WalletNetwork, string>> = {
  'solana:devnet': DEVNET_GENESIS_HASH,
  'solana:mainnet-beta': MAINNET_GENESIS_HASH,
};
const SUPPORTED_PROGRAMS = new Map([
  [TOKEN_PROGRAM_ID.toBase58(), 'spl-token'],
  [TOKEN_2022_PROGRAM_ID.toBase58(), 'spl-token-2022'],
] as const);
const MAX_MINT_CACHE_ENTRIES = 128;

export type SupportedTokenProgram = 'spl-token' | 'spl-token-2022';
export type SolanaCommitment = 'confirmed' | 'finalized';

export type SolanaVerificationErrorCode =
  | 'INVALID_ADDRESS'
  | 'RPC_UNAVAILABLE'
  | 'NETWORK_MISMATCH'
  | 'MINT_NOT_FOUND'
  | 'UNSUPPORTED_TOKEN_PROGRAM'
  | 'MALFORMED_RPC_RESPONSE';

export class SolanaVerificationError extends Error {
  readonly code: SolanaVerificationErrorCode;

  constructor(code: SolanaVerificationErrorCode) {
    super('Solana token verification could not be completed.');
    this.name = 'SolanaVerificationError';
    this.code = code;
  }
}

export interface SolanaRpcOptions {
  readonly rpcUrl: string;
  readonly network: WalletNetwork;
  readonly commitment: SolanaCommitment;
  readonly timeoutMs?: number;
  readonly maximumAttempts?: number;
  readonly mintCacheTtlMs?: number;
  readonly clock?: () => number;
  readonly fetch?: typeof globalThis.fetch;
}

export interface VerifiedMint {
  readonly mintAddress: string;
  readonly tokenProgram: SupportedTokenProgram;
  readonly tokenProgramAddress: string;
  readonly decimals: number;
  readonly slot: number;
}

export interface VerifiedTokenBalance extends VerifiedMint {
  readonly walletAddress: string;
  readonly rawAmount: bigint;
  readonly tokenAccountCount: number;
}

const rpcEnvelopeSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.number(),
    result: z.unknown().optional(),
    error: z.object({ code: z.number(), message: z.string() }).passthrough().optional(),
  })
  .passthrough();

const contextSchema = z.object({ slot: z.number().int().nonnegative() }).passthrough();
const mintResultSchema = z
  .object({
    context: contextSchema,
    value: z
      .object({
        executable: z.boolean(),
        lamports: z.number().int().nonnegative(),
        owner: z.string(),
        rentEpoch: z.number().int().nonnegative().optional(),
        data: z.tuple([z.string().min(1), z.literal('base64')]),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();

const tokenAccountResultSchema = z
  .object({
    context: contextSchema,
    value: z.array(
      z
        .object({
          pubkey: z.string(),
          account: z
            .object({
              lamports: z.number().int().nonnegative(),
              owner: z.string(),
              data: z
                .object({
                  parsed: z
                    .object({
                      type: z.literal('account'),
                      info: z
                        .object({
                          mint: z.string(),
                          owner: z.string(),
                          state: z.string(),
                          tokenAmount: z
                            .object({
                              amount: z.string().regex(/^\d+$/u),
                              decimals: z.number().int().min(0).max(18),
                            })
                            .passthrough(),
                        })
                        .passthrough(),
                    })
                    .passthrough(),
                })
                .passthrough(),
            })
            .passthrough(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

function parseAddress(address: string): PublicKey {
  try {
    const key = new PublicKey(address);

    if (key.toBase58() !== address) {
      throw new Error('Address is not canonical');
    }

    return key;
  } catch {
    throw new SolanaVerificationError('INVALID_ADDRESS');
  }
}

export function validateSolanaAddress(address: string): string {
  return parseAddress(address).toBase58();
}

export function verifySolanaMessageSignature(input: {
  readonly walletAddress: string;
  readonly message: string;
  readonly signatureBase64: string;
}): boolean {
  const publicKey = parseAddress(input.walletAddress).toBytes();
  const signature = Buffer.from(input.signatureBase64, 'base64');

  if (
    signature.length !== nacl.sign.signatureLength ||
    signature.toString('base64') !== input.signatureBase64
  ) {
    return false;
  }

  return nacl.sign.detached.verify(new TextEncoder().encode(input.message), signature, publicKey);
}

class SolanaRpcClient {
  readonly #rpcUrl: string;
  readonly #network: WalletNetwork;
  readonly #commitment: SolanaCommitment;
  readonly #timeoutMs: number;
  readonly #maximumAttempts: number;
  readonly #mintCacheTtlMs: number;
  readonly #clock: () => number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #mintCache = new Map<
    string,
    { readonly expiresAt: number; readonly mint: VerifiedMint }
  >();
  readonly #mintRequests = new Map<string, Promise<VerifiedMint>>();
  #requestId = 0;

  constructor(options: SolanaRpcOptions) {
    const url = new URL(options.rpcUrl);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new SolanaVerificationError('RPC_UNAVAILABLE');
    }

    this.#rpcUrl = url.toString();
    this.#network = options.network;
    this.#commitment = options.commitment;
    this.#timeoutMs = options.timeoutMs ?? 5_000;
    this.#maximumAttempts = options.maximumAttempts ?? 2;
    this.#mintCacheTtlMs = options.mintCacheTtlMs ?? 60_000;
    this.#clock = options.clock ?? Date.now;
    this.#fetch = options.fetch ?? globalThis.fetch;

    if (
      this.#maximumAttempts < 1 ||
      this.#maximumAttempts > 3 ||
      this.#timeoutMs < 100 ||
      this.#mintCacheTtlMs < 1_000 ||
      this.#mintCacheTtlMs > 3_600_000
    ) {
      throw new Error(
        'Solana RPC retry, timeout, or mint-cache configuration is outside safe bounds',
      );
    }
  }

  async request(method: string, params: readonly unknown[]): Promise<unknown> {
    let attempt = 0;

    while (attempt < this.#maximumAttempts) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);

      try {
        const response = await this.#fetch(this.#rpcUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: ++this.#requestId,
            method,
            params,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          if (
            (response.status === 429 || response.status >= 500) &&
            attempt < this.#maximumAttempts
          ) {
            continue;
          }

          throw new SolanaVerificationError('RPC_UNAVAILABLE');
        }

        const envelope = rpcEnvelopeSchema.safeParse(await response.json());

        if (!envelope.success) {
          throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
        }

        if (envelope.data.error !== undefined) {
          throw new SolanaVerificationError('RPC_UNAVAILABLE');
        }

        return envelope.data.result;
      } catch (error) {
        if (error instanceof SolanaVerificationError) {
          throw error;
        }

        if (attempt >= this.#maximumAttempts) {
          throw new SolanaVerificationError('RPC_UNAVAILABLE');
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    throw new SolanaVerificationError('RPC_UNAVAILABLE');
  }

  async assertNetwork(): Promise<void> {
    const expectedHash = NETWORK_GENESIS_HASHES[this.#network];
    const result = await this.request('getGenesisHash', []);

    if (result !== expectedHash) {
      throw new SolanaVerificationError('NETWORK_MISMATCH');
    }
  }

  async #readMint(canonicalMint: string, commitment: SolanaCommitment): Promise<VerifiedMint> {
    await this.assertNetwork();
    const result = mintResultSchema.safeParse(
      await this.request('getAccountInfo', [canonicalMint, { commitment, encoding: 'base64' }]),
    );

    if (!result.success) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    if (result.data.value === null) {
      throw new SolanaVerificationError('MINT_NOT_FOUND');
    }

    const account = result.data.value;
    const tokenProgram = SUPPORTED_PROGRAMS.get(account.owner);

    if (tokenProgram === undefined) {
      throw new SolanaVerificationError('UNSUPPORTED_TOKEN_PROGRAM');
    }

    if (account.executable || account.lamports === 0) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    const encodedData = account.data[0];
    const data = Buffer.from(encodedData, 'base64');
    if (
      data.length === 0 ||
      data.toString('base64') !== encodedData ||
      (tokenProgram === 'spl-token' && data.length !== MINT_SIZE)
    ) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    const programId = tokenProgram === 'spl-token' ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
    const accountInfo: AccountInfo<Buffer> = {
      executable: account.executable,
      lamports: account.lamports,
      owner: programId,
      data,
      ...(account.rentEpoch === undefined ? {} : { rentEpoch: account.rentEpoch }),
    };
    let mint;
    try {
      mint = unpackMint(new PublicKey(canonicalMint), accountInfo, programId);
    } catch {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    if (!mint.isInitialized || mint.decimals < 0 || mint.decimals > 18) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    return {
      mintAddress: canonicalMint,
      tokenProgram,
      tokenProgramAddress: account.owner,
      decimals: mint.decimals,
      slot: result.data.context.slot,
    };
  }

  async #resolveMint(
    mintAddress: string,
    commitment: SolanaCommitment,
    refresh: boolean,
  ): Promise<VerifiedMint> {
    const canonicalMint = validateSolanaAddress(mintAddress);
    const cacheKey = `${commitment}:${canonicalMint}`;
    const cached = this.#mintCache.get(cacheKey);
    if (!refresh && cached !== undefined && cached.expiresAt > this.#clock()) {
      return cached.mint;
    }

    const pending = refresh ? undefined : this.#mintRequests.get(cacheKey);
    if (pending !== undefined) return pending;

    const request = this.#readMint(canonicalMint, commitment);
    if (!refresh) this.#mintRequests.set(cacheKey, request);

    try {
      const mint = await request;
      const now = this.#clock();
      for (const [key, entry] of this.#mintCache) {
        if (entry.expiresAt <= now) this.#mintCache.delete(key);
      }
      if (!this.#mintCache.has(cacheKey) && this.#mintCache.size >= MAX_MINT_CACHE_ENTRIES) {
        const oldestKey = this.#mintCache.keys().next().value;
        if (oldestKey !== undefined) this.#mintCache.delete(oldestKey);
      }
      this.#mintCache.set(cacheKey, {
        expiresAt: now + this.#mintCacheTtlMs,
        mint,
      });
      return mint;
    } finally {
      if (this.#mintRequests.get(cacheKey) === request) this.#mintRequests.delete(cacheKey);
    }
  }

  validateMint(
    mintAddress: string,
    commitment: SolanaCommitment = this.#commitment,
  ): Promise<VerifiedMint> {
    return this.#resolveMint(mintAddress, commitment, false);
  }

  refreshMint(
    mintAddress: string,
    commitment: SolanaCommitment = this.#commitment,
  ): Promise<VerifiedMint> {
    return this.#resolveMint(mintAddress, commitment, true);
  }

  async verifyBalance(
    walletAddress: string,
    mintAddress: string,
    commitment: SolanaCommitment = this.#commitment,
  ): Promise<VerifiedTokenBalance> {
    const canonicalWallet = validateSolanaAddress(walletAddress);
    const mint = await this.validateMint(mintAddress, commitment);
    const result = tokenAccountResultSchema.safeParse(
      await this.request('getTokenAccountsByOwner', [
        canonicalWallet,
        { mint: mint.mintAddress },
        {
          commitment,
          encoding: 'jsonParsed',
          minContextSlot: mint.slot,
        },
      ]),
    );

    if (!result.success) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    if (result.data.context.slot < mint.slot) {
      throw new SolanaVerificationError('MALFORMED_RPC_RESPONSE');
    }

    const seen = new Set<string>();
    let rawAmount = 0n;
    let tokenAccountCount = 0;

    for (const item of result.data.value) {
      if (seen.has(item.pubkey)) {
        continue;
      }
      seen.add(item.pubkey);

      const info = item.account.data.parsed.info;
      const stateIsCountable = info.state === 'initialized' || info.state === 'frozen';
      const belongsToWallet = info.owner === canonicalWallet;
      const isExactMint = info.mint === mint.mintAddress;
      const isExpectedProgram = item.account.owner === mint.tokenProgramAddress;
      const decimalsMatch = info.tokenAmount.decimals === mint.decimals;

      if (
        item.account.lamports === 0 ||
        !stateIsCountable ||
        !belongsToWallet ||
        !isExactMint ||
        !isExpectedProgram ||
        !decimalsMatch
      ) {
        continue;
      }

      rawAmount += BigInt(info.tokenAmount.amount);
      tokenAccountCount += 1;
    }

    return {
      ...mint,
      walletAddress: canonicalWallet,
      rawAmount,
      tokenAccountCount,
      slot: result.data.context.slot,
    };
  }
}

export function createSolanaTokenVerifier(options: SolanaRpcOptions) {
  const client = new SolanaRpcClient(options);

  return {
    validateMint: (mintAddress: string, commitment?: SolanaCommitment) =>
      client.validateMint(mintAddress, commitment),
    refreshMint: (mintAddress: string, commitment?: SolanaCommitment) =>
      client.refreshMint(mintAddress, commitment),
    verifyBalance: (walletAddress: string, mintAddress: string, commitment?: SolanaCommitment) =>
      client.verifyBalance(walletAddress, mintAddress, commitment),
  };
}
