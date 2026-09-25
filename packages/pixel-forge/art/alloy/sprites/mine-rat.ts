import type { CodeSprite } from '../../../src/draw';

/** Mine Rat: a tiny grey rat with an ember eye, facing left. */
const mineRat: CodeSprite = {
  size: 10,
  legend: {
    k: '#181425',
    g: '#8b9bb4',
    G: '#5a6988',
    p: '#f6757a',
    E: '#f77622',
    t: '#b55088',
  },
  // prettier-ignore
  frames: [
    [
      '.kk.......',
      'kGGkkkk...',
      'kEGGGgGk..',
      'pGGGGGGkkk',
      'kkGkkGkktk',
      '.kk..kk.kk',
    ],
  ],
};

export default mineRat;
