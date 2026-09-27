import type { CodeSprite } from '../../../src/draw';

/** Training Dummy: a straw dummy on a post with a target on its chest; its sack head sways. */
const dummy: CodeSprite = {
  size: 16,
  legend: {
    k: '#181425', // outline
    S: '#e4a672', // burlap
    s: '#feae34', // straw
    b: '#b86f50', // burlap shade
    t: '#c28569', // rope
    r: '#e43b44', // target red
    o: '#ffffff', // target white
    w: '#733e39', // post
    W: '#3e2731', // base
  },
  // prettier-ignore
  frames: [
    [
      '....kkkkk....',
      '...kSSSSbk...',
      '...kSkSkbk...',
      '...kSSSSbk...',
      '....kbSbk....',
      'kkkkktttkkkkk',
      'kssSSrrrSbssk',
      'kkkSrooorbkkk',
      '..kSrororbk..',
      '..kSrooorbk..',
      '..kSSrrrSbk..',
      '..kSsSSsSbk..',
      '...kSSsSbk...',
      '....kkwkk....',
      '.....kwk.....',
      '...kWWwWWk...',
    ],
    [
      '.....kkkkk....',
      '....kSSSSbk...',
      '....kSkSkbk...',
      '....kSSSSbk...',
      '.....kbSbk....',
      'kkkkktttkkkkk.',
      'kssSSrrrSbssk.',
      'kkkSrooorbkkk.',
      '..kSrororbk...',
      '..kSrooorbk...',
      '..kSSrrrSbk...',
      '..kSsSSsSbk...',
      '...kSSsSbk....',
      '....kkwkk.....',
      '.....kwk......',
      '...kWWwWWk....',
    ],
  ],
};

export default dummy;
