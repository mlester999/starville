export const ADMIN_AUTH_COOKIE_NAME = 'starville-admin-auth';

export function adminAuthCookieOptions(appUrl: string) {
  return {
    name: ADMIN_AUTH_COOKIE_NAME,
    path: '/',
    sameSite: 'lax' as const,
    secure: appUrl.startsWith('https://'),
  };
}
