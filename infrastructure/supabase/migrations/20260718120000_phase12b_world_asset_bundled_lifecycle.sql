-- Starville Phase 12B: bundled world-asset identity and protected restore lifecycle.
-- Existing immutable world revision pins are deliberately never rewritten here.

create table public.world_asset_bundled_catalog (
  asset_key text primary key check (
    char_length(asset_key) between 3 and 96
    and asset_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  manifest_version text not null check (
    char_length(manifest_version) between 1 and 32
    and manifest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  source_path text not null check (
    source_path ~ '^assets/source/[a-z0-9_./-]+\.svg$'
    and source_path !~ '(^|/)\.\.(/|$)'
  ),
  runtime_path text not null check (
    runtime_path ~ '^/assets/starville/bundled/v1/[a-z0-9_./-]+\.webp$'
    and runtime_path !~ '(^|/)\.\.(/|$)'
  ),
  thumbnail_path text not null check (
    thumbnail_path ~ '^/assets/starville/bundled/v1/thumbnails/[a-z0-9_./-]+\.webp$'
    and thumbnail_path !~ '(^|/)\.\.(/|$)'
  ),
  replacement_allowed boolean not null,
  safe_fallback_key text not null check (
    char_length(safe_fallback_key) between 3 and 96
    and safe_fallback_key ~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
  ),
  metadata jsonb not null check (
    jsonb_typeof(metadata) = 'object'
    and octet_length(metadata::text) <= 65536
  ),
  world_asset_id uuid,
  world_asset_version_id uuid,
  created_at timestamptz not null default now(),
  unique (world_asset_id),
  unique (world_asset_version_id)
);

-- Stable bundled keys may contain dots or underscores. Public derivatives stay
-- bucket-relative, immutable, and version-addressed.
alter table public.world_asset_versions
  drop constraint world_asset_versions_delivery_path_check,
  add constraint world_asset_versions_delivery_path_check check (
    (delivery_source_path is null and delivery_preview_path is null
      and delivery_thumbnail_path is null)
    or (
      delivery_source_path ~ '^starville/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*/v[1-9][0-9]*/source\.webp$'
      and delivery_preview_path ~ '^starville/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*/v[1-9][0-9]*/preview\.webp$'
      and delivery_thumbnail_path ~ '^starville/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*/v[1-9][0-9]*/thumbnail\.webp$'
    )
  );

insert into public.world_asset_bundled_catalog (
  asset_key, manifest_version, source_path, runtime_path, thumbnail_path,
  replacement_allowed, safe_fallback_key, metadata
)
select
  entry ->> 'key', entry ->> 'manifestVersion', entry ->> 'sourcePath',
  entry ->> 'runtimePath', entry ->> 'thumbnailPath',
  (entry ->> 'replacementAllowed')::boolean, entry ->> 'safeFallbackKey', entry
from jsonb_array_elements(
  $starville_bundled_catalog$
[{"key":"system.missing-asset","manifestVersion":"1.0.0","friendlyName":"Missing Asset","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/system__missing-asset.svg","runtimePath":"/assets/starville/bundled/v1/interaction/system__missing-asset.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/system__missing-asset.webp","width":192,"height":192,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":false,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.grass.base","manifestVersion":"1.0.0","friendlyName":"Meadow Grass","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__grass__base.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__grass__base.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__grass__base.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.grass.clover","manifestVersion":"1.0.0","friendlyName":"Clover Grass Variation","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__grass__clover.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__grass__clover.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__grass__clover.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.dirt","manifestVersion":"1.0.0","friendlyName":"Garden Dirt","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__dirt.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__dirt.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__dirt.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.path.stone","manifestVersion":"1.0.0","friendlyName":"Lantern Stone Path","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__path__stone.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__path__stone.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__path__stone.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.plaza","manifestVersion":"1.0.0","friendlyName":"Lantern Plaza Stone","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__plaza.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__plaza.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__plaza.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.water","manifestVersion":"1.0.0","friendlyName":"Brook Water","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__water.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__water.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__water.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.bridge","manifestVersion":"1.0.0","friendlyName":"Willow Bridge Deck","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__bridge.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__bridge.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__bridge.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.soil.dry","manifestVersion":"1.0.0","friendlyName":"Dry Farm Soil","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__soil__dry.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__soil__dry.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__soil__dry.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.terrain.soil.watered","manifestVersion":"1.0.0","friendlyName":"Watered Farm Soil","assetType":"terrain_tile","category":"terrain","sourcePath":"assets/source/terrain/world__terrain__soil__watered.svg","runtimePath":"/assets/starville/bundled/v1/terrain/world__terrain__soil__watered.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/terrain/world__terrain__soil__watered.webp","width":96,"height":48,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"cottage-amber","manifestVersion":"1.0.0","friendlyName":"Amber Cottage","assetType":"building","category":"structure","sourcePath":"assets/source/structure/cottage-amber.svg","runtimePath":"/assets/starville/bundled/v1/structure/cottage-amber.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/cottage-amber.webp","width":384,"height":384,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1.1,"offsetY":-0.7,"width":2.2,"height":1.4},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"cottage-sage","manifestVersion":"1.0.0","friendlyName":"Sage Cottage","assetType":"building","category":"structure","sourcePath":"assets/source/structure/cottage-sage.svg","runtimePath":"/assets/starville/bundled/v1/structure/cottage-sage.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/cottage-sage.webp","width":384,"height":384,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1.1,"offsetY":-0.7,"width":2.2,"height":1.4},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"tree-pine","manifestVersion":"1.0.0","friendlyName":"Whisper Pine","assetType":"tree","category":"nature","sourcePath":"assets/source/nature/tree-pine.svg","runtimePath":"/assets/starville/bundled/v1/nature/tree-pine.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/tree-pine.webp","width":256,"height":320,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.22,"offsetY":-0.24,"width":0.44,"height":0.48},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"tree-maple","manifestVersion":"1.0.0","friendlyName":"Star Maple","assetType":"tree","category":"nature","sourcePath":"assets/source/nature/tree-maple.svg","runtimePath":"/assets/starville/bundled/v1/nature/tree-maple.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/tree-maple.webp","width":288,"height":320,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.22,"offsetY":-0.24,"width":0.44,"height":0.48},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"rock-moss","manifestVersion":"1.0.0","friendlyName":"Mossy Waystone","assetType":"rock","category":"nature","sourcePath":"assets/source/nature/rock-moss.svg","runtimePath":"/assets/starville/bundled/v1/nature/rock-moss.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/rock-moss.webp","width":192,"height":192,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.35,"offsetY":-0.25,"width":0.7,"height":0.5},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"moonstone-marker","manifestVersion":"1.0.0","friendlyName":"Moonstone Marker","assetType":"rock","category":"nature","sourcePath":"assets/source/nature/moonstone-marker.svg","runtimePath":"/assets/starville/bundled/v1/nature/moonstone-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/moonstone-marker.webp","width":192,"height":192,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.35,"offsetY":-0.25,"width":0.7,"height":0.5},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"flowers-moon","manifestVersion":"1.0.0","friendlyName":"Moonbell Flowers","assetType":"decoration","category":"nature","sourcePath":"assets/source/nature/flowers-moon.svg","runtimePath":"/assets/starville/bundled/v1/nature/flowers-moon.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/flowers-moon.webp","width":192,"height":192,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"bush-round","manifestVersion":"1.0.0","friendlyName":"Round-leaf Bush","assetType":"decoration","category":"nature","sourcePath":"assets/source/nature/bush-round.svg","runtimePath":"/assets/starville/bundled/v1/nature/bush-round.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/nature/bush-round.webp","width":192,"height":192,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"fence-willow","manifestVersion":"1.0.0","friendlyName":"Willow Fence","assetType":"fence","category":"boundary","sourcePath":"assets/source/boundary/fence-willow.svg","runtimePath":"/assets/starville/bundled/v1/boundary/fence-willow.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/boundary/fence-willow.webp","width":288,"height":160,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1.5,"offsetY":-0.2,"width":3,"height":0.4},"supportedRotations":[0,90],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"whisperpine-gate","manifestVersion":"1.0.0","friendlyName":"Whisperpine Gate","assetType":"fence","category":"boundary","sourcePath":"assets/source/boundary/whisperpine-gate.svg","runtimePath":"/assets/starville/bundled/v1/boundary/whisperpine-gate.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/boundary/whisperpine-gate.webp","width":352,"height":288,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1.5,"offsetY":-0.25,"width":3,"height":0.5},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"closed-route-marker","manifestVersion":"1.0.0","friendlyName":"Closed Route Marker","assetType":"fence","category":"boundary","sourcePath":"assets/source/boundary/closed-route-marker.svg","runtimePath":"/assets/starville/bundled/v1/boundary/closed-route-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/boundary/closed-route-marker.webp","width":224,"height":160,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1,"offsetY":-0.2,"width":2,"height":0.4},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"lamp-star","manifestVersion":"1.0.0","friendlyName":"Star Lantern","assetType":"lamp","category":"lighting","sourcePath":"assets/source/lighting/lamp-star.svg","runtimePath":"/assets/starville/bundled/v1/lighting/lamp-star.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/lighting/lamp-star.webp","width":192,"height":288,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.18,"offsetY":-0.18,"width":0.36,"height":0.36},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"notice-board","manifestVersion":"1.0.0","friendlyName":"Lantern Notice Board","assetType":"sign","category":"signage","sourcePath":"assets/source/signage/notice-board.svg","runtimePath":"/assets/starville/bundled/v1/signage/notice-board.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/signage/notice-board.webp","width":224,"height":224,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.35,"offsetY":-0.18,"width":0.7,"height":0.36},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"brooklight-sign","manifestVersion":"1.0.0","friendlyName":"Brooklight Sign","assetType":"sign","category":"signage","sourcePath":"assets/source/signage/brooklight-sign.svg","runtimePath":"/assets/starville/bundled/v1/signage/brooklight-sign.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/signage/brooklight-sign.webp","width":224,"height":224,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.35,"offsetY":-0.18,"width":0.7,"height":0.36},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"orchard-road-sign","manifestVersion":"1.0.0","friendlyName":"Orchard Road Sign","assetType":"sign","category":"signage","sourcePath":"assets/source/signage/orchard-road-sign.svg","runtimePath":"/assets/starville/bundled/v1/signage/orchard-road-sign.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/signage/orchard-road-sign.webp","width":224,"height":224,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.35,"offsetY":-0.18,"width":0.7,"height":0.36},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-general-store-marker","manifestVersion":"1.0.0","friendlyName":"General Store","assetType":"shop","category":"shop","sourcePath":"assets/source/shop/phase7-general-store-marker.svg","runtimePath":"/assets/starville/bundled/v1/shop/phase7-general-store-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/shop/phase7-general-store-marker.webp","width":448,"height":416,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-1.4,"offsetY":-0.85,"width":2.8,"height":1.7},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.building.general-store.highlight","manifestVersion":"1.0.0","friendlyName":"General Store Highlight","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/world__building__general-store__highlight.svg","runtimePath":"/assets/starville/bundled/v1/interaction/world__building__general-store__highlight.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/world__building__general-store__highlight.webp","width":256,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-cooking-hearth-marker","manifestVersion":"1.0.0","friendlyName":"Cooking Hearth","assetType":"cooking_station","category":"structure","sourcePath":"assets/source/structure/phase7-cooking-hearth-marker.svg","runtimePath":"/assets/starville/bundled/v1/structure/phase7-cooking-hearth-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/phase7-cooking-hearth-marker.webp","width":288,"height":288,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.75,"offsetY":-0.45,"width":1.5,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.station.cooking-hearth.active","manifestVersion":"1.0.0","friendlyName":"Cooking Hearth Active","assetType":"cooking_station","category":"structure","sourcePath":"assets/source/structure/world__station__cooking-hearth__active.svg","runtimePath":"/assets/starville/bundled/v1/structure/world__station__cooking-hearth__active.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/world__station__cooking-hearth__active.webp","width":288,"height":288,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.75,"offsetY":-0.45,"width":1.5,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.station.cooking-hearth.ready","manifestVersion":"1.0.0","friendlyName":"Cooking Hearth Ready","assetType":"cooking_station","category":"structure","sourcePath":"assets/source/structure/world__station__cooking-hearth__ready.svg","runtimePath":"/assets/starville/bundled/v1/structure/world__station__cooking-hearth__ready.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/world__station__cooking-hearth__ready.webp","width":288,"height":288,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.75,"offsetY":-0.45,"width":1.5,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-crafting-workbench-marker","manifestVersion":"1.0.0","friendlyName":"Crafting Workbench","assetType":"crafting_station","category":"structure","sourcePath":"assets/source/structure/phase7-crafting-workbench-marker.svg","runtimePath":"/assets/starville/bundled/v1/structure/phase7-crafting-workbench-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/phase7-crafting-workbench-marker.webp","width":304,"height":256,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.8,"offsetY":-0.45,"width":1.6,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.station.crafting-workbench.active","manifestVersion":"1.0.0","friendlyName":"Crafting Workbench Active","assetType":"crafting_station","category":"structure","sourcePath":"assets/source/structure/world__station__crafting-workbench__active.svg","runtimePath":"/assets/starville/bundled/v1/structure/world__station__crafting-workbench__active.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/world__station__crafting-workbench__active.webp","width":304,"height":256,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.8,"offsetY":-0.45,"width":1.6,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"world.station.crafting-workbench.ready","manifestVersion":"1.0.0","friendlyName":"Crafting Workbench Ready","assetType":"crafting_station","category":"structure","sourcePath":"assets/source/structure/world__station__crafting-workbench__ready.svg","runtimePath":"/assets/starville/bundled/v1/structure/world__station__crafting-workbench__ready.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/world__station__crafting-workbench__ready.webp","width":304,"height":256,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.8,"offsetY":-0.45,"width":1.6,"height":0.9},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-home-entrance-marker","manifestVersion":"1.0.0","friendlyName":"Personal Home Entrance","assetType":"home_entrance","category":"structure","sourcePath":"assets/source/structure/phase7-home-entrance-marker.svg","runtimePath":"/assets/starville/bundled/v1/structure/phase7-home-entrance-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/structure/phase7-home-entrance-marker.webp","width":224,"height":256,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase10b-wardrobe-mirror-marker","manifestVersion":"1.0.0","friendlyName":"Wardrobe Mirror","assetType":"home_interior_object","category":"interior","sourcePath":"assets/source/interior/phase10b-wardrobe-mirror-marker.svg","runtimePath":"/assets/starville/bundled/v1/interior/phase10b-wardrobe-mirror-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interior/phase10b-wardrobe-mirror-marker.webp","width":224,"height":272,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.45,"offsetY":-0.25,"width":0.9,"height":0.5},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase10b-wardrobe-furniture-marker","manifestVersion":"1.0.0","friendlyName":"Wardrobe Cabinet","assetType":"home_interior_object","category":"interior","sourcePath":"assets/source/interior/phase10b-wardrobe-furniture-marker.svg","runtimePath":"/assets/starville/bundled/v1/interior/phase10b-wardrobe-furniture-marker.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interior/phase10b-wardrobe-furniture-marker.webp","width":224,"height":272,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.45,"offsetY":-0.25,"width":0.9,"height":0.5},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-farm-plot-marker","manifestVersion":"1.0.0","friendlyName":"Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__empty.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__empty.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__empty.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.empty","manifestVersion":"1.0.0","friendlyName":"Empty Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__empty.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__empty.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__empty.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.prepared","manifestVersion":"1.0.0","friendlyName":"Prepared Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__prepared.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__prepared.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__prepared.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.dry","manifestVersion":"1.0.0","friendlyName":"Dry Planted Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__dry.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__dry.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__dry.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.watered","manifestVersion":"1.0.0","friendlyName":"Watered Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__watered.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__watered.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__watered.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.planted","manifestVersion":"1.0.0","friendlyName":"Planted Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__planted.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__planted.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__planted.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.selected","manifestVersion":"1.0.0","friendlyName":"Selected Farm Plot","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__selected.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__selected.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__selected.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.plot.invalid","manifestVersion":"1.0.0","friendlyName":"Invalid Farm Placement","assetType":"farm_plot","category":"farming","sourcePath":"assets/source/farming/farming__plot__invalid.svg","runtimePath":"/assets/starville/bundled/v1/farming/farming__plot__invalid.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/farming__plot__invalid.webp","width":192,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.7},"footAnchor":{"x":0.5,"y":0.7},"depthAnchor":{"x":0.5,"y":0.7},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.moonbean.stage-0","manifestVersion":"1.0.0","friendlyName":"Moonbean Stage 1","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-0.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-0.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-0.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.moonbean.stage-1","manifestVersion":"1.0.0","friendlyName":"Moonbean Stage 2","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-1.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-1.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-1.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.moonbean.stage-2","manifestVersion":"1.0.0","friendlyName":"Moonbean Stage 3","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-2.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-2.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-2.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.moonbean.stage-3","manifestVersion":"1.0.0","friendlyName":"Moonbean Stage 4","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.moonbean.ready","manifestVersion":"1.0.0","friendlyName":"Moonbean Harvest Ready","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-moonbean-crop","manifestVersion":"1.0.0","friendlyName":"Moonbean Crop Sequence","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__moonbean__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__moonbean__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__moonbean__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.sunroot.stage-0","manifestVersion":"1.0.0","friendlyName":"Sunroot Stage 1","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-0.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-0.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-0.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.sunroot.stage-1","manifestVersion":"1.0.0","friendlyName":"Sunroot Stage 2","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-1.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-1.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-1.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.sunroot.stage-2","manifestVersion":"1.0.0","friendlyName":"Sunroot Stage 3","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-2.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-2.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-2.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.sunroot.stage-3","manifestVersion":"1.0.0","friendlyName":"Sunroot Stage 4","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.sunroot.ready","manifestVersion":"1.0.0","friendlyName":"Sunroot Harvest Ready","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-sunroot-crop","manifestVersion":"1.0.0","friendlyName":"Sunroot Crop Sequence","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__sunroot__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__sunroot__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__sunroot__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.stage-0","manifestVersion":"1.0.0","friendlyName":"Cloudberry Stage 1","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-0.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-0.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-0.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.stage-1","manifestVersion":"1.0.0","friendlyName":"Cloudberry Stage 2","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-1.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-1.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-1.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.stage-2","manifestVersion":"1.0.0","friendlyName":"Cloudberry Stage 3","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-2.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-2.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-2.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.stage-3","manifestVersion":"1.0.0","friendlyName":"Cloudberry Stage 4","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-3.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-3.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-3.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.stage-4","manifestVersion":"1.0.0","friendlyName":"Cloudberry Stage 5","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-4.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-4.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-4.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"farming.crop.cloudberry.ready","manifestVersion":"1.0.0","friendlyName":"Cloudberry Harvest Ready","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-4.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-4.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-4.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-cloudberry-crop","manifestVersion":"1.0.0","friendlyName":"Cloudberry Crop Sequence","assetType":"crop_stage","category":"crop","sourcePath":"assets/source/crop/farming__crop__cloudberry__stage-4.svg","runtimePath":"/assets/starville/bundled/v1/crop/farming__crop__cloudberry__stage-4.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/crop/farming__crop__cloudberry__stage-4.webp","width":160,"height":192,"scale":1,"anchor":{"x":0.5,"y":0.88},"footAnchor":{"x":0.5,"y":0.88},"depthAnchor":{"x":0.5,"y":0.88},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-willow-chair","manifestVersion":"1.0.0","friendlyName":"Willow Chair","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-willow-chair.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-willow-chair.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-willow-chair.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.4,"offsetY":-0.3,"width":0.8,"height":0.6},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-hearth-table","manifestVersion":"1.0.0","friendlyName":"Hearth Table","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-hearth-table.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-hearth-table.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-hearth-table.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.4,"offsetY":-0.3,"width":0.8,"height":0.6},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-moonwoven-rug","manifestVersion":"1.0.0","friendlyName":"Moonwoven Rug","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-moonwoven-rug.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-moonwoven-rug.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-moonwoven-rug.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"none","blocking":false},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-lantern-floor-lamp","manifestVersion":"1.0.0","friendlyName":"Lantern Floor Lamp","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-lantern-floor-lamp.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-lantern-floor-lamp.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-lantern-floor-lamp.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.4,"offsetY":-0.3,"width":0.8,"height":0.6},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-meadow-shelf","manifestVersion":"1.0.0","friendlyName":"Meadow Shelf","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-meadow-shelf.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-meadow-shelf.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-meadow-shelf.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.4,"offsetY":-0.3,"width":0.8,"height":0.6},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-round-leaf-planter","manifestVersion":"1.0.0","friendlyName":"Round-leaf Planter","assetType":"furniture","category":"furniture","sourcePath":"assets/source/furniture/phase7-dev-round-leaf-planter.svg","runtimePath":"/assets/starville/bundled/v1/furniture/phase7-dev-round-leaf-planter.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/phase7-dev-round-leaf-planter.webp","width":192,"height":208,"scale":1,"anchor":{"x":0.5,"y":1},"footAnchor":{"x":0.5,"y":0.92},"depthAnchor":{"x":0.5,"y":0.92},"collision":{"shape":"rectangle","blocking":true,"offsetX":-0.4,"offsetY":-0.3,"width":0.8,"height":0.6},"supportedRotations":[0,90,180,270],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-moonbean-seed","manifestVersion":"1.0.0","friendlyName":"Moonbean Seed","assetType":"seed_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-moonbean-seed.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-moonbean-seed.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-moonbean-seed.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-sunroot-seed","manifestVersion":"1.0.0","friendlyName":"Sunroot Seed","assetType":"seed_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-sunroot-seed.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-sunroot-seed.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-sunroot-seed.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-cloudberry-seed","manifestVersion":"1.0.0","friendlyName":"Cloudberry Seed","assetType":"seed_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-cloudberry-seed.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-cloudberry-seed.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-cloudberry-seed.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-moonbean","manifestVersion":"1.0.0","friendlyName":"Moonbean","assetType":"crop_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-moonbean.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-moonbean.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-moonbean.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-sunroot","manifestVersion":"1.0.0","friendlyName":"Sunroot","assetType":"crop_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-sunroot.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-sunroot.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-sunroot.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-cloudberry","manifestVersion":"1.0.0","friendlyName":"Cloudberry","assetType":"crop_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-cloudberry.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-cloudberry.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-cloudberry.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-meadow-flour","manifestVersion":"1.0.0","friendlyName":"Meadow Flour","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-meadow-flour.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-meadow-flour.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-meadow-flour.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-willow-timber","manifestVersion":"1.0.0","friendlyName":"Willow Timber","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-willow-timber.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-willow-timber.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-willow-timber.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-moonbean-salad","manifestVersion":"1.0.0","friendlyName":"Moonbean Salad","assetType":"recipe_icon","category":"recipe","sourcePath":"assets/source/recipe/phase7-dev-moonbean-salad.svg","runtimePath":"/assets/starville/bundled/v1/recipe/phase7-dev-moonbean-salad.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/recipe/phase7-dev-moonbean-salad.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-sunroot-soup","manifestVersion":"1.0.0","friendlyName":"Sunroot Soup","assetType":"recipe_icon","category":"recipe","sourcePath":"assets/source/recipe/phase7-dev-sunroot-soup.svg","runtimePath":"/assets/starville/bundled/v1/recipe/phase7-dev-sunroot-soup.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/recipe/phase7-dev-sunroot-soup.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-cloudberry-tart","manifestVersion":"1.0.0","friendlyName":"Cloudberry Tart","assetType":"recipe_icon","category":"recipe","sourcePath":"assets/source/recipe/phase7-dev-cloudberry-tart.svg","runtimePath":"/assets/starville/bundled/v1/recipe/phase7-dev-cloudberry-tart.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/recipe/phase7-dev-cloudberry-tart.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-meadow-biscuit","manifestVersion":"1.0.0","friendlyName":"Meadow Biscuit","assetType":"recipe_icon","category":"recipe","sourcePath":"assets/source/recipe/phase7-dev-meadow-biscuit.svg","runtimePath":"/assets/starville/bundled/v1/recipe/phase7-dev-meadow-biscuit.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/recipe/phase7-dev-meadow-biscuit.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-garden-twine","manifestVersion":"1.0.0","friendlyName":"Garden Twine","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-garden-twine.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-garden-twine.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-garden-twine.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-willow-planks","manifestVersion":"1.0.0","friendlyName":"Willow Planks","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-willow-planks.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-willow-planks.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-willow-planks.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase7-dev-starter-watering-can","manifestVersion":"1.0.0","friendlyName":"Starter Watering Can","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase7-dev-starter-watering-can.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase7-dev-starter-watering-can.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase7-dev-starter-watering-can.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"phase11a-dev-starter-hoe","manifestVersion":"1.0.0","friendlyName":"Willow Starter Hoe","assetType":"item_icon","category":"inventory","sourcePath":"assets/source/inventory/phase11a-dev-starter-hoe.svg","runtimePath":"/assets/starville/bundled/v1/inventory/phase11a-dev-starter-hoe.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/phase11a-dev-starter-hoe.webp","width":160,"height":160,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.currency.dust","manifestVersion":"1.0.0","friendlyName":"DUST","assetType":"interaction_marker","category":"inventory","sourcePath":"assets/source/inventory/ui__currency__dust.svg","runtimePath":"/assets/starville/bundled/v1/inventory/ui__currency__dust.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/ui__currency__dust.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.inventory","manifestVersion":"1.0.0","friendlyName":"Inventory Category","assetType":"interaction_marker","category":"inventory","sourcePath":"assets/source/inventory/ui__category__inventory.svg","runtimePath":"/assets/starville/bundled/v1/inventory/ui__category__inventory.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/ui__category__inventory.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.farming","manifestVersion":"1.0.0","friendlyName":"Farming Category","assetType":"interaction_marker","category":"farming","sourcePath":"assets/source/farming/ui__category__farming.svg","runtimePath":"/assets/starville/bundled/v1/farming/ui__category__farming.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/farming/ui__category__farming.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.cooking","manifestVersion":"1.0.0","friendlyName":"Cooking Category","assetType":"interaction_marker","category":"recipe","sourcePath":"assets/source/recipe/ui__category__cooking.svg","runtimePath":"/assets/starville/bundled/v1/recipe/ui__category__cooking.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/recipe/ui__category__cooking.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.crafting","manifestVersion":"1.0.0","friendlyName":"Crafting Category","assetType":"interaction_marker","category":"inventory","sourcePath":"assets/source/inventory/ui__category__crafting.svg","runtimePath":"/assets/starville/bundled/v1/inventory/ui__category__crafting.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/inventory/ui__category__crafting.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.shop","manifestVersion":"1.0.0","friendlyName":"Shop Category","assetType":"shop_icon","category":"shop","sourcePath":"assets/source/shop/ui__category__shop.svg","runtimePath":"/assets/starville/bundled/v1/shop/ui__category__shop.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/shop/ui__category__shop.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.housing","manifestVersion":"1.0.0","friendlyName":"Housing Category","assetType":"interaction_marker","category":"furniture","sourcePath":"assets/source/furniture/ui__category__housing.svg","runtimePath":"/assets/starville/bundled/v1/furniture/ui__category__housing.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/furniture/ui__category__housing.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.category.social","manifestVersion":"1.0.0","friendlyName":"Social Category","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__category__social.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__category__social.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__category__social.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.quest.active","manifestVersion":"1.0.0","friendlyName":"Active Quest","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__quest__active.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__quest__active.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__quest__active.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.objective.active","manifestVersion":"1.0.0","friendlyName":"Active Objective","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__objective__active.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__objective__active.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__objective__active.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.direction","manifestVersion":"1.0.0","friendlyName":"Direction Indicator","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__direction.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__direction.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__direction.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.interaction","manifestVersion":"1.0.0","friendlyName":"Interaction Marker","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__interaction.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__interaction.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__interaction.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.spawn","manifestVersion":"1.0.0","friendlyName":"Spawn Marker","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__spawn.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__spawn.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__spawn.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.exit","manifestVersion":"1.0.0","friendlyName":"World Exit","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__exit.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__exit.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__exit.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.warning","manifestVersion":"1.0.0","friendlyName":"Warning","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__warning.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__warning.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__warning.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.validation.success","manifestVersion":"1.0.0","friendlyName":"Validation Passed","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__validation__success.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__validation__success.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__validation__success.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.validation.error","manifestVersion":"1.0.0","friendlyName":"Validation Error","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__validation__error.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__validation__error.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__validation__error.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.social.home-visit","manifestVersion":"1.0.0","friendlyName":"Home Visit","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__social__home-visit.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__social__home-visit.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__social__home-visit.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.social.photo-area","manifestVersion":"1.0.0","friendlyName":"Photo Area","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__social__photo-area.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__social__photo-area.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__social__photo-area.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.social.guestbook","manifestVersion":"1.0.0","friendlyName":"Guestbook","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__social__guestbook.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__social__guestbook.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__social__guestbook.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"},{"key":"ui.social.appreciation","manifestVersion":"1.0.0","friendlyName":"Appreciation","assetType":"interaction_marker","category":"interaction","sourcePath":"assets/source/interaction/ui__social__appreciation.svg","runtimePath":"/assets/starville/bundled/v1/interaction/ui__social__appreciation.webp","thumbnailPath":"/assets/starville/bundled/v1/thumbnails/interaction/ui__social__appreciation.webp","width":128,"height":128,"scale":1,"anchor":{"x":0.5,"y":0.5},"footAnchor":{"x":0.5,"y":0.5},"depthAnchor":{"x":0.5,"y":0.5},"collision":{"shape":"none","blocking":false},"supportedRotations":[0],"defaultRotation":0,"replacementAllowed":true,"safeFallbackKey":"system.missing-asset"}]
  $starville_bundled_catalog$::jsonb
) as catalog(entry)
on conflict (asset_key) do nothing;

