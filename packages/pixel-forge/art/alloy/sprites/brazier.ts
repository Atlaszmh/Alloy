import type { CodeSprite } from '../../../src/draw';

/**
 * Brazier (fire hazard, radius 0.4, size 0.8): an iron bowl on a tripod. Frames by state:
 * ready (burning), primed (flaring white-hot), dormant (dark coals).
 */
const BASE = [
  'kIIIIIIIiik',
  '.kIiiiiidk.',
  '..kkiiikk..',
  '....kik....',
  '...kkikk...',
  '..kik.kik..',
  '.kik...kik.',
  '.kk.....kk.',
];

const brazier: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    I: '#8b9bb4', // iron, lit
    i: '#5a6988', // iron
    d: '#3a4466', // iron shade
    R: '#e43b44', // flame edge
    O: '#f77622', // flame
    Y: '#feae34', // flame core
    y: '#fee761', // flame heart
    W: '#ffffff', // white heat
    C: '#3e2731', // coal
    e: '#a22633', // ember
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '.....R.....',
      '....ROR....',
      '...ROYOR.R.',
      '..ROYyYORR.',
      '.kOYyyyYOk.',
      ...BASE,
    ],
    [
      '.R..yWy..R.',
      '..ROyWyOR..',
      '.ROyWWWyOR.',
      'ROYyWWWyYOR',
      'kOYyyWyyYOk',
      ...BASE,
    ],
    [
      '.kCeCCCeCk.',
      ...BASE,
    ],
  ],
};

export default brazier;
