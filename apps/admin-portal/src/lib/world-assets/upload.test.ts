import { describe, expect, it } from 'vitest';

import {
  assetSlugValidationMessage,
  friendlyNameValidationMessage,
  generateAssetSlug,
  isValidAssetSlug,
  normalizeFriendlyName,
  slugCollisionMessage,
  suggestAlternateAssetSlug,
  uploadSlug,
} from './upload';

describe('friendly name validation', () => {
  it('requires a non-empty readable name', () => {
    expect(friendlyNameValidationMessage('')).toBe('Friendly name is required.');
    expect(friendlyNameValidationMessage('   ')).toBe(
      'Enter a readable name — spaces alone are not allowed.',
    );
  });

  it('trims surrounding whitespace for normalization', () => {
    expect(normalizeFriendlyName('  Village Supply Shop  ')).toBe('Village Supply Shop');
    expect(normalizeFriendlyName('Pine\tTree  02')).toBe('Pine Tree 02');
  });

  it('preserves readable capitalization', () => {
    expect(normalizeFriendlyName('Moonpetal Flower')).toBe('Moonpetal Flower');
    expect(normalizeFriendlyName('Cozy Cottage')).toBe('Cozy Cottage');
  });

  it('rejects control and markup characters', () => {
    expect(friendlyNameValidationMessage('Shop <script>')).toMatch(/cannot be used/i);
  });
});

describe('automatic asset slug generation', () => {
  it('generates lowercase hyphenated ids from friendly names', () => {
    expect(generateAssetSlug('Village Supply Shop')).toBe('village-supply-shop');
    expect(generateAssetSlug('Pine Tree 02')).toBe('pine-tree-02');
    expect(uploadSlug('Lantern Square Fountain')).toBe('lantern-square-fountain');
  });

  it('handles punctuation, repeated separators, and edge hyphens', () => {
    expect(generateAssetSlug('  Moonpetal Café Chair  ')).toBe('moonpetal-cafe-chair');
    expect(generateAssetSlug('Oak---Tree!!!')).toBe('oak-tree');
    expect(generateAssetSlug('--Pine Tree--')).toBe('pine-tree');
  });

  it('preserves safe numbers and enforces maximum length', () => {
    expect(generateAssetSlug('Bench 12')).toBe('bench-12');
    const long = generateAssetSlug(`${'A'.repeat(120)} Tree`);
    expect(long.length).toBeLessThanOrEqual(96);
  });

  it('validates generated slug shape', () => {
    expect(isValidAssetSlug('village-supply-shop')).toBe(true);
    expect(isValidAssetSlug('02-pine')).toBe(false);
    expect(isValidAssetSlug('ab')).toBe(false);
  });

  it('surfaces clear validation when a name cannot produce a valid id', () => {
    expect(assetSlugValidationMessage('', '  ')).toBeNull();
    expect(assetSlugValidationMessage('', '!!!')).toMatch(/letters/i);
    expect(assetSlugValidationMessage('02-pine', '02 Pine')).toMatch(/start with a letter/i);
  });
});

describe('slug collision handling', () => {
  it('suggests sequential human-readable alternatives', () => {
    expect(suggestAlternateAssetSlug('pine-tree', new Set(['pine-tree']))).toBe('pine-tree-02');
    expect(suggestAlternateAssetSlug('pine-tree', ['pine-tree', 'pine-tree-02'])).toBe(
      'pine-tree-03',
    );
  });

  it('does not invent random characters for the first suggestion', () => {
    const suggestion = suggestAlternateAssetSlug('oak-bench', new Set(['oak-bench']));
    expect(suggestion).toBe('oak-bench-02');
    expect(suggestion).not.toMatch(/[0-9a-f]{8}/u);
  });

  it('explains collisions with a specific alternative when available', () => {
    expect(slugCollisionMessage('pine-tree', 'pine-tree-02')).toContain('pine-tree-02');
    expect(slugCollisionMessage('pine-tree', 'pine-tree')).toMatch(/more specific/i);
  });
});