insert into public.world_assets (
  asset_key, content_hash, storage_path, source_type, media_type,
  width, height, file_size_bytes, approval_status, repository_owned,
  approved_at, game_key, friendly_name, asset_type, category,
  lifecycle_status, production_status
)
select
  catalog.asset_key,
  encode(extensions.digest(
    convert_to('starville-procedural:v1:' || catalog.asset_key, 'UTF8'), 'sha256'
  ), 'hex'),
  'repository/procedural/' || catalog.asset_key,
  'repository_procedural', 'application/x-starville-procedural',
  null, null, null, 'approved', true, now(), 'starville',
  catalog.metadata ->> 'friendlyName', catalog.metadata ->> 'assetType',
  catalog.metadata ->> 'category', 'draft', 'development_marker'
from public.world_asset_bundled_catalog as catalog
on conflict (asset_key) do nothing;

-- Reuse only an existing immutable repository version with the exact checked-in
-- identity. A stable-key collision with storage-backed history must never make
-- that user-owned version the bundled default.
update public.world_asset_bundled_catalog as catalog
set world_asset_id = asset.id,
    world_asset_version_id = version.id
from public.world_assets as asset
join lateral (
  select candidate.id
  from public.world_asset_versions as candidate
  where candidate.world_asset_id = asset.id
    and candidate.source_kind = 'repository_procedural'
    and candidate.detected_mime_type = 'application/x-starville-procedural'
    and candidate.checksum_sha256 = encode(extensions.digest(
      convert_to('starville-procedural:v1:' || asset.asset_key, 'UTF8'), 'sha256'
    ), 'hex')
  order by candidate.version_number, candidate.id
  limit 1
) as version on true
where asset.asset_key = catalog.asset_key;

