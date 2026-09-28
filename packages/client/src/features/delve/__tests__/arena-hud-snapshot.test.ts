import { describe, it, expect } from 'vitest';
import {
  beginFloor,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultAbilities,
  setAbility,
  startDive,
  stepWorld,
} from '@alloy/engine';
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

  it('under Infinite mana an ability dearer than the whole pool shows as affordable, as the engine casts it', () => {
    const make = (infiniteMana: boolean) =>
      createSandboxWorld(registry, {
        depth: 5,
        stats: computeHeroStats({}, registry),
        abilities: {
          ...defaultAbilities('fire'),
          ultimate: { form: 'nova', elements: ['fire'], weight: 2, payment: 'mana' },
        },
        toggles: { infiniteMana, noCooldowns: false, invulnerable: false },
      });
    const on = make(true);
    expect(on.hero.abilities[2].cost).toBeGreaterThan(on.hero.manaMax);
    expect(snapshot(on).abilities[2].affordable).toBe(true);
    const off = make(false);
    off.hero.mana = off.hero.manaMax;
    expect(snapshot(off).abilities[2].affordable).toBe(false);
  });

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    expect(snapshot(w)).toMatchObject({ barrier: null, galvanizedAt: null, t: w.t });
    w.t = 3;
    w.hero.barrier = { hp: 5, max: 8, until: 7 };
    w.hero.reactionReadyAt.galvanize = 2.5;
    const cooldown = registry.getDelveBalance().reactions.reactionCooldown;
    expect(snapshot(w)).toMatchObject({
      barrier: { hp: 5, max: 8 },
      galvanizedAt: 2.5 - cooldown,
      t: 3,
    });
  });
});
