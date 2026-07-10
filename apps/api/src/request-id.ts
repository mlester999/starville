import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const TRUSTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export function resolveRequestId(request: IncomingMessage): string {
  const header = request.headers['x-request-id'];
  const candidate = Array.isArray(header) ? header[0] : header;

  return candidate !== undefined && TRUSTED_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}
