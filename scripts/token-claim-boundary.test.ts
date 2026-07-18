import { describe, expect, it } from 'vitest';

import { inspectTokenClaimSource } from './token-claim-boundary';

// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE: forbidden tokens below are inert scanner inputs.
const packagePath = 'packages/token-claim-architecture/src/provider.ts';

describe('disabled token-claim source boundary', () => {
  it.each([
    ['private-key input', 'const privateKey = request.value'],
    ['seed-phrase input', 'const seedPhrase = request.value'],
    ['secret-key array', 'const secretKey = new Uint8Array(request.value)'],
    ['keypair generation', 'Keypair.generate()'],
    ['secret-key constructor', 'Keypair.fromSecretKey(bytes)'],
    ['filesystem loading', 'readFileSync("treasury.json")'],
    ['aliased filesystem loading', 'import { readFileSync as load } from "node:fs"; load(path)'],
    ['environment loading', 'process.env.TREASURY_SECRET'],
    ['bracketed environment loading', 'process["env"][name]'],
    ['network access', 'fetch("https://rpc.example")'],
    ['aliased network access', 'const request = fetch; request(endpoint)'],
    ['RPC access', 'new Connection(endpoint)'],
    ['blockhash retrieval', 'connection.getLatestBlockhash()'],
    ['wallet submission', 'wallet.sendTransaction(plan)'],
    ['aliased wallet submission', 'const deliver = wallet.sendTransaction; deliver(plan)'],
    ['wallet signing', 'wallet.signTransaction(plan)'],
    ['batch wallet signing', 'wallet.signAllTransactions(plans)'],
    ['raw submission', 'connection.sendRawTransaction(bytes)'],
    ['transaction construction', 'new VersionedTransaction(message)'],
    ['transaction serialization', 'transaction.serialize()'],
    ['production signer', 'class ProductionSignerProvider {}'],
    ['typed production signer', 'const live: SignerProvider = provider'],
  ])('rejects %s', (_name, content) => {
    expect(inspectTokenClaimSource({ content, path: packagePath })).not.toEqual([]);
  });

  it('allows only the explicitly disabled and fixture-only provider declarations', () => {
    expect(
      inspectTokenClaimSource({
        content:
          'export class DisabledSignerProvider {}\nexport class MockSignerProvider {}\nexport const mode = "disabled";',
        path: packagePath,
      }),
    ).toEqual([]);
  });

  it.each([
    'Claim Now',
    'Earn STAR',
    'Cash Out',
    'Approve Token',
    'Approve STAR',
    'Connect to Receive Rewards',
  ])('rejects the active player-facing call to action %s', (label) => {
    expect(
      inspectTokenClaimSource({
        content: `<button>${label}</button>`,
        path: 'apps/game-client/src/components/TokenClaim.tsx',
      }),
    ).toEqual([
      'active token-claim call to action in apps/game-client/src/components/TokenClaim.tsx',
    ]);
  });

  it('rejects an active token-claim label outside a native control', () => {
    expect(
      inspectTokenClaimSource({
        content: "const action = { label: 'Claim Now' };",
        path: 'apps/game-client/src/components/Rewards.tsx',
      }),
    ).toContain('active token-claim call to action in apps/game-client/src/components/Rewards.tsx');
  });

  it('rejects an API mutation route and an active withdrawal control', () => {
    expect(
      inspectTokenClaimSource({
        content: 'app.post("/api/v1/token-claims", handler)',
        path: 'apps/api/src/routes/token-claims.ts',
      }),
    ).toContain('live token-claim mutation route in apps/api/src/routes/token-claims.ts');
    expect(
      inspectTokenClaimSource({
        content: '<button><span>Withdraw</span></button>',
        path: 'apps/landing/src/components/Rewards.tsx',
      }),
    ).toContain('active token-claim call to action in apps/landing/src/components/Rewards.tsx');
  });

  it('rejects Next-style claim and payout mutation routes', () => {
    expect(
      inspectTokenClaimSource({
        content: 'export async function POST() { return deliver(); }',
        path: 'apps/api/src/app/token-claims/route.ts',
      }),
    ).toContain('live token-claim mutation route in apps/api/src/app/token-claims/route.ts');
    expect(
      inspectTokenClaimSource({
        content: 'export const POST = async () => payout();',
        path: 'apps/api/src/app/token-payouts/route.ts',
      }),
    ).toContain('live token-claim mutation route in apps/api/src/app/token-payouts/route.ts');
  });

  it.each([
    ['.env.example', 'TREASURY_SECRET_KEY=placeholder'],
    ['packages/config/src/server.ts', 'const key = "TREASURY_KEYPAIR"'],
    ['apps/realtime-server/src/claim-runtime.ts', 'const name = "CLAIM_SIGNER_SECRET_KEY"'],
    ['apps/worker/src/token-claim-worker.ts', 'const name = "SOLANA_SECRET_KEY"'],
  ])('rejects treasury-secret identifiers in %s', (path, content) => {
    expect(inspectTokenClaimSource({ content, path })).toContain(
      `treasury-secret environment identifier in ${path}`,
    );
  });

  it('applies signer and delivery restrictions outside the architecture package', () => {
    expect(
      inspectTokenClaimSource({
        content: 'export const runTokenClaim = () => wallet.signTransaction(plan);',
        path: 'apps/worker/src/token-claim-worker.ts',
      }),
    ).toContain(
      'wallet or RPC transaction operation in disabled token-claim production source apps/worker/src/token-claim-worker.ts',
    );
  });

  it('applies token-claim production restrictions to package content, not only paths', () => {
    expect(
      inspectTokenClaimSource({
        content: 'export const runTokenClaim = () => wallet.signTransaction(plan);',
        path: 'packages/rewards/src/runtime.ts',
      }),
    ).toContain(
      'wallet or RPC transaction operation in disabled token-claim production source packages/rewards/src/runtime.ts',
    );
  });

  it('does not exempt an executable-looking test without an explicit fixture marker', () => {
    expect(
      inspectTokenClaimSource({
        content: 'Keypair.generate(); wallet.sendTransaction(tx); process.env.TREASURY_SECRET;',
        path: 'packages/token-claim-architecture/test/unsafe.test.ts',
      }),
    ).not.toEqual([]);
  });

  it('does not let an unreviewed test self-approve with the fixture marker', () => {
    expect(
      inspectTokenClaimSource({
        content:
          '// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE\nKeypair.generate(); wallet.sendTransaction(tx);',
        path: 'packages/token-claim-architecture/test/unreviewed.test.ts',
      }),
    ).not.toEqual([]);
  });

  it('rejects broad token-claim secret identifiers in environment templates', () => {
    expect(
      inspectTokenClaimSource({
        content: 'TOKEN_CLAIM_PRIVATE_KEY=placeholder',
        path: '.env.example',
      }),
    ).toContain('treasury-secret environment identifier in .env.example');
  });

  it('rejects Fastify mutation method arrays for token-claim routes', () => {
    expect(
      inspectTokenClaimSource({
        content: "server.route({ method: ['GET', 'POST'], url: '/api/token-claims', handler });",
        path: 'apps/api/src/routes/rewards.ts',
      }),
    ).toContain('live token-claim mutation route in apps/api/src/routes/rewards.ts');
  });

  it('does not confuse a nested off-chain collection reward claim with a token claim', () => {
    expect(
      inspectTokenClaimSource({
        content: 'app.post(`${PREFIX}/collections/:collectionKey/claim`, handler)',
        path: 'apps/api/src/routes/cosmetics.ts',
      }),
    ).toEqual([]);
  });

  it('does not confuse an off-chain housing storage withdrawal with a token claim', () => {
    expect(
      inspectTokenClaimSource({
        content: "const operation: 'deposit' | 'withdrawal' = 'withdrawal';",
        path: 'apps/api/src/housing/storage.ts',
      }),
    ).toEqual([]);
  });

  it('does not flag truthful disabled copy or existing wallet-sign-in code', () => {
    expect(
      inspectTokenClaimSource({
        content: 'Token claims are disabled. No transaction or withdrawal is available.',
        path: 'apps/landing/src/content/docs/pages-economy-safety.ts',
      }),
    ).toEqual([]);
    expect(
      inspectTokenClaimSource({
        content: 'wallet.signMessage(challenge)',
        path: 'apps/landing/src/lib/reown.ts',
      }),
    ).toEqual([]);
  });

  it('allows forbidden-pattern fixtures only in tests', () => {
    expect(
      inspectTokenClaimSource({
        content:
          '// PHASE9BA_NONFUNCTIONAL_SECURITY_FIXTURE\nsendTransaction(); Keypair.fromSecretKey(bytes);',
        path: 'packages/token-claim-architecture/test/providers-planner.test.ts',
      }),
    ).toEqual([]);
  });
});
