import type { CodeSprite } from '../../../src/draw';

/** Bone pile (room prop, radius 0.4, size 0.8): a heap of bones under a skull; broken, the bones lie scattered. */
const bonePile: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    B: '#ead4aa', // bone, lit
    b: '#c28569', // bone shade
    d: '#3e2731', // sockets, gaps
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '....kkkk.....',
      '...kBBBbk....',
      '...kdBdbk....',
      '..kkBBbbkkk..',
      '.kBBkkkkBBbk.',
      'kBbkBBBbkkbbk',
      'kkBBkdkBBBkkk',
      'kBbbBBkbbkBbk',
      'kkkkkkkkkkkkk',
    ],
    [
      '.......kkkk..',
      '.kk...kBBBbk.',
      'kBbk..kdBdbk.',
      'kkkBk..kkkkkk',
      'kk.kBBkBBbbbk',
      'kBbbbkkkkkkkk',
      'kkkkk........',
    ],
  ],
};

export default bonePile;
