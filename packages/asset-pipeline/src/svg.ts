import type { BundledAssetEntry, BundledAssetVariant } from '@starville/asset-management';

type Palette = Readonly<{
  ink: string;
  deep: string;
  middle: string;
  light: string;
  accent: string;
  glow: string;
}>;

const PALETTES: Readonly<Record<BundledAssetEntry['generator']['palette'], Palette>> = {
  amber: {
    ink: '#382b2a',
    deep: '#75503d',
    middle: '#b87849',
    light: '#e8bd77',
    accent: '#f5df9a',
    glow: '#fff2bd',
  },
  sage: {
    ink: '#253832',
    deep: '#345c4c',
    middle: '#5d8b68',
    light: '#a7c98b',
    accent: '#d8d99a',
    glow: '#f3edbd',
  },
  meadow: {
    ink: '#283a32',
    deep: '#3f6f53',
    middle: '#71a867',
    light: '#b8d98d',
    accent: '#efd78b',
    glow: '#fff3bd',
  },
  moon: {
    ink: '#2c304b',
    deep: '#4e5686',
    middle: '#7887b5',
    light: '#b8c7df',
    accent: '#e9d68d',
    glow: '#fff4c5',
  },
  hearth: {
    ink: '#402c29',
    deep: '#804331',
    middle: '#c36b3f',
    light: '#eeb870',
    accent: '#f6dc83',
    glow: '#fff0b0',
  },
  stone: {
    ink: '#30363b',
    deep: '#58636a',
    middle: '#818e8f',
    light: '#b7c2b6',
    accent: '#d6c28e',
    glow: '#f4e8b4',
  },
  system: {
    ink: '#342d3d',
    deep: '#704056',
    middle: '#ba5b67',
    light: '#e49a82',
    accent: '#f3d27d',
    glow: '#fff0b0',
  },
};

export type SvgRenderInput = Readonly<{
  asset: BundledAssetEntry;
  variant?: BundledAssetVariant;
}>;

export function renderBundledAssetSvg(input: SvgRenderInput): string {
  const { asset, variant } = input;
  const { width, height } = asset;
  const palette = PALETTES[asset.generator.palette];
  const title = escapeXml(
    variant === undefined ? asset.displayName : `${asset.displayName} ${variant.id}`,
  );
  const description = escapeXml(asset.description);
  const rotation = variant?.rotation ?? asset.defaultRotation;
  const state = variant?.state ?? asset.generator.variant;
  const body = renderBody(asset, palette, rotation, state);
  return normalizeSvgNumbers(
    [
      '<svg xmlns="http://www.w3.org/2000/svg"',
      ` width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}"`,
      ' fill="none">',
      `<title>${title}</title><desc>${description}</desc>`,
      renderDefinitions(palette),
      `<g stroke-linecap="round" stroke-linejoin="round">${body}</g>`,
      '</svg>\n',
    ].join(''),
  );
}

function renderDefinitions(palette: Palette): string {
  return `<defs>
    <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette.light}"/><stop offset="1" stop-color="${palette.middle}"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.middle}"/><stop offset="1" stop-color="${palette.deep}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${palette.glow}" stop-opacity=".92"/><stop offset="1" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>
  </defs>`;
}

function renderBody(
  asset: BundledAssetEntry,
  palette: Palette,
  rotation: 0 | 90 | 180 | 270,
  state: string,
): string {
  const renderers: Readonly<Record<string, () => string>> = {
    terrain: () => terrain(asset, palette, state),
    building: () => building(asset, palette, state),
    tree: () => tree(asset, palette, state),
    nature_prop: () => natureProp(asset, palette, state),
    boundary: () => boundary(asset, palette, state, rotation),
    lamp: () => lamp(asset, palette),
    sign: () => sign(asset, palette, state),
    marker: () => marker(asset, palette),
    station: () => station(asset, palette, state),
    entrance: () => entrance(asset, palette),
    furniture: () => furniture(asset, palette, state, rotation),
    farm_plot: () => farmPlot(asset, palette, state),
    crop: () => crop(asset, palette, state),
    item_icon: () => itemIcon(asset, palette, state),
    ui_icon: () => uiIcon(asset, palette, state),
    missing_asset: () => missingAsset(asset, palette),
  };
  return (renderers[asset.generator.kind] ?? (() => missingAsset(asset, palette)))();
}

function terrain(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const points = `${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`;
  let fill = 'url(#surface)';
  let detail: string;
  if (state === 'water') {
    fill = palette.deep;
    detail = `<path d="M${w * 0.17} ${h * 0.46}q${w * 0.1}-${h * 0.1} ${w * 0.2} 0t${w * 0.2} 0M${w * 0.42} ${h * 0.62}q${w * 0.1}-${h * 0.1} ${w * 0.2} 0t${w * 0.16} 0" stroke="${palette.light}" stroke-width="2" opacity=".78"/><path d="M${w * 0.37} ${h * 0.35}l${w * 0.04}-${h * 0.04}" stroke="${palette.glow}" stroke-width="2.4"/>`;
  } else if (state === 'grass' || state === 'grass_clover') {
    detail = `<path d="M${w * 0.28} ${h * 0.55}l3 -6 2 6M${w * 0.39} ${h * 0.38}l2 -5 3 5M${w * 0.64} ${h * 0.58}l3 -5 2 5" stroke="${palette.accent}" stroke-width="1.6" opacity=".7"/>${
      state === 'grass_clover'
        ? `<g fill="${palette.glow}" opacity=".8"><circle cx="${w * 0.29}" cy="${h * 0.42}" r="1.8"/><circle cx="${w * 0.33}" cy="${h * 0.42}" r="1.8"/><circle cx="${w * 0.31}" cy="${h * 0.38}" r="1.8"/><circle cx="${w * 0.7}" cy="${h * 0.5}" r="1.6"/><circle cx="${w * 0.74}" cy="${h * 0.5}" r="1.6"/><circle cx="${w * 0.72}" cy="${h * 0.46}" r="1.6"/></g>`
        : ''
    }`;
  } else if (state === 'dirt') {
    fill = '#a97955';
    detail = `<g fill="${palette.deep}" opacity=".55"><ellipse cx="${w * 0.27}" cy="${h * 0.5}" rx="3.5" ry="1.8"/><ellipse cx="${w * 0.62}" cy="${h * 0.39}" rx="2.7" ry="1.4"/><ellipse cx="${w * 0.72}" cy="${h * 0.58}" rx="4" ry="1.7"/></g><path d="M${w * 0.39} ${h * 0.59}q${w * 0.08}-${h * 0.09} ${w * 0.16}-${h * 0.02}" stroke="${palette.light}" stroke-width="1.5" opacity=".6"/>`;
  } else if (state === 'path') {
    fill = '#aaa894';
    detail = `<path d="M${w * 0.14} ${h * 0.5}l${w * 0.36}-${h * 0.2} ${w * 0.36} ${h * 0.2}-${w * 0.36} ${h * 0.2}z" fill="#c8c2a9" stroke="${palette.deep}" stroke-width="1.5"/><path d="M${w * 0.31} ${h * 0.41}l${w * 0.38} ${h * 0.19}M${w * 0.22} ${h * 0.55}l${w * 0.38}-${h * 0.2}M${w * 0.4} ${h * 0.69}l${w * 0.38}-${h * 0.2}" stroke="${palette.middle}" stroke-width="1.2"/>`;
  } else if (state === 'plaza') {
    fill = '#c7c5b6';
    detail = `<path d="M${w * 0.5} ${h * 0.08}v${h * 0.84}M${w * 0.26} ${h * 0.27}l${w * 0.48} ${h * 0.46}M${w * 0.74} ${h * 0.27}l-${w * 0.48} ${h * 0.46}" stroke="${palette.middle}" stroke-width="1.2" opacity=".9"/><path d="M${w * 0.41} ${h * 0.5}l${w * 0.09}-${h * 0.05} ${w * 0.09} ${h * 0.05}-${w * 0.09} ${h * 0.05}z" fill="${palette.accent}" opacity=".8"/>`;
  } else if (state === 'bridge') {
    fill = '#b77c4e';
    detail = `<path d="M${w * 0.16} ${h * 0.43}l${w * 0.48} ${h * 0.25}M${w * 0.25} ${h * 0.36}l${w * 0.48} ${h * 0.25}M${w * 0.36} ${h * 0.3}l${w * 0.48} ${h * 0.25}" stroke="${palette.deep}" stroke-width="2"/><path d="M${w * 0.13} ${h * 0.48}l${w * 0.37} ${h * 0.2} ${w * 0.37}-${h * 0.2}" stroke="${palette.accent}" stroke-width="2.2"/>`;
  } else if (state === 'soil_watered') {
    fill = '#5a514d';
    detail = `<path d="M${w * 0.2} ${h * 0.5}l${w * 0.3}-${h * 0.16} ${w * 0.3} ${h * 0.16}M${w * 0.28} ${h * 0.58}l${w * 0.22}-${h * 0.12} ${w * 0.22} ${h * 0.12}" stroke="#817b72" stroke-width="2.4"/><path d="M${w * 0.63} ${h * 0.39}q4 4 0 8q-4-4 0-8" fill="#9eb8c7" stroke="${palette.ink}" stroke-width="1"/>`;
  } else {
    fill = '#a66f48';
    detail = `<path d="M${w * 0.2} ${h * 0.5}l${w * 0.3}-${h * 0.16} ${w * 0.3} ${h * 0.16}M${w * 0.28} ${h * 0.58}l${w * 0.22}-${h * 0.12} ${w * 0.22} ${h * 0.12}" stroke="#754830" stroke-width="2.4"/><path d="M${w * 0.63} ${h * 0.38}l-3 4 4 2-3 5" stroke="${palette.accent}" stroke-width="1.5"/>`;
  }
  return `<polygon points="${points}" fill="${fill}" stroke="${palette.ink}" stroke-width="2" opacity=".98"/>${detail}`;
}

