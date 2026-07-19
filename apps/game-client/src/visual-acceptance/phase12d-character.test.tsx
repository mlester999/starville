import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AVATAR_ANIMATION_STATES, AVATAR_PREVIEW_DIRECTIONS } from '../components/AvatarPreview';

import { PHASE12D_CHARACTER_MAPPINGS, Phase12DCharacterAcceptance } from './phase12d-character';

describe('Phase 12D character visual acceptance', () => {
  it('covers each shared animation state in all eight shared directions exactly once', () => {
    expect(AVATAR_ANIMATION_STATES).toEqual(['idle', 'walk', 'jog']);
    expect(AVATAR_PREVIEW_DIRECTIONS).toEqual([
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ]);
    expect(PHASE12D_CHARACTER_MAPPINGS).toHaveLength(24);
    expect(new Set(PHASE12D_CHARACTER_MAPPINGS.map(({ key }) => key)).size).toBe(24);
  });

  it('renders all 24 labeled mappings paused for reduced-motion acceptance', () => {
    const markup = renderToStaticMarkup(
      <Phase12DCharacterAcceptance highContrast={false} reducedMotion />,
    );

    expect(markup.match(/data-mapping-key=/gu)).toHaveLength(24);
    expect(markup.match(/role="img"/gu)).toHaveLength(24);
    expect(markup.match(/data-paused="true"/gu)).toHaveLength(24);
    expect(markup).toContain('idle:north');
    expect(markup).toContain('jog:northwest');
    expect(markup).toContain('Production-candidate review surface · not final art approval');
  });
});
