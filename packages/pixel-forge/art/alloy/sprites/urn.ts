import type { CodeSprite } from '../../../src/draw';

/** Urn (room prop, radius 0.35, size 0.7): a painted clay urn; broken, its foot stands in a ring of shards. */
const urn: CodeSprite = {
  size: 11,
  legend: {
    k: '#181425', // outline
    L: '#d77643', // clay, lit
    c: '#be4a2f', // clay
    C: '#733e39', // clay shade
    D: '#3e2731', // inside
    b: '#e4a672', // painted band
    B: '#feae34', // band glint
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '..kkkkk..',
      '.kLLccCk.',
      '..kDDDk..',
      '..kLcCk..',
      '.kLLccCk.',
      'kLbBbbbCk',
      'kLLcccCCk',
      'kLccccCCk',
      '.kcccCCk.',
      '..kCCCk..',
      '..kkkkk..',
    ],
    [
      '..k.k..k...',
      '.kLkDkkCk..',
      '.kLbDbbCk..',
      '.kLccccCk..',
      'k.kccCCk.kk',
      'Lk.kCCCk.Ck',
      'kk.kkkkk..k',
    ],
  ],
};

export default urn;
