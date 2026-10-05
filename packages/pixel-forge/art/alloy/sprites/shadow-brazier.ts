import type { CodeSprite } from '../../../src/draw';

/**
 * Shadow brazier (shadow hazard, radius 0.4, size 0.8): a crypt-stone bowl on a pillar burning
 * violet. Frames by state: ready, primed (flaring pale), dormant (cold ash).
 */
const BASE = [
  'kSSSSSSSssk',
  '.kssssssdk.',
  '..kkssdkk..',
  '...ksddk...',
  '...kSsdk...',
  '..kSssddk..',
  '.kkkkkkkkk.',
];

const shadowBrazier: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    S: '#5a6988', // stone, lit
    s: '#3a4466', // stone
    d: '#262b44', // stone shade
    V: '#68386c', // flame edge
    v: '#b55088', // flame
    p: '#f6757a', // flame core
    W: '#ffffff', // pale heat
    a: '#5a6988', // ash
    e: '#68386c', // ember
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '.....V.....',
      '....VvV....',
      '.V.VvpvV...',
      '..VvppvV.V.',
      '.kvpppppvk.',
      ...BASE,
    ],
    [
      '.V..vpv..V.',
      '..VvpWpvV..',
      '.VvpWWWpvV.',
      'VvpWWWWWpvV',
      'kvppWWWppvk',
      ...BASE,
    ],
    [
      '.kaeaaaeak.',
      ...BASE,
    ],
  ],
};

export default shadowBrazier;
