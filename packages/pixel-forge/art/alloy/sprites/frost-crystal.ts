import type { CodeSprite } from '../../../src/draw';

/**
 * Frost crystal (frost hazard, radius 0.4, size 0.8): ice spikes on a rock. Frames by state:
 * ready (glinting), primed (blazing white), dormant (dull and frosted over).
 */
const crystal = (W: string, C: string, c: string, b: string) => [
  '.....k......',
  `....k${W}k.....`,
  `....k${C}${c}k....`,
  `.k..k${C}${c}k....`,
  `k${W}k.k${C}${c}k..k.`,
  `k${C}${c}kk${C}${c}${b}kk${W}k`,
  `k${C}${c}k${W}${C}${c}${b}k${C}${b}k`,
  `.k${c}k${C}${C}${c}${b}k${c}k.`,
  `.k${c}${b}k${C}${c}${b}${c}${b}k.`,
  '.kRRRrrrrRk.',
  'kRrrrrrrrrrk',
  'kkkkkkkkkkkk',
];

const frostCrystal: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    W: '#ffffff', // glint
    C: '#2ce8f5', // ice, lit
    c: '#0099db', // ice
    b: '#124e89', // ice shade
    n: '#c0cbdc', // frosted, lit
    D: '#8b9bb4', // frosted
    d: '#5a6988', // frosted shade
    e: '#3a4466', // frosted deep
    R: '#5a6988', // rock, lit
    r: '#3a4466', // rock
  },
  idle: 'none',
  frames: [crystal('W', 'C', 'c', 'b'), crystal('W', 'W', 'C', 'c'), crystal('n', 'D', 'd', 'e')],
};

export default frostCrystal;
