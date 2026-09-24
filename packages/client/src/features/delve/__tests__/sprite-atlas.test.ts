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

describe('delve sprite atlas', () => {
  const registry = getDelveRegistry();
  const monsterIds = new Set(
    registry.getDelveData().biomes.flatMap((b) => [...b.monsters.map((m) => m.id), b.boss.id]),
  );

  it('only holds sprites the game can use', () => {
    for (const id of Object.keys(atlas.animations)) {
      expect(id === 'hero' || monsterIds.has(id), `unknown sprite "${id}"`).toBe(true);
    }
  });

  it('covers the hero and the whole first biome', () => {
    const first = registry.getDelveData().biomes[0];
    for (const id of ['hero', ...first.monsters.map((m) => m.id), first.boss.id]) {
      expect(atlas.animations[id]?.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  it('points every animation at real frames', () => {
    for (const names of Object.values(atlas.animations))
      for (const n of names) expect(atlas.frames[n]).toBeDefined();
    expect(atlas.meta.image).toBe('atlas.png');
  });
});
