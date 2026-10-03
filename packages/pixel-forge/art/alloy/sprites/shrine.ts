import type { CodeSprite } from '../../../src/draw';

/** Shrine (prop, size 1.4): a small stone altar under a glowing mana crystal; spent, the crystal is dark and cracked. */
const shrine: CodeSprite = {
  size: 22,
  legend: {
    k: '#181425', // outline
    S: '#8b9bb4', // stone, lit
    s: '#5a6988', // stone
    d: '#3a4466', // stone shade
    W: '#ffffff', // crystal glint
    C: '#2ce8f5', // crystal
    c: '#0099db', // crystal shade
    b: '#124e89', // crystal deep
    n: '#5a6988', // spent crystal, lit
    D: '#3a4466', // spent crystal
    e: '#262b44', // spent crystal shade
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '..C.....kk........',
      '.......kWck.......',
      '......kWCcck....C.',
      '.....kCWCccbk.....',
      '.c...kCCCccbk.....',
      '.....kCCcccbk...c.',
      '......kCccbk......',
      '...C...kcbk.......',
      '........kk........',
      '..kkkkkkkkkkkkkk..',
      '.kSSSSScCCcSSSSSk.',
      'kSSSSSSSccSSSSSSSk',
      'kssssssssssssssssk',
      'kkkkkkkkkkkkkkkkkk',
      '...kssssssssddk...',
      '...ksssCcsssddk...',
      '...kssscCsssddk...',
      '...kssssssssddk...',
      '.kkkkkkkkkkkkkkkk.',
      'kSSSSSSSSSSSSSSSdk',
      'kssssssssssssssddk',
      'kkkkkkkkkkkkkkkkkk',
    ],
    [
      '........kk........',
      '.......knDk.......',
      '......knDDek......',
      '.....kDnkDeek.....',
      '.....kDDDkeek.....',
      '.....kDDDekek.....',
      '......kDDeek......',
      '.......kDek.......',
      '........kk........',
      '..kkkkkkkkkkkkkk..',
      '.kSSSSSSSSSSSSSSk.',
      'kSSSSSSSSSSSSSSSSk',
      'kssssssssssssssssk',
      'kkkkkkkkkkkkkkkkkk',
      '...kssssssssddk...',
      '...ksssddsssddk...',
      '...kssssdsssddk...',
      '...kssssssssddk...',
      '.kkkkkkkkkkkkkkkk.',
      'kSSSSSSSSSSSSSSSdk',
      'kssssssssssssssddk',
      'kkkkkkkkkkkkkkkkkk',
    ],
  ],
};

export default shrine;
