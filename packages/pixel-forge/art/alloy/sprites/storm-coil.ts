import type { CodeSprite } from '../../../src/draw';

/**
 * Storm coil (storm hazard, radius 0.4, size 0.8): a copper coil under a steel sphere on an iron
 * plinth. Frames by state: ready (a few sparks), primed (arcing), dormant (dark).
 */
const COIL = [
  '...kcCck...',
  '...kdddk...',
  '...kcCck...',
  '..kkkkkkk..',
  '.kIIIIIiik.',
  '.kiiiiiidk.',
  'kkkkkkkkkkk',
];

const stormCoil: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    W: '#ffffff', // sphere glint, arc heart
    S: '#c0cbdc', // sphere, lit
    s: '#8b9bb4', // sphere
    D: '#5a6988', // sphere shade, dark
    E: '#3a4466', // dark sphere shade
    c: '#d77643', // copper
    C: '#be4a2f', // copper shade
    d: '#3e2731', // coil gap
    I: '#8b9bb4', // plinth, lit
    i: '#5a6988', // plinth
    y: '#fee761', // spark
    Y: '#feae34', // spark edge
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '.y.......Y.',
      '..Y.kkk.y..',
      '...kWSsk...',
      '...kSssDk..',
      '....kDDk...',
      ...COIL,
    ],
    [
      'y.Y.yWy.Y.y',
      '.yWykkkyWy.',
      'YykkWWSkkyY',
      '.yykSWsDky.',
      'Y.y.kDDky.Y',
      ...COIL,
    ],
    [
      '....kkk....',
      '...ksDDk...',
      '...kDDEEk..',
      '....kEEk...',
      ...COIL,
    ],
  ],
};

export default stormCoil;
