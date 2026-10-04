import { describe, it, expect } from 'vitest';
import { DataRegistry } from '../src/data/registry.js';
import { loadAndValidateData } from '../src/data/loader.js';
import { SetPiecesDataSchema, setPiecesProblems } from '../src/data/setpieces-schema.js';
import rawSetPieces from '../src/data/setpieces.json';
import { LOOK_IDS } from '../src/types/floor-map.js';
import { registry } from './fixtures/arena.js';

// See the room objects spec: `setpieces.json` (props, hazards, pieces, a palette per biome),
// schema-checked at load, its references checked by `setPiecesProblems`.

const data = registry.getSetPieces();
const parse = (patch: Record<string, unknown>) =>
  SetPiecesDataSchema.safeParse({ ...rawSetPieces, ...patch }).success;
const piece = (o: Record<string, unknown>) => ({
  id: 'p',
  rows: ['#.'],
  tags: ['edge'],
  weight: 1,
  turns: true,
  ...o,
});

describe('setpieces.json', () => {
  it('loads through the registry, with a palette for every biome', () => {
    expect(data.pieces.length).toBeGreaterThan(0);
    expect(Object.keys(data.palettes).sort()).toEqual(
      registry
        .getDelveData()
        .biomes.map((b) => b.id)
        .sort(),
    );
    expect(setPiecesProblems(registry)).toEqual([]);
    expect(LOOK_IDS[0]).toBe('plain');
  });

  it('refuses a row off the legend, rows of two widths, an unknown look, tag or element', () => {
    expect(parse({ pieces: [piece({})] })).toBe(true);
    expect(parse({ pieces: [piece({ rows: ['#x'] })] })).toBe(false);
    expect(parse({ pieces: [piece({ rows: ['#.', '#'] })] })).toBe(false);
    expect(parse({ pieces: [piece({ looks: { '#': 'marble' } })] })).toBe(false);
    expect(parse({ pieces: [piece({ tags: ['ceiling'] })] })).toBe(false);
    expect(parse({ pieces: [piece({}), piece({})] })).toBe(false);
    expect(parse({ hazards: [{ id: 'h', element: 'wind', radius: 0.4, burst: 2 }] })).toBe(false);
  });

  it("names a missing palette, an unknown biome's, and props, hazards or biomes it doesn't know", () => {
    const d = loadAndValidateData();
    const { cinder_mines: _gone, ...palettes } = d.setPieces.palettes;
    const odd = {
      ...d.setPieces,
      palettes: {
        ...palettes,
        moon: { ...palettes.frostvault, props: ['vase'], hazards: ['geyser'] },
      },
      pieces: [{ ...d.setPieces.pieces[0], biomes: ['moon'] }],
    };
    expect(setPiecesProblems(new DataRegistry({ ...d, setPieces: odd }))).toEqual([
      'no palette for cinder_mines',
      'palette sunken_quarry: no foliage 3 thick to hide in',
      'palette moon: no such biome',
      'palette moon: no prop vase',
      'palette moon: no hazard geyser',
      `piece ${d.setPieces.pieces[0].id}: no biome moon`,
    ]);
  });
});