with inserted_bundled_version as (
insert into public.world_asset_versions (
  world_asset_id, version_number, lifecycle_status, source_kind,
  checksum_sha256, detected_mime_type, render_width, render_height,
  render_scale, anchor_x, anchor_y, foot_anchor_x, foot_anchor_y,
  depth_anchor_x, depth_anchor_y, collision_profile, supported_rotations,
  default_rotation, interaction_compatibility, automated_validation_status,
  validation_results, internal_notes, reviewed_at, approved_at, activated_at
)
select
  asset.id,
  (
    select coalesce(max(existing.version_number), 0) + 1
    from public.world_asset_versions as existing
    where existing.world_asset_id = asset.id
  ),
  'active', 'repository_procedural',
  encode(extensions.digest(
    convert_to('starville-procedural:v1:' || catalog.asset_key, 'UTF8'), 'sha256'
  ), 'hex'),
  'application/x-starville-procedural',
  (catalog.metadata ->> 'width')::integer,
  (catalog.metadata ->> 'height')::integer,
  (catalog.metadata ->> 'scale')::numeric,
  (catalog.metadata #>> '{anchor,x}')::numeric,
  (catalog.metadata #>> '{anchor,y}')::numeric,
  (catalog.metadata #>> '{footAnchor,x}')::numeric,
  (catalog.metadata #>> '{footAnchor,y}')::numeric,
  (catalog.metadata #>> '{depthAnchor,x}')::numeric,
  (catalog.metadata #>> '{depthAnchor,y}')::numeric,
  catalog.metadata -> 'collision',
  array(
    select value::smallint
    from jsonb_array_elements_text(catalog.metadata -> 'supportedRotations') as rotation(value)
  ),
  (catalog.metadata ->> 'defaultRotation')::smallint,
  case catalog.metadata ->> 'assetType'
    when 'shop' then array['shop']::text[]
    when 'cooking_station' then array['cooking_station']::text[]
    when 'crafting_station' then array['crafting_station']::text[]
    when 'home_entrance' then array['home_entrance']::text[]
    when 'farm_plot' then array['farm_plot']::text[]
    when 'sign' then array['sign']::text[]
    else array['decorative']::text[]
  end,
  'valid',
  jsonb_build_object(
    'valid', true,
    'checkedAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'issues', jsonb_build_array(jsonb_build_object(
      'code', 'BUNDLED_REPOSITORY_MATERIAL', 'level', 'passed', 'path', '',
      'message', 'Immutable bundled repository material is registered without rewriting history.'
    ))
  ),
  'Starville bundled manifest ' || catalog.manifest_version || ' repository material.',
  now(), now(), now()
from public.world_asset_bundled_catalog as catalog
join public.world_assets as asset on asset.asset_key = catalog.asset_key
where catalog.world_asset_version_id is null
returning world_asset_id, id
)
update public.world_asset_bundled_catalog as catalog
set world_asset_id = inserted.world_asset_id,
    world_asset_version_id = inserted.id
from inserted_bundled_version as inserted
join public.world_assets as asset on asset.id = inserted.world_asset_id
where catalog.asset_key = asset.asset_key;

do $$
begin
  if exists (
    select 1
    from public.world_asset_bundled_catalog as catalog
    left join public.world_assets as asset on asset.id = catalog.world_asset_id
    left join public.world_asset_versions as version
      on version.world_asset_id = catalog.world_asset_id
     and version.id = catalog.world_asset_version_id
    where asset.id is null
       or version.id is null
       or version.source_kind <> 'repository_procedural'
       or version.detected_mime_type <> 'application/x-starville-procedural'
       or version.checksum_sha256 <> encode(extensions.digest(
         convert_to('starville-procedural:v1:' || catalog.asset_key, 'UTF8'), 'sha256'
       ), 'hex')
  ) then
    raise exception using errcode = '23514', message = 'PHASE12B_BUNDLED_VERSION_CONFLICT';
  end if;
end;
$$;

alter table public.world_asset_bundled_catalog
  alter column world_asset_id set not null,
  alter column world_asset_version_id set not null,
  add constraint world_asset_bundled_catalog_asset_fk
    foreign key (world_asset_id) references public.world_assets(id) on delete restrict,
  add constraint world_asset_bundled_catalog_version_fk
    foreign key (world_asset_id, world_asset_version_id)
    references public.world_asset_versions(world_asset_id, id) on delete restrict,
  add constraint world_asset_bundled_catalog_fallback_fk
    foreign key (safe_fallback_key)
    references public.world_asset_bundled_catalog(asset_key) on delete restrict;

alter table public.world_assets
  add column bundled_default_version_id uuid,
  add column bundled_manifest_version text,
  add constraint world_assets_bundled_manifest_version_check check (
    bundled_manifest_version is null
    or (
      char_length(bundled_manifest_version) between 1 and 32
      and bundled_manifest_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    )
  );

select set_config('starville.asset_lifecycle_transition', 'true', true);

update public.world_assets as asset
set bundled_default_version_id = catalog.world_asset_version_id,
    bundled_manifest_version = catalog.manifest_version,
    active_version_id = case
      when asset.active_version_id is null
        or exists (
          select 1
          from public.world_asset_versions as active_version
          where active_version.world_asset_id = asset.id
            and active_version.id = asset.active_version_id
            and active_version.source_kind = 'repository_procedural'
        ) then catalog.world_asset_version_id
      else asset.active_version_id
    end,
    lifecycle_status = case
      when asset.active_version_id is null
        or exists (
          select 1
          from public.world_asset_versions as active_version
          where active_version.world_asset_id = asset.id
            and active_version.id = asset.active_version_id
            and active_version.source_kind = 'repository_procedural'
        ) then 'active'
      else asset.lifecycle_status
    end,
    production_status = case
      when asset.active_version_id is null
        or exists (
          select 1
          from public.world_asset_versions as active_version
          where active_version.world_asset_id = asset.id
            and active_version.id = asset.active_version_id
            and active_version.source_kind = 'repository_procedural'
        ) then 'development_marker'
      else asset.production_status
    end,
    record_version = asset.record_version + 1
from public.world_asset_bundled_catalog as catalog
where catalog.world_asset_id = asset.id
  and (
    asset.bundled_default_version_id is distinct from catalog.world_asset_version_id
    or asset.bundled_manifest_version is distinct from catalog.manifest_version
    or asset.active_version_id is null
  );

select set_config('starville.asset_lifecycle_transition', 'false', true);

alter table public.world_assets
  add column asset_source_state text generated always as (
    case
      when active_version_id is null then 'unavailable'
      when bundled_default_version_id is not null
        and active_version_id = bundled_default_version_id then 'bundled_default'
      else 'uploaded_override'
    end
  ) stored,
  add constraint world_assets_bundled_default_state_check check (
    (bundled_default_version_id is null and bundled_manifest_version is null)
    or (bundled_default_version_id is not null and bundled_manifest_version is not null)
  ),
  add constraint world_assets_bundled_default_version_fk
    foreign key (id, bundled_default_version_id)
    references public.world_asset_versions(world_asset_id, id) on delete restrict;

create index world_assets_bundled_default_idx
  on public.world_assets(bundled_default_version_id)
  where bundled_default_version_id is not null;
create index world_assets_source_state_idx
  on public.world_assets(asset_source_state, lifecycle_status, updated_at desc, id desc);

create or replace function private.reject_world_asset_bundled_catalog_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception using errcode = '42501', message = 'ASSET_BUNDLED_CATALOG_IMMUTABLE';
end;
$$;

create trigger world_asset_bundled_catalog_immutable
before update or delete on public.world_asset_bundled_catalog
for each row execute function private.reject_world_asset_bundled_catalog_mutation();

create or replace function private.protect_world_asset_bundled_default()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
       new.bundled_default_version_id is distinct from old.bundled_default_version_id
       or new.bundled_manifest_version is distinct from old.bundled_manifest_version
     )
     and coalesce(current_setting('starville.asset_bundled_catalog_transition', true), '') <> 'true'
  then
    raise exception using errcode = '42501', message = 'ASSET_BUNDLED_DEFAULT_PROTECTED';
  end if;
  return new;
end;
$$;

create trigger world_assets_protect_bundled_default
before update on public.world_assets
for each row execute function private.protect_world_asset_bundled_default();

create or replace function private.world_asset_category_allowed(
  p_asset_type text,
  p_category text
)
returns boolean
language sql
immutable
strict
security definer
set search_path = ''
as $$
  select case p_asset_type
    when 'building' then p_category in ('structure', 'shop')
    when 'shop' then p_category = 'shop'
    when 'cooking_station' then p_category in ('structure', 'interior')
    when 'crafting_station' then p_category in ('structure', 'interior')
    when 'home_entrance' then p_category = 'structure'
    when 'decoration' then p_category in ('structure', 'nature', 'boundary', 'lighting', 'signage')
    when 'tree' then p_category = 'nature'
    when 'rock' then p_category = 'nature'
    when 'fence' then p_category = 'boundary'
    when 'lamp' then p_category = 'lighting'
    when 'sign' then p_category = 'signage'
    when 'terrain_tile' then p_category = 'terrain'
    when 'bridge' then p_category = 'structure'
    when 'farm_plot' then p_category = 'farming'
    when 'crop_stage' then p_category = 'crop'
    when 'furniture' then p_category in ('furniture', 'interior')
    when 'home_interior_object' then p_category in ('interior', 'furniture')
    when 'interaction_marker' then p_category in (
      'interaction', 'inventory', 'farming', 'recipe', 'furniture'
    )
    when 'recipe_icon' then p_category = 'recipe'
    when 'shop_icon' then p_category = 'shop'
    when 'item_icon' then p_category = 'inventory'
    when 'seed_icon' then p_category = 'inventory'
    when 'crop_icon' then p_category = 'inventory'
    when 'furniture_icon' then p_category = 'inventory'
    when 'brand_logo' then p_category = 'branding'
    when 'brand_mark' then p_category = 'branding'
    when 'favicon' then p_category = 'branding'
    when 'admin_login_background' then p_category = 'branding'
    when 'landing_hero_background' then p_category = 'branding'
    when 'social_share_image' then p_category = 'branding'
    when 'avatar_sprite_sheet' then p_category = 'avatar'
    when 'avatar_layer_sheet' then p_category = 'avatar'
    when 'avatar_preview' then p_category = 'avatar'
    when 'avatar_thumbnail' then p_category = 'avatar'
    when 'avatar_palette' then p_category = 'avatar'
    when 'avatar_accessory_sheet' then p_category = 'avatar'
    else false
  end;
$$;

create or replace function private.assert_verified_admin_permission(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_permission_key text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  authorization_result jsonb;
begin
  if p_permission_key in ('assets.approve', 'assets.activate', 'assets.deprecate')
     and p_assurance_level <> 'aal2' then
    raise exception using errcode = '42501', message = 'MFA_REQUIRED';
  end if;

  authorization_result := private.evaluate_admin_authorization(
    p_user_id, p_auth_session_id, p_assurance_level
  );
  if authorization_result ->> 'outcome' <> 'authorized' then
    raise exception using errcode = '42501', message = 'ADMIN_ACCESS_DENIED';
  end if;
  if not ((authorization_result -> 'context' -> 'permissionKeys') ? p_permission_key) then
    raise exception using errcode = '42501', message = 'MISSING_PERMISSION';
  end if;
  return (authorization_result -> 'context' ->> 'adminSessionId')::uuid;
end;
$$;

alter table public.world_asset_operation_intents
  drop constraint world_asset_operation_intents_operation_check,
  add constraint world_asset_operation_intents_operation_check check (
    operation in (
      'submit_asset_review', 'review_asset_version', 'activate_asset_version',
      'restore_bundled_default'
    )
  );

create or replace function public.claim_admin_game_asset_operation_intent(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_version_id uuid,
  p_operation text,
  p_request_id text,
  p_reason text,
  p_intent_fingerprint text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  stored_fingerprint text;
begin
  if p_operation not in (
       'submit_asset_review', 'review_asset_version', 'activate_asset_version',
       'restore_bundled_default'
     )
     or char_length(coalesce(p_request_id, '')) not between 1 and 128
     or not private.valid_world_asset_reason(p_reason)
     or coalesce(p_intent_fingerprint, '') !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_OPERATION_INTENT';
  end if;
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level,
    case p_operation
      when 'submit_asset_review' then 'assets.edit'
      when 'review_asset_version' then 'assets.review'
      else 'assets.activate'
    end
  );
  if not exists (
    select 1
    from public.world_asset_versions as version
    join public.world_assets as asset on asset.id = version.world_asset_id
    where version.id = p_version_id
      and version.world_asset_id = p_asset_id
      and (
        p_operation <> 'restore_bundled_default'
        or asset.bundled_default_version_id = version.id
      )
  ) then
    return jsonb_build_object(
      'status', case when p_operation = 'restore_bundled_default'
        then 'bundled_default_missing' else 'not_found' end
    );
  end if;

  insert into public.world_asset_operation_intents (
    administrator_user_id, operation, request_id, world_asset_id,
    world_asset_version_id, intent_fingerprint
  ) values (
    p_user_id, p_operation, p_request_id, p_asset_id,
    p_version_id, p_intent_fingerprint
  )
  on conflict (administrator_user_id, operation, request_id) do update
  set world_asset_id = excluded.world_asset_id,
      world_asset_version_id = excluded.world_asset_version_id,
      intent_fingerprint = excluded.intent_fingerprint,
      created_at = now(),
      expires_at = now() + interval '24 hours'
  where public.world_asset_operation_intents.expires_at <= now()
  returning intent_fingerprint into stored_fingerprint;

  if stored_fingerprint is not null then
    if p_operation in ('activate_asset_version', 'restore_bundled_default') then
      insert into public.world_asset_audit_events (
        event_key, action, permission_key, actor_admin_user_id, admin_session_id,
        target_world_asset_id, target_world_asset_version_id, request_id,
        outcome, reason, after_state
      ) values (
        case p_operation
          when 'restore_bundled_default' then 'asset.bundled_default.restore_requested'
          else 'asset.version.activation_requested'
        end,
        case p_operation
          when 'restore_bundled_default' then 'restore_requested'
          else 'activation_requested'
        end,
        'assets.activate', p_user_id, admin_session_id, p_asset_id, p_version_id,
        p_request_id, 'success', p_reason,
        jsonb_build_object(
          'mutationPerformed', false, 'worldReferencesChanged', false,
          'worldPublicationPerformed', false
        )
      ) on conflict (request_id, event_key) do nothing;
    end if;
    return jsonb_build_object('status', 'claimed');
  end if;

  select intent.intent_fingerprint into stored_fingerprint
  from public.world_asset_operation_intents as intent
  where intent.administrator_user_id = p_user_id
    and intent.operation = p_operation
    and intent.request_id = p_request_id
    and intent.expires_at > now();
  if stored_fingerprint = p_intent_fingerprint then
    return jsonb_build_object('status', 'exact_replay');
  end if;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, before_state, after_state
  ) values (
    'asset.request.intent_conflict', 'request_conflict', 'assets.read', p_user_id,
    admin_session_id, p_asset_id, p_version_id, p_request_id, 'error',
    jsonb_build_object('operation', p_operation),
    jsonb_build_object('mutationPerformed', false, 'worldPublicationPerformed', false)
  ) on conflict (request_id, event_key) do nothing;
  return jsonb_build_object('status', 'request_conflict');
end;
$$;

create or replace function private.world_asset_json(p_asset public.world_assets)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_asset.id,
    'gameKey', p_asset.game_key,
    'assetKey', p_asset.asset_key,
    'slug', p_asset.asset_key,
    'friendlyName', p_asset.friendly_name,
    'assetType', p_asset.asset_type,
    'category', p_asset.category,
    'lifecycleStatus', p_asset.lifecycle_status,
    'productionStatus', p_asset.production_status,
    'activeVersionId', p_asset.active_version_id,
    'activeVersionNumber', (
      select version_number from public.world_asset_versions where id = p_asset.active_version_id
    ),
    'bundledDefaultVersionId', p_asset.bundled_default_version_id,
    'bundledManifestVersion', p_asset.bundled_manifest_version,
    'activeSourceState', p_asset.asset_source_state,
    'canRestoreBundledDefault', p_asset.bundled_default_version_id is not null
      and p_asset.active_version_id is distinct from p_asset.bundled_default_version_id
      and p_asset.lifecycle_status = 'active',
    'thumbnailUrl', case when exists (
      select 1 from public.world_asset_versions
      where id = p_asset.active_version_id and processed_thumbnail_path is not null
    ) then '/api/v1/admin/world-assets/' || p_asset.id::text || '/versions/'
      || p_asset.active_version_id::text || '/thumbnail' else null end,
    'developmentMarkerReplacementKey', p_asset.development_marker_replacement_key,
    'recordVersion', p_asset.record_version,
    'versionCount', (
      select count(*)::integer from public.world_asset_versions where world_asset_id = p_asset.id
    ),
    'uploadedVersionCount', (
      select count(*)::integer
      from public.world_asset_versions
      where world_asset_id = p_asset.id
        and source_kind in ('storage_raster', 'legacy_storage_raster')
    ),
    'invalidVersionCount', (
      select count(*)::integer
      from public.world_asset_versions
      where world_asset_id = p_asset.id
        and (
          automated_validation_status = 'invalid'
          or lifecycle_status = 'validation_failed'
        )
    ),
    'referenceBreakdown', jsonb_build_object(
      'world', (
        select count(*)::integer
        from public.world_map_version_assets
        where world_asset_id = p_asset.id
      ),
      'furniture', (
        select count(*)::integer
        from public.world_asset_references
        where world_asset_id = p_asset.id and reference_type = 'furniture_definition'
      ),
      'farming', (
        select count(*)::integer
        from public.world_asset_references
        where world_asset_id = p_asset.id and reference_type = 'crop_definition'
      )
    ),
    'referenceSummary', private.world_asset_reference_summary(p_asset.id),
    'createdAt', p_asset.created_at,
    'updatedAt', p_asset.updated_at
  );
$$;

-- Rebind pinned repository deliveries to the exact checked-in manifest. This
-- does not inspect or change any immutable world_map_version_assets row.
create or replace function private.world_asset_deliveries_for_version(
  p_world_map_version_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'assetKey', asset.asset_key,
    'versionId', version.id,
    'checksumSha256', version.checksum_sha256,
    'bundledManifestVersion', case
      when version.source_kind = 'repository_procedural'
        and version.id = catalog.world_asset_version_id then catalog.manifest_version
      else null
    end,
    'mediaType', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then 'image/webp'
      else null
    end,
    'width', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.processed_source_width
      else null
    end,
    'height', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.processed_source_height
      else null
    end,
    'renderWidth', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.render_width
      else null
    end,
    'renderHeight', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then version.render_height
      else null
    end,
    'scale', version.render_scale,
    'anchorX', version.anchor_x,
    'anchorY', version.anchor_y,
    'footAnchorX', version.foot_anchor_x,
    'footAnchorY', version.foot_anchor_y,
    'depthAnchorX', version.depth_anchor_x,
    'depthAnchorY', version.depth_anchor_y,
    'collisionProfile', version.collision_profile,
    'supportedRotations', to_jsonb(version.supported_rotations),
    'defaultRotation', version.default_rotation,
    'developmentMarker', version.source_kind <> 'storage_raster'
      or version.delivery_source_path is null,
    'delivery', case
      when version.source_kind = 'storage_raster'
        and version.delivery_source_path is not null then jsonb_build_object(
          'bucket', 'game-assets', 'objectPath', version.delivery_source_path
        )
      else null
    end,
    'fallback', case
      when version.source_kind = 'repository_procedural'
        and version.id = catalog.world_asset_version_id then 'repository_procedural'
      else null
    end
  ) order by asset.asset_key), '[]'::jsonb)
  from public.world_map_version_assets as reference
  join public.world_assets as asset on asset.id = reference.world_asset_id
  join public.world_asset_versions as version
    on version.id = reference.world_asset_version_id
   and version.world_asset_id = reference.world_asset_id
  left join public.world_asset_bundled_catalog as catalog
    on catalog.world_asset_id = asset.id
   and catalog.world_asset_version_id = version.id
  where reference.world_map_version_id = p_world_map_version_id
    and version.lifecycle_status in ('active', 'deprecated')
    and version.checksum_sha256 is not null;
