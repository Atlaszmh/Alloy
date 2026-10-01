import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/utils/sound-manager', () => ({ playSound: vi.fn() }));
vi.mock('@/shared/utils/haptics', () => ({ vibrate: vi.fn() }));
vi.mock('@/components/Toast', () => ({ showToast: vi.fn() }));

import { playSound } from '@/shared/utils/sound-manager';
import { vibrate } from '@/shared/utils/haptics';
import { showToast } from '@/components/Toast';
import { noManaToaster, playArenaEvents } from '../arena/arena-sounds';

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
