import { z } from 'zod';

import {
  APPLICATION_NAMES,
  ENVIRONMENT_NAMES,
  type EnvironmentName,
} from '@starville/shared-types';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const WEBSOCKET_PROTOCOLS = new Set(['ws:', 'wss:']);

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

export function assertSecureUrlForEnvironment(
  value: string,
  environment: EnvironmentName,
  label: string,
): void {
  const url = new URL(value);
  const secure = url.protocol === 'https:' || url.protocol === 'wss:';

  if (secure) {
    return;
  }

  const localDevelopment = environment !== 'production' && isLoopbackHostname(url.hostname);

  if (!localDevelopment) {
    throw new Error(`${label} must use HTTPS or WSS outside local development`);
  }
}

function urlWithProtocolsSchema(protocols: ReadonlySet<string>, label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .superRefine((value, context) => {
      try {
        const url = new URL(value);

        if (!protocols.has(url.protocol)) {
          context.addIssue({
            code: 'custom',
            message: `${label} must use ${[...protocols].join(' or ')}`,
          });
        }

        if (url.username !== '' || url.password !== '') {
          context.addIssue({
            code: 'custom',
            message: `${label} must not contain credentials`,
          });
        }
      } catch {
        context.addIssue({ code: 'custom', message: `${label} must be a valid URL` });
      }
    });
}

export const applicationNameSchema = z.enum([...APPLICATION_NAMES]);
export const environmentNameSchema = z.enum([...ENVIRONMENT_NAMES]);

export const httpUrlSchema = urlWithProtocolsSchema(HTTP_PROTOCOLS, 'URL');
export const webSocketUrlSchema = urlWithProtocolsSchema(WEBSOCKET_PROTOCOLS, 'WebSocket URL');

export const portSchema = z.coerce
  .number()
  .int('Port must be an integer')
  .min(1, 'Port must be at least 1')
  .max(65_535, 'Port must be no greater than 65535');

export const hostSchema = z
  .string()
  .trim()
  .min(1, 'Host is required')
  .regex(
    /^(?:[a-zA-Z0-9.-]+|\[[0-9a-fA-F:]+\]|[0-9a-fA-F:]+)$/,
    'Host must be a hostname or IP address',
  );

export const positiveIntegerSchema = z.coerce.number().int().positive();

export const logLevelSchema = z.enum([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
]);

export type LogLevel = z.infer<typeof logLevelSchema>;

export const originSchema = httpUrlSchema
  .superRefine((value, context) => {
    const url = new URL(value);

    if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
      context.addIssue({
        code: 'custom',
        message: 'Origin must not include a path, query string, or fragment',
      });
    }
  })
  .transform((value) => new URL(value).origin);

export const originAllowlistSchema = z.preprocess(
  (value) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0)
      : value,
  z
    .array(originSchema)
    .min(1, 'At least one allowed origin is required')
    .transform((origins) => [...new Set(origins)]),
);

export const publicApplicationUrlsSchema = z
  .object({
    landingUrl: httpUrlSchema,
    gameUrl: httpUrlSchema,
    adminUrl: httpUrlSchema,
    apiUrl: httpUrlSchema,
    realtimeUrl: webSocketUrlSchema,
  })
  .strict();

export const serviceConfigurationSchema = z
  .object({
    application: applicationNameSchema,
    environment: environmentNameSchema,
    host: hostSchema,
    port: portSchema,
    logLevel: logLevelSchema,
    allowedOrigins: originAllowlistSchema,
  })
  .strict();

export type PublicApplicationUrls = z.infer<typeof publicApplicationUrlsSchema>;
export type ServiceConfiguration = z.infer<typeof serviceConfigurationSchema>;
