import { describe, expect, it } from 'vitest';

import {
  assetDirectoryParameters,
  assetReviewQueueParameters,
  editorAssetCandidateParameters,
  parseAssetDirectoryQuery,
} from './query';

describe('world asset directory query', () => {
  it('allowlists browser filters and emits exact API parameter names', () => {
    const query = parseAssetDirectoryQuery({
      page: '2',
      pageSize: '50',
      search: ' willow ',
      assetType: 'building',
      category: 'structure',
      lifecycleStatus: 'active',
      productionStatus: 'approved_production',
      sort: 'friendly_name',
      direction: 'asc',
    });
    const parameters = assetDirectoryParameters(query);

    expect(parameters.get('assetType')).toBe('building');
    expect(parameters.get('lifecycleStatus')).toBe('active');
    expect(parameters.get('productionStatus')).toBe('approved_production');
    expect(parameters.get('offset')).toBe('50');
    expect(parameters.has('type')).toBe(false);
    expect(parameters.has('activity')).toBe(false);
  });

  it('drops malformed category and unsupported enum values', () => {
    const query = parseAssetDirectoryQuery({
      category: '../private',
      assetType: 'executable',
      lifecycleStatus: 'published',
    });
    expect(query.category).toBe('');
    expect(query.assetType).toBe('all');
    expect(query.lifecycle).toBe('all');
  });

  it('drops syntactically valid categories outside the shared catalog', () => {
    const query = parseAssetDirectoryQuery({ category: 'unregistered_category' });

    expect(query.category).toBe('');
    expect(assetDirectoryParameters(query).has('category')).toBe(false);
  });

  it('does not send version-only lifecycle states to the asset directory', () => {
    const query = parseAssetDirectoryQuery({ lifecycleStatus: 'validated' });

    expect(query.lifecycle).toBe('all');
    expect(assetDirectoryParameters(query).has('lifecycleStatus')).toBe(false);
  });

  it('emits only parameters supported by the review queue', () => {
    const parameters = assetReviewQueueParameters({
      page: 3,
      pageSize: 10,
      search: 'willow',
    });

    expect(Object.fromEntries(parameters)).toEqual({
      limit: '10',
      offset: '20',
      search: 'willow',
    });
    expect(parameters.has('sort')).toBe(false);
    expect(parameters.has('direction')).toBe(false);
    expect(parameters.has('lifecycleStatus')).toBe(false);
  });

  it('emits only allowlisted editor candidate parameters', () => {
    const parameters = editorAssetCandidateParameters({
      page: 2,
      pageSize: 50,
      search: 'oven',
      assetType: 'building',
      category: 'structure',
      interaction: 'cooking_station',
    });

    expect(Object.fromEntries(parameters)).toEqual({
      limit: '50',
      offset: '50',
      search: 'oven',
      assetType: 'building',
      category: 'structure',
      interaction: 'cooking_station',
    });
    expect(parameters.has('sort')).toBe(false);
    expect(parameters.has('direction')).toBe(false);
    expect(parameters.has('lifecycleStatus')).toBe(false);
    expect(parameters.has('productionStatus')).toBe(false);
  });
});
