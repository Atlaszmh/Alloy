import type { CodeSprite } from '../../../src/draw';

/**
 * Exit gate (prop, size 2.6): a forged iron portcullis in a brick arch with a keystone;
 * open, the portcullis is raised into the arch over a dark passage. Built from a shape
 * rule rather than typed rows: 40 × 40 is too big to keep symmetric by hand.
 */
const W = 40;
const H = 40;
const SPRING = 12; // the outer arch meets the pillars here
const INNER = 14; // the opening's arch meets its sides here
const HALF = 13; // the opening's half width

const dxOf = (x: number) => Math.abs(x + 0.5 - W / 2);

function inOuter(x: number, y: number): boolean {
  if (x < 0 || x >= W || y < 0 || y >= H) return false;
  if (y >= SPRING) return true;
  return (dxOf(x) / (W / 2)) ** 2 + ((SPRING - y - 0.5) / SPRING) ** 2 <= 1;
}

function inOpening(x: number, y: number): boolean {
  if (dxOf(x) >= HALF || y >= H - 1) return false;
  if (y >= INNER) return true;
  return (dxOf(x) / HALF) ** 2 + ((INNER - y - 0.5) / 8) ** 2 <= 1;
}

const isBar = (x: number) => [1, 2].includes(Math.floor(dxOf(x)) % 4);

function stone(x: number, y: number): string {
  const edge = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ].some(([a, b]) => !inOuter(a, b) || inOpening(a, b));
  if (edge) return 'k';
  if (dxOf(x) < 3 && y < INNER - 7) return dxOf(x) > 2 ? 'k' : y < 3 ? 'S' : 's'; // the keystone
  if (y % 4 === 0) return 'q';
  const joint = (c: number) => (c + (Math.floor(y / 4) % 2) * 3) % 6 === 0;
  if (joint(x)) return 'q';
  if (joint(x + 1)) return 'd';
  return y % 4 === 1 ? 'S' : 's';
}

/** The portcullis down to `bottom` (its spikes on that row), crossbars on `rails`, else `behind`. */
function portcullis(x: number, y: number, bottom: number, rails: number[], behind: string): string {
  if (y > bottom) return behind;
  const lit = isBar(x) && !isBar(x - 1);
  if (y === bottom) return lit ? 'I' : 'v';
  if (rails.includes(y)) return lit && isBar(x) ? 'm' : 'I';
  if (rails.includes(y - 1)) return 'i';
  return isBar(x) ? (lit ? 'I' : 'i') : 'v';
}

function passage(y: number): string {
  if (y >= H - 5) return y % 2 ? 'w' : 's';
  return y >= H - 12 ? 'u' : 'V';
}

function frame(open: boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      if (!inOuter(x, y)) row += '.';
      else if (!inOpening(x, y)) row += stone(x, y);
      else if (open) row += portcullis(x, y, 13, [10], passage(y));
      else row += portcullis(x, y, H - 2, [16, 26], 'v');
    }
    rows.push(row);
  }
  return rows;
}

const exitGate: CodeSprite = {
  size: 42,
  legend: {
    k: '#181425', // outline
    S: '#8b9bb4', // brick, lit
    s: '#5a6988', // brick
    d: '#3a4466', // brick shade
    q: '#262b44', // mortar
    m: '#8b9bb4', // rivet
    I: '#5a6988', // iron, lit
    i: '#3a4466', // iron
    v: '#181425', // behind the bars
    u: '#262b44', // the passage
    V: '#181425', // the passage, deep
    w: '#3a4466', // the passage floor
  },
  idle: 'none',
  frames: [frame(false), frame(true)],
};

export default exitGate;
