import type { CodeSprite } from '../../../src/draw';

/** Slag Beetle: an iron shell split by glowing molten seams. */
const slagBeetle: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425',
    i: '#262b44',
    I: '#3a4466',
    L: '#5a6988',
    m: '#f77622',
    M: '#feae34',
    h: '#3e2731',
    e: '#e43b44',
  },
  mirror: true,
  frames: [
    [
      '....kkkk',
      '..kkLLIm',
      '.kLLIIIM',
      '.kLIIIim',
      'kkIIImii',
      'k.kIiimi',
      'kkkiiiim',
      '.kkiiiik',
      '..kkhhhh',
      '...khehh',
      '..k.khhk',
      '....kk.k',
    ],
  ],
};

export default slagBeetle;
