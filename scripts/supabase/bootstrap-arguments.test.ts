import { describe, expect, it } from 'vitest';

import {
  assertBootstrapEnvironmentConfirmation,
  assertBootstrapProjectRef,
  parseBootstrapArguments,
} from './bootstrap-arguments';

const userId = '11111111-1111-4111-8111-111111111111';
const projectRef = 'abcdefghijklmnopqrst';

describe('administrator bootstrap arguments', () => {
  it('is a dry run by default and requires an exact target and create input', () => {
    const options = parseBootstrapArguments(
      [
        '--',
        `--user-id=${userId}`,
        '--display-name=Foundation Administrator',
        `--project-ref=${projectRef}`,
      ],
      false,
    );

    expect(options).toMatchObject({ apply: false, projectRef, requireMfa: false });
    expect(() => assertBootstrapProjectRef(options, projectRef)).not.toThrow();
    expect(() => assertBootstrapProjectRef(options, 'differentprojectref1')).toThrow(
      'does not match',
    );
  });

  it('requires one environment-specific confirmation for a write', () => {
    const base = [
      `--user-id=${userId}`,
      '--display-name=Foundation Administrator',
      `--project-ref=${projectRef}`,
    ];

    expect(() => parseBootstrapArguments([...base, '--apply'], false)).toThrow(
      '--confirm-development',
    );
    expect(
      parseBootstrapArguments([...base, '--confirm-development', '--apply'], false).apply,
    ).toBe(true);
    const production = parseBootstrapArguments([...base, '--confirm-production', '--apply'], true);
    expect(() => assertBootstrapEnvironmentConfirmation(production, 'production')).not.toThrow();
    expect(() => assertBootstrapEnvironmentConfirmation(production, 'development')).toThrow(
      '--confirm-development',
    );
    expect(() =>
      parseBootstrapArguments(
        [...base, '--confirm-development', '--confirm-production', '--apply'],
        false,
      ),
    ).toThrow('Exactly one');
    expect(() =>
      parseBootstrapArguments([...base, '--dry-run', '--apply', '--confirm-development'], false),
    ).toThrow('cannot be combined');
  });

  it('activates only an explicitly expected invited record without overwriting its name', () => {
    const arguments_ = [
      `--user-id=${userId}`,
      `--project-ref=${projectRef}`,
      '--activate-invited',
      '--expected-status=invited',
      '--expected-role=customer_support',
      '--require-mfa=false',
    ];

    expect(parseBootstrapArguments(arguments_, true)).toMatchObject({
      activateInvited: true,
      expectedStatus: 'invited',
      expectedRoleKey: 'customer_support',
      requireMfa: false,
    });
    expect(() =>
      parseBootstrapArguments([...arguments_, '--display-name=Unsafe overwrite'], true),
    ).toThrow('preserves the existing display name');
  });

  it('rejects ambiguous activation, missing MFA intent, and unknown options', () => {
    const base = [
      `--user-id=${userId}`,
      `--project-ref=${projectRef}`,
      '--activate-invited',
      '--expected-status=invited',
      '--expected-role=customer_support',
    ];

    expect(() => parseBootstrapArguments(base, false)).toThrow('--require-mfa');
    expect(() =>
      parseBootstrapArguments(
        [
          `--user-id=${userId}`,
          '--display-name=Foundation Administrator',
          `--project-ref=${projectRef}`,
          '--unknown',
        ],
        false,
      ),
    ).toThrow('Unknown');
    expect(() =>
      parseBootstrapArguments(
        [
          '--',
          '--',
          `--user-id=${userId}`,
          '--display-name=Foundation Administrator',
          `--project-ref=${projectRef}`,
        ],
        false,
      ),
    ).toThrow('Duplicate bootstrap argument separator');
  });
});