function building(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const store = state.includes('store');
  return `${softShadow(w, h)}
    <path d="M${w * 0.2} ${h * 0.46}L${w * 0.5} ${h * 0.27}l${w * 0.3} ${h * 0.19}v${h * 0.34}l-${w * 0.3} ${h * 0.17}-${w * 0.3}-${h * 0.17}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="5"/>
    <path d="M${w * 0.13} ${h * 0.47}L${w * 0.5} ${h * 0.18}l${w * 0.37} ${h * 0.29}-${w * 0.1} ${h * 0.08}-${w * 0.27}-${h * 0.19}-${w * 0.27} ${h * 0.19}z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="5"/>
    <path d="M${w * 0.49} ${h * 0.69}l${w * 0.12} ${h * 0.055}v${h * 0.16}l-${w * 0.12} ${h * 0.05}z" fill="${palette.ink}" opacity=".86"/>
    <path d="M${w * 0.28} ${h * 0.59}l${w * 0.1} ${h * 0.05}v${h * 0.09}l-${w * 0.1}-${h * 0.05}zM${w * 0.65} ${h * 0.6}l${w * 0.1}-${h * 0.05}v${h * 0.1}l-${w * 0.1} ${h * 0.05}z" fill="${palette.glow}" stroke="${palette.deep}" stroke-width="3"/>
    ${
      store
        ? `<path d="M${w * 0.18} ${h * 0.56}l${w * 0.32} ${h * 0.16} ${w * 0.32}-${h * 0.16}v${h * 0.105}l-${w * 0.32} ${h * 0.16}-${w * 0.32}-${h * 0.16}z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="4"/><path d="M${w * 0.27} ${h * 0.605}v${h * 0.105}m${w * 0.15}-${h * 0.035}v${h * 0.105}m${w * 0.16}-${h * 0.19}v${h * 0.105}m${w * 0.15}-${h * 0.19}v${h * 0.105}" stroke="${palette.deep}" stroke-width="7" opacity=".7"/><path d="M${w * 0.43} ${h * 0.33}h${w * 0.14}v${h * 0.105}h-${w * 0.14}z" fill="${palette.glow}" stroke="${palette.ink}" stroke-width="4"/>${sparkle(w * 0.5, h * 0.382, Math.min(w, h) * 0.028, palette)}<path d="M${w * 0.46} ${h * 0.78}l${w * 0.08} ${h * 0.035}v${h * 0.1}l-${w * 0.08} ${h * 0.035}z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="3"/><circle cx="${w * 0.515}" cy="${h * 0.865}" r="4" fill="${palette.accent}"/><path d="M${w * 0.42} ${h * 0.94}l${w * 0.08} ${h * 0.025} ${w * 0.08}-${h * 0.025}" stroke="${palette.accent}" stroke-width="5"/>`
        : ''
    }`;
}

function tree(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const pine = state.includes('pine');
  const crown = pine
    ? `<path d="M${w * 0.5} ${h * 0.08}l-${w * 0.24} ${h * 0.42}h${w * 0.13}l-${w * 0.2} ${h * 0.3}h${w * 0.62}l-${w * 0.2}-${h * 0.3}h${w * 0.13}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="5"/>`
    : `<circle cx="${w * 0.38}" cy="${h * 0.38}" r="${w * 0.22}" fill="${palette.middle}" stroke="${palette.ink}" stroke-width="5"/><circle cx="${w * 0.61}" cy="${h * 0.4}" r="${w * 0.2}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="5"/><circle cx="${w * 0.5}" cy="${h * 0.25}" r="${w * 0.2}" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="5"/>`;
  return `${softShadow(w, h)}<path d="M${w * 0.46} ${h * 0.58}l${w * 0.08} 0 ${w * 0.05} ${h * 0.3}h-${w * 0.18}z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="5"/>${crown}<path d="M${w * 0.36} ${h * 0.27}q${w * 0.12}-${h * 0.11} ${w * 0.25}-${h * 0.04}" stroke="${palette.glow}" stroke-width="8" opacity=".5"/>`;
}

