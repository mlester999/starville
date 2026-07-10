import { createHmac, timingSafeEqual } from 'node:crypto';

const RECOVERY_MARKER_TTL_MS = 10 * 60 * 1_000;

interface RecoveryMarkerPayload {
  readonly userId: string;
  readonly authSessionId: string;
  readonly expiresAt: number;
}

function signature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createRecoveryMarker(
  secret: string,
  userId: string,
  authSessionId: string,
  now = Date.now(),
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      authSessionId,
      expiresAt: now + RECOVERY_MARKER_TTL_MS,
    } satisfies RecoveryMarkerPayload),
  ).toString('base64url');

  return `${payload}.${signature(payload, secret)}`;
}

function parsePayload(encoded: string): RecoveryMarkerPayload | undefined {
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));

    if (typeof value !== 'object' || value === null) {
      return undefined;
    }

    const userId = Reflect.get(value, 'userId');
    const authSessionId = Reflect.get(value, 'authSessionId');
    const expiresAt = Reflect.get(value, 'expiresAt');

    return typeof userId === 'string' &&
      typeof authSessionId === 'string' &&
      typeof expiresAt === 'number'
      ? { userId, authSessionId, expiresAt }
      : undefined;
  } catch {
    return undefined;
  }
}

export function verifyRecoveryMarker(
  marker: string | undefined,
  secret: string,
  expectedUserId: string,
  expectedAuthSessionId: string,
  now = Date.now(),
): boolean {
  if (marker === undefined || marker.length > 2_048) {
    return false;
  }

  const segments = marker.split('.');
  const payload = segments[0];
  const providedSignature = segments[1];

  if (segments.length !== 2 || payload === undefined || providedSignature === undefined) {
    return false;
  }

  const expectedSignature = Buffer.from(signature(payload, secret));
  const providedSignatureBuffer = Buffer.from(providedSignature);

  if (
    expectedSignature.length !== providedSignatureBuffer.length ||
    !timingSafeEqual(expectedSignature, providedSignatureBuffer)
  ) {
    return false;
  }

  const parsed = parsePayload(payload);

  return (
    parsed !== undefined &&
    parsed.userId === expectedUserId &&
    parsed.authSessionId === expectedAuthSessionId &&
    parsed.expiresAt > now &&
    parsed.expiresAt <= now + RECOVERY_MARKER_TTL_MS
  );
}