$$;

create or replace function public.get_player_gameplay_asset_overrides(
  p_wallet_address text,
  p_asset_keys text[],
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  moderation_status text;
  rename_required boolean;
  requested_count integer;
  items jsonb;
  override_count integer;
begin
  perform private.assert_valid_request_id(p_request_id);
  if p_wallet_address is null
     or p_wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
     or p_asset_keys is null
     or cardinality(p_asset_keys) not between 1 and 96
     or p_rate_limit not between 1 and 1000
     or exists (
       select 1 from unnest(p_asset_keys) as requested(asset_key)
       where requested.asset_key is null
          or char_length(requested.asset_key) not between 3 and 96
          or requested.asset_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
     )
     or cardinality(p_asset_keys) <> (
       select count(distinct requested.asset_key)::integer
       from unnest(p_asset_keys) as requested(asset_key)
     ) then
    raise exception using errcode = '22023', message = 'INVALID_GAMEPLAY_ASSET_KEYS';
  end if;

  if exists (
    select 1
    from unnest(p_asset_keys) as requested(asset_key)
    left join public.world_asset_bundled_catalog as catalog
      on catalog.asset_key = requested.asset_key
    where catalog.asset_key is null
       or not catalog.replacement_allowed
       or coalesce(catalog.metadata ->> 'assetType', '') not in (
         'cooking_station', 'crafting_station', 'farm_plot', 'crop_stage',
         'furniture', 'home_interior_object', 'interaction_marker', 'item_icon',
         'seed_icon', 'crop_icon', 'recipe_icon', 'furniture_icon', 'shop_icon'
       )
       or coalesce(catalog.metadata ->> 'category', '') not in (
         'farming', 'crop', 'furniture', 'interior', 'interaction',
         'inventory', 'recipe', 'shop', 'structure'
       )
  ) then
    raise exception using errcode = '22023', message = 'INVALID_GAMEPLAY_ASSET_KEYS';
  end if;

  select moderation.status, moderation.rename_required
    into moderation_status, rename_required
  from public.player_profiles as profile
  join public.player_moderation_states as moderation
    on moderation.player_profile_id = profile.id
  where profile.wallet_address = p_wallet_address;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  if moderation_status = 'suspended' then
    return jsonb_build_object('status', 'suspended');
  end if;
  if rename_required then return jsonb_build_object('status', 'rename_required'); end if;
  if not private.claim_world_asset_rate_limit(
    'candidate_read', p_wallet_address, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  requested_count := cardinality(p_asset_keys);
  with requested as (
    select asset_key, ordinal
    from unnest(p_asset_keys) with ordinality as item(asset_key, ordinal)
  ), eligible as (
    select requested.ordinal, catalog.replacement_allowed, asset.asset_key,
      version.id as version_id, version.version_number, version.checksum_sha256,
      version.delivery_source_path, version.processed_source_width,
      version.processed_source_height, version.render_width, version.render_height,
      version.render_scale, version.anchor_x, version.anchor_y,
      version.foot_anchor_x, version.foot_anchor_y,
      version.depth_anchor_x, version.depth_anchor_y,
      version.collision_profile, version.supported_rotations, version.default_rotation
    from requested
    join public.world_asset_bundled_catalog as catalog
      on catalog.asset_key = requested.asset_key and catalog.replacement_allowed
    join public.world_assets as asset
      on asset.id = catalog.world_asset_id
     and asset.game_key = 'starville'
     and asset.asset_key = catalog.asset_key
     and asset.lifecycle_status = 'active'
     and asset.asset_source_state = 'uploaded_override'
    join public.world_asset_versions as version
      on version.id = asset.active_version_id
     and version.world_asset_id = asset.id
     and version.source_kind = 'storage_raster'
     and version.lifecycle_status = 'active'
     and version.automated_validation_status = 'valid'
     and version.validation_results ->> 'valid' = 'true'
     and version.approved_at is not null
     and version.approved_by_admin_id is not null
     and version.checksum_sha256 is not null
     and version.processed_source_width is not null
     and version.processed_source_height is not null
     and version.render_width is not null
     and version.render_height is not null
     and version.delivery_source_path =
       'starville/' || asset.asset_key || '/v' || version.version_number::text || '/source.webp'
     and version.delivery_preview_path =
       'starville/' || asset.asset_key || '/v' || version.version_number::text || '/preview.webp'
     and version.delivery_thumbnail_path =
       'starville/' || asset.asset_key || '/v' || version.version_number::text || '/thumbnail.webp'
  )
  select count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'assetKey', asset_key,
      'versionId', version_id,
      'versionNumber', version_number,
      'checksumSha256', checksum_sha256,
      'bundledManifestVersion', null,
      'deliverySourcePath', delivery_source_path,
      'mediaType', 'image/webp',
      'width', processed_source_width,
      'height', processed_source_height,
      'renderWidth', render_width,
      'renderHeight', render_height,
      'scale', render_scale,
      'anchor', jsonb_build_object('x', anchor_x, 'y', anchor_y),
      'footAnchor', jsonb_build_object('x', foot_anchor_x, 'y', foot_anchor_y),
      'depthAnchor', jsonb_build_object('x', depth_anchor_x, 'y', depth_anchor_y),
      'collision', collision_profile,
      'supportedRotations', to_jsonb(supported_rotations),
      'defaultRotation', default_rotation,
      'replacementAllowed', replacement_allowed
    ) order by ordinal), '[]'::jsonb)
    into override_count, items
  from eligible;

  return jsonb_build_object(
    'status', 'loaded',
    'requestedKeyCount', requested_count,
    'overrideCount', override_count,
    'items', items
  );
