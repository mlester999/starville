export interface AdminContentSecurityPolicyInput {
  readonly apiUrl: string;
  readonly supabaseUrl: string;
  readonly development?: boolean;
}

function origin(value: string): string {
  return new URL(value).origin;
}

function websocketOrigin(value: string): string {
  const url = new URL(value);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.origin;
}

export function buildAdminContentSecurityPolicy(input: AdminContentSecurityPolicyInput): string {
  const apiOrigin = origin(input.apiUrl);
  const supabaseOrigin = origin(input.supabaseUrl);
  const supabaseWebsocketOrigin = websocketOrigin(input.supabaseUrl);
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${input.development === true ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabaseOrigin}`,
    `font-src 'self' data:`,
    `connect-src 'self' ${apiOrigin} ${supabaseOrigin} ${supabaseWebsocketOrigin}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');
}
