import type { CodeSprite } from '../../../src/draw';

/** Ice pillar (a cover look, one cell, size 1): a frozen column under a snowy capital, on a snowy base. */
const icePillar: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    W: '#ffffff', // snow, glint
    n: '#c0cbdc', // snow shade
    C: '#2ce8f5', // ice, lit
    c: '#0099db', // ice
    b: '#124e89', // ice shade
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      'kkkkkkkkkk',
      'kWWWWWWnnk',
      'kkCcccbkkk',
      '.kCWcccbk.',
      '.kCCccbbk.',
      '.kCWccbbk.',
      '.kCCccbbk.',
      '.kCcccbbk.',
      '.kCWcckbk.',
      '.kCCcckbk.',
      '.kCcccbbk.',
      '.kCWccbbk.',
      '.kCCccbbk.',
      'kkCcccbbkk',
      'kWWWWWnnnk',
      'kkkkkkkkkk',
    ],
  ],
};

export default icePillar;
