import type { Rarity } from '@alloy/engine';
import { RARITY_COLOR } from './format';
import { pixelRuns } from './kit/glyph-art';

/**
 * One 10×10 pixel map per gear base (`#` is the item). It is drawn in the rarity colour, and
 * every empty pixel beside it gets the #181425 outline, so the shapes keep a 1 px margin.
 */
const MAPS: Record<string, string[]> = {
  dagger: [
    '..........',
    '..........',
    '......##..',
    '.....###..',
    '..#.###...',
    '...###....',
    '...##.....',
    '..#..#....',
    '.#........',
    '..........',
  ],
  sword: [
    '..........',
    '.......##.',
    '......###.',
    '.....###..',
    '..#.###...',
    '...###....',
    '...##.....',
    '..#..#....',
    '.#........',
    '..........',
  ],
  axe: [
    '..........',
    '...#.##...',
    '...######.',
    '...#####..',
    '...#.##...',
    '...#......',
    '...#......',
    '...#......',
    '...#......',
    '..........',
  ],
  maul: [
    '..........',
    '.########.',
    '.########.',
    '.########.',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '..........',
  ],
  staff: [
    '..........',
    '....##....',
    '...####...',
    '...####...',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '..........',
  ],
  wand: [
    '..........',
    '......#...',
    '.....###..',
    '......#...',
    '.....#....',
    '....#.....',
    '...#......',
    '..#.......',
    '.#........',
    '..........',
  ],
  bow: [
    '..........',
    '...##..#..',
    '....#..#..',
    '.....#.#..',
    '.....#.#..',
    '.....#.#..',
    '.....#.#..',
    '....#..#..',
    '...##..#..',
    '..........',
  ],
  helm: [
    '..........',
    '..........',
    '...####...',
    '..######..',
    '.########.',
    '.###..###.',
    '.##....##.',
    '.##....##.',
    '..........',
    '..........',
  ],
  cuirass: [
    '..........',
    '..##..##..',
    '.########.',
    '.########.',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..######..',
    '..........',
  ],
  gauntlets: [
    '..........',
    '..#.#.#...',
    '..#.#.#.#.',
    '..#######.',
    '..#######.',
    '..######..',
    '...####...',
    '...####...',
    '...####...',
    '..........',
  ],
  greaves: [
    '..........',
    '..####....',
    '..####....',
    '..####....',
    '..####....',
    '..#####...',
    '..######..',
    '..#######.',
    '..#######.',
    '..........',
  ],
  amulet: [
    '..........',
    '.#......#.',
    '..#....#..',
    '...#..#...',
    '....##....',
    '...####...',
    '..######..',
    '...####...',
    '....##....',
    '..........',
  ],
  ring: [
    '..........',
    '....##....',
    '....##....',
    '..........',
    '...####...',
    '..#....#..',
    '..#....#..',
    '..#....#..',
    '...####...',
    '..........',
  ],
};

const NEIGHBOURS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

/** The map with its outline: an empty pixel beside a filled one becomes `o`. */
function outlined(rows: string[]): string[] {
  return rows.map((row, y) =>
    [...row]
      .map((ch, x) =>
        ch === '.' && NEIGHBOURS.some(([dx, dy]) => rows[y + dy]?.[x + dx] === '#') ? 'o' : ch,
      )
      .join(''),
  );
}

const RUNS = Object.fromEntries(
  Object.entries(MAPS).map(([id, rows]) => [id, pixelRuns(outlined(rows))]),
);

export interface ItemIconProps {
  baseId: string;
  rarity: Rarity;
  size?: number | string;
  /** Render as a dim outline (empty paper-doll slot / unknown codex entry). */
  ghost?: boolean;
}

/** A gear base's pixel map in its rarity colour; an unknown base draws the ring. */
export function ItemIcon({ baseId, rarity, size = '100%', ghost = false }: ItemIconProps) {
  const base = MAPS[baseId] ? baseId : 'ring';
  const fill = ghost ? '#5a6988' : RARITY_COLOR[rarity];
  return (
    <svg
      viewBox="0 0 10 10"
      width={size}
      height={size}
      aria-hidden="true"
      shapeRendering="crispEdges"
      data-base={base}
      style={{ display: 'block', opacity: ghost ? 0.35 : 1 }}
    >
      {RUNS[base]
        .filter((r) => !ghost || r.ch === '#')
        .map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={r.w}
            height={1}
            fill={r.ch === '#' ? fill : '#181425'}
          />
        ))}
    </svg>
  );
}
