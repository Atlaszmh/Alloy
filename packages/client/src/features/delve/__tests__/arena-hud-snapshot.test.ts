import { describe, it, expect } from 'vitest';
import { beginFloor, createDelveProfile, setAbility, startDive, stepWorld } from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const STEP = registry.getDelveBalance().arena.step;

describe('arena HUD snapshot', () => {
  it('a channelled ability dims the buttons only once its channel starts, not in its conjure', () => {
    let p = createDelveProfile(registry, 99);
    p = setAbility(registry, p, 'primary', {
      form: 'bolt',
      elements: ['fire'],
      weight: 0,
      payment: 'cast',
    });
    const w = beginFloor(registry, startDive(registry, p, 1));
    w.hero.nextAttackAt = 1e9;
    stepWorld(registry, w, { move: { x: 0, y: 0 }, cast: { slot: 0, aim: null } }, STEP);
    const wu = w.hero.windup!;
    expect(w.t).toBeLessThan(wu.conjureUntil);
    let hud = snapshot(w);
    expect(hud.busy).toBe(false);
    expect(hud.abilities[1].ready).toBe(true);
    while (w.t < wu.conjureUntil) stepWorld(registry, w, { move: { x: 0, y: 0 } }, STEP);
    hud = snapshot(w);
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1].ready).toBe(false);
  });
});
