import type { CodeSprite } from '../../../src/draw';

/**
 * Spore pod (nature hazard, radius 0.4, size 0.8): a spotted bulb on a stalk among leaves.
 * Frames by state: ready, primed (swollen, its spots glowing), dormant (shrivelled).
 */
const LEAVES = ['.kGkkgkkGk.', 'kGgGkgkGgGk', 'kkkkkkkkkkk'];

const sporePod: CodeSprite = {
  size: 13,
  legend: {
    k: '#181425', // outline
    L: '#63c74d', // pod, lit
    g: '#3e8948', // pod
    G: '#265c42', // pod shade, leaves
    s: '#ead4aa', // spot
    y: '#fee761', // glowing spot
    Y: '#feae34', // glow edge
    d: '#193c3e', // shrivelled shade
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '....kkk....',
      '...kLLgk...',
      '..kLsLggk..',
      '..kLLgsGk..',
      '..kLggggk..',
      '...kgsGk...',
      '....kgk....',
      ...LEAVES,
    ],
    [
      '.y..kkk..y.',
      '...kLyLk...',
      '..kLyLLgk..',
      '.kLLLgyggk.',
      '.kyLggggyk.',
      '.kLgyggGGk.',
      '..kgggyGk..',
      '...kkgkk...',
      ...LEAVES,
    ],
    [
      '...kkk.....',
      '..kGgGk....',
      '..kgdGdk...',
      '...kGdk....',
      '....kGk....',
      ...LEAVES,
    ],
  ],
};

export default sporePod;
