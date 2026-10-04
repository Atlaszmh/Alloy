import type { DataRegistry } from '../../data/registry.js';
import type { BiomeDef } from '../../types/delve.js';
import type { FloorMap } from '../../types/floor-map.js';
import type { ManaType } from '../../types/mana.js';

/** What the furnisher placed beside the cells: the props and hazards for `createFloorWorld` to stand. */
export interface Furnishing {
  props: { kind: string; x: number; y: number }[];
  hazards: { kind: string; element: ManaType; x: number; y: number }[];
}

/**
 * Furnish a generated floor (B1; see the room objects spec): set pieces from
 * the biome's palette, drawn on the floor seed's `furnish` fork and written
 * into the map's `cells`, `look` and `structures` under the invariants, and
 * the props and hazards they hold. Stub: nothing.
 */
export function furnishFloor(
  _registry: DataRegistry,
  _map: FloorMap,
  _seed: number,
  _depth: number,
  _biome: BiomeDef,
): Furnishing {
  return { props: [], hazards: [] };
}
