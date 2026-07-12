import { describe, expect, it } from 'vitest';

import {
  parseWorldCatalogQuery,
  parseWorldDirectoryQuery,
  worldCatalogHref,
  worldDirectoryHref,
} from './query';

describe('world-management query boundaries', () => {
  it('normalizes search and allowlists bounded directory pagination and sorting', () => {
    expect(
      parseWorldDirectoryQuery({
        page: '-1',
        pageSize: '500',
        search: '  Meadow  ',
        status: 'active',
        sort: 'private_column',
        direction: 'sideways',
      }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      search: 'Meadow',
      status: 'active',
      sort: 'updated_at',
      direction: 'desc',
    });
  });

  it('preserves all safe filters while generating server-pagination links', () => {
    const query = parseWorldDirectoryQuery({
      search: 'Gate',
      status: 'archived',
      sort: 'slug',
      direction: 'asc',
    });
    const href = worldDirectoryHref(query, { page: 2 });
    expect(href).toContain('page=2');
    expect(href).toContain('search=Gate');
    expect(href).toContain('status=archived');
    expect(href).toContain('sort=slug');
    expect(href).toContain('direction=asc');
  });

  it('bounds asset and audit catalog queries to the reviewed routes', () => {
    const query = parseWorldCatalogQuery({ page: '3', pageSize: '100', search: '  lamp  ' });
    expect(query).toEqual({ page: 3, pageSize: 100, search: 'lamp' });
    expect(worldCatalogHref('/world-assets', query, { page: 4 })).toContain('/world-assets?page=4');
    expect(worldCatalogHref('/world-audit', query, { page: 1 })).toContain('/world-audit?page=1');
  });
});
