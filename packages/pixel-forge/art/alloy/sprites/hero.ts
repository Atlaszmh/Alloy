import type { CodeSprite } from '../../../src/draw';

/** The hero: a battle-mage in a violet hood with a staff tipped by a glowing orb. */
const hero: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425',
    H: '#68386c',
    h: '#b55088',
    f: '#e8b796',
    F: '#c28569',
    r: '#3a4466',
    R: '#262b44',
    l: '#5a6988',
    g: '#feae34',
    w: '#733e39',
    O: '#ffffff',
    o: '#2ce8f5',
    b: '#3e2731',
  },
  frames: [
    [
      '....kkkk...kk.',
      '...kHhhHk.kOok',
      '..kHhhhhHkkook',
      '..kHhHHhHk.kk.',
      '.kHHffffHHkkwk',
      '.kHfkffkfHkkwk',
      '.kHffffFFHkkwk',
      '..kHFFFFHk.kwk',
      '.krrRggRrrkfwk',
      'krrrRggRrrrkwk',
      'krlrRggRrrrkwk',
      'krlrRggRrrrkwk',
      '.krrRggRrrkkwk',
      '.kRRRRRRRRk.kk',
      '..kbbk.kbbk...',
      '..kkkk.kkkk...',
    ],
  ],
};

export default hero;
