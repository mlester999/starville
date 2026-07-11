import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateWalletNonce(): string {
  return randomBytes(32).toString('base64url');
}

export function generateAccessSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashAccessSessionToken(token: string, secret: string): string {
  if (secret.length < 32) {
    throw new Error('Token-access cookie secret must contain at least 32 characters');
  }

  return createHmac('sha256', secret).update(token).digest('hex');
}

export function hashesEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');

  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
