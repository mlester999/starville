export const ACCESS_MODAL_STATES = [
  'disconnected',
  'connection_opening',
  'connected',
  'unsupported_network',
  'unsupported_wallet',
  'challenge_creation',
  'awaiting_signature',
  'signature_rejected',
  'signature_verification',
  'balance_verification',
  'access_granted',
  'insufficient_balance',
  'rpc_unavailable',
  'configuration_unavailable',
  'challenge_expired',
  'session_expired',
  'access_revoked',
  'account_changed',
  'network_changed',
  'retry',
] as const;

export type AccessModalState = (typeof ACCESS_MODAL_STATES)[number];

export type AccessStateTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

export interface AccessStateContent {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly tone: AccessStateTone;
  readonly busy: boolean;
}

export const ACCESS_STATE_CONTENT = {
  disconnected: {
    eyebrow: 'A quiet beginning',
    title: 'Enter Starville',
    description:
      'Connect a Solana wallet to prove ownership. You will sign a free message—not a transaction.',
    tone: 'neutral',
    busy: false,
  },
  connection_opening: {
    eyebrow: 'Choose a wallet',
    title: 'Opening the wallet list',
    description: 'Select a supported Solana wallet in the secure connection window.',
    tone: 'progress',
    busy: true,
  },
  connected: {
    eyebrow: 'Wallet connected',
    title: 'Ready to verify',
    description:
      'Sign Starville’s one-time message so the server can verify this wallet belongs to you.',
    tone: 'neutral',
    busy: false,
  },
  unsupported_network: {
    eyebrow: 'Network required',
    title: 'Switch to the configured Solana network',
    description: 'Starville development access is available only on the configured Solana network.',
    tone: 'warning',
    busy: false,
  },
  unsupported_wallet: {
    eyebrow: 'Signature unavailable',
    title: 'This wallet cannot sign the message',
    description:
      'Choose a Solana wallet that supports message signing. No transaction signature is requested.',
    tone: 'warning',
    busy: false,
  },
  challenge_creation: {
    eyebrow: 'Preparing verification',
    title: 'Creating a one-time message',
    description: 'The Starville server is preparing a short-lived ownership challenge.',
    tone: 'progress',
    busy: true,
  },
  awaiting_signature: {
    eyebrow: 'Wallet confirmation',
    title: 'Sign the Starville message',
    description:
      'Review the message in your wallet. It cannot transfer tokens or grant spending authority.',
    tone: 'progress',
    busy: true,
  },
  signature_rejected: {
    eyebrow: 'Nothing was signed',
    title: 'Signature request cancelled',
    description: 'Your wallet remains connected. Try again whenever you are ready.',
    tone: 'neutral',
    busy: false,
  },
  signature_verification: {
    eyebrow: 'Verifying ownership',
    title: 'Checking your signature',
    description: 'The server is validating the exact one-time message and wallet address.',
    tone: 'progress',
    busy: true,
  },
  balance_verification: {
    eyebrow: 'Checking access',
    title: 'Looking for the Starville token',
    description: 'The server is checking the configured mint and exact balance on Solana.',
    tone: 'progress',
    busy: true,
  },
  access_granted: {
    eyebrow: 'The lanterns are lit',
    title: 'Welcome to Starville',
    description: 'Your wallet and token access have been verified by the Starville server.',
    tone: 'success',
    busy: false,
  },
  insufficient_balance: {
    eyebrow: 'Access requirement not met',
    title: 'More STAR is needed',
    description:
      'Connect another wallet or obtain the required amount before checking access again.',
    tone: 'warning',
    busy: false,
  },
  rpc_unavailable: {
    eyebrow: 'Verification paused',
    title: 'We could not verify your wallet',
    description:
      'The Solana balance service is temporarily unavailable. Your wallet has not been rejected.',
    tone: 'warning',
    busy: false,
  },
  configuration_unavailable: {
    eyebrow: 'Access is not ready',
    title: 'Starville verification is unavailable',
    description: 'The token-access configuration is incomplete or temporarily paused.',
    tone: 'warning',
    busy: false,
  },
  challenge_expired: {
    eyebrow: 'Time to refresh',
    title: 'That message expired',
    description:
      'For your safety, ownership messages are short-lived. Create a new one to continue.',
    tone: 'neutral',
    busy: false,
  },
  session_expired: {
    eyebrow: 'Session ended',
    title: 'Verify access again',
    description: 'Your short-lived Starville access session has expired.',
    tone: 'neutral',
    busy: false,
  },
  access_revoked: {
    eyebrow: 'Access changed',
    title: 'This session is no longer active',
    description: 'Reconnect and verify the current wallet to request a new access session.',
    tone: 'warning',
    busy: false,
  },
  account_changed: {
    eyebrow: 'Wallet changed',
    title: 'The new account needs verification',
    description: 'A previous wallet session never authorizes a newly selected account.',
    tone: 'neutral',
    busy: false,
  },
  network_changed: {
    eyebrow: 'Network changed',
    title: 'Return to the configured Solana network',
    description: 'Changing networks ends the current verification attempt.',
    tone: 'warning',
    busy: false,
  },
  retry: {
    eyebrow: 'Please try again',
    title: 'Verification did not finish',
    description: 'No access was granted. Check the connection and start a fresh verification.',
    tone: 'danger',
    busy: false,
  },
} as const satisfies Readonly<Record<AccessModalState, AccessStateContent>>;

