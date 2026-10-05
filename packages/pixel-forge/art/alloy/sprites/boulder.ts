import type { CodeSprite } from '../../../src/draw';

/** Boulder (a cover look, one cell, size 1): a grey quarry boulder with moss on its crown. */
const boulder: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    m: '#63c74d', // moss, lit
    M: '#3e8948', // moss
    S: '#c0cbdc', // stone, lit
    s: '#8b9bb4', // stone
    d: '#5a6988', // stone shade
    D: '#3a4466', // stone deep
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '....kkkkk...',
      '..kkmmmMMkk.',
      '.kmmMmMMsdk.',
      '.kSmSssssddk',
      'kSSSssssdddk',
      'kSSsssskddDk',
      'kSssssddkdDk',
      'kssskssddDDk',
      '.kssddddDDk.',
      '..kkkkkkkk..',
    ],
  ],
};

export default boulder;
