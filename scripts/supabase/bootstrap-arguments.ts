import { z } from 'zod';

const projectRefSchema = z
  .string()
  .regex(/^[a-z0-9]{20}$/, 'Project reference must be 20 lowercase characters');
const roleKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{1,62}$/, 'Expected role key must be lowercase snake case');

const VALUE_OPTIONS = new Set([
  'user-id',
  'display-name',
  'project-ref',
  'require-mfa',
  'expected-status',
  'expected-role',
]);
const FLAG_OPTIONS = new Set([
  'apply',
  'dry-run',
  'confirm-development',
  'confirm-production',
  'activate-invited',
]);

export interface BootstrapArguments {
  readonly apply: boolean;
  readonly activateInvited: boolean;
  readonly confirmedDevelopment: boolean;
  readonly confirmedProduction: boolean;
  readonly userId: string;
  readonly displayName?: string;
  readonly projectRef: string;
  readonly requireMfa: boolean;
  readonly expectedStatus?: 'invited';
  readonly expectedRoleKey?: string;
}

function collectArguments(arguments_: readonly string[]) {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  let sawSeparator = false;

  for (const argument of arguments_) {
    if (argument === '--') {
      if (sawSeparator) {
        throw new Error('Duplicate bootstrap argument separator');
      }

      sawSeparator = true;
      continue;
    }

    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected bootstrap argument: ${argument}`);
    }

    const separator = argument.indexOf('=');

    if (separator === -1) {
      const name = argument.slice(2);

      if (!FLAG_OPTIONS.has(name)) {
        throw new Error(`Unknown or value-less bootstrap option: --${name}`);
      }

      if (flags.has(name)) {
        throw new Error(`Duplicate bootstrap option: --${name}`);
      }

      flags.add(name);
      continue;
    }

    const name = argument.slice(2, separator);
    const value = argument.slice(separator + 1);

    if (!VALUE_OPTIONS.has(name)) {
      throw new Error(`Unknown bootstrap option: --${name}`);
    }

    if (values.has(name) || value.length === 0) {
      throw new Error(`Duplicate or empty bootstrap option: --${name}`);
    }

    values.set(name, value);
  }

  return { values, flags };
}

function optionalBoolean(value: string | undefined, fallback: boolean): boolean {
  return value === undefined
    ? fallback
    : z
        .enum(['true', 'false'])
        .transform((entry) => entry === 'true')
        .parse(value);
}

export function parseBootstrapArguments(
  arguments_: readonly string[],
  defaultRequireMfa: boolean,
): BootstrapArguments {
  const { values, flags } = collectArguments(arguments_);
  const apply = flags.has('apply');
  const explicitDryRun = flags.has('dry-run');
  const activateInvited = flags.has('activate-invited');

  if (apply && explicitDryRun) {
    throw new Error('--apply and --dry-run cannot be combined');
  }

  if (apply && flags.has('confirm-development') === flags.has('confirm-production')) {
    throw new Error(
      'Exactly one of --confirm-development or --confirm-production is required with --apply',
    );
  }

  const userId = z.uuid().parse(values.get('user-id'));
  const projectRef = projectRefSchema.parse(values.get('project-ref'));
  const displayNameValue = values.get('display-name');
  const requireMfaValue = values.get('require-mfa');
  const expectedStatusValue = values.get('expected-status');
  const expectedRoleValue = values.get('expected-role');

  if (activateInvited) {
    if (displayNameValue !== undefined) {
      throw new Error('Invited activation preserves the existing display name');
    }

    if (requireMfaValue === undefined) {
      throw new Error('--require-mfa=true|false is required for invited activation');
    }

    if (expectedStatusValue !== 'invited' || expectedRoleValue === undefined) {
      throw new Error(
        'Invited activation requires --expected-status=invited and --expected-role=<role>',
      );
    }

    return {
      apply,
      activateInvited,
      confirmedDevelopment: flags.has('confirm-development'),
      confirmedProduction: flags.has('confirm-production'),
      userId,
      projectRef,
      requireMfa: optionalBoolean(requireMfaValue, defaultRequireMfa),
      expectedStatus: 'invited',
      expectedRoleKey: roleKeySchema.parse(expectedRoleValue),
    };
  }

  if (expectedStatusValue !== undefined || expectedRoleValue !== undefined) {
    throw new Error('Expected administrator state requires --activate-invited');
  }

  return {
    apply,
    activateInvited,
    confirmedDevelopment: flags.has('confirm-development'),
    confirmedProduction: flags.has('confirm-production'),
    userId,
    displayName: z.string().trim().min(1).max(100).parse(displayNameValue),
    projectRef,
    requireMfa: optionalBoolean(requireMfaValue, defaultRequireMfa),
  };
}

export function assertBootstrapEnvironmentConfirmation(
  options: BootstrapArguments,
  environment: 'development' | 'production',
): void {
  if (!options.apply) return;
  if (environment === 'development' && !options.confirmedDevelopment) {
    throw new Error('Development bootstrap requires --confirm-development');
  }
  if (environment === 'production' && !options.confirmedProduction) {
    throw new Error('Production bootstrap requires --confirm-production');
  }
}

export function assertBootstrapProjectRef(
  options: BootstrapArguments,
  verifiedProjectRef: string,
): void {
  if (options.projectRef !== verifiedProjectRef) {
    throw new Error('Bootstrap --project-ref does not match the verified hosted target');
  }
}
