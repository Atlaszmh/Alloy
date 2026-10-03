import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { questStates, type QuestState } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../../registry';
import { RARITY_COLOR } from '../../format';
import { questView } from '../quest-view';
import { useQuests } from '../useQuests';

// The engine's quests (B1 fills `questStates`): each test says what it gives.
vi.mock('@alloy/engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@alloy/engine')>()),
  questStates: vi.fn(() => []),
}));

const registry = getDelveRegistry();
/** A main quest under way, as `questStates` gives it. */
const FIRST: QuestState = {
  id: 'first_steps',
  kind: 'main',
  status: 'active',
  isNew: true,
  tracked: true,
  name: 'First Steps',
  line: 'Go down a little way.',
  chapter: 'Embers of the Anvil',
  objectives: [{ id: 'depth', text: 'Reach depth 2', value: 1, count: 2, done: false }],
  rewards: [
    { ref: { kind: 'metal', metal: 'iron' }, count: 3 },
    { ref: { kind: 'scrap' }, count: 40 },
    { ref: { kind: 'pattern', pattern: 'maul' }, count: 1 },
    { rule: { kind: 'shard', family: 'offense', tier: 3, count: 1 } },
  ],
};

describe('questView', () => {
  it('draws an engine quest: Hesta gives it, her line its story, each reward named', () => {
    expect(questView(registry, FIRST)).toEqual({
      id: 'first_steps',
      kind: 'main',
      name: 'First Steps',
      sub: 'Embers of the Anvil',
      chapter: 'Embers of the Anvil',
      story: 'Go down a little way.',
      giver: 'hesta',
      objectives: [
        { id: 'depth', text: 'Reach depth 2', done: false, progress: { value: 1, max: 2 } },
      ],
      rewards: [
        { id: '0', name: '3 × Iron bar', color: '#8b9bb4' },
        { id: '1', name: '40 scrap', color: '#fcd34d' },
        { id: '2', name: 'Maul pattern', color: '#c0cbdc' },
        {
          id: '3',
          name: 'A tier III offense shard',
          sub: 'Chosen when you claim it',
          color: '#e43b44',
        },
      ],
      tracked: true,
      status: 'active',
      isNew: true,
    });
  });

  it('a quest with no chapter reads its first objective under its name', () => {
    const side: QuestState = { ...FIRST, kind: 'side', chapter: undefined };
    expect(questView(registry, side).sub).toBe('Reach depth 2');
  });

  it('names each rule reward by what it will be, and carries a complete quest as seen', () => {
    const rules: QuestState = {
      ...FIRST,
      status: 'complete',
      isNew: false,
      rewards: [
        { rule: { kind: 'metal', id: 'depth', count: 3 } },
        { rule: { kind: 'shard', family: 'defense', tier: 2, count: 2 } },
        { rule: { kind: 'essence', id: 'fit', count: 1 } },
        {
          rule: { kind: 'pattern', id: 'unknown', count: 1, fallback: { kind: 'dust', count: 20 } },
        },
      ],
    };
    const view = questView(registry, rules);
    expect(view).toMatchObject({ status: 'complete', isNew: false });
    expect(view.rewards.map((r) => [r.name, r.sub, r.color])).toEqual([
      ['3 bars of your deepest metal', 'Chosen when you claim it', '#c0cbdc'],
      ['2 tier II defense shards', 'Chosen when you claim it', '#0099db'],
      ['An essence for a pattern you know', 'Chosen when you claim it', RARITY_COLOR.legendary],
      ["A pattern you don't know yet", 'Chosen when you claim it', '#c0cbdc'],
    ]);
  });
});

describe('useQuests', () => {
  const trackQuest = useDelveStore.getState().trackQuest;
  afterEach(() => useDelveStore.setState({ trackQuest }));

  it("reads the engine's quests for the profile, and tracks through the store", () => {
    vi.mocked(questStates).mockReturnValue([FIRST]);
    const track = vi.fn();
    useDelveStore.setState({ trackQuest: track });
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([questView(registry, FIRST)]);
    expect(questStates).toHaveBeenLastCalledWith(registry, useDelveStore.getState().profile);
    act(() => result.current.setTracked('first_steps', false));
    expect(track).toHaveBeenCalledWith('first_steps', false);
  });

  it('has none while the engine has none', () => {
    vi.mocked(questStates).mockReturnValue([]);
    const { result } = renderHook(() => useQuests());
    expect(result.current.quests).toEqual([]);
  });
});
