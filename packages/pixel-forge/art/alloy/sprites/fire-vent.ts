import type { CodeSprite } from '../../../src/draw';

/**
 * Fire vent (fire hazard, radius 0.4, size 0.8): a glowing crack in a basalt mound. Frames by
 * state: ready (smouldering), primed (a plume of fire), dormant (cold, one ember).
 */
const vent = (a: string, b: string) => [
  '..kkkkkkk..',
  `.kRk${a}${b}${a}krk.`,
  `kRk${a}${b}${b}${b}${a}krk`,
  'kRrrkkkkrrk',
  'kkkkkkkkkkk',
];

const fireVent: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    R: '#733e39', // basalt, lit
    r: '#3e2731', // basalt
    O: '#f77622', // fire
    Y: '#feae34', // fire core
    y: '#fee761', // fire heart
    W: '#ffffff', // white heat
    E: '#e43b44', // fire edge
    s: '#5a6988', // smoke
    e: '#a22633', // ember
    c: '#262b44', // cold crack
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '.....s.....',
      '....s.s....',
      '.....E.....',
      ...vent('O', 'Y'),
    ],
    [
      '...E.y.E...',
      '..EOYyYOE..',
      '.E.OyWyO.E.',
      '..OYyWyYO..',
      '..OYyWyYO..',
      '...OYWYO...',
      '...EOyOE...',
      ...vent('Y', 'y'),
    ],
    vent('c', 'e'),
  ],
};

export default fireVent;
