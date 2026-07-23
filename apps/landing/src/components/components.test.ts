import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

function readSource(fileName: string): string {
  return readFileSync(resolve(process.cwd(), 'src/components', fileName), 'utf8');
}

describe('landing experience component boundaries', () => {
  it('renders the official Starville identity', () => {
    const mark = readSource('starville-mark.tsx');

    expect(mark).toContain('/images/starville-icon-official.png');
    expect(mark).toContain('STARVILLE');
  });

  it('provides a labelled modal, focus loop, and focus restoration', () => {
    const dialog = readSource('access-dialog.tsx');

    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal');
    expect(dialog).toContain('aria-labelledby');
    expect(dialog).toContain("event.key !== 'Tab'");
    expect(dialog).toContain('returnFocusElement?.focus()');
  });

  it('provides real navigation routes, truthful world status, and a copyable configured mint', () => {
    const landing = readSource('landing-experience.tsx');

    expect(landing).toContain('href="/how-to-play"');
    expect(landing).toContain('href="/docs"');
    expect(landing).toContain('href="/spectate"');
    expect(landing).toContain('target="_blank"');
    expect(landing).toContain('rel="noopener noreferrer"');
    expect(landing).toContain('World status');
    expect(landing).toContain('Village preparing');
    expect(landing).not.toContain('Online players');
    expect(landing).toContain('shortenWalletAddress(mintAddress)');
    expect(landing).toContain('navigator.clipboard.writeText(mintAddress)');
    expect(landing).not.toMatch(/[0-9,]+ players (online|monthly)/i);
  });

  it('uses the supplied official social assets with safe and accessible link states', () => {
    const landing = readSource('landing-experience.tsx');

    expect(landing).toContain('/images/x-official.png');
    expect(landing).toContain('/images/discord-official.png');
    expect(landing).toContain('Follow Starville on X');
    expect(landing).toContain('Join the Starville Discord');
    expect(landing).toContain('role="tooltip"');
    expect(landing).toContain('aria-disabled="true"');
    expect(landing).toContain('rel="noopener noreferrer"');
    expect(landing).toContain('target="_blank"');
    expect(landing).toContain('social-link__mobile-label');
  });

  it('keeps Spectate routed outside the wallet flow and gives it a viewing icon', () => {
    const landing = readSource('landing-experience.tsx');

    expect(landing).toContain('href="/spectate"');
    expect(landing).toContain('<EyeIcon />');
    expect(landing.indexOf('href="/spectate"')).toBeLessThan(landing.indexOf('<EyeIcon />'));
  });

  it('keeps existing wallet action handlers while presenting actions as labelled buttons', () => {
    const flow = readSource('wallet-access-flow.tsx');

    expect(flow).toContain('className="session-action"');
    expect(flow).toContain('onClick={checkAgain}');
    expect(flow).toContain('onClick={changeWallet}');
    expect(flow).toContain('onClick={disconnectWallet}');
    expect(flow).toContain('<RefreshIcon />');
    expect(flow).toContain('<WalletSwitchIcon />');
    expect(flow).toContain('<PowerIcon />');
  });

  it('uses a reusable, lightweight route presentation boundary', () => {
    const route = readSource('route-preview.tsx');

    expect(route).toContain('More from the village is coming soon.');
    expect(route).toContain('Return home');
  });
});
