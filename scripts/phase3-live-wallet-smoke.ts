import { webcrypto } from 'node:crypto';

import { walletNetworkSchema, type WalletNetwork } from '@starville/wallet-access';

interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data: T;
}

interface PublicConfig {
  readonly availability: string;
  readonly enabled: boolean;
  readonly network: WalletNetwork;
}

interface Challenge {
  readonly challengeId: string;
  readonly expiresAt: string;
  readonly message: string;
}

interface AccessView {
  readonly access: string;
  readonly observedAmount?: string;
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function required(name: string): string {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required for the live wallet smoke test`);
  }

  return value;
}

function encodeBase58(bytes: Uint8Array): string {
  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;

    for (let index = 0; index < digits.length; index += 1) {
      const value = (digits[index] ?? 0) * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }

    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) {
    leadingZeroes += 1;
  }

  return (
    '1'.repeat(leadingZeroes) +
    digits
      .reverse()
      .map((digit) => BASE58_ALPHABET[digit])
      .join('')
  );
}

async function parseEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  const value = (await response.json()) as ApiEnvelope<T>;
  assert(value.success === true && typeof value.data === 'object', 'Malformed API response');
  return value;
}

async function main(): Promise<void> {
  const apiUrl = new URL(required('NEXT_PUBLIC_API_URL'));
  const landingOrigin = new URL(required('NEXT_PUBLIC_LANDING_URL')).origin;
  const network = walletNetworkSchema.parse(`solana:${required('SOLANA_NETWORK')}`);
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json',
    origin: landingOrigin,
    'user-agent': 'starville-phase3-live-smoke',
  };
  const configResponse = await fetch(new URL('/api/v1/token-access/config', apiUrl));
  const config = await parseEnvelope<PublicConfig>(configResponse);
  assert(configResponse.status === 200, 'Live token-access configuration is unavailable');
  assert(
    config.data.enabled && config.data.availability === 'available',
    'Token gate is not ready',
  );
  assert(config.data.network === network, 'Public token-access network does not match environment');

  const keyPair = await webcrypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  assert('publicKey' in keyPair && 'privateKey' in keyPair, 'Ed25519 key generation failed');
  const publicKey = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));
  const walletAddress = encodeBase58(publicKey);
  const challengeResponse = await fetch(new URL('/api/v1/token-access/challenge', apiUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ walletAddress, network }),
  });
  const challenge = await parseEnvelope<Challenge>(challengeResponse);
  assert(challengeResponse.status === 200, 'Live challenge creation failed');
  assert(Date.parse(challenge.data.expiresAt) > Date.now(), 'Server challenge was already expired');

  const signature = await webcrypto.subtle.sign(
    'Ed25519',
    keyPair.privateKey,
    new TextEncoder().encode(challenge.data.message),
  );
  const verificationBody = {
    challengeId: challenge.data.challengeId,
    walletAddress,
    network,
    message: challenge.data.message,
    signature: Buffer.from(signature).toString('base64'),
  };
  const verificationResponse = await fetch(new URL('/api/v1/token-access/verify', apiUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(verificationBody),
  });
  const verification = await parseEnvelope<AccessView>(verificationResponse);
  assert(verificationResponse.status === 200, 'Live signature or balance verification failed');
  assert(
    verification.data.access === 'insufficient_balance' && verification.data.observedAmount === '0',
    'Disposable zero-balance signer was not denied as insufficient',
  );
  const verificationCookie = verificationResponse.headers.get('set-cookie') ?? '';
  assert(
    !/starville-token-access=[A-Za-z0-9_-]{43}/u.test(verificationCookie),
    'Insufficient wallet unexpectedly received a live access cookie',
  );

  const replayResponse = await fetch(new URL('/api/v1/token-access/verify', apiUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify(verificationBody),
  });
  assert(replayResponse.status === 409, 'Consumed live challenge was replayable');

  const otherNetwork: WalletNetwork =
    network === 'solana:mainnet-beta' ? 'solana:devnet' : 'solana:mainnet-beta';
  const networkMismatchResponse = await fetch(new URL('/api/v1/token-access/challenge', apiUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ walletAddress, network: otherNetwork }),
  });
  assert(networkMismatchResponse.status === 400, 'Wrong-network live challenge was not denied');

  const disconnectResponse = await fetch(new URL('/api/v1/token-access/session', apiUrl), {
    method: 'DELETE',
    headers: { origin: landingOrigin },
  });
  assert(disconnectResponse.status === 200, 'Live disconnect endpoint failed closed incorrectly');

  process.stdout.write(
    `${JSON.stringify({
      status: 'ok',
      network,
      challengeCreated: true,
      messageSigned: true,
      serverSignatureVerified: true,
      liveBalanceChecked: true,
      observedAmount: '0',
      insufficientDenied: true,
      accessCookieIssued: false,
      challengeReplayDenied: true,
      wrongNetworkDenied: true,
      disconnectHandled: true,
    })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Live wallet smoke test failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