function natureProp(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  if (state.includes('flower')) {
    return `${softShadow(w, h)}<path d="M${w * 0.5} ${h * 0.78}V${h * 0.42}m0 ${h * 0.2}l-${w * 0.18}-${h * 0.12}m${w * 0.18} ${h * 0.04}l${w * 0.17}-${h * 0.14}" stroke="${palette.deep}" stroke-width="8"/><g fill="${palette.light}" stroke="${palette.ink}" stroke-width="3"><circle cx="${w * 0.49}" cy="${h * 0.34}" r="${w * 0.12}"/><circle cx="${w * 0.36}" cy="${h * 0.47}" r="${w * 0.1}"/><circle cx="${w * 0.65}" cy="${h * 0.43}" r="${w * 0.1}"/></g><g fill="${palette.accent}"><circle cx="${w * 0.49}" cy="${h * 0.34}" r="${w * 0.035}"/><circle cx="${w * 0.36}" cy="${h * 0.47}" r="${w * 0.03}"/><circle cx="${w * 0.65}" cy="${h * 0.43}" r="${w * 0.03}"/></g>`;
  }
  if (state.includes('bush')) {
    return `${softShadow(w, h)}<path d="M${w * 0.19} ${h * 0.68}q0-${h * 0.31} ${w * 0.22}-${h * 0.26}q${w * 0.09}-${h * 0.24} ${w * 0.24} 0q${w * 0.22}-${h * 0.04} ${w * 0.19} ${h * 0.28}q-${w * 0.32} ${h * 0.22}-${w * 0.65}-${h * 0.02}" fill="url(#surface)" stroke="${palette.ink}" stroke-width="5"/><circle cx="${w * 0.43}" cy="${h * 0.47}" r="5" fill="${palette.accent}"/><circle cx="${w * 0.66}" cy="${h * 0.55}" r="5" fill="${palette.accent}"/>`;
  }
  return `${softShadow(w, h)}<path d="M${w * 0.17} ${h * 0.73}l${w * 0.13}-${h * 0.37} ${w * 0.35}-${h * 0.13} ${w * 0.2} ${h * 0.28}-${w * 0.08} ${h * 0.3}-${w * 0.45} ${h * 0.05}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.34} ${h * 0.47}q${w * 0.13}-${h * 0.12} ${w * 0.28}-${h * 0.07}" stroke="${palette.glow}" stroke-width="7" opacity=".55"/>`;
}

function boundary(
  asset: BundledAssetEntry,
  palette: Palette,
  state: string,
  rotation: number,
): string {
  const { width: w, height: h } = asset;
  const mirrored = rotation === 90 || rotation === 270;
  const transform = mirrored ? ` transform="translate(${String(w)} 0) scale(-1 1)"` : '';
  const tall = state.includes('gate');
  return `${softShadow(w, h)}<g${transform}><path d="M${w * 0.18} ${h * 0.82}V${h * (tall ? 0.2 : 0.35)}m${w * 0.64} ${h * 0.47}V${h * (tall ? 0.2 : 0.35)}" stroke="${palette.ink}" stroke-width="14"/><path d="M${w * 0.18} ${h * 0.45}l${w * 0.64} ${h * 0.18}M${w * 0.18} ${h * 0.64}l${w * 0.64} ${h * 0.18}" stroke="${state.includes('closed') ? palette.accent : palette.middle}" stroke-width="12"/>${tall ? `<path d="M${w * 0.18} ${h * 0.25}q${w * 0.32}-${h * 0.24} ${w * 0.64} 0" stroke="${palette.light}" stroke-width="12"/>` : ''}</g>`;
}

function lamp(asset: BundledAssetEntry, palette: Palette): string {
  const { width: w, height: h } = asset;
  return `${softShadow(w, h)}<ellipse cx="${w * 0.5}" cy="${h * 0.32}" rx="${w * 0.38}" ry="${h * 0.25}" fill="url(#glow)"/><path d="M${w * 0.5} ${h * 0.84}V${h * 0.38}" stroke="${palette.ink}" stroke-width="12"/><path d="M${w * 0.35} ${h * 0.37}l${w * 0.15}-${h * 0.13} ${w * 0.15} ${h * 0.13}-${w * 0.05} ${h * 0.18}h-${w * 0.2}z" fill="${palette.glow}" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.34} ${h * 0.86}h${w * 0.32}" stroke="${palette.deep}" stroke-width="14"/>`;
}

function sign(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const notice = state.includes('notice');
  return `${softShadow(w, h)}<path d="M${w * 0.35} ${h * 0.83}V${h * 0.51}m${w * 0.3} ${h * 0.32}V${h * 0.51}" stroke="${palette.ink}" stroke-width="12"/><path d="M${w * 0.17} ${h * 0.24}h${w * 0.66}v${h * 0.34}h-${w * 0.66}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.25} ${h * 0.34}h${w * 0.36}${notice ? `m-${w * 0.36} ${h * 0.12}h${w * 0.5}` : `l${w * 0.1} ${h * 0.07}-.1 ${h * 0.07}`}" stroke="${palette.accent}" stroke-width="8"/>`;
}

function marker(asset: BundledAssetEntry, palette: Palette): string {
  const { width: w, height: h } = asset;
  return `<ellipse cx="${w * 0.5}" cy="${h * 0.53}" rx="${w * 0.39}" ry="${h * 0.25}" fill="url(#glow)"/><ellipse cx="${w * 0.5}" cy="${h * 0.53}" rx="${w * 0.34}" ry="${h * 0.2}" stroke="${palette.accent}" stroke-width="8" stroke-dasharray="14 10"/>`;
}

