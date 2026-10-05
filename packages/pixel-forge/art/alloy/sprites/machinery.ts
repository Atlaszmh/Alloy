import type { CodeSprite } from '../../../src/draw';

/** Machinery (a cover look, one cell, size 1): a riveted steel boiler with a brass gauge and a pipe. */
const machinery: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    I: '#8b9bb4', // steel, lit
    i: '#5a6988', // steel
    d: '#3a4466', // steel shade
    B: '#feae34', // brass
    b: '#f77622', // brass shade
    W: '#ffffff', // gauge face
    r: '#e43b44', // gauge needle
    y: '#fee761', // lamp
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '...kk.....',
      '..kBbk....',
      '..kBbk.kk.',
      '.kkBbkkyk.',
      'kIIIIIiikk',
      'kIBiiiiBdk',
      'kIikkkiidk',
      'kIkWWrkidk',
      'kIkWrWkidk',
      'kIikkkiidk',
      'kIiiiiiidk',
      'kBbBbBbBbk',
      'kIiiiiiidk',
      'kIBiiiiBdk',
      'kkkkkkkkkk',
    ],
  ],
};

export default machinery;
