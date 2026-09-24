import type { CodeSprite } from '../../../src/draw';

/** Mine Rat: a mangy grey rat with ember eyes, facing left. */
const mineRat: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425',
    g: '#8b9bb4',
    G: '#5a6988',
    l: '#c0cbdc',
    p: '#f6757a',
    E: '#f77622',
    t: '#b55088',
  },
  frames: [
    [
      '..kk............',
      '.kpGk..kkkkk....',
      '.kGGkkkGGllGk...',
      'kGEGGGGGGGGlGk..',
      'pGGGGGGGGGGGGk..',
      'kkGGgGGGGgGGGkkk',
      '.kkgggggggggkttk',
      '..kGkkGk.kGkk.kk',
      '..kk..kk..kk....',
    ],
  ],
};

export default mineRat;