function station(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const hearth = state.includes('hearth');
  const active = state.includes('active');
  const ready = state.includes('ready');
  let base: string;
  let cue: string;
  if (hearth) {
    base = `<path d="M${w * 0.2} ${h * 0.72}l${w * 0.3} ${h * 0.15} ${w * 0.3}-${h * 0.15}v-${h * 0.27}l-${w * 0.3}-${h * 0.15}-${w * 0.3} ${h * 0.15}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.28} ${h * 0.72}l${w * 0.22} ${h * 0.11} ${w * 0.22}-${h * 0.11}v-${h * 0.13}l-${w * 0.22}-${h * 0.1}-${w * 0.22} ${h * 0.1}z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="4"/><ellipse cx="${w * 0.5}" cy="${h * 0.43}" rx="${w * 0.21}" ry="${h * 0.105}" fill="${palette.ink}"/><path d="M${w * 0.36} ${h * 0.4}q${w * 0.02} ${h * 0.2} ${w * 0.14} ${h * 0.2}t${w * 0.14}-${h * 0.2}v${h * 0.17}q-${w * 0.14} ${h * 0.13}-${w * 0.28} 0z" fill="${palette.middle}" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.36} ${h * 0.38}q${w * 0.14}-${h * 0.12} ${w * 0.28} 0" stroke="${palette.light}" stroke-width="10"/>`;
    if (active) {
      cue = `<path d="M${w * 0.42} ${h * 0.72}q-${w * 0.08}-${h * 0.13} ${w * 0.02}-${h * 0.21}q${w * 0.14} ${h * 0.1} ${w * 0.08} ${h * 0.22}q${w * 0.13}-${h * 0.09} ${w * 0.12} ${h * 0.08}q-${w * 0.1} ${h * 0.15}-${w * 0.22}-${h * 0.09}" fill="${palette.accent}" stroke="${palette.deep}" stroke-width="4"/><path d="M${w * 0.43} ${h * 0.25}q-${w * 0.05}-${h * 0.08} 0-${h * 0.14}M${w * 0.56} ${h * 0.25}q${w * 0.05}-${h * 0.08} 0-${h * 0.14}" stroke="${palette.glow}" stroke-width="7" opacity=".8"/>`;
    } else if (ready) {
      cue = `<path d="M${w * 0.38} ${h * 0.35}q${w * 0.12}-${h * 0.1} ${w * 0.24} 0M${w * 0.5} ${h * 0.3}v-${h * 0.05}" stroke="${palette.accent}" stroke-width="8"/>${sparkle(w * 0.75, h * 0.25, Math.min(w, h) * 0.085, palette)}<circle cx="${w * 0.76}" cy="${h * 0.52}" r="${w * 0.075}" fill="${palette.glow}" stroke="${palette.ink}" stroke-width="4"/><path d="M${w * 0.72} ${h * 0.52}l${w * 0.025} ${h * 0.03} ${w * 0.055}-${h * 0.065}" stroke="${palette.deep}" stroke-width="5"/>`;
    } else {
      cue = `<g fill="${palette.ink}" opacity=".78"><circle cx="${w * 0.42}" cy="${h * 0.68}" r="7"/><circle cx="${w * 0.5}" cy="${h * 0.71}" r="7"/><circle cx="${w * 0.58}" cy="${h * 0.68}" r="7"/></g>`;
    }
  } else {
    base = `<path d="M${w * 0.14} ${h * 0.48}l${w * 0.36} ${h * 0.17} ${w * 0.36}-${h * 0.17}v${h * 0.14}l-${w * 0.36} ${h * 0.18}-${w * 0.36}-${h * 0.18}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.23} ${h * 0.59}v${h * 0.27}m${w * 0.54}-${h * 0.27}v${h * 0.27}" stroke="${palette.ink}" stroke-width="10"/><path d="M${w * 0.24} ${h * 0.4}v-${h * 0.21}h${w * 0.52}v${h * 0.21}" fill="none" stroke="${palette.deep}" stroke-width="8"/><path d="M${w * 0.31} ${h * 0.27}h${w * 0.13}m${w * 0.12} 0h${w * 0.13}" stroke="${palette.light}" stroke-width="7"/>`;
    if (active) {
      cue = `<path d="M${w * 0.36} ${h * 0.49}l${w * 0.27} ${h * 0.13}" stroke="${palette.accent}" stroke-width="14"/><path d="M${w * 0.47} ${h * 0.2}l${w * 0.12} ${h * 0.24}m-${w * 0.08}-${h * 0.19}l${w * 0.17}-${h * 0.08}" stroke="${palette.ink}" stroke-width="10"/><g fill="${palette.glow}"><circle cx="${w * 0.69}" cy="${h * 0.48}" r="5"/><circle cx="${w * 0.74}" cy="${h * 0.54}" r="4"/><circle cx="${w * 0.65}" cy="${h * 0.57}" r="3"/></g>`;
    } else if (ready) {
      cue = `<path d="M${w * 0.37} ${h * 0.45}l${w * 0.13} ${h * 0.07} ${w * 0.13}-${h * 0.07}v${h * 0.13}l-${w * 0.13} ${h * 0.07}-${w * 0.13}-${h * 0.07}z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="5"/>${sparkle(w * 0.73, h * 0.28, Math.min(w, h) * 0.085, palette)}<circle cx="${w * 0.73}" cy="${h * 0.56}" r="${w * 0.065}" fill="${palette.glow}" stroke="${palette.ink}" stroke-width="4"/><path d="M${w * 0.695} ${h * 0.56}l${w * 0.022} ${h * 0.028} ${w * 0.05}-${h * 0.06}" stroke="${palette.deep}" stroke-width="5"/>`;
    } else {
      cue = `<path d="M${w * 0.34} ${h * 0.36}l${w * 0.08} ${h * 0.17}m${w * 0.11}-${h * 0.13}l${w * 0.17} ${h * 0.08}" stroke="${palette.ink}" stroke-width="9"/><circle cx="${w * 0.7}" cy="${h * 0.29}" r="8" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="4"/>`;
    }
  }
  return `${softShadow(w, h)}${base}${cue}`;
}

function entrance(asset: BundledAssetEntry, palette: Palette): string {
  const { width: w, height: h } = asset;
  return `${softShadow(w, h)}<path d="M${w * 0.26} ${h * 0.85}V${h * 0.42}q0-${h * 0.25} ${w * 0.24}-${h * 0.25}t${w * 0.24} ${h * 0.25}v${h * 0.43}" fill="url(#shade)" stroke="${palette.ink}" stroke-width="8"/><path d="M${w * 0.4} ${h * 0.85}V${h * 0.45}q0-${h * 0.09} ${w * 0.1}-${h * 0.09}t${w * 0.1} ${h * 0.09}v${h * 0.4}" fill="${palette.deep}"/><circle cx="${w * 0.56}" cy="${h * 0.61}" r="5" fill="${palette.accent}"/>${sparkle(w * 0.2, h * 0.55, w * 0.06, palette)}${sparkle(w * 0.81, h * 0.48, w * 0.05, palette)}`;
}

