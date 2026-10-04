import { describe, it, expect, beforeEach } from 'vitest';
import { bankWorld, stepWorld, type ArpgWorld } from '@alloy/engine';
import { startFloor } from '../arena/useArena';
import { getDelveRegistry } from '../registry';
import { useDelveStore } from '@/stores/delveStore';

// A guided depth is always built from its entry (see the tutorial spec's retry): a reload, an HMR
// or a Resume mid-floor can't strand a one-shot step (a set drop, the chest, the shrine).

const registry = getDelveRegistry();
const s = () => useDelveStore.getState();
/** Foe `spawn` at the hero's side on its last life, and the fight run until it falls. */
function kill(w: ArpgWorld, spawn: string): void {
  const m = w.monsters.find((x) => x.spawnId === spawn)!;
  Object.assign(m, { x: w.hero.x + 0.8, y: w.hero.y, hp: 1 });
  for (let i = 0; i < 90 && w.monsters.includes(m); i++)
    stepWorld(registry, w, { move: { x: 0, y: 0 } }, 1 / 30);
}
const items = (w: ArpgWorld) => w.drops.filter((d) => d.kind === 'item').length;

describe("a guided depth's world", () => {
  beforeEach(() => {
    localStorage.clear();
    s().resetProfile(1234, 'fire');
    s().startTutorial();
    expect(s().startDive(1)).toBe(true);
  });

  it('starts again from the entry after a bank: the set drop drops again', () => {
    const w = startFloor(registry);
    kill(w, 'rat3');
    expect(items(w)).toBe(1);
    s().setProfile(bankWorld(registry, s().profile, w).profile);
    expect(s().profile.dive!.dropsGiven).toHaveLength(1);
    // The page comes back (a reload): the floor is the depth as it was entered.
    const again = startFloor(registry);
    expect(s().profile.dive!.dropsGiven).toEqual([]);
    kill(again, 'rat3');
    expect(items(again)).toBe(1);
  });

  it('leaves a fresh entry as it is, and an ordinary floor alone', () => {
    const entered = s().profile;
    startFloor(registry);
    expect(s().profile).toEqual(entered);
    s().skipTutorial();
    const skipped = s().profile;
    startFloor(registry);
    expect(s().profile).toBe(skipped);
  });
});
