import type { CodeSprite } from '../../../src/draw';

/** Chest (prop, size 0.9): an iron-banded wooden chest with a gold lock; open, its lid is up and gold glints inside. */
const chest: CodeSprite = {
  size: 14,
  legend: {
    k: '#181425', // outline
    w: '#b86f50', // wood
    W: '#733e39', // wood shade
    d: '#3e2731', // inside
    I: '#8b9bb4', // iron band
    i: '#5a6988', // iron band shade
    y: '#fee761', // gold glint
    g: '#feae34', // gold
    G: '#f77622', // gold shade
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '..kkkkkkkkkk..',
      '.kIwwwwwwwwIk.',
      'kIwwwwwwwwwwIk',
      'kiWWWWWWWWWWik',
      'kkkkkkggkkkkkk',
      'kIwwwwgykwwwIk',
      'kiwwwwGGkwwwik',
      'kiWWWWWWWWWWik',
      'kIwwwwwwwwwwIk',
      'kiWWWWWWWWWWik',
      'kkkkkkkkkkkkkk',
    ],
    [
      '..kkkkkkkkkk..',
      '.kIWWWWWWWWIk.',
      'kIWddddddddWIk',
      'kkkkkkkkkkkkkk',
      'kdyggydygygddk',
      'kIgygGggyGggIk',
      'kkkkkkGGkkkkkk',
      'kIwwwwwwwwwwIk',
      'kiWWWWWWWWWWik',
      'kIwwwwwwwwwwIk',
      'kiWWWWWWWWWWik',
      'kkkkkkkkkkkkkk',
    ],
  ],
};

export default chest;
