import type { DataRegistry } from '../../data/registry.js';
import type { BiomeDef, DoorDef } from '../../types/delve.js';
import type { FloorMap } from '../../types/floor-map.js';

/**
 * A floor's rooms and halls (see the floor maps spec's "Generator"; the
 * generator area fills this directory): pure and deterministic on the floor
 * seed's `layout` fork.
 */
export function generateFloor(
  _registry: DataRegistry,
  _seed: number,
  _depth: number,
  _biome: BiomeDef,
  _door: DoorDef | null,
): FloorMap {
  throw new Error('generateFloor: not implemented');
}
