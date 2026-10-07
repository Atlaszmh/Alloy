import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/utils/sound-manager', () => ({ playSound: vi.fn() }));
vi.mock('@/shared/utils/haptics', () => ({ vibrate: vi.fn() }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { ECHO_GAIN, lootCues, noManaToaster, playArenaEvents } from '../arena/arena-sounds';
import {
  computeHeroStats,
  createSandboxWorld,
  defaultChains,
  generateItem,
  SeededRNG,
  type Drop,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';

describe('arena sounds', () => {
  beforeEach(() => vi.clearAllMocks());

  it("plays each event's sound and haptic", () => {
    playArenaEvents([
      {
        kind: 'hit',
        id: 1,
        x: 0,
        y: 0,
        amount: 5,
        crit: true,
        element: null,
        heft: 0,
        source: 'basic',
      },
      { kind: 'perfectDodge', x: 0, y: 0 },
    ]);
    expect(playSound).toHaveBeenCalledWith('crit');
    expect(playSound).toHaveBeenCalledWith('synergyActivate');
    expect(vibrate).toHaveBeenCalledWith('light');
    expect(vibrate).toHaveBeenCalledWith('success');
  });

  it("an echo's hit plays its sound at half volume and doesn't buzz", () => {
    const hit = {
      kind: 'hit',
      id: 1,
      x: 0,
      y: 0,
      amount: 5,
      element: null,
      heft: 1,
      source: 'basic',
      echo: true,
    } as const;
    playArenaEvents([
      { ...hit, crit: true },
      { ...hit, crit: false },
    ]);
    expect(playSound).toHaveBeenCalledWith('crit', ECHO_GAIN);
    expect(playSound).toHaveBeenCalledWith('attack', ECHO_GAIN);
    expect(ECHO_GAIN).toBe(0.5);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("Obsidian's barrier breaks with a socket's pop", () => {
    playArenaEvents([{ kind: 'barrierBreak', x: 0, y: 0 }]);
    expect(playSound).toHaveBeenCalledWith('orbRemove');
  });

  it('a hit Invulnerable blocked makes no hurt sound and no buzz', () => {
    playArenaEvents([
      { kind: 'heroHit', x: 0, y: 0, amount: 9, dodged: false, element: null, blocked: true },
    ]);
    expect(playSound).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('says "not enough mana" at most every 1.5 s', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(10_000);
    const toast = noManaToaster();
    toast('Fire Bolt');
    toast('Fire Bolt');
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith('Not enough mana for Fire Bolt');
    now.mockReturnValue(11_600);
    toast();
    expect(showToast).toHaveBeenLastCalledWith('Not enough mana');
    now.mockRestore();
  });
});

describe('rune sounds', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a rune drops with the loot sound and is picked up with its own', () => {
    playArenaEvents([{ kind: 'drop', dropId: 1, x: 0, y: 0, dropKind: 'rune' }]);
    expect(playSound).toHaveBeenLastCalledWith('lootDrop');
    playArenaEvents([
      { kind: 'pickup', dropId: 1, dropKind: 'rune', amount: 0, rune: { id: 'split', tier: 3 } },
    ]);
    expect(playSound).toHaveBeenLastCalledWith('upgradeTier');
  });
});

describe("the room objects' sounds", () => {
  beforeEach(() => vi.clearAllMocks());

  it('a hazard ticks as it is set off and slams as it bursts; debris scatters; a slam thuds', () => {
    const at = { x: 0, y: 0 };
    const hazard = { id: 1, hazard: 'brazier', element: 'fire' as const, ...at, radius: 2.5 };
    playArenaEvents([
      { kind: 'hazardPrime', ...hazard, fuse: 0.4 },
      { kind: 'hazardBurst', ...hazard },
      { kind: 'crumble', structure: 0, cells: [at] },
      { kind: 'propBreak', id: 2, prop: 'crate', ...at },
      { kind: 'wallSlam', id: 3, ...at },
      { kind: 'chargeStun', id: 4, ...at },
    ]);
    expect(vi.mocked(playSound).mock.calls.map(([s]) => s)).toEqual([
      'orbSelect',
      'forgeSlam',
      'forgeSlam',
      'gemScatter',
      'combineFail',
      'combineFail',
    ]);
    expect(vi.mocked(vibrate).mock.calls.map(([v]) => v)).toEqual(['medium', 'medium']);
  });
});

describe('loot cues', () => {
  beforeEach(() => vi.clearAllMocks());
  const registry = getDelveRegistry();
  const world = () =>
    createSandboxWorld(registry, {
      depth: 5,
      stats: computeHeroStats({}, registry),
      chains: defaultChains(registry, 'fire', null),
      toggles: { infiniteMana: false, noCooldowns: false, invulnerable: false },
    });
  const drop = (id: number, over: Partial<Drop>): Drop => ({
    id,
    kind: 'material',
    x: 1,
    y: 1,
    amount: 1,
    born: 0,
    vacuum: false,
    dead: false,
    ...over,
  });
  const fell = (id: number, dropKind: Drop['kind'], rarity?: 'rare') =>
    ({ kind: 'drop', dropId: id, x: 1, y: 1, dropKind, rarity }) as const;

  it("finds this frame's essences and upgrades in the world's drops, by drop id", () => {
    const w = world();
    const item = (uid: string, slot: 'helm' | 'boots', seed: number) =>
      generateItem(registry, { uid, ilvl: 5, rarity: 'rare', slot, mana: 'fire' }, new SeededRNG(seed));
    w.drops.push(
      drop(1, { material: { kind: 'essence', essence: registry.getDelveData().legendaries[0].id } }),
      drop(2, { kind: 'item', item: item('h', 'helm', 1) }),
      drop(3, { kind: 'item', item: item('b', 'boots', 2) }),
      drop(4, { material: { kind: 'metal', metal: 'iron' } }),
    );
    const events = [fell(1, 'material'), fell(2, 'item', 'rare'), fell(3, 'item', 'rare'), fell(4, 'material')];
    expect(lootCues(w, events, (it) => it.uid === 'h')).toEqual({ 1: 'essence', 2: 'upgrade' });
    // No upgrade test (the Training Grounds): essences only.
    expect(lootCues(w, events)).toEqual({ 1: 'essence' });
  });

  it("an upgrade and an essence play their own sounds, in place of the rarity's", () => {
    playArenaEvents([fell(2, 'item', 'rare'), fell(1, 'material'), fell(3, 'item', 'rare')], {
      2: 'upgrade',
      1: 'essence',
    });
    expect(vi.mocked(playSound).mock.calls.map(([s]) => s)).toEqual([
      'lootUpgrade',
      'lootEssence',
      'lootRare',
    ]);
  });
});
