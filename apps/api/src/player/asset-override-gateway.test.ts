import { describe, expect, it } from 'vitest';

import {
  GameplayAssetOverridePersistenceError,
  parseGameplayAssetOverrideResult,
} from './asset-override-gateway.js';

describe('gameplay asset override persistence parser', () => {
  it('rejects private, malformed, foreign, or internally inconsistent rows', () => {
    expect(() =>
      parseGameplayAssetOverrideResult({
        status: 'loaded',
        requestedKeyCount: 1,
        overrideCount: 1,
        items: [
          {
            assetKey: '../foreign',
            versionId: '22222222-2222-4222-8222-222222222222',
            versionNumber: 2,
          },
        ],
      }),
    ).toThrow(GameplayAssetOverridePersistenceError);
    expect(() =>
      parseGameplayAssetOverrideResult({
        status: 'loaded',
        requestedKeyCount: 1,
        overrideCount: 1,
        items: [],
      }),
    ).toThrow(GameplayAssetOverridePersistenceError);
  });
});
