export interface LandingContentSecurityPolicyInput {
  readonly apiUrl: string;
  readonly supabaseUrl: string;
  readonly development?: boolean;
}

const REOWN_CONNECT_ORIGINS = [
  'https://api.web3modal.org',
  'https://pulse.walletconnect.org',
  'https://rpc.walletconnect.org',
  'wss://relay.walletconnect.org',
  'https://verify.walletconnect.com',
  'https://verify.walletconnect.org',
] as const;

const REOWN_FRAME_ORIGINS = [
  'https://secure.walletconnect.org',
  'https://secure-mobile.walletconnect.com',
  'https://secure-mobile.walletconnect.org',
] as const;

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

/** Exact origins required by the repository-locked Reown AppKit integration. */
export function buildLandingContentSecurityPolicy(
  input: LandingContentSecurityPolicyInput,
): string {
  const apiOrigin = origin(input.apiUrl);
  const supabaseOrigin = origin(input.supabaseUrl);
  const supabaseWebsocketOrigin = websocketOrigin(input.supabaseUrl);
  return [
    `default-src 'self'`,
    `script-src 'self' 'unsafe-inline'${input.development === true ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: ${supabaseOrigin} https://api.web3modal.org`,
    `font-src 'self' data: https://fonts.reown.com`,
    `connect-src 'self' ${apiOrigin} ${supabaseOrigin} ${supabaseWebsocketOrigin} ${REOWN_CONNECT_ORIGINS.join(' ')}`,
    `frame-src ${REOWN_FRAME_ORIGINS.join(' ')}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
  ].join('; ');
}
