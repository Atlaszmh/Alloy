import type { CodeSprite } from '../../../src/draw';

/** Slag Beetle: a heavy iron shell split by glowing molten seams, horns forward. */
const slagBeetle: CodeSprite = {
  size: 22,
  legend: {
    k: '#181425',
    i: '#262b44',
    I: '#3a4466',
    L: '#5a6988',
    l: '#8b9bb4',
    m: '#f77622',
    M: '#feae34',
    h: '#3e2731',
    H: '#733e39',
    e: '#e43b44',
  },
  mirror: true,
  frames: [
    [
      '.......k...',
      '......kLk..',
      '......kLk.k',
      '.......kkkk',
      '.....kkkkkk',
      '...kklLLLIM',
      '..klLLIIIIm',
      '.klLIIIIIim',
      '.kLIIIIIimi',
      'kkLIIIiimii',
      'k.kIIiiimii',
      'k.kIiiimiim',
      'kkkIiiimiiM',
      '..kkiiiimim',
      '...kkiiiiik',
      '....kkhhHhh',
      '.....khhehh',
      '....kkhhhhk',
      '...k..kkkk.',
      '..k...k..k.',
      '..k..k...k.',
    ],
  ],
};

export default slagBeetle;
