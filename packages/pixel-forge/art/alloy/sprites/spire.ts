import type { CodeSprite } from '../../../src/draw';

/** Obsidian spire (a cover look, one cell, size 1): a jagged black glass spike with a molten seam. */
const spire: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    G: '#b55088', // glassy sheen
    o: '#3a4466', // obsidian, lit
    O: '#262b44', // obsidian
    l: '#f77622', // molten seam
    L: '#feae34', // seam heart
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '....k.....',
      '...kGk....',
      '...kGOk...',
      '...koOk...',
      '..kGoOk...',
      '..koOlk.k.',
      '..koOLOkGk',
      '.kGoOlOkok',
      '.koOOlOkOk',
      '.koOlOOkOk',
      'kGoOLOOOOk',
      'koOOlOOOOk',
      'koOlOOOOOk',
      'kooOlOOOOk',
      '.kkkkkkkk.',
    ],
  ],
};

export default spire;
