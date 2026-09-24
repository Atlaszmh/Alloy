import { setRGBA, type Image, type RGB } from './image';

/** A 3×5 pixel font for labelling contact sheets. */
const GLYPHS: Record<string, string> = {
  A: '.#.#.#####.##.#',
  B: '##.#.###.#.###.',
  C: '.###..#..#...##',
  D: '##.#.##.##.###.',
  E: '####..##.#..###',
  F: '####..##.#..#..',
  G: '.###..#.##.#.##',
  H: '#.##.#####.##.#',
  I: '###.#..#..#.###',
  J: '..#..#..##.#.#.',
  K: '#.##.###.#.##.#',
  L: '#..#..#..#..###',
  M: '#.########.##.#',
  N: '##.#.##.##.##.#',
  O: '.#.#.##.##.#.#.',
  P: '##.#.###.#..#..',
  Q: '.#.#.##.###..##',
  R: '##.#.###.#.##.#',
  S: '.###...#...###.',
  T: '###.#..#..#..#.',
  U: '#.##.##.##.####',
  V: '#.##.##.##.#.#.',
  W: '#.##.########.#',
  X: '#.##.#.#.#.##.#',
  Y: '#.##.#.#..#..#.',
  Z: '###..#.#.#..###',
  '0': '####.##.##.####',
  '1': '.#.##..#..#.###',
  '2': '##...#.#.#..###',
  '3': '##...#.#...###.',
  '4': '#.##.####..#..#',
  '5': '####..##...###.',
  '6': '.###..####.####',
  '7': '###..#.#..#..#.',
  '8': '####.#####.####',
  '9': '####.####..###.',
  _: '............###',
  '-': '......###......',
  '.': '.............#.',
  ' ': '...............',
};

/** Glyphs are 15 characters: 3 wide × 5 tall, row by row. */
function rows(ch: string): string {
  return GLYPHS[ch] ?? GLYPHS[' '];
}

/** Draw text with its top-left at (x, y); returns the width drawn. */
export function drawText(
  img: Image,
  text: string,
  x: number,
  y: number,
  color: RGB,
  scale = 1,
): number {
  let cx = x;
  for (const raw of text.toUpperCase()) {
    const g = rows(raw);
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (g[gy * 3 + gx] !== '#') continue;
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++)
            setRGBA(
              img,
              cx + gx * scale + sx,
              y + gy * scale + sy,
              color[0],
              color[1],
              color[2],
              255,
            );
      }
    }
    cx += 4 * scale;
  }
  return cx - x;
}
