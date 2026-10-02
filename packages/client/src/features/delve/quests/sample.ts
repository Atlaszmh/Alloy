import type { QuestView } from './types';

/** The dev preview's quests (localStorage `alloy:delve:questPreview` = "1"): the Quests board's fixture. */
export const SAMPLE_QUESTS: QuestView[] = [
  {
    id: 'frozen-foreman',
    kind: 'main',
    name: 'The Frozen Foreman',
    sub: 'Chapter 1 · Frostvault',
    chapter: 'Chapter 1',
    story:
      'The Frostvault iced over in a single night, with Foreman Grask still inside. The miners want their foreman back, or at least the keys he carried.',
    giver: 'foreman_grask',
    objectives: [
      { id: 'reach', text: 'Reach the Frostvault', hint: 'Depth 6 or deeper', done: true },
      {
        id: 'descend',
        text: 'Descend to depth 8',
        hint: 'In one dive',
        done: false,
        progress: { value: 6, max: 8 },
      },
      {
        id: 'grask',
        text: 'Defeat Foreman Grask',
        hint: 'Waits at depth 8',
        done: false,
        progress: { value: 0, max: 1 },
      },
    ],
    rewards: [
      { id: 'links', name: '3 Links', sub: 'For slots and sockets', color: '#2ce8f5' },
      { id: 'echo', name: 'Rune · Echo III', sub: 'To your pouch', color: '#feae34' },
    ],
    tracked: true,
  },
  {
    id: 'kindling',
    kind: 'side',
    name: 'Kindling',
    sub: 'Set off Melt 20 times',
    objectives: [
      { id: 'melt', text: 'Set off Melt', done: false, progress: { value: 12, max: 20 } },
    ],
    rewards: [
      { id: 'dust', name: '10 Mana Dust', sub: 'For edits and re-attuning', color: '#e8b796' },
    ],
    tracked: true,
  },
  {
    id: 'deep-roots',
    kind: 'side',
    name: 'Deep Roots',
    sub: 'Set off Seedling 5 times',
    objectives: [
      { id: 'seed', text: 'Set off Seedling', done: false, progress: { value: 1, max: 5 } },
    ],
    rewards: [{ id: 'links', name: '1 Link', sub: 'For slots and sockets', color: '#2ce8f5' }],
    tracked: false,
  },
  {
    id: 'rat-catcher',
    kind: 'bounty',
    name: 'Rat Catcher',
    sub: 'Refreshes each day',
    objectives: [
      { id: 'rats', text: 'Slay mine rats', done: false, progress: { value: 4, max: 30 } },
    ],
    rewards: [{ id: 'scrap', name: '200 scrap', sub: 'To your purse', color: '#c0cbdc' }],
    tracked: false,
  },
];
