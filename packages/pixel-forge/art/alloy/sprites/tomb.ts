import type { CodeSprite } from '../../../src/draw';

/** Tomb (a cover look, one cell, size 1): a carved crypt headstone with a cross, on a stone slab. */
const tomb: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    S: '#8b9bb4', // stone, lit
    s: '#5a6988', // stone
    d: '#3a4466', // stone shade
    D: '#262b44', // carving
    m: '#3e8948', // moss
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '...kkkk...',
      '..kSSssk..',
      '.kSSsssdk.',
      '.kSsDDsdk.',
      '.kSDDDDdk.',
      '.kSsDDsdk.',
      '.kSsDDsdk.',
      '.kSsssddk.',
      '.kSmsssdk.',
      '.kSmmsddk.',
      'kkkkkkkkkk',
      'kSSSssssdk',
      'kSsssssddk',
      'kkkkkkkkkk',
    ],
  ],
};

export default tomb;
