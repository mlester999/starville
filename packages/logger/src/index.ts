import type { ApplicationName, EnvironmentName } from '@starville/shared-types';
import type { LogLevel } from '@starville/shared-validation';

const REDACTED = '[REDACTED]';

const LEVEL_PRIORITY: Readonly<Record<LogLevel, number>> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Number.POSITIVE_INFINITY,
};

const RESERVED_FIELDS = new Set(['environment', 'level', 'message', 'service', 'timestamp']);

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogDestination {
  write(line: string): void;
}

export interface LoggerOptions {
  readonly service: ApplicationName;
  readonly environment: EnvironmentName;
  readonly level: LogLevel;
  readonly bindings?: LogContext;
  readonly destination?: LogDestination;
  readonly clock?: () => Date;
}

export interface StructuredLogger {
  trace(message: string, context?: LogContext): void;
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  fatal(message: string, context?: LogContext): void;
  child(bindings: LogContext): StructuredLogger;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);

  return (
    normalized.includes('password') ||
    normalized.includes('passwd') ||
    normalized.includes('authorization') ||
    normalized.includes('authtoken') ||
    normalized.includes('accesstoken') ||
    normalized.includes('refreshtoken') ||
    normalized.includes('idtoken') ||
    normalized.includes('privatekey') ||
    normalized.includes('seedphrase') ||
    normalized.includes('recoveryphrase') ||
    normalized.includes('mnemonic') ||
    normalized.includes('servicerole') ||
    normalized.includes('databaseurl') ||
    normalized.includes('connectionstring') ||
    normalized.includes('rpcurl') ||
    normalized === 'token' ||
    normalized === 'apikey' ||
    normalized === 'credentials' ||
    normalized.endsWith('credentials') ||
    normalized === 'cookie' ||
    normalized === 'setcookie' ||
    normalized === 'secret' ||
    normalized.endsWith('secret')
  );
}

function sanitizeString(value: string): string {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value)) {
    return '[REDACTED_PRIVATE_KEY]';
  }

  if (/postgres(?:ql)?:\/\//i.test(value)) {
    return '[REDACTED_DATABASE_URL]';
  }

  if (/https?:\/\/\S*(?:api[_-]?key|token|secret|signature)=/i.test(value)) {
    return '[REDACTED_SECRET_URL]';
  }

  return value
    .replaceAll(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replaceAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_TOKEN]');
}

function sanitizeError(error: Error, seen: WeakSet<object>): Readonly<Record<string, unknown>> {
  const serialized: Record<string, unknown> = {
    type: error.name,
    message: sanitizeString(error.message),
  };

  if (error.stack !== undefined) {
    serialized['stack'] = sanitizeString(error.stack);
  }

  if (error.cause !== undefined) {
    serialized['cause'] = sanitizeValue(error.cause, seen);
  }

  for (const [key, value] of Object.entries(error)) {
    serialized[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(value, seen);
  }

  return serialized;
}

function sanitizeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (value instanceof Error) {
    return sanitizeError(value, seen);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, seen));
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeValue(entry, seen);
  }

  return sanitized;
}

export function redactLogValue(value: unknown): unknown {
  return sanitizeValue(value, new WeakSet<object>());
}

const standardOutputDestination: LogDestination = {
  write(line) {
    process.stdout.write(line);
  },
};

function contextRecord(
  bindings: LogContext,
  context: LogContext | undefined,
): Record<string, unknown> {
  const combined: Record<string, unknown> = { ...bindings, ...context };

  for (const field of RESERVED_FIELDS) {
    delete combined[field];
  }

  const sanitized = redactLogValue(combined);
  return typeof sanitized === 'object' && sanitized !== null
    ? (sanitized as Record<string, unknown>)
    : {};
}

export function createLogger(options: LoggerOptions): StructuredLogger {
  const destination = options.destination ?? standardOutputDestination;
  const clock = options.clock ?? (() => new Date());
  const bindings = options.bindings ?? {};

  function write(level: Exclude<LogLevel, 'silent'>, message: string, context?: LogContext): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[options.level]) {
      return;
    }

    const record = {
      ...contextRecord(bindings, context),
      level,
      timestamp: clock().toISOString(),
      service: options.service,
      environment: options.environment,
      message: sanitizeString(message),
    };

    destination.write(`${JSON.stringify(record)}\n`);
  }

  return {
    trace: (message, context) => write('trace', message, context),
    debug: (message, context) => write('debug', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    fatal: (message, context) => write('fatal', message, context),
    child: (childBindings) =>
      createLogger({
        ...options,
        bindings: { ...bindings, ...childBindings },
        destination,
        clock,
      }),
  };
}
