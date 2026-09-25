import type { CodeSprite } from '../../../src/draw';

/** Soot Bat: a small bat with plum wings and ember eyes; two flaps. */
const sootBat: CodeSprite = {
  size: 11,
  legend: {
    k: '#181425',
    b: '#3a4466',
    B: '#5a6988',
    m: '#68386c',
    M: '#b55088',
    E: '#f77622',
  },
  mirror: true,
  // prettier-ignore
  frames: [
    [
      '...kk',
      'k.kBb',
      'MkkbE',
      'kmMkb',
      'kmmMk',
      '.kmkk',
      '..k..',
    ],
    [
      '...kk',
      '..kBb',
      '..kbE',
      '.kMkb',
      'kMmMk',
      'kmkmk',
      '.k.k.',
    ],
  ],
};

export default sootBat;
