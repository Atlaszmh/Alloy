import type { CodeSprite } from '../../../src/draw';

/** Minecart wreck (a cover look, one cell, size 1): a toppled iron cart spilling coal, a wheel off. */
const minecart: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    I: '#8b9bb4', // iron, lit
    i: '#5a6988', // iron
    d: '#3a4466', // iron shade
    r: '#be4a2f', // rust
    c: '#262b44', // coal
    C: '#3a4466', // coal glint
    w: '#733e39', // wheel wood
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '..kkkkkkkk..',
      '.kIIIIIIIik.',
      'kIiiiiiirdk.',
      'kIicCcccidk.',
      'kIicccCcidkk',
      'kIircccciddk',
      'kIiiiiiirdkk',
      '.kddddddddkc',
      'kwkkkkkkkcCk',
      'kik..kkcCcck',
      '.k..kccccck.',
    ],
  ],
};

export default minecart;
