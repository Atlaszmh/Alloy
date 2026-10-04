import { describe, it, expect } from 'vitest';
import { DataRegistry } from '../src/data/registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { hidesPack, setPiecesProblems } from '../src/data/setpieces-schema.js';
import { registry } from './fixtures/arena.js';

// The set pieces and the biome palettes (see the room objects spec's "Set pieces" and "Biome
// palettes"): enough of each kind for every biome, foliage thick enough to hide a pack.

const data = registry.getSetPieces();
const biomes = registry.getDelveData().biomes.map((b) => b.id);
/** The pieces a biome may place: its own and the ones for every biome. */
const piecesOf = (biome: string) =>
  data.pieces.filter((p) => !p.biomes || p.biomes.includes(biome));
const holds = (biome: string, ch: string) =>
  piecesOf(biome).some((p) => p.rows.join('').includes(ch));

describe('the set pieces', () => {
  it('give every biome cover, crumbling cover, slow ground, props and hazards, and pieces of its own', () => {
    for (const b of biomes) {
      expect(piecesOf(b).length, b).toBeGreaterThanOrEqual(12);
      expect(data.pieces.filter((p) => p.biomes?.includes(b)).length, b).toBeGreaterThanOrEqual(2);
      for (const ch of ['#', 'c', '~', 'u', 'h']) expect(holds(b, ch), `${b} ${ch}`).toBe(true);
      expect(data.palettes[b].props.length, b).toBeGreaterThanOrEqual(2);
    }
  });

  it('stand against a wall, in a corner and in the middle, and fit the smallest room', () => {
    for (const tag of ['edge', 'corner', 'centre'] as const)
      expect(
        data.pieces.some((p) => p.tags.includes(tag)),
        tag,
      ).toBe(true);
    for (const p of data.pieces) {
      expect(Math.max(p.rows.length, p.rows[0].length), p.id).toBeLessThanOrEqual(12);
      expect(p.rows.join('').replace(/[.?]/g, '').length, p.id).toBeGreaterThan(0);
    }
  });

  it('grow foliage only in the Sunken Quarry, at least 3 thick, so its packs can hide', () => {
    const leafy = biomes.filter((b) => data.palettes[b].looks.foliage.length > 0);
    expect(leafy).toEqual(['sunken_quarry']);
    for (const b of leafy)
      expect(
        piecesOf(b).some((p) => hidesPack(p.rows)),
        b,
      ).toBe(true);
    for (const p of data.pieces.filter((p) => p.rows.join('').includes('f')))
      expect(p.biomes, p.id).toEqual(['sunken_quarry']);
  });

  it('draw crumbling cover as a statue or a cracked wall (the looks that show cracks)', () => {
    const cracks = ['statue', 'cracked_wall'];
    for (const b of biomes)
      for (const look of data.palettes[b].looks.crumbling) expect(cracks, b).toContain(look);
    for (const p of data.pieces) if (p.looks?.c) expect(cracks, p.id).toContain(p.looks.c);
  });

  it('name foliage under 3 thick, and a leafy palette with nowhere to hide', () => {
    expect([
      hidesPack(['fff', 'fff', 'fff']),
      hidesPack(['ffff', 'ffff']),
      hidesPack(['?fff?', 'fffff', 'fffff', '?fff?']),
    ]).toEqual([true, false, true]);
    const d = loadAndValidateData();
    const thin = { id: 'hedge', rows: ['ffff', 'ffff'], tags: ['edge'], weight: 1, turns: true };
    const pieces = [...d.setPieces.pieces.filter((p) => !p.rows.join('').includes('f')), thin];
    expect(
      setPiecesProblems(new DataRegistry({ ...d, setPieces: { ...d.setPieces, pieces } as never })),
    ).toEqual([
      'palette sunken_quarry: no foliage 3 thick to hide in',
      'piece hedge: foliage under 3 thick',
    ]);
  });
});
