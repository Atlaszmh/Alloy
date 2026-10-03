import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDelveRegistry } from '../registry';

const atlas = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/sprites/delve/atlas.json'), 'utf8'),
) as {
  frames: Record<string, { frame: { w: number; h: number } }>;
  animations: Record<string, string[]>;
  meta: { image: string };
};

/** The floor-map props' sizes in units (the values `layouts.json → props` holds once it exists). */
const PROP_SIZES: Record<string, number> = {
  chest: 0.9,
  shrine: 1.4,
  alcove_anvil: 1.4,
  exit_gate: 2.6,
};

describe('delve sprite atlas', () => {
  const registry = getDelveRegistry();
  const monsterIds = new Set(
    registry.getDelveData().biomes.flatMap((b) => [...b.monsters.map((m) => m.id), b.boss.id]),
  );
  /** Everything drawn from the atlas: the hero, the training dummy (size 1), the monsters, Hesta, the Anvil-keeper, and the floor-map props. */
  const known = new Set(['hero', 'dummy', 'hesta', ...monsterIds, ...Object.keys(PROP_SIZES)]);

  it('only holds sprites the game can use', () => {
    for (const id of Object.keys(atlas.animations)) {
      expect(known.has(id), `unknown sprite "${id}"`).toBe(true);
    }
  });

  it('covers the hero, the training dummy, Hesta and the whole first biome', () => {
    const first = registry.getDelveData().biomes[0];
    for (const id of ['hero', 'dummy', 'hesta', ...first.monsters.map((m) => m.id), first.boss.id]) {
      expect(atlas.animations[id]?.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('holds every floor-map prop with its two states', () => {
    for (const id of Object.keys(PROP_SIZES)) {
      expect(atlas.animations[id]?.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps one pixel density: every canvas is 16 px per unit of monster or prop size', () => {
    // A size-1 monster is 16 px, a size-3 giant 48 px, and every sprite pixel is the same
    // SPRITE_PIXEL in the world. Canvases follow size, so art and hitboxes stay in proportion.
    const sizes = new Map(
      registry
        .getDelveData()
        .biomes.flatMap((b) => [...b.monsters, b.boss])
        .map((m) => [m.id, m.size ?? 1]),
    );
    sizes.set('hero', 1);
    sizes.set('dummy', 1);
    sizes.set('hesta', 1.6);
    for (const [id, size] of Object.entries(PROP_SIZES)) sizes.set(id, size);
    for (const [id, names] of Object.entries(atlas.animations)) {
      const want = Math.round(16 * sizes.get(id)!);
      for (const n of names) {
        const { w, h } = atlas.frames[n].frame;
        expect([w, h], `${n} should be ${want}×${want}`).toEqual([want, want]);
      }
    }
  });

  it('points every animation at real frames', () => {
    for (const names of Object.values(atlas.animations))
      for (const n of names) expect(atlas.frames[n]).toBeDefined();
    expect(atlas.meta.image).toBe('atlas.png');
  });
});
