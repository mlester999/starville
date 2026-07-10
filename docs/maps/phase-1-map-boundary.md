# Map architecture boundary

No map or editor is implemented in Phase 1. The game runtime boundary is deliberately ready to load
a future modular isometric tilemap without coupling it to React.

Future maps must remain structured, versioned data with tile layers, object layers, collision,
spawn, interaction, zone, asset, and metadata references. A published world must never be flattened
into one background image. Visual map editing and publishing begin only in their authorized phases.
