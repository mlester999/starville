import { describe, expect, it } from 'vitest';

import { parsePlayerDirectoryQuery, playerDirectoryHref } from './query';

describe('player directory query', () => {
  it('normalizes allowlisted values and bounds untrusted query strings', () => {
    expect(
      parsePlayerDirectoryQuery({
        page: '-4',
        pageSize: '1000',
        search: '  Luna  ',
        status: 'suspended',
        rename: 'required',
        sort: 'private_column',
        direction: 'sideways',
        recentDays: '7',
      }),
    ).toEqual({
      page: 1,
      pageSize: 25,
      search: 'Luna',
      status: 'suspended',
      rename: 'required',
      mapId: 'all',
      recentDays: 7,
      sort: 'last_entered_at',
      direction: 'desc',
    });
  });

  it('preserves filters while generating pagination links', () => {
    const query = parsePlayerDirectoryQuery({ search: 'Vale', status: 'active' });
    const href = playerDirectoryHref(query, { page: 2 });
    expect(href).toContain('page=2');
    expect(href).toContain('search=Vale');
    expect(href).toContain('status=active');
  });

  it('accepts every Phase 6 published-map filter and rejects unknown maps', () => {
    expect(parsePlayerDirectoryQuery({ mapId: 'moonpetal-meadow' }).mapId).toBe('moonpetal-meadow');
    expect(parsePlayerDirectoryQuery({ mapId: 'brooklight-crossing' }).mapId).toBe(
      'brooklight-crossing',
    );
    expect(parsePlayerDirectoryQuery({ mapId: 'hearthfield-road' }).mapId).toBe('hearthfield-road');
    expect(parsePlayerDirectoryQuery({ mapId: 'whisperpine-gate' }).mapId).toBe('whisperpine-gate');
    expect(parsePlayerDirectoryQuery({ mapId: 'unpublished-map' }).mapId).toBe('all');
  });
});
