import { describe, expect, it } from 'vitest';

import { inspectAvatarSource } from './avatar-security-boundary';

const playerPath = 'apps/game-client/src/app/avatar-runtime.ts';

describe('Phase 10A avatar source boundary', () => {
  it.each([
    ['raw external asset URL', 'const avatarUrl = payload.value;'],
    ['raw asset path', 'const assetPath: string = request.value;'],
    ['appearance data URL', 'const appearance = "data:image/png;base64,aaaa";'],
    ['SVG script content', 'const avatarSvg = "<script>alert(1)</script>";'],
    ['SVG event handler', 'const avatarSvg = "<svg onload=run()>";'],
    ['eval configuration', 'const avatarAnimation = eval(payload.code);'],
    ['Function configuration', 'const avatarAnimation = new Function(payload.code);'],
    ['JavaScript URL configuration', 'const avatarAnimation = "javascript:run()";'],
  ])('rejects %s', (_label, content) => {
    expect(inspectAvatarSource({ content, path: playerPath })).not.toEqual([]);
  });

  it.each([
    ['render order', 'const appearance = input.renderOrder;'],
    ['asset path', 'const avatar = request.assetPath;'],
    ['asset URL', 'const appearance = payload.assetUrl;'],
  ])('rejects browser-controlled %s', (_label, content) => {
    expect(inspectAvatarSource({ content, path: playerPath })).toContain(
      `browser-controlled avatar rendering authority in ${playerPath}`,
    );
  });

  it('rejects private asset-intake references and identity leakage in public contracts', () => {
    const path = 'packages/avatar/src/contracts.ts';
    expect(
      inspectAvatarSource({ content: 'const avatarBucket = "asset-intake";', path }),
    ).toContain(`private asset-intake reference in public appearance source ${path}`);
    expect(
      inspectAvatarSource({ content: 'const publicAppearance = { walletAddress };', path }),
    ).toContain(`private identity field in public appearance source ${path}`);
    expect(
      inspectAvatarSource({ content: 'const publicAppearance = { emailAddress };', path }),
    ).toContain(`private identity field in public appearance source ${path}`);
  });

  it('rejects direct table mutation, administrator bypass fields, and dynamic imports', () => {
    expect(
      inspectAvatarSource({
        content: `await supabase.from('avatar_player_profiles').update(appearance);`,
        path: 'apps/api/src/avatar/persistence.ts',
      }),
    ).toContain(
      'direct avatar-table mutation outside trusted RPC in apps/api/src/avatar/persistence.ts',
    );
    expect(
      inspectAvatarSource({
        content: 'const avatarOption = { administratorOnly: request.value };',
        path: playerPath,
      }),
    ).toContain(`administrator cosmetic authority exposed to player source ${playerPath}`);
    expect(
      inspectAvatarSource({
        content: 'const avatarRenderer = await import(configuration.module);',
        path: playerPath,
      }),
    ).toContain(`unsafe dynamic import in avatar runtime source ${playerPath}`);
  });

  it('allows approved keys, compact appearance references, and static imports', () => {
    expect(
      inspectAvatarSource({
        content:
          'import { renderer } from "./approved-renderer"; const appearance = { appearanceId, appearanceRevision, presetKey };',
        path: playerPath,
      }),
    ).toEqual([]);
  });

  it('does not treat documentation, migrations, or inert scanner tests as runtime source', () => {
    for (const path of [
      'docs/security/phase-10a-avatar-trust-boundaries.md',
      'infrastructure/supabase/migrations/20260716100000_phase10a_avatar_schema.sql',
      'scripts/avatar-security-boundary.test.ts',
    ]) {
      expect(
        inspectAvatarSource({ content: 'avatarUrl data:image/png <script> import(value)', path }),
      ).toEqual([]);
    }
  });
});
