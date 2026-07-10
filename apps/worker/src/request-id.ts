import { randomUUID } from 'node:crypto';

const TRUSTED_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/u;

export function resolveRequestId(header: string | string[] | undefined): string {
  const candidate = Array.isArray(header) ? header[0] : header;

  return candidate !== undefined && TRUSTED_REQUEST_ID.test(candidate) ? candidate : randomUUID();
}