end;
$$;

create or replace function public.restore_admin_game_asset_bundled_default(
  p_user_id uuid,
  p_auth_session_id uuid,
  p_assurance_level text,
  p_asset_id uuid,
  p_expected_asset_revision integer,
  p_reason text,
  p_request_id text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  admin_session_id uuid;
  asset public.world_assets%rowtype;
  override_version public.world_asset_versions%rowtype;
  bundled_version public.world_asset_versions%rowtype;
  replay jsonb;
  result jsonb;
  pin_count_before integer;
begin
  if p_assurance_level <> 'aal2' then
    raise exception using errcode = '42501', message = 'MFA_REQUIRED';
  end if;
  admin_session_id := private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.activate'
  );
  perform private.assert_verified_admin_permission(
    p_user_id, p_auth_session_id, p_assurance_level, 'assets.deprecate'
  );
  perform private.assert_valid_request_id(p_request_id);
  if not private.valid_world_asset_reason(p_reason) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_RESTORE_DEFAULT';
  end if;
  if not private.claim_world_asset_rate_limit(
    'deprecation_write', p_user_id::text, p_rate_limit, 60
  ) then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asset-activation:' || p_asset_id::text, 0)
  );
  select * into asset from public.world_assets where id = p_asset_id for update;
  if not found then return jsonb_build_object('status', 'not_found'); end if;

  replay := private.world_asset_replay(p_user_id, 'restore_bundled_default', p_request_id);
  if replay is not null then
    if replay #>> '{asset,id}' = p_asset_id::text
       and asset.active_version_id = asset.bundled_default_version_id
       and asset.record_version = p_expected_asset_revision + 1
       and exists (
         select 1 from public.world_asset_audit_events as event
         where event.request_id = p_request_id
           and event.event_key = 'asset.bundled_default.restored'
           and event.target_world_asset_id = p_asset_id
           and event.reason = p_reason
       ) then
      return replay;
    end if;
    return jsonb_build_object('status', 'request_conflict');
  end if;

  if asset.record_version <> p_expected_asset_revision then
    return jsonb_build_object(
      'status', 'asset_version_conflict', 'assetRevision', asset.record_version
    );
  end if;
  if asset.bundled_default_version_id is null then
    return jsonb_build_object('status', 'bundled_default_missing');
  end if;
  if asset.active_version_id = asset.bundled_default_version_id then
    return jsonb_build_object('status', 'already_bundled_default');
  end if;
  if asset.lifecycle_status <> 'active' or asset.active_version_id is null then
    return jsonb_build_object('status', 'restore_not_allowed');
  end if;

  select * into override_version
  from public.world_asset_versions
  where id = asset.active_version_id and world_asset_id = asset.id
  for update;
  select * into bundled_version
  from public.world_asset_versions
  where id = asset.bundled_default_version_id and world_asset_id = asset.id
  for update;
  if override_version.id is null
     or override_version.source_kind not in ('storage_raster', 'legacy_storage_raster')
     or override_version.lifecycle_status <> 'active' then
    return jsonb_build_object('status', 'override_not_available');
  end if;
  if bundled_version.id is null
     or bundled_version.source_kind <> 'repository_procedural'
     or bundled_version.lifecycle_status not in ('active', 'deprecated')
     or bundled_version.automated_validation_status <> 'valid'
     or bundled_version.checksum_sha256 is null then
    return jsonb_build_object('status', 'bundled_default_missing');
  end if;

  select count(*)::integer into pin_count_before
  from public.world_map_version_assets
  where world_asset_id = asset.id;

  perform set_config('starville.asset_lifecycle_transition', 'true', true);
  update public.world_asset_versions
  set lifecycle_status = 'deprecated', edit_version = edit_version + 1
  where id = override_version.id
  returning * into override_version;
  update public.world_asset_versions
  set lifecycle_status = 'active', activated_at = now(), edit_version = edit_version + 1
  where id = bundled_version.id
  returning * into bundled_version;
  update public.world_assets
  set active_version_id = bundled_version.id,
      lifecycle_status = 'active',
      production_status = 'development_marker',
      content_hash = bundled_version.checksum_sha256,
      storage_path = 'repository/procedural/' || asset.asset_key,
      source_type = 'repository_procedural',
      media_type = 'application/x-starville-procedural',
      width = null,
      height = null,
      file_size_bytes = null,
      approval_status = 'approved',
      approved_at = coalesce(asset.approved_at, now()),
      deprecated_at = null,
      record_version = record_version + 1
  where id = asset.id
  returning * into asset;
  perform private.sync_world_asset_content_references_for_asset(asset.id);

  if (select count(*)::integer from public.world_map_version_assets
      where world_asset_id = asset.id) <> pin_count_before then
    raise exception using errcode = '23514', message = 'WORLD_ASSET_PIN_HISTORY_CHANGED';
  end if;

  insert into public.world_asset_audit_events (
    event_key, action, permission_key, actor_admin_user_id, admin_session_id,
    target_world_asset_id, target_world_asset_version_id, request_id,
    outcome, reason, before_state, after_state, metadata
  ) values (
    'asset.bundled_default.restored', 'bundled_default_restored', 'assets.activate',
    p_user_id, admin_session_id, asset.id, bundled_version.id, p_request_id,
    'success', p_reason,
    jsonb_build_object(
      'activeVersionId', override_version.id,
      'activeSourceState', 'uploaded_override',
      'assetRevision', p_expected_asset_revision
    ),
    jsonb_build_object(
      'activeVersionId', bundled_version.id,
      'activeSourceState', asset.asset_source_state,
      'assetRevision', asset.record_version
    ),
    jsonb_build_object(
      'deprecatedOverrideVersionId', override_version.id,
      'bundledManifestVersion', asset.bundled_manifest_version,
      'worldMapVersionAssetRowsUpdated', 0,
      'mutableContentReferencesResynchronized', true
    )
  );

  result := jsonb_build_object(
    'status', 'bundled_default_restored',
    'asset', private.world_asset_json(asset),
    'version', private.world_asset_version_json(bundled_version)
  );
  perform private.store_world_asset_replay(
    p_user_id, 'restore_bundled_default', p_request_id, result
  );
  return result;
