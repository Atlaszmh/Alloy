import { describe, it, expect } from 'vitest';
import {
  beginFloor,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultChains,
  setChain,
  startDive,
  stepWorld,
  type Chains,
  type HeroStatsExtra,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { getDelveRegistry } from '../registry';

const registry = getDelveRegistry();
const STEP = registry.getDelveBalance().arena.step;
const still = { x: 0, y: 0 };

/** An empty sandbox arena, unarmed, with these chains over Fire's defaults. */
function sandbox(over: Partial<Chains> = {}, extra: HeroStatsExtra = {}, infiniteMana = false) {
  return createSandboxWorld(registry, {
    depth: 5,
    stats: computeHeroStats({}, registry, extra),
    chains: { ...defaultChains(registry, 'fire', null), ...over },
    toggles: { infiniteMana, noCooldowns: false, invulnerable: false },
  });
}

describe('arena HUD snapshot', () => {
  it('a channelled ability dims the buttons only once its channel starts, not in its conjure', () => {
    let p = createDelveProfile(registry, 99);
    p = setChain(registry, p, 'primary', {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }],
      payment: 'cast',
    });
    const w = beginFloor(registry, startDive(registry, p, 1));
    w.hero.nextAttackAt = 1e9;
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim: null } }, STEP);
    const wu = w.hero.windup!;
    expect(w.t).toBeLessThan(wu.conjureUntil);
    let hud = snapshot(w);
    expect(hud.busy).toBe(false);
    expect(hud.abilities[1].ready).toBe(true);
    while (w.t < wu.conjureUntil) stepWorld(registry, w, { move: still }, STEP);
    hud = snapshot(w);
    expect(hud.busy).toBe(true);
    expect(hud.abilities[0].windup).toBeGreaterThanOrEqual(0);
    expect(hud.abilities[1].ready).toBe(false);
  });

  it('under Infinite mana a move dearer than the whole pool shows as affordable, as the engine casts it', () => {
    const ultimate = {
      moves: [{ kind: 'heavy' as const, form: 'nova' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    const on = sandbox({ ultimate }, {}, true);
    expect(on.hero.chains[2].moves[0].cost).toBeGreaterThan(on.hero.manaMax);
    expect(snapshot(on).abilities[2].affordable).toBe(true);
    const off = sandbox({ ultimate });
    off.hero.mana = off.hero.manaMax;
    expect(snapshot(off).abilities[2].affordable).toBe(false);
  });

  it("shows each chain's next move: its name, kind and step, its own cooldown, and a hold's charge", () => {
    const w = sandbox({
      primary: {
        moves: [
          { kind: 'light', form: 'bolt', elements: ['fire'] },
          { kind: 'hold', form: 'lance', elements: ['frost'] },
        ],
        payment: 'mana',
      },
    });
    let hud = snapshot(w);
    expect(hud.abilities[0]).toMatchObject({
      name: 'Fire Bolt',
      nextKind: 'light',
      chainStep: 0,
      chainLength: 2,
      hold: null,
    });
    // The light Bolt landed: the next press is the held Lance, on its own cooldown.
    w.hero.comboStep[0] = 0;
    w.hero.comboAt[0] = w.t;
    w.hero.cooldowns[0][0] = w.t + 5;
    hud = snapshot(w);
    expect(hud.abilities[0]).toMatchObject({
      name: 'Frost Lance',
      nextKind: 'hold',
      chainStep: 1,
      cooldown: 0,
    });
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    hud = snapshot(w);
    expect(hud.abilities[0].hold!.charge).toBeCloseTo(0.5, 1);
    expect(hud.abilities[0].hold!.stage).toBe(1);
    expect(hud.abilities[0].chainStep).toBe(1); // the window waits for the release
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1].ready).toBe(false);
  });

  it("shows the basic chain's next blow and a manual hold blow's charge", () => {
    const sword = sandbox();
    expect(snapshot(sword)).toMatchObject({
      basicChainStep: 0,
      basicChainLength: sword.hero.stats.weapon.blows.length,
      basicNextKind: sword.hero.stats.weapon.blows[0].kind,
      basicHold: null,
    });
    const w = sandbox({}, { basic: [{ kind: 'hold', element: 'fire' }] });
    for (let i = 0; i < 90 && (w.hero.swing?.held ?? null) === null; i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    for (let i = 0; i < Math.round(0.5 / STEP); i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    const hud = snapshot(w);
    expect(hud.basicNextKind).toBe('hold');
    expect(hud.basicHold!.stage).toBe(1);
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