function furniture(
  asset: BundledAssetEntry,
  palette: Palette,
  state: string,
  rotation: 0 | 90 | 180 | 270,
): string {
  const { width: w, height: h } = asset;
  const mirror = rotation === 90 || rotation === 270;
  const transform = mirror ? ` transform="translate(${String(w)} 0) scale(-1 1)"` : '';
  let shape: string;
  if (state.includes('rug')) {
    shape = `<path d="M${w * 0.14} ${h * 0.63}l${w * 0.36}-${h * 0.22} ${w * 0.36} ${h * 0.22}-${w * 0.36} ${h * 0.22}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.31} ${h * 0.63}l${w * 0.19}-${h * 0.11} ${w * 0.19} ${h * 0.11}-${w * 0.19} ${h * 0.11}z" fill="${palette.accent}" opacity=".72"/>`;
  } else if (state.includes('chair')) {
    shape = `<path d="M${w * 0.3} ${h * 0.52}l${w * 0.2} ${h * 0.11} ${w * 0.2}-${h * 0.11}-${w * 0.2}-${h * 0.12}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.3} ${h * 0.52}V${h * 0.22}l${w * 0.2} ${h * 0.11}v${h * 0.29}M${w * 0.35} ${h * 0.58}v${h * 0.25}m${w * 0.3}-${h * 0.25}v${h * 0.25}" stroke="${palette.ink}" stroke-width="9"/>`;
  } else if (state.includes('table')) {
    shape = `<path d="M${w * 0.14} ${h * 0.46}l${w * 0.36} ${h * 0.18} ${w * 0.36}-${h * 0.18}-${w * 0.36}-${h * 0.18}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.21} ${h * 0.52}v${h * 0.31}m${w * 0.58}-${h * 0.31}v${h * 0.31}M${w * 0.42} ${h * 0.61}v${h * 0.23}m${w * 0.16}-${h * 0.23}v${h * 0.23}" stroke="${palette.ink}" stroke-width="9"/><path d="M${w * 0.29} ${h * 0.43}l${w * 0.27} ${h * 0.13}" stroke="${palette.accent}" stroke-width="5" opacity=".75"/>`;
  } else if (state.includes('shelf')) {
    shape = `<path d="M${w * 0.27} ${h * 0.77}V${h * 0.19}l${w * 0.23} ${h * 0.11}v${h * 0.58}z" fill="url(#shade)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.3}l${w * 0.23}-${h * 0.11}v${h * 0.58}l-${w * 0.23} ${h * 0.11}z" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.31} ${h * 0.43}l${w * 0.19} ${h * 0.09} ${w * 0.19}-${h * 0.09}M${w * 0.31} ${h * 0.61}l${w * 0.19} ${h * 0.09} ${w * 0.19}-${h * 0.09}" stroke="${palette.accent}" stroke-width="7"/><path d="M${w * 0.37} ${h * 0.39}v-${h * 0.09}m${w * 0.1} ${h * 0.14}v-${h * 0.11}m${w * 0.09} ${h * 0.25}v-${h * 0.1}" stroke="${palette.light}" stroke-width="8"/>`;
  } else if (state.includes('lamp')) {
    shape = `<path d="M${w * 0.5} ${h * 0.82}V${h * 0.36}" stroke="${palette.ink}" stroke-width="10"/><path d="M${w * 0.32} ${h * 0.38}l${w * 0.18}-${h * 0.22} ${w * 0.18} ${h * 0.22}z" fill="${palette.glow}" stroke="${palette.ink}" stroke-width="6"/><ellipse cx="${w * 0.5}" cy="${h * 0.84}" rx="${w * 0.2}" ry="${h * 0.07}" fill="${palette.deep}"/>`;
  } else if (state.includes('planter')) {
    shape = `<path d="M${w * 0.32} ${h * 0.57}h${w * 0.36}l-${w * 0.07} ${h * 0.28}h-${w * 0.22}z" fill="url(#shade)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.5} ${h * 0.58}q-${w * 0.24}-${h * 0.1}-${w * 0.16}-${h * 0.29}q${w * 0.19} 0 ${w * 0.19} ${h * 0.17}q${w * 0.06}-${h * 0.25} ${w * 0.23}-${h * 0.18}q${w * 0.06} ${h * 0.2}-${w * 0.26} ${h * 0.3}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="5"/>`;
  } else if (state.includes('mirror')) {
    shape = `<path d="M${w * 0.31} ${h * 0.77}V${h * 0.25}q${w * 0.19}-${h * 0.16} ${w * 0.38} 0v${h * 0.52}z" fill="${palette.light}" stroke="${palette.ink}" stroke-width="8"/><path d="M${w * 0.38} ${h * 0.66}V${h * 0.3}q${w * 0.12}-${h * 0.1} ${w * 0.24} 0v${h * 0.36}z" fill="${palette.glow}" opacity=".6"/><path d="M${w * 0.43} ${h * 0.37}l${w * 0.12}-${h * 0.07}" stroke="#ffffff" stroke-width="7" opacity=".7"/><path d="M${w * 0.24} ${h * 0.84}h${w * 0.52}" stroke="${palette.deep}" stroke-width="13"/>`;
  } else if (state.includes('wardrobe')) {
    shape = `<path d="M${w * 0.24} ${h * 0.78}V${h * 0.25}l${w * 0.26}-${h * 0.11} ${w * 0.26} ${h * 0.11}v${h * 0.53}l-${w * 0.26} ${h * 0.11}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="8"/><path d="M${w * 0.5} ${h * 0.25}v${h * 0.64}" stroke="${palette.deep}" stroke-width="6"/><circle cx="${w * 0.45}" cy="${h * 0.55}" r="5" fill="${palette.accent}"/><circle cx="${w * 0.55}" cy="${h * 0.55}" r="5" fill="${palette.accent}"/><path d="M${w * 0.31} ${h * 0.35}l${w * 0.12}-${h * 0.05}m${w * 0.14} ${h * 0.05}l${w * 0.12} ${h * 0.05}" stroke="${palette.light}" stroke-width="6"/>`;
  } else {
    shape = `<path d="M${w * 0.18} ${h * 0.5}l${w * 0.32} ${h * 0.16} ${w * 0.32}-${h * 0.16}-${w * 0.32}-${h * 0.16}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.24} ${h * 0.57}v${h * 0.27}m${w * 0.52}-${h * 0.27}v${h * 0.27}" stroke="${palette.ink}" stroke-width="10"/>`;
  }
  const directionCue =
    rotation === 180 || rotation === 270
      ? `<path d="M${w * 0.39} ${h * 0.4}l${w * 0.12}-${h * 0.05}" stroke="${palette.accent}" stroke-width="6"/>`
      : '';
  return `${softShadow(w, h)}<g${transform}>${shape}${directionCue}</g>`;
}

function farmPlot(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const diamond = `M${w * 0.1} ${h * 0.54}l${w * 0.4}-${h * 0.27} ${w * 0.4} ${h * 0.27}-${w * 0.4} ${h * 0.27}z`;
  const inner = `M${w * 0.23} ${h * 0.54}l${w * 0.27}-${h * 0.18} ${w * 0.27} ${h * 0.18}-${w * 0.27} ${h * 0.18}z`;
  if (state === 'empty') {
    return `<path d="${diamond}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="5"/><path d="${inner}" fill="#b4865a" stroke="${palette.deep}" stroke-width="3" opacity=".76"/><path d="M${w * 0.19} ${h * 0.51}l3 -7 3 7m${w * 0.59} ${h * 0.02}l3 -7 3 7" stroke="${palette.glow}" stroke-width="3"/>`;
  }
  if (state === 'prepared') {
    return `<path d="${diamond}" fill="#956142" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.21} ${h * 0.49}l${w * 0.29}-${h * 0.17} ${w * 0.29} ${h * 0.17}M${w * 0.21} ${h * 0.58}l${w * 0.29}-${h * 0.17} ${w * 0.29} ${h * 0.17}M${w * 0.29} ${h * 0.65}l${w * 0.21}-${h * 0.12} ${w * 0.21} ${h * 0.12}" stroke="#d3a46a" stroke-width="5" opacity=".72"/>`;
  }
  if (state === 'dry') {
    return `<path d="${diamond}" fill="#b67849" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.25} ${h * 0.51}l${w * 0.1}-${h * 0.05} ${w * 0.08} ${h * 0.05} ${w * 0.1}-${h * 0.06}M${w * 0.55} ${h * 0.59}l${w * 0.07} ${h * 0.04} ${w * 0.08}-${h * 0.05}" stroke="#71432f" stroke-width="4"/><path d="M${w * 0.38} ${h * 0.5}v-${h * 0.13}m0 ${h * 0.06}l-${w * 0.06}-${h * 0.04}m${w * 0.27} ${h * 0.14}v-${h * 0.13}m0 ${h * 0.06}l${w * 0.06}-${h * 0.04}" stroke="${palette.deep}" stroke-width="6"/>`;
  }
  if (state === 'watered') {
    return `<path d="${diamond}" fill="#514f4d" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.22} ${h * 0.5}l${w * 0.28}-${h * 0.16} ${w * 0.28} ${h * 0.16}M${w * 0.28} ${h * 0.62}l${w * 0.22}-${h * 0.13} ${w * 0.22} ${h * 0.13}" stroke="#7c8380" stroke-width="5"/><path d="M${w * 0.62} ${h * 0.38}q6 7 0 13q-6-6 0-13M${w * 0.42} ${h * 0.58}q5 6 0 11q-5-5 0-11" fill="#a9cddd" stroke="${palette.ink}" stroke-width="2"/>`;
  }
  if (state === 'planted') {
    return `<path d="${diamond}" fill="#74523d" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.29} ${h * 0.52}l${w * 0.21}-${h * 0.12} ${w * 0.21} ${h * 0.12}" stroke="#a77c57" stroke-width="5"/><g fill="${palette.light}" stroke="${palette.ink}" stroke-width="2"><path d="M${w * 0.36} ${h * 0.5}q-${w * 0.07}-${h * 0.1}-${w * 0.11}-${h * 0.02}q${w * 0.05} ${h * 0.08} ${w * 0.11} ${h * 0.02}q${w * 0.06}-${h * 0.1} ${w * 0.11}-${h * 0.01}q-${w * 0.04} ${h * 0.08}-${w * 0.11} ${h * 0.01}z"/><path d="M${w * 0.62} ${h * 0.57}q-${w * 0.07}-${h * 0.1}-${w * 0.11}-${h * 0.02}q${w * 0.05} ${h * 0.08} ${w * 0.11} ${h * 0.02}q${w * 0.06}-${h * 0.1} ${w * 0.11}-${h * 0.01}q-${w * 0.04} ${h * 0.08}-${w * 0.11} ${h * 0.01}z"/></g>`;
  }
  if (state === 'selected') {
    return `<path d="${diamond}" fill="#8d6749" stroke="${palette.glow}" stroke-width="9"/><path d="${inner}" fill="none" stroke="${palette.accent}" stroke-width="4" stroke-dasharray="9 7"/>${sparkle(w * 0.19, h * 0.38, 10, palette)}${sparkle(w * 0.81, h * 0.62, 10, palette)}`;
  }
  return `<path d="${diamond}" fill="#8f4d57" stroke="#ffd0bd" stroke-width="9"/><path d="${inner}" fill="none" stroke="${palette.ink}" stroke-width="4"/><path d="M${w * 0.34} ${h * 0.42}l${w * 0.32} ${h * 0.24}m0-${h * 0.24}l-${w * 0.32} ${h * 0.24}" stroke="#fff0d7" stroke-width="11"/>`;
}

