import { describe, expect, it } from 'vitest';

import { initializeStarvilleAppKit } from './reown';

describe('Starville Reown boundary', () => {
  it('does not initialize browser state during server rendering', () => {
    expect(globalThis.window).toBeUndefined();
    expect(() =>
      initializeStarvilleAppKit({
        landingUrl: 'https://starville.example',
        projectId: 'starville-test-project',
        network: 'solana:mainnet-beta',
      }),
    ).not.toThrow();
  });
});
