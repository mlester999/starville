import { describe, expect, it } from 'vitest';

import {
  assertValidMigrationFilename,
  createMigrationFilename,
  isValidMigrationFilename,
} from '../src/index';

describe('Supabase migration naming', () => {
  it('accepts a valid UTC timestamp and snake-case description', () => {
    expect(isValidMigrationFilename('20260710143005_initialize_extensions.sql')).toBe(true);
  });

  it.each([
    '001_initialize.sql',
    '20260710143005-unsafe-name.sql',
    '20261310143005_invalid_month.sql',
    '20260230143005_invalid_day.sql',
    '20260710143005_Admin_Users.sql',
  ])('rejects invalid migration filename %s', (filename) => {
    expect(isValidMigrationFilename(filename)).toBe(false);
    expect(() => assertValidMigrationFilename(filename)).toThrow();
  });

  it('creates deterministic UTC filenames', () => {
    expect(
      createMigrationFilename('enable_required_extensions', new Date('2026-07-10T14:30:05Z')),
    ).toBe('20260710143005_enable_required_extensions.sql');
  });

  it('refuses ambiguous descriptions', () => {
    expect(() => createMigrationFilename('CreateAdminUsers')).toThrow('lowercase snake_case');
  });
});
