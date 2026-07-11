'use client';

import { createAppKit, type CreateAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana, solanaDevnet } from '@reown/appkit/networks';

import type { WalletNetwork } from '@starville/wallet-access';

export interface StarvilleAppKitConfig {
  readonly landingUrl: string;
  readonly projectId: string;
  readonly network: WalletNetwork;
}

let initializedKey: string | undefined;

/**
 * Initializes AppKit once, in the browser, with only the configured Solana network.
 * Calling this from React Strict Mode is intentionally idempotent.
 */
export function initializeStarvilleAppKit(config: StarvilleAppKitConfig): void {
  if (typeof window === 'undefined') {
    return;
  }

  const key = `${config.projectId}:${config.landingUrl}:${config.network}`;

  if (initializedKey === key) {
    return;
  }

  if (initializedKey !== undefined) {
    throw new Error('Starville AppKit was already initialized with different public metadata.');
  }

  const iconUrl = new URL('/images/starville-mark.svg', config.landingUrl).toString();
  // AppKit 1.8.22's adapter and network packages can resolve parallel copies of
  // their exact-optional controller types under pnpm. These are the official,
  // matching-version runtime values documented for the Solana integration.
  const adapters = [new SolanaAdapter()] as unknown as NonNullable<CreateAppKit['adapters']>;
  const configuredNetwork = config.network === 'solana:mainnet-beta' ? solana : solanaDevnet;
  const networks = [configuredNetwork] as unknown as CreateAppKit['networks'];
  const defaultNetwork = configuredNetwork as unknown as NonNullable<
    CreateAppKit['defaultNetwork']
  >;

  createAppKit({
    adapters,
    networks,
    defaultNetwork,
    projectId: config.projectId,
    metadata: {
      name: 'Starville',
      description: 'A cozy world to farm, cook, build, and restore with friends.',
      url: config.landingUrl,
      icons: [iconUrl],
    },
    allowUnsupportedChain: false,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-font-family': 'Inter, ui-sans-serif, system-ui, sans-serif',
      '--w3m-accent': '#eac367',
      '--w3m-color-mix': '#10251e',
      '--w3m-color-mix-strength': 32,
      '--w3m-border-radius-master': '2px',
      '--w3m-z-index': 3000,
    },
    features: {
      analytics: false,
      email: false,
      socials: [],
      onramp: false,
      swaps: false,
      send: false,
      receive: false,
    },
  });

  initializedKey = key;
}
