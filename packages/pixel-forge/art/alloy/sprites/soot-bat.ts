import type { CodeSprite } from '../../../src/draw';

/** Soot Bat: wings spread, ember eyes; two flaps. */
const sootBat: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425',
    b: '#3a4466',
    B: '#5a6988',
    m: '#68386c',
    M: '#b55088',
    E: '#f77622',
    f: '#ffffff',
  },
  mirror: true,
  frames: [
    [
      '.....k..',
      '....kBk.',
      'k..kBbbb',
      'Mk.kbEbb',
      'kMkkbbbb',
      'kmMkbbbf',
      'kmmMkbbb',
      '.kmmMkbb',
      '.kmkmkkk',
      '..k.k...',
    ],
    [
      '.....k..',
      '....kBk.',
      '...kBbbb',
      '...kbEbb',
      '..kkbbbb',
      '.kMkbbbf',
      'kMmMkbbb',
      'kmmmMkbb',
      'kmkmkmkk',
      '.k.k.k..',
    ],
  ],
};

export default sootBat;