function crop(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const stage = asset.generator.stage ?? 0;
  const heightFactor = 0.24 + stage * 0.12;
  const top = h * Math.max(0.14, 0.86 - heightFactor);
  const fruitCount = Math.max(0, stage - 1);
  const fruit = Array.from({ length: fruitCount }, (_, index) => {
    const x = w * (0.39 + (index % 2) * 0.2);
    const y = top + h * (0.16 + Math.floor(index / 2) * 0.12);
    return `<circle cx="${x}" cy="${y}" r="${7 + stage * 2}" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="3"/>`;
  }).join('');
  return `${softShadow(w, h)}<path d="M${w * 0.5} ${h * 0.87}V${top}" stroke="${palette.deep}" stroke-width="9"/><path d="M${w * 0.5} ${h * 0.66}q-${w * 0.25}-${h * 0.13}-${w * 0.26}-${h * 0.31}q${w * 0.27}-${h * 0.02} ${w * 0.3} ${h * 0.22}q${w * 0.16}-${h * 0.27} ${w * 0.31}-${h * 0.12}q-${w * 0.02} ${h * 0.22}-${w * 0.34} ${h * 0.31}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="5"/>${fruit}${state.includes('cloudberry') ? sparkle(w * 0.72, top, w * 0.05, palette) : ''}`;
}

function itemIcon(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  const tool = state.includes('can') || state.includes('hoe');
  const food = ['salad', 'soup', 'tart', 'biscuit'].some((part) => state.includes(part));
  const material = ['timber', 'planks', 'twine', 'flour'].some((part) => state.includes(part));
  let symbol: string;
  if (tool) {
    symbol = state.includes('hoe')
      ? `<path d="M${w * 0.36} ${h * 0.8}l${w * 0.3}-${h * 0.58}m-${w * 0.13} ${h * 0.08}l${w * 0.29} ${h * 0.14}" stroke="${palette.ink}" stroke-width="14"/><path d="M${w * 0.55} ${h * 0.27}l${w * 0.25} ${h * 0.12}" stroke="${palette.light}" stroke-width="8"/>`
      : `<path d="M${w * 0.27} ${h * 0.42}h${w * 0.43}l${w * 0.08} ${h * 0.36}h-${w * 0.56}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.7} ${h * 0.48}q${w * 0.18}-${h * 0.04} ${w * 0.19} ${h * 0.12}M${w * 0.33} ${h * 0.42}q0-${h * 0.22} ${w * 0.25}-${h * 0.22}t${w * 0.17} ${h * 0.2}" stroke="${palette.ink}" stroke-width="9"/>`;
  } else if (food) {
    symbol = `<path d="M${w * 0.23} ${h * 0.53}q${w * 0.27} ${h * 0.14} ${w * 0.54} 0q-${w * 0.06} ${h * 0.3}-${w * 0.27} ${h * 0.3}t-${w * 0.27}-${h * 0.3}" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><ellipse cx="${w * 0.5}" cy="${h * 0.52}" rx="${w * 0.27}" ry="${h * 0.13}" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="6"/>`;
  } else if (material) {
    symbol = `<path d="M${w * 0.27} ${h * 0.7}l${w * 0.16}-${h * 0.43} ${w * 0.36} ${h * 0.12}-${w * 0.08} ${h * 0.43}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.39} ${h * 0.52}l${w * 0.26} ${h * 0.08}" stroke="${palette.accent}" stroke-width="7"/>`;
  } else {
    symbol = `<path d="M${w * 0.5} ${h * 0.21}q${w * 0.28} ${h * 0.08} ${w * 0.23} ${h * 0.36}q-${w * 0.07} ${h * 0.29}-${w * 0.3} ${h * 0.23}q-${w * 0.26}-${h * 0.12}-${w * 0.12}-${h * 0.39}q${w * 0.08}-${h * 0.2} ${w * 0.19}-${h * 0.2}" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/>${sparkle(w * 0.7, h * 0.28, w * 0.07, palette)}`;
  }
  return `<circle cx="${w * 0.5}" cy="${h * 0.52}" r="${w * 0.41}" fill="${palette.glow}" opacity=".17"/>${symbol}`;
}

