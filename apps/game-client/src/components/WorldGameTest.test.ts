import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const component = readFileSync(resolve(process.cwd(), 'src/components/WorldGameTest.tsx'), 'utf8');
const app = readFileSync(resolve(process.cwd(), 'src/app/App.tsx'), 'utf8');
const client = readFileSync(resolve(process.cwd(), 'src/app/game-test-client.ts'), 'utf8');
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');
const shopFixture = readFileSync(
  resolve(process.cwd(), 'src/components/GeneralStoreGameTest.tsx'),
  'utf8',
);

describe('real game-client World Game Test boundary', () => {
  it('routes /preview/world into the real GameCanvas without the public token gate', () => {
    expect(app).toContain("window.location.pathname === '/preview/world'");
    expect(app).toContain('<WorldGameTest');
    expect(component).toContain('<GameCanvas');
    expect(component).toContain('runtimeWorld(props.projection)');
    expect(component).toContain('onStateChanged={(state) => setLocalState(state)}');
  });

  it('does not mount persistence, economy, rewards, inventory, social, chat, or public realtime', () => {
    for (const forbidden of [
      'usePlayerPersistence',
      'useRealtimePresence',
      'CozyGameplay',
      'ChatPanel',
      'SocialInteractionPanel',
      'SocialGraphPanel',
      'CooperativeActivityPanel',
      'PremiumWardrobe',
      'requestPlayerApi',
    ]) {
      expect(component).not.toContain(forbidden);
    }
    expect(component).toContain('data-private-realtime="disabled"');
    expect(component).toContain('onCheckpoint={() => undefined}');
    expect(component).toContain('onFinalState={() => undefined}');
    expect(component).toContain('World transition disabled');
  });

  it('opens an isolated in-memory General Store fixture without persistent mutation clients', () => {
    expect(component).toContain("worldInteraction.id === 'phase7-general-store'");
    expect(component).toContain('<GeneralStoreGameTest');
    expect(shopFixture).toContain('This shop uses temporary preview data.');
    expect(shopFixture).toContain(
      'No inventory, DUST, stock, limits, receipts, or quest progress will be saved.',
    );
    expect(shopFixture).toContain("direction === 'buy'");
    expect(shopFixture).toContain("direction === 'sell'");
    expect(shopFixture).toContain('setWorkspace');
    expect(shopFixture).not.toContain('transactGeneralStore');
    expect(shopFixture).not.toContain('requestPlayerApi');
    expect(shopFixture).not.toContain('/transactions');
  });

  it('keeps the session revision visible and revalidates revocation or expiry', () => {
    expect(component).toContain('GAME TEST · NO PROGRESSION');
    expect(component).toContain('Exact draft revision');
    expect(component).toContain('loadWorldGameTestSession(apiUrl)');
    expect(component).toContain('30_000');
    expect(component).toContain('This Game Test session ended safely.');
    expect(client).toContain("target.searchParams.set('gameTest', 'returned')");
    expect(client).toContain("target.searchParams.set('gameTestSessionId', gameTestSessionId)");
    expect(component).toContain('Revision debug');
    expect(component).toContain('Pinned assets');
    expect(component).toContain('Fallbacks');
  });

  it('uses fragment exchange, HttpOnly-cookie reloads, and no-store/no-referrer requests', () => {
    expect(client).toContain('location.hash');
    expect(client).toContain('history.replaceState');
    expect(client).toContain('bootstrapPromise ??=');
    expect(client).toContain("request(apiUrl, '/exchange'");
    expect(client).toContain("request(apiUrl, '/session'");
    expect(client).toContain("credentials: 'include'");
    expect(client).toContain("cache: 'no-store'");
    expect(client).toContain("referrerPolicy: 'no-referrer'");
    expect(client).not.toContain('localStorage');
    expect(client).not.toContain('sessionStorage');
  });

  it('has a persistent responsive preview banner and noindex metadata', () => {
    expect(component).toContain("robots.content = 'noindex, nofollow, noarchive'");
    expect(component).toContain("referrer.content = 'no-referrer'");
    expect(component).toContain("cacheControl.content = 'no-store'");
    expect(styles).toContain('.world-game-test-banner');
    expect(styles).toContain('@media (max-width: 760px)');
    expect(styles).toContain('.world-game-test-debug');
  });
});
