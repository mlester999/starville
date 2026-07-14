import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  compiledPlatformConfiguration,
  fetchPlatformConfiguration,
} from './platform-configuration';

afterEach(() => vi.unstubAllGlobals());

describe('game-client platform configuration', () => {
  it('provides the safe compiled Starville presentation fallback', () => {
    expect(compiledPlatformConfiguration()).toMatchObject({
      fallback: true,
      configuration: { branding: { fullGameName: 'Starville' } },
    });
  });

  it('rejects malformed runtime responses instead of leaking draft-shaped data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ data: { configuration: { secret: true } } })),
      ),
    );
    await expect(fetchPlatformConfiguration('http://localhost:4000')).rejects.toBeDefined();
  });
});