function uiIcon(asset: BundledAssetEntry, palette: Palette, state: string): string {
  const { width: w, height: h } = asset;
  let glyph: string;
  switch (state) {
    case 'dust':
      glyph = `<circle cx="${w * 0.48}" cy="${h * 0.52}" r="${w * 0.24}" fill="${palette.deep}" stroke="${palette.ink}" stroke-width="7"/>${sparkle(w * 0.48, h * 0.5, w * 0.14, palette)}<g fill="${palette.accent}" stroke="${palette.ink}" stroke-width="2"><circle cx="${w * 0.72}" cy="${h * 0.28}" r="7"/><circle cx="${w * 0.76}" cy="${h * 0.62}" r="5"/><circle cx="${w * 0.27}" cy="${h * 0.7}" r="4"/></g>`;
      break;
    case 'satchel':
      glyph = `<path d="M${w * 0.22} ${h * 0.4}h${w * 0.56}l-${w * 0.05} ${h * 0.39}h-${w * 0.46}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.34} ${h * 0.4}q0-${h * 0.22} ${w * 0.16}-${h * 0.22}t${w * 0.16} ${h * 0.22}" stroke="${palette.ink}" stroke-width="8"/><path d="M${w * 0.22} ${h * 0.49}q${w * 0.28} ${h * 0.22} ${w * 0.56} 0" stroke="${palette.deep}" stroke-width="6"/><circle cx="${w * 0.5}" cy="${h * 0.58}" r="6" fill="${palette.accent}"/>`;
      break;
    case 'sprout':
      glyph = `<path d="M${w * 0.5} ${h * 0.78}V${h * 0.34}" stroke="${palette.deep}" stroke-width="10"/><path d="M${w * 0.49} ${h * 0.49}q-${w * 0.25} ${h * 0.02}-${w * 0.27}-${h * 0.24}q${w * 0.25}-${h * 0.04} ${w * 0.29} ${h * 0.2}q${w * 0.05}-${h * 0.29} ${w * 0.28}-${h * 0.24}q${w * 0.03} ${h * 0.25}-${w * 0.27} ${h * 0.34}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.26} ${h * 0.8}q${w * 0.24}-${h * 0.12} ${w * 0.48} 0" stroke="${palette.accent}" stroke-width="8"/>`;
      break;
    case 'cooking':
      glyph = `<path d="M${w * 0.23} ${h * 0.47}h${w * 0.54}q-${w * 0.03} ${h * 0.31}-${w * 0.27} ${h * 0.31}t-${w * 0.27}-${h * 0.31}z" fill="url(#shade)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.32} ${h * 0.43}q${w * 0.18}-${h * 0.13} ${w * 0.36} 0M${w * 0.15} ${h * 0.5}h${w * 0.1}m${w * 0.5} 0h${w * 0.1}" stroke="${palette.ink}" stroke-width="8"/><path d="M${w * 0.4} ${h * 0.31}q-${w * 0.05}-${h * 0.09} 0-${h * 0.16}m${w * 0.18} ${h * 0.16}q${w * 0.05}-${h * 0.09} 0-${h * 0.16}" stroke="${palette.accent}" stroke-width="7"/>`;
      break;
    case 'crafting':
      glyph = `<path d="M${w * 0.29} ${h * 0.75}l${w * 0.35}-${h * 0.53}" stroke="${palette.deep}" stroke-width="13"/><path d="M${w * 0.49} ${h * 0.29}l${w * 0.18}-${h * 0.13} ${w * 0.17} ${h * 0.16}-${w * 0.17} ${h * 0.13}z" fill="${palette.light}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.2} ${h * 0.75}h${w * 0.6}" stroke="${palette.ink}" stroke-width="10"/>${sparkle(w * 0.73, h * 0.63, w * 0.065, palette)}`;
      break;
    case 'shop':
      glyph = `<path d="M${w * 0.23} ${h * 0.43}h${w * 0.54}v${h * 0.39}h-${w * 0.54}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.18} ${h * 0.43}l${w * 0.07}-${h * 0.2}h${w * 0.5}l${w * 0.07} ${h * 0.2}q-${w * 0.09} ${h * 0.12}-${w * 0.18} 0q-${w * 0.09} ${h * 0.12}-${w * 0.18} 0q-${w * 0.09} ${h * 0.12}-${w * 0.18} 0z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.44} ${h * 0.82}v-${h * 0.22}h${w * 0.16}v${h * 0.22}" fill="${palette.deep}"/>`;
      break;
    case 'housing':
      glyph = `<path d="M${w * 0.18} ${h * 0.48}l${w * 0.32}-${h * 0.28} ${w * 0.32} ${h * 0.28}v${h * 0.34}h-${w * 0.64}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.42} ${h * 0.82}v-${h * 0.22}h${w * 0.16}v${h * 0.22}" fill="${palette.deep}"/><path d="M${w * 0.25} ${h * 0.48}l${w * 0.25}-${h * 0.22} ${w * 0.25} ${h * 0.22}" stroke="${palette.accent}" stroke-width="5"/>`;
      break;
    case 'social':
      glyph = `<circle cx="${w * 0.36}" cy="${h * 0.38}" r="${w * 0.13}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="6"/><circle cx="${w * 0.66}" cy="${h * 0.41}" r="${w * 0.12}" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="6"/><path d="M${w * 0.16} ${h * 0.76}q${w * 0.2}-${h * 0.26} ${w * 0.4} 0q${w * 0.15}-${h * 0.21} ${w * 0.3} 0" stroke="${palette.ink}" stroke-width="10"/>`;
      break;
    case 'quest':
      glyph = `<path d="M${w * 0.25} ${h * 0.2}q${w * 0.09} ${h * 0.08} ${w * 0.18} 0h${w * 0.32}v${h * 0.55}h-${w * 0.32}q-${w * 0.09}-${h * 0.08}-${w * 0.18} 0z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.34}v${h * 0.21}m0 ${h * 0.1}v2" stroke="${palette.deep}" stroke-width="9"/>${sparkle(w * 0.73, h * 0.22, w * 0.055, palette)}`;
      break;
    case 'objective':
      glyph = `<circle cx="${w * 0.48}" cy="${h * 0.52}" r="${w * 0.31}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="7"/><circle cx="${w * 0.48}" cy="${h * 0.52}" r="${w * 0.17}" fill="none" stroke="${palette.deep}" stroke-width="7"/><circle cx="${w * 0.48}" cy="${h * 0.52}" r="${w * 0.055}" fill="${palette.accent}"/><path d="M${w * 0.48} ${h * 0.21}V${h * 0.1}m0 ${h * 0.84}v-${h * 0.11}M${w * 0.17} ${h * 0.52}H${w * 0.06}m${w * 0.79} 0h${w * 0.1}" stroke="${palette.ink}" stroke-width="6"/>`;
      break;
    case 'direction':
      glyph = `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.33}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.17}l${w * 0.13} ${h * 0.34}-${w * 0.13} ${h * 0.08}-${w * 0.13}-${h * 0.08}z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="5"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="5" fill="${palette.deep}"/>`;
      break;
    case 'interaction':
      glyph = `<path d="M${w * 0.2} ${h * 0.25}h${w * 0.6}v${h * 0.39}h-${w * 0.28}l-${w * 0.18} ${h * 0.16}v-${h * 0.16}h-${w * 0.14}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><g fill="${palette.deep}"><circle cx="${w * 0.36}" cy="${h * 0.45}" r="6"/><circle cx="${w * 0.5}" cy="${h * 0.45}" r="6"/><circle cx="${w * 0.64}" cy="${h * 0.45}" r="6"/></g>`;
      break;
    case 'spawn':
      glyph = `<ellipse cx="${w * 0.5}" cy="${h * 0.58}" rx="${w * 0.31}" ry="${h * 0.19}" fill="none" stroke="${palette.deep}" stroke-width="8"/><path d="M${w * 0.5} ${h * 0.14}l${w * 0.08} ${h * 0.22} ${w * 0.22} ${h * 0.08}-${w * 0.22} ${h * 0.08}-${w * 0.08} ${h * 0.22}-${w * 0.08}-${h * 0.22}-${w * 0.22}-${h * 0.08} ${w * 0.22}-${h * 0.08}z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.29} ${h * 0.76}q${w * 0.21} ${h * 0.1} ${w * 0.42} 0" stroke="${palette.light}" stroke-width="6"/>`;
      break;
    case 'exit':
      glyph = `<path d="M${w * 0.22} ${h * 0.82}V${h * 0.38}q0-${h * 0.2} ${w * 0.2}-${h * 0.2}h${w * 0.18}q${w * 0.2} 0 ${w * 0.2} ${h * 0.2}v${h * 0.44}" fill="url(#shade)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.45} ${h * 0.53}h${w * 0.36}m-${w * 0.13}-${h * 0.12}l${w * 0.13} ${h * 0.12}-${w * 0.13} ${h * 0.12}" stroke="${palette.glow}" stroke-width="9"/>`;
      break;
    case 'warning':
      glyph = `<path d="M${w * 0.5} ${h * 0.16}l${w * 0.34} ${h * 0.64}h-${w * 0.68}z" fill="${palette.middle}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.36}v${h * 0.23}m0 ${h * 0.1}v2" stroke="${palette.glow}" stroke-width="9"/>`;
      break;
    case 'success':
      glyph = `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.33}" fill="${palette.middle}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.31} ${h * 0.51}l${w * 0.14} ${h * 0.15} ${w * 0.27}-${h * 0.3}" stroke="${palette.glow}" stroke-width="10"/>`;
      break;
    case 'error':
      glyph = `<path d="M${w * 0.36} ${h * 0.16}h${w * 0.28}l${w * 0.2} ${h * 0.2}v${h * 0.28}l-${w * 0.2} ${h * 0.2}h-${w * 0.28}l-${w * 0.2}-${h * 0.2}v-${h * 0.28}z" fill="${palette.middle}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.36} ${h * 0.36}l${w * 0.28} ${h * 0.28}m0-${h * 0.28}l-${w * 0.28} ${h * 0.28}" stroke="${palette.glow}" stroke-width="10"/>`;
      break;
    case 'home_visit':
      glyph = `<path d="M${w * 0.13} ${h * 0.51}l${w * 0.27}-${h * 0.24} ${w * 0.27} ${h * 0.24}v${h * 0.29}h-${w * 0.54}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="6"/><circle cx="${w * 0.73}" cy="${h * 0.38}" r="${w * 0.105}" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="5"/><path d="M${w * 0.59} ${h * 0.75}q${w * 0.14}-${h * 0.22} ${w * 0.28} 0" stroke="${palette.ink}" stroke-width="9"/><path d="M${w * 0.31} ${h * 0.8}v-${h * 0.18}h${w * 0.13}v${h * 0.18}" fill="${palette.deep}"/>`;
      break;
    case 'photo':
      glyph = `<path d="M${w * 0.17} ${h * 0.34}h${w * 0.18}l${w * 0.08}-${h * 0.1}h${w * 0.19}l${w * 0.08} ${h * 0.1}h${w * 0.13}v${h * 0.43}h-${w * 0.66}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><circle cx="${w * 0.5}" cy="${h * 0.55}" r="${w * 0.16}" fill="${palette.light}" stroke="${palette.ink}" stroke-width="6"/><circle cx="${w * 0.5}" cy="${h * 0.55}" r="${w * 0.06}" fill="${palette.deep}"/>${sparkle(w * 0.75, h * 0.27, w * 0.045, palette)}`;
      break;
    case 'guestbook':
      glyph = `<path d="M${w * 0.17} ${h * 0.3}q${w * 0.17}-${h * 0.09} ${w * 0.33} ${h * 0.06}q${w * 0.17}-${h * 0.15} ${w * 0.33}-${h * 0.06}v${h * 0.49}q-${w * 0.17}-${h * 0.09}-${w * 0.33} ${h * 0.06}q-${w * 0.17}-${h * 0.15}-${w * 0.33}-${h * 0.06}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.36}v${h * 0.43}M${w * 0.24} ${h * 0.45}l${w * 0.17} ${h * 0.04}m-${w * 0.17} ${h * 0.1}l${w * 0.17} ${h * 0.04}" stroke="${palette.deep}" stroke-width="5"/>`;
      break;
    case 'appreciation':
      glyph = `<path d="M${w * 0.5} ${h * 0.79}q-${w * 0.38}-${h * 0.24}-${w * 0.3}-${h * 0.48}q${w * 0.08}-${h * 0.19} ${w * 0.3} 0q${w * 0.22}-${h * 0.19} ${w * 0.3} 0q${w * 0.08} ${h * 0.24}-${w * 0.3} ${h * 0.48}z" fill="${palette.accent}" stroke="${palette.ink}" stroke-width="7"/>${sparkle(w * 0.75, h * 0.21, w * 0.055, palette)}`;
      break;
    default:
      glyph = `<path d="M${w * 0.5} ${h * 0.14}l${w * 0.1} ${h * 0.23} ${w * 0.25} ${h * 0.02}-${w * 0.19} ${h * 0.17} ${w * 0.07} ${h * 0.25}-${w * 0.23}-${h * 0.13}-${w * 0.23} ${h * 0.13} ${w * 0.07}-${h * 0.25}-${w * 0.19}-${h * 0.17} ${w * 0.25}-${h * 0.02}z" fill="url(#surface)" stroke="${palette.ink}" stroke-width="7"/>`;
  }
  return `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${w * 0.43}" fill="${palette.glow}" opacity=".12"/>${glyph}`;
}

