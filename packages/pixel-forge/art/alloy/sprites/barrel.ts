import type { CodeSprite } from '../../../src/draw';

/** Barrel (room prop, radius 0.4, size 0.8): an iron-hooped barrel; broken, its staves splayed round a fallen hoop. */
const barrel: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    T: '#d77643', // lid
    L: '#e4a672', // stave, lit
    w: '#b86f50', // stave
    W: '#733e39', // stave shade
    I: '#8b9bb4', // hoop
    i: '#5a6988', // hoop shade
    d: '#3e2731', // inside
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '..kkkkkk..',
      '.kTTTTTTk.',
      'kIIIIIIiik',
      'kLwwwwwWWk',
      'kLwwwwwWWk',
      'kIIIIIIiik',
      'kLwwwwwWWk',
      'kLwwwwwWWk',
      'kIIIIIIiik',
      'kLwwwwwWWk',
      '.kwwwwwWk.',
      '..kkkkkk..',
    ],
    [
      '...k..k..k...',
      '..kLk.kwkWk..',
      '.kLwkkddkWk..',
      '.kIIIIIIiik..',
      'kLkwdddddWkLk',
      'kwkkkkkkkkkWk',
      'kkk.......kkk',
    ],
  ],
};

export default barrel;
