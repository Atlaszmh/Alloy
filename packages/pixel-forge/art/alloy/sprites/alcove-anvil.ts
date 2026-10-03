import type { CodeSprite } from '../../../src/draw';

/** Alcove anvil (prop, size 1.4): a steel anvil on a stone plinth, a hot ingot on it; the glow and the sparks flicker. */
const anvil = [
  '...........kkkkk....',
  '.......kkkkkyggkkkk.',
  '...kkkkmmmmmGGGmmmk.',
  '..kMMMMMMMMMMMMMMMk.',
  '...kkknMMMMMMMMMnnk.',
  '......knnMMMMMnnk...',
  '.......knnnnnnnk....',
  '.......kNnnnnnNk....',
  '......knnnnnnnnnk...',
  '.....kNNNNNNNNNNNk..',
];
const plinth = [
  'kkkkkkkkkkkkkkkkkkkk',
  'kPPPooooooooooooPPPk',
  'kppppppppppppppppppk',
  'kppppqppppppqpppppqk',
  'kqqqqqqqqqqqqqqqqqqk',
  'kpppppppqppGpppppppk',
  'kkkkkkkkkkkkkkkkkkkk',
];

const alcoveAnvil: CodeSprite = {
  size: 22,
  legend: {
    k: '#181425', // outline
    m: '#c0cbdc', // steel, lit
    M: '#8b9bb4', // steel
    n: '#5a6988', // steel shade
    N: '#3a4466', // steel deep
    y: '#fee761', // ingot, white-hot
    g: '#feae34', // ingot
    G: '#f77622', // ember
    o: '#be4a2f', // glow on the plinth
    O: '#d77643', // glow, flaring
    P: '#5a6988', // plinth, lit
    p: '#3a4466', // plinth
    q: '#262b44', // mortar
  },
  idle: 'none',
  // prettier-ignore
  frames: [
    [
      '............y.......',
      '..........g.........',
      '.............G......',
      ...anvil,
      ...plinth,
    ],
    [
      '..........G.....g...',
      '..............y.....',
      '...........g........',
      ...anvil.map((r) => r.replace('ygg', 'gyy').replace('GGG', 'GgG')),
      ...plinth.map((r) => r.replaceAll('o', 'O').replace('G', 'g')),
    ],
  ],
};

export default alcoveAnvil;
