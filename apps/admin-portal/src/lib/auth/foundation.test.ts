import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AUTH_MESSAGES, loginNoticeMessage } from './messages';
import { normalizeTotpCode } from './mfa-code';
import { validateNewPassword } from './password';
import { ADMIN_ROUTES, destinationForAuthorization } from './redirects';
import { ADMIN_AUTH_COOKIE_NAME, adminAuthCookieOptions } from '../supabase/cookie-options';

describe('administrator authorization route mapping', () => {
  it.each([
    [{ outcome: 'unauthenticated' } as const, ADMIN_ROUTES.login],
    [{ outcome: 'unauthorized' } as const, ADMIN_ROUTES.unauthorized],
    [{ outcome: 'mfa_required' } as const, ADMIN_ROUTES.mfaRequired],
    [{ outcome: 'session_invalid' } as const, ADMIN_ROUTES.sessionExpired],
  ])('maps %o to the fixed safe destination %s', (result, destination) => {
    expect(destinationForAuthorization(result)).toBe(destination);
  });

  it('does not expose a public administrator signup route', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/signup'))).toBe(false);
  });
});

describe('administrator auth-cookie isolation', () => {
  it('uses a dedicated admin cookie namespace', () => {
    expect(ADMIN_AUTH_COOKIE_NAME).toBe('starville-admin-auth');
  });

  it('enables secure cookies for HTTPS deployments', () => {
    expect(adminAuthCookieOptions('https://admin.starville.example')).toMatchObject({
      path: '/',
      sameSite: 'lax',
      secure: true,
    });
  });
});

describe('administrator credential messaging', () => {
  it('uses one generic credential error', () => {
    expect(loginNoticeMessage('invalid')).toBe(AUTH_MESSAGES.invalidCredentials);
    expect(AUTH_MESSAGES.invalidCredentials.toLowerCase()).not.toContain('account');
    expect(AUTH_MESSAGES.invalidCredentials.toLowerCase()).not.toContain('email');
  });

  it('does not reflect unknown notice values', () => {
    expect(loginNoticeMessage('user-does-not-exist')).toBeUndefined();
  });

  it('uses a non-enumerating password-reset response', () => {
    expect(AUTH_MESSAGES.resetRequested).toMatch(/^If that address/);
  });
});

describe('administrator password validation', () => {
  it('accepts a matching strong password', () => {
    expect(validateNewPassword('Starlight!2026', 'Starlight!2026')).toEqual({ valid: true });
  });

  it('rejects mismatched passwords without returning either value', () => {
    expect(validateNewPassword('Starlight!2026', 'Moonlight!2026')).toEqual({
      valid: false,
      reason: 'mismatch',
    });
  });

  it.each(['short!A1', 'alllowercase!2026', 'ALLUPPERCASE!2026', 'NoSymbol2026'])(
    'rejects a weak password',
    (password) => {
      expect(validateNewPassword(password, password)).toEqual({ valid: false, reason: 'weak' });
    },
  );
});

describe('administrator TOTP verification input', () => {
  it('accepts only a normalized six-digit authenticator code', () => {
    expect(normalizeTotpCode(' 123456 ')).toBe('123456');
    expect(normalizeTotpCode('12345')).toBeUndefined();
    expect(normalizeTotpCode('12345a')).toBeUndefined();
  });
});