function missingAsset(asset: BundledAssetEntry, palette: Palette): string {
  const { width: w, height: h } = asset;
  return `${softShadow(w, h)}<path d="M${w * 0.2} ${h * 0.45}l${w * 0.3}-${h * 0.18} ${w * 0.3} ${h * 0.18}v${h * 0.34}l-${w * 0.3} ${h * 0.17}-${w * 0.3}-${h * 0.17}z" fill="url(#shade)" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.2} ${h * 0.45}l${w * 0.3} ${h * 0.18} ${w * 0.3}-${h * 0.18}M${w * 0.5} ${h * 0.63}v${h * 0.33}" stroke="${palette.ink}" stroke-width="7"/><path d="M${w * 0.5} ${h * 0.36}q${w * 0.12}-${h * 0.13} ${w * 0.22} 0q${w * 0.02} ${h * 0.1}-${w * 0.12} ${h * 0.17}v${h * 0.06}m0 ${h * 0.1}v2" stroke="${palette.glow}" stroke-width="9"/>`;
}

function softShadow(width: number, height: number): string {
  return `<ellipse cx="${width * 0.52}" cy="${height * 0.88}" rx="${width * 0.34}" ry="${height * 0.08}" fill="#18231f" opacity=".22"/>`;
}

function sparkle(x: number, y: number, radius: number, palette: Palette): string {
  return `<path d="M${x} ${y - radius}l${radius * 0.28} ${radius * 0.72} ${radius * 0.72} ${radius * 0.28}-${radius * 0.72} ${radius * 0.28}-${radius * 0.28} ${radius * 0.72}-${radius * 0.28}-${radius * 0.72}-${radius * 0.72}-${radius * 0.28} ${radius * 0.72}-${radius * 0.28}z" fill="${palette.glow}" stroke="${palette.accent}" stroke-width="2"/>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeSvgNumbers(svg: string): string {
  return svg.replace(/-?\d+\.\d{4,}/gu, (value) => String(Number(Number(value).toFixed(3))));
}