end;
$$;

create or replace function public.reconcile_world_asset_bundled_lifecycle(
  p_limit integer,
  p_after_asset_key text,
  p_request_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  scanned_count integer := 0;
  issue_count integer := 0;
  page_last_key text;
  has_more boolean := false;
  issues jsonb := '[]'::jsonb;
begin
  perform private.assert_valid_request_id(p_request_id);
  if p_limit not between 1 and 500
     or (
       p_after_asset_key is not null
       and (
         char_length(p_after_asset_key) not between 3 and 96
         or p_after_asset_key !~ '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$'
       )
     ) then
    raise exception using errcode = '22023', message = 'INVALID_ASSET_RECONCILIATION_INPUT';
  end if;
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('world-asset-bundled-reconciliation', 0)
  ) then
    return jsonb_build_object(
      'status', 'already_running', 'requestId', p_request_id,
      'scannedAssetCount', 0, 'issueCount', 0, 'issues', '[]'::jsonb,
      'hasMore', false, 'nextCursor', null,
      'automaticActionCount', 0, 'publishedPinMutationCount', 0,
      'recommendationsOnly', true
    );
  end if;

  with scanned as materialized (
    select catalog.*
    from public.world_asset_bundled_catalog as catalog
    where p_after_asset_key is null or catalog.asset_key > p_after_asset_key
    order by catalog.asset_key
    limit p_limit
  ), classified as (
    select
      catalog.asset_key,
      asset.id as asset_id,
      asset.active_version_id,
      asset.bundled_default_version_id,
      case
        when asset.id is null then 'BUNDLED_ASSET_IDENTITY_MISSING'
        when catalog.runtime_path is null
          or catalog.thumbnail_path is null
          or catalog.metadata ->> 'runtimePath' is distinct from catalog.runtime_path
          or catalog.metadata ->> 'thumbnailPath' is distinct from catalog.thumbnail_path
          or catalog.metadata ->> 'sourcePath' is distinct from catalog.source_path
          then 'BUNDLED_CATALOG_MEDIA_METADATA_INVALID'
        when asset.bundled_default_version_id is distinct from catalog.world_asset_version_id
          or asset.bundled_manifest_version is distinct from catalog.manifest_version
          then 'BUNDLED_POINTER_MISMATCH'
        when bundled.id is null
          or bundled.source_kind <> 'repository_procedural'
          or bundled.lifecycle_status not in ('active', 'deprecated')
          or bundled.automated_validation_status <> 'valid'
          then 'BUNDLED_VERSION_INVALID'
        when asset.lifecycle_status = 'active' and active.id is null
          then 'ACTIVE_ASSET_SOURCE_MISSING'
        when asset.lifecycle_status = 'active'
          and active.id <> bundled.id
          and active.source_kind in ('storage_raster', 'legacy_storage_raster')
          and active.automated_validation_status <> 'valid'
          then 'ACTIVE_OVERRIDE_VALIDATION_INVALID'
        when asset.lifecycle_status = 'active'
          and active.id <> bundled.id
          and active.source_kind = 'storage_raster'
          and (
            active.delivery_thumbnail_path is null
            or active.processed_thumbnail_path is null
            or active.processed_thumbnail_width is null
            or active.processed_thumbnail_height is null
            or active.delivery_thumbnail_path <>
              'starville/' || asset.asset_key || '/v'
                || active.version_number::text || '/thumbnail.webp'
          ) then 'ACTIVE_OVERRIDE_THUMBNAIL_MISSING'
        when asset.lifecycle_status = 'active'
          and active.id <> bundled.id
          and active.source_kind = 'storage_raster'
          and (
            active.checksum_sha256 is null
            or active.delivery_source_path is null
            or active.delivery_preview_path is null
            or active.processed_source_path is null
            or active.processed_preview_path is null
            or active.processed_source_width is null
            or active.processed_source_height is null
            or active.render_width is null
            or active.render_height is null
            or active.delivery_source_path <>
              'starville/' || asset.asset_key || '/v'
                || active.version_number::text || '/source.webp'
            or active.delivery_preview_path <>
              'starville/' || asset.asset_key || '/v'
                || active.version_number::text || '/preview.webp'
          ) then 'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE'
        when asset.lifecycle_status = 'active'
          and active.id <> bundled.id
          and (
            active.source_kind not in ('storage_raster', 'legacy_storage_raster')
            or active.lifecycle_status <> 'active'
            or active.automated_validation_status <> 'valid'
          ) then 'ACTIVE_OVERRIDE_INVALID'
        when exists (
          select 1
          from public.world_asset_versions as approved
          where approved.world_asset_id = asset.id
            and approved.source_kind in ('storage_raster', 'legacy_storage_raster')
            and approved.lifecycle_status = 'approved'
            and approved.automated_validation_status <> 'valid'
        ) then 'APPROVED_OVERRIDE_VALIDATION_INVALID'
        when exists (
          select 1
          from public.world_asset_versions as rollback
          where rollback.world_asset_id = asset.id
            and rollback.source_kind in ('storage_raster', 'legacy_storage_raster')
            and rollback.lifecycle_status = 'deprecated'
            and (
              rollback.checksum_sha256 is null
              or rollback.automated_validation_status <> 'valid'
              or (
                rollback.source_kind = 'storage_raster'
                and (
                  rollback.delivery_source_path is null
                  or rollback.delivery_thumbnail_path is null
                )
              )
            )
        ) then 'DEPRECATED_OVERRIDE_ROLLBACK_INVALID'
        when exists (
          select 1
          from public.world_asset_references as reference
          where reference.world_asset_id = asset.id
            and reference.world_asset_version_id is distinct from asset.active_version_id
        ) then 'MUTABLE_REFERENCE_STALE'
        else null
      end as issue_code
    from scanned as catalog
    left join public.world_assets as asset on asset.id = catalog.world_asset_id
    left join public.world_asset_versions as bundled
      on bundled.id = catalog.world_asset_version_id
      and bundled.world_asset_id = catalog.world_asset_id
    left join public.world_asset_versions as active
      on active.id = asset.active_version_id and active.world_asset_id = asset.id
  )
  select
    count(*)::integer,
    max(asset_key),
    count(*) filter (where issue_code is not null)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'code', issue_code,
      'assetKey', asset_key,
      'assetId', asset_id,
      'activeVersionId', active_version_id,
      'bundledDefaultVersionId', bundled_default_version_id,
      'severity', case
        when issue_code in (
          'BUNDLED_ASSET_IDENTITY_MISSING', 'BUNDLED_VERSION_INVALID',
          'ACTIVE_ASSET_SOURCE_MISSING', 'BUNDLED_CATALOG_MEDIA_METADATA_INVALID',
          'ACTIVE_OVERRIDE_VALIDATION_INVALID', 'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE'
        ) then 'error' else 'warning' end,
      'recommendation', case issue_code
        when 'BUNDLED_ASSET_IDENTITY_MISSING' then 'apply_forward_catalog_seed'
        when 'BUNDLED_CATALOG_MEDIA_METADATA_INVALID'
          then 'repair_bundled_catalog_metadata_with_forward_migration'
        when 'BUNDLED_POINTER_MISMATCH' then 'repair_bundled_pointer_with_forward_migration'
        when 'BUNDLED_VERSION_INVALID' then 'repair_repository_material_with_forward_migration'
        when 'ACTIVE_ASSET_SOURCE_MISSING' then 'restore_bundled_default_after_review'
        when 'ACTIVE_OVERRIDE_INVALID' then 'review_or_restore_uploaded_override'
        when 'ACTIVE_OVERRIDE_VALIDATION_INVALID' then 'restore_bundled_default_after_review'
        when 'ACTIVE_OVERRIDE_THUMBNAIL_MISSING' then 'regenerate_uploaded_derivatives'
        when 'ACTIVE_OVERRIDE_DERIVATIVES_INCOMPLETE' then 'regenerate_uploaded_derivatives'
        when 'APPROVED_OVERRIDE_VALIDATION_INVALID' then 'return_uploaded_version_to_review'
        when 'DEPRECATED_OVERRIDE_ROLLBACK_INVALID' then 'exclude_invalid_rollback_candidate'
        when 'MUTABLE_REFERENCE_STALE' then 'resynchronize_mutable_content_references'
      end,
      'automaticActionTaken', false,
      'publishedPinsChanged', false
    ) order by asset_key) filter (where issue_code is not null), '[]'::jsonb)
  into scanned_count, page_last_key, issue_count, issues
  from classified;

  has_more := page_last_key is not null and exists (
    select 1 from public.world_asset_bundled_catalog
    where asset_key > page_last_key
  );
  return jsonb_build_object(
    'status', 'reconciled',
    'requestId', p_request_id,
    'scannedAssetCount', scanned_count,
    'issueCount', issue_count,
    'issues', issues,
    'hasMore', has_more,
    'nextCursor', case when has_more then page_last_key else null end,
    'automaticActionCount', 0,
    'publishedPinMutationCount', 0,
    'recommendationsOnly', true
  );
