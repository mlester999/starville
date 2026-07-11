import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it, vi } from 'vitest';

import {
  createSolanaTokenVerifier,
  SolanaVerificationError,
  validateSolanaAddress,
  verifySolanaMessageSignature,
} from '../src/index';

const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const MINT = 'So11111111111111111111111111111111111111112';
const WALLET = '11111111111111111111111111111111';

function jsonResponse(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function mintResult(decimals = 6, owner = TOKEN_PROGRAM, slot = 100) {
  return {
    context: { slot },
    value: {
      executable: false,
      owner,
      data: { parsed: { type: 'mint', info: { decimals, isInitialized: true } } },
    },
  };
}

function tokenAccount(
  pubkey: string,
  amount: string,
  state = 'initialized',
  options: {
    readonly program?: string;
    readonly mint?: string;
    readonly owner?: string;
    readonly decimals?: number;
    readonly lamports?: number;
  } = {},
) {
  return {
    pubkey,
    account: {
      lamports: options.lamports ?? 2_039_280,
      owner: options.program ?? TOKEN_PROGRAM,
      data: {
        parsed: {
          type: 'account',
          info: {
            mint: options.mint ?? MINT,
            owner: options.owner ?? WALLET,
            state,
            tokenAmount: { amount, decimals: options.decimals ?? 6 },
          },
        },
      },
    },
  };
}

describe('Solana address and signature verification', () => {
  it('rejects noncanonical addresses', () => {
    expect(validateSolanaAddress(MINT)).toBe(MINT);
    expect(() => validateSolanaAddress('not-a-public-key')).toThrow(SolanaVerificationError);
  });

  it('accepts only the exact signed bytes and key', () => {
    const keypair = nacl.sign.keyPair();
    const message = 'Starville access only';
    const signature = nacl.sign.detached(new TextEncoder().encode(message), keypair.secretKey);
    const walletAddress = new PublicKey(keypair.publicKey).toBase58();

    expect(
      verifySolanaMessageSignature({
        walletAddress,
        message,
        signatureBase64: Buffer.from(signature).toString('base64'),
      }),
    ).toBe(true);
    expect(
      verifySolanaMessageSignature({
        walletAddress,
        message: `${message}!`,
        signatureBase64: Buffer.from(signature).toString('base64'),
      }),
    ).toBe(false);
  });
});

describe('server-authoritative token verification', () => {
  it('accepts only the Mainnet genesis hash when Mainnet is configured', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(MAINNET_GENESIS_HASH))
      .mockResolvedValueOnce(jsonResponse(mintResult(6, TOKEN_2022_PROGRAM)));
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:mainnet-beta',
      commitment: 'confirmed',
      fetch,
    });

    await expect(verifier.validateMint(MINT)).resolves.toMatchObject({
      tokenProgram: 'spl-token-2022',
      decimals: 6,
    });
  });

  it('sums associated, non-associated, and frozen accounts exactly and de-duplicates responses', async () => {
    const first = tokenAccount('11111111111111111111111111111111', '600000000');
    const second = tokenAccount(
      'SysvarRent111111111111111111111111111111111',
      '400000000',
      'frozen',
    );
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(jsonResponse(mintResult()))
      .mockResolvedValueOnce(
        jsonResponse({ context: { slot: 101 }, value: [first, first, second] }),
      );
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch,
    });

    await expect(verifier.verifyBalance(WALLET, MINT)).resolves.toMatchObject({
      rawAmount: 1_000_000_000n,
      tokenAccountCount: 2,
      decimals: 6,
      slot: 101,
    });
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://rpc.example.test/',
      expect.objectContaining({
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'getTokenAccountsByOwner',
          params: [
            WALLET,
            { mint: MINT },
            { commitment: 'confirmed', encoding: 'jsonParsed', minContextSlot: 100 },
          ],
        }),
      }),
    );
  });

  it('propagates a trusted per-call commitment override through mint and balance RPC reads', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(jsonResponse(mintResult()))
      .mockResolvedValueOnce(jsonResponse({ context: { slot: 101 }, value: [] }));
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch,
    });

    await verifier.verifyBalance(WALLET, MINT, 'finalized');

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://rpc.example.test/',
      expect.objectContaining({
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'getAccountInfo',
          params: [MINT, { commitment: 'finalized', encoding: 'jsonParsed' }],
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'https://rpc.example.test/',
      expect.objectContaining({
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'getTokenAccountsByOwner',
          params: [
            WALLET,
            { mint: MINT },
            { commitment: 'finalized', encoding: 'jsonParsed', minContextSlot: 100 },
          ],
        }),
      }),
    );
  });

  it.each([
    { balanceSlot: 199, expectedOutcome: 'rejects stale' },
    { balanceSlot: 200, expectedOutcome: 'accepts equal' },
    { balanceSlot: 201, expectedOutcome: 'accepts newer' },
  ] as const)(
    '$expectedOutcome token-account context at slot $balanceSlot against mint slot 200',
    async ({ balanceSlot }) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
        .mockResolvedValueOnce(jsonResponse(mintResult(6, TOKEN_PROGRAM, 200)))
        .mockResolvedValueOnce(
          jsonResponse({
            context: { slot: balanceSlot },
            value: [tokenAccount('SysvarC1ock11111111111111111111111111111111', '1')],
          }),
        );
      const verifier = createSolanaTokenVerifier({
        rpcUrl: 'https://rpc.example.test',
        network: 'solana:devnet',
        commitment: 'confirmed',
        fetch,
      });

      const verification = verifier.verifyBalance(WALLET, MINT);

      if (balanceSlot < 200) {
        await expect(verification).rejects.toMatchObject({ code: 'MALFORMED_RPC_RESPONSE' });
      } else {
        await expect(verification).resolves.toMatchObject({
          rawAmount: 1n,
          slot: balanceSlot,
        });
      }

      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://rpc.example.test/',
        expect.objectContaining({
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'getTokenAccountsByOwner',
            params: [
              WALLET,
              { mint: MINT },
              { commitment: 'confirmed', encoding: 'jsonParsed', minContextSlot: 200 },
            ],
          }),
        }),
      );
    },
  );

  it('fails closed on a mismatched network', async () => {
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test/credential-in-path',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch: vi.fn<typeof globalThis.fetch>().mockResolvedValue(jsonResponse('wrong-genesis')),
    });

    await expect(verifier.validateMint(MINT)).rejects.toMatchObject({ code: 'NETWORK_MISMATCH' });
  });

  it('supports Token-2022 and preserves balances beyond Number.MAX_SAFE_INTEGER', async () => {
    const rawAmount = 9_007_199_254_740_993_000_000n;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(jsonResponse(mintResult(6, TOKEN_2022_PROGRAM)))
      .mockResolvedValueOnce(
        jsonResponse({
          context: { slot: 102 },
          value: [
            tokenAccount(
              'SysvarC1ock11111111111111111111111111111111',
              rawAmount.toString(),
              'initialized',
              {
                program: TOKEN_2022_PROGRAM,
              },
            ),
          ],
        }),
      );
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'finalized',
      fetch,
    });

    await expect(verifier.verifyBalance(WALLET, MINT)).resolves.toMatchObject({
      tokenProgram: 'spl-token-2022',
      rawAmount,
      tokenAccountCount: 1,
    });
  });

  it('excludes closed, uninitialized, wrong-owner, wrong-program, and wrong-mint accounts', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
      .mockResolvedValueOnce(jsonResponse(mintResult()))
      .mockResolvedValueOnce(
        jsonResponse({
          context: { slot: 103 },
          value: [
            tokenAccount('SysvarC1ock11111111111111111111111111111111', '1', 'uninitialized'),
            tokenAccount('SysvarFees111111111111111111111111111111111', '2', 'initialized', {
              owner: MINT,
            }),
            tokenAccount('SysvarRecentB1ockHashes11111111111111111111', '4', 'initialized', {
              mint: WALLET,
            }),
            tokenAccount('SysvarS1otHashes111111111111111111111111111', '8', 'initialized', {
              program: TOKEN_2022_PROGRAM,
            }),
            tokenAccount('SysvarStakeHistory1111111111111111111111111', '16', 'initialized', {
              lamports: 0,
            }),
          ],
        }),
      );
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch,
    });

    await expect(verifier.verifyBalance(WALLET, MINT)).resolves.toMatchObject({
      rawAmount: 0n,
      tokenAccountCount: 0,
    });
  });

  it('rejects an unsupported mint owner and malformed token-account response', async () => {
    const unsupported = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
        .mockResolvedValueOnce(jsonResponse(mintResult(6, WALLET))),
    });
    await expect(unsupported.validateMint(MINT)).rejects.toMatchObject({
      code: 'UNSUPPORTED_TOKEN_PROGRAM',
    });

    const malformed = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test',
      network: 'solana:devnet',
      commitment: 'confirmed',
      fetch: vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(jsonResponse(DEVNET_GENESIS_HASH))
        .mockResolvedValueOnce(jsonResponse(mintResult()))
        .mockResolvedValueOnce(
          jsonResponse({ context: { slot: 104 }, value: [{ pubkey: WALLET, account: {} }] }),
        ),
    });
    await expect(malformed.verifyBalance(WALLET, MINT)).rejects.toMatchObject({
      code: 'MALFORMED_RPC_RESPONSE',
    });
  });

  it('bounds retry attempts and returns no provider detail', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('provider credential detail', { status: 503 }));
    const verifier = createSolanaTokenVerifier({
      rpcUrl: 'https://rpc.example.test/private-key',
      network: 'solana:devnet',
      commitment: 'confirmed',
      maximumAttempts: 2,
      fetch,
    });

    const error = await verifier.validateMint(MINT).catch((reason: unknown) => reason);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(error).toMatchObject({ code: 'RPC_UNAVAILABLE' });
    expect(String(error)).not.toContain('credential');
    expect(String(error)).not.toContain('provider');
  });
});
