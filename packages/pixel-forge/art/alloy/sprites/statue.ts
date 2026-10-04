import type { CodeSprite } from '../../../src/draw';

/**
 * Statue (a cover look, one cell, size 1): a hooded stone figure on a plinth. Frames: whole,
 * cracked, badly cracked (a crumbling structure's life, by thirds).
 */
const WHOLE = [
  '...kkkk...',
  '..kSSssk..',
  '..kSDDsk..',
  '..kSssdk..',
  '.kkSssdkk.',
  'kSSSsssddk',
  'kSkSsssdkd',
  'kSkSSssdkd',
  'kkkSsssdkk',
  '..kSsssdk.',
  '..kSssddk.',
  '.kSSsssddk',
  'kkkkkkkkkk',
  'kSSSSsssdk',
  'kSsssssddk',
  'kkkkkkkkkk',
];

/** The rows with each [x, y] pixel turned to a crack. */
function cracked(rows: string[], at: [number, number][]): string[] {
  const out = rows.map((r) => [...r]);
  for (const [x, y] of at) out[y][x] = 'k';
  return out.map((r) => r.join(''));
}

const CRACKS: [number, number][] = [
  [5, 5],
  [5, 6],
  [6, 7],
  [3, 10],
  [4, 11],
];
const MORE: [number, number][] = [
  [4, 1],
  [4, 3],
  [3, 7],
  [6, 9],
  [7, 10],
  [5, 13],
  [6, 14],
];

const statue: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline, cracks
    S: '#c0cbdc', // stone, lit
    s: '#8b9bb4', // stone
    d: '#5a6988', // stone shade
    D: '#3a4466', // face in the hood
  },
  idle: 'none',
  frames: [WHOLE, cracked(WHOLE, CRACKS), cracked(WHOLE, [...CRACKS, ...MORE])],
};

export default statue;