end;
$$;

alter table public.world_asset_bundled_catalog enable row level security;
alter table public.world_asset_bundled_catalog force row level security;
revoke all on table public.world_asset_bundled_catalog
  from public, anon, authenticated, service_role;

revoke all on function private.reject_world_asset_bundled_catalog_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_world_asset_bundled_default()
  from public, anon, authenticated, service_role;
revoke all on function private.world_asset_category_allowed(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.assert_verified_admin_permission(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.claim_admin_game_asset_operation_intent(
  uuid, uuid, text, uuid, uuid, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.claim_admin_game_asset_operation_intent(
  uuid, uuid, text, uuid, uuid, text, text, text, text
) to service_role;
revoke all on function public.restore_admin_game_asset_bundled_default(
  uuid, uuid, text, uuid, integer, text, text, integer
) from public, anon, authenticated, service_role;
grant execute on function public.restore_admin_game_asset_bundled_default(
  uuid, uuid, text, uuid, integer, text, text, integer
) to service_role;
revoke all on function public.get_player_gameplay_asset_overrides(text, text[], text, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_player_gameplay_asset_overrides(text, text[], text, integer)
  to service_role;
revoke all on function public.reconcile_world_asset_bundled_lifecycle(integer, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_world_asset_bundled_lifecycle(integer, text, text)
  to service_role;

comment on table public.world_asset_bundled_catalog is
  'Immutable checked-in Starville bundled material linked to repository version one; direct clients have no access.';
comment on column public.world_assets.bundled_default_version_id is
  'Immutable repository version used when no approved uploaded override is active.';
comment on column public.world_assets.asset_source_state is
  'Server-derived source state: unavailable, bundled_default, or uploaded_override.';
comment on function public.restore_admin_game_asset_bundled_default(
  uuid, uuid, text, uuid, integer, text, text, integer
) is
  'AAL2 restore that deprecates the uploaded active override and reactivates immutable bundled material without rewriting world pins.';
comment on function public.get_player_gameplay_asset_overrides(text, text[], text, integer) is
  'Bounded authenticated-player projection of allowlisted eligible active Starville uploads; raw paths remain internal to the API.';
comment on function public.reconcile_world_asset_bundled_lifecycle(integer, text, text) is
  'Bounded advisory-locked detection that returns recommendations only and never changes active art or immutable world pins.';
