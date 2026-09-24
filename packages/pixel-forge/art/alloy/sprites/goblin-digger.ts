import type { CodeSprite } from '../../../src/draw';

/** Goblin Slinger: a scrawny goblin in a leather cap with a pouch of glowing coals. */
const goblin: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425',
    c: '#733e39',
    C: '#b86f50',
    g: '#63c74d',
    G: '#3e8948',
    y: '#fee761',
    t: '#be4a2f',
    T: '#a22633',
    o: '#f77622',
    s: '#8b9bb4',
  },
  frames: [
    [
      '.....kkkk.....',
      '....kCCcck....',
      '...kCCcccck...',
      'kk.kkkkkkkk.kk',
      'kGkkgggggGkkGk',
      '.kGgykgykgGGk.',
      '..kgggggggGk..',
      '...kGkkkGGk.k.',
      '..ktTttttTk.ks',
      '.kgtTttttTgkks',
      '.kgkTttttkok..',
      '..k.kTttTkook.',
      '....kttttkkk..',
      '...kGk.kGk....',
      '...kkk.kkk....',
    ],
  ],
};

export default goblin;