export type TokenAccessViewStatus =
  'granted' | 'none' | 'expired' | 'revoked' | 'insufficient_balance' | 'configuration_changed';

export function stateForAccessStatus(status: TokenAccessViewStatus): AccessModalState {
  switch (status) {
    case 'granted':
      return 'access_granted';
    case 'expired':
      return 'session_expired';
    case 'revoked':
    case 'configuration_changed':
      return 'access_revoked';
    case 'insufficient_balance':
      return 'insufficient_balance';
    case 'none':
      return 'disconnected';
  }
}

const ERROR_STATE_BY_CODE: Readonly<Record<string, AccessModalState>> = {
  TOKEN_ACCESS_INSUFFICIENT_BALANCE: 'insufficient_balance',
  TOKEN_BALANCE_INSUFFICIENT: 'insufficient_balance',
  INSUFFICIENT_TOKEN_BALANCE: 'insufficient_balance',
  SOLANA_RPC_UNAVAILABLE: 'rpc_unavailable',
  TOKEN_ACCESS_RPC_UNAVAILABLE: 'rpc_unavailable',
  RPC_UNAVAILABLE: 'rpc_unavailable',
  TOKEN_GATE_UNAVAILABLE: 'configuration_unavailable',
  TOKEN_GATE_UNCONFIGURED: 'configuration_unavailable',
  TOKEN_ACCESS_CONFIGURATION_UNAVAILABLE: 'configuration_unavailable',
  WALLET_CHALLENGE_EXPIRED: 'challenge_expired',
  CHALLENGE_EXPIRED: 'challenge_expired',
  TOKEN_ACCESS_SESSION_EXPIRED: 'session_expired',
  TOKEN_ACCESS_EXPIRED: 'session_expired',
  TOKEN_ACCESS_SESSION_REVOKED: 'access_revoked',
  TOKEN_ACCESS_REVOKED: 'access_revoked',
  TOKEN_ACCESS_CONFIGURATION_CHANGED: 'access_revoked',
  CONFIG_VERSION_CONFLICT: 'access_revoked',
  WALLET_ACCOUNT_CHANGED: 'account_changed',
  WALLET_NETWORK_MISMATCH: 'unsupported_network',
  UNSUPPORTED_SOLANA_NETWORK: 'unsupported_network',
  NETWORK_MISMATCH: 'unsupported_network',
  RATE_LIMITED: 'retry',
  CHALLENGE_INVALID: 'retry',
  SIGNATURE_INVALID: 'retry',
  PERSISTENCE_UNAVAILABLE: 'retry',
};

export function stateForSafeErrorCode(code: string | undefined): AccessModalState {
  return code === undefined ? 'retry' : (ERROR_STATE_BY_CODE[code] ?? 'retry');
}
