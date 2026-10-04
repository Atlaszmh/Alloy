import type { CodeSprite } from '../../../src/draw';

/** Crate (room prop, radius 0.4, size 0.8): a braced wooden crate; broken, a split box among loose planks. */
const crate: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    T: '#e4a672', // lid, lit
    t: '#c28569', // lid
    w: '#b86f50', // wood
    W: '#733e39', // brace, shade
    d: '#3e2731', // dark
    n: '#8b9bb4', // nail
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '.kkkkkkkkkk.',
      'kTTTTTTTTttk',
      'kTnTTTTTTntk',
      'kkkkkkkkkkkk',
      'kWwwwwwwwWWk',
      'kwWwwwwwWwWk',
      'kwwWwwwWwwWk',
      'kwwwWWWwwwWk',
      'kwwWwwwWwwWk',
      'kwWwwwwwWwWk',
      'kWwwwwwwwWWk',
      'kkkkkkkkkkkk',
    ],
    [
      '..k.k...k....',
      '.kwkWk.kWk...',
      '.kwddddddWk..',
      '.kWwdddwWWk..',
      'kkwwWwwWwWkkk',
      'TtkWwwwwwWkwW',
      'kkkkkkkkkkkkk',
    ],
  ],
};

export default crate;
