import { describe, it, expect, vi } from 'vitest';
import {
  beginFloor,
  computeHeroStats,
  createDelveProfile,
  createSandboxWorld,
  defaultChains,
  defaultMoveset,
  hudMapOf,
  sandboxWeapon,
  startDive,
  stepWorld,
  type Chains,
  type Drop,
  type GearItem,
  type HeroStatsExtra,
  type HudMap,
  type MonsterEntity,
} from '@alloy/engine';
import { snapshot } from '../arena/useArena';
import { promptAfter, type PromptEvent } from '../arena/useArenaCore';
import { getDelveRegistry } from '../registry';
import { RARITY_COLOR } from '../format';
import { FAMILY_STYLE } from '../runes/rune-style';

// The floor flow's map (B3's) is a stub until it lands: each test says what it returns.
vi.mock('@alloy/engine', async (orig) => ({
  ...(await orig<typeof import('@alloy/engine')>()),
  hudMapOf: vi.fn(),
}));

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
    // A new hero whose sword is epic (all four skills), its Primary a cast Bolt.
    const p = createDelveProfile(registry, 99);
    const weapon = { ...p.equipped.weapon!, rarity: 'epic' as const };
    const moveset = defaultMoveset(registry, weapon, 'fire');
    moveset.chains.primary = {
      moves: [{ kind: 'medium', form: 'bolt', elements: ['fire'] }],
      payment: 'cast',
    };
    const armed = { ...p, equipped: { ...p.equipped, weapon: { ...weapon, moveset } } };
    const w = beginFloor(registry, startDive(registry, armed, 1));
    w.hero.nextAttackAt = 1e9;
    // Aimed: the start room holds no foe for an auto-aimed Bolt.
    const aim = { x: w.hero.x, y: w.hero.y - 3 };
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim } }, STEP);
    const wu = w.hero.windup!;
    expect(w.t).toBeLessThan(wu.conjureUntil);
    let hud = snapshot(w, null);
    expect(hud.busy).toBe(false);
    expect(hud.abilities[1]!.ready).toBe(true);
    while (w.t < wu.conjureUntil) stepWorld(registry, w, { move: still }, STEP);
    hud = snapshot(w, null);
    expect(hud.busy).toBe(true);
    expect(hud.abilities[0]!.windup).toBeGreaterThanOrEqual(0);
    expect(hud.abilities[1]!.ready).toBe(false);
  });

  it('under Infinite mana a move dearer than the whole pool shows as affordable, as the engine casts it', () => {
    const ultimate = {
      moves: [{ kind: 'heavy' as const, form: 'nova' as const, elements: ['fire' as const] }],
      payment: 'mana' as const,
    };
    const on = sandbox({ ultimate }, {}, true);
    expect(on.hero.chains[2]!.moves[0].cost).toBeGreaterThan(on.hero.manaMax);
    expect(snapshot(on, null).abilities[2]!.affordable).toBe(true);
    const off = sandbox({ ultimate });
    off.hero.mana = off.hero.manaMax;
    expect(snapshot(off, null).abilities[2]!.affordable).toBe(false);
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
    let hud = snapshot(w, null);
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
    hud = snapshot(w, null);
    expect(hud.abilities[0]).toMatchObject({
      name: 'Frost Lance',
      nextKind: 'hold',
      chainStep: 1,
      cooldown: 0,
    });
    for (let i = 0; i < Math.round(0.6 / STEP); i++)
      stepWorld(registry, w, { move: still, holding: 0 }, STEP);
    hud = snapshot(w, null);
    expect(hud.abilities[0]!.hold!.charge).toBeCloseTo(0.57, 1);
    expect(hud.abilities[0]!.hold!.stage).toBe(1);
    expect(hud.abilities[0]!.chainStep).toBe(1); // the window waits for the release
    expect(hud.busy).toBe(true);
    expect(hud.abilities[1]!.ready).toBe(false);
  });

  it("shows the basic chain's next blow and a manual hold blow's charge until it is let go", () => {
    const sword = sandbox();
    expect(snapshot(sword, null)).toMatchObject({
      basicChainStep: 0,
      basicChainLength: sword.hero.stats.weapon.blows.length,
      basicNextKind: sword.hero.stats.weapon.blows[0].kind,
      basicHold: null,
    });
    // A sword: its heavy row lunges minLeap or more further than its medium (unarmed's doesn't).
    const w = sandbox();
    const weapon = sandboxWeapon(registry, {
      baseId: 'sword',
      mana: 'fire',
      rarity: 'common',
      ilvl: 5,
    });
    w.hero.stats = computeHeroStats({ weapon }, registry, {
      basic: [{ kind: 'hold', element: 'fire' }],
    });
    for (let i = 0; i < 90 && (w.hero.swing?.held ?? null) === null; i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    for (let i = 0; i < Math.round(0.6 / STEP); i++)
      stepWorld(registry, w, { move: still, attack: true }, STEP);
    const hud = snapshot(w, null);
    expect(hud.basicNextKind).toBe('hold');
    expect(hud.basicHold!.stage).toBe(1);
    // Let go at stage 1: the sword's heavy lunges further than its medium, so it leaps first.
    stepWorld(registry, w, { move: still, attack: false }, STEP);
    expect(w.hero.swing).toMatchObject({ released: 1 });
    expect(snapshot(w, null).basicHold).toBeNull();
  });

  it("shows a slot's beat as its wait (the longer of it and the move's cooldown), flagged as a beat", () => {
    const w = sandbox();
    w.t = 10;
    w.hero.beatFrom[0] = 9.8;
    w.hero.beatUntil[0] = 10.4;
    let bolt = snapshot(w, null).abilities[0]!;
    expect(bolt).toMatchObject({ beat: true, ready: false });
    expect(bolt.cooldown).toBeCloseTo(0.4);
    expect(bolt.cooldownTotal).toBeCloseTo(0.6);
    // A cooldown that outlasts the beat shows instead, with its own length.
    w.hero.cooldowns[0][0] = 11;
    bolt = snapshot(w, null).abilities[0]!;
    expect(bolt).toMatchObject({ beat: false, cooldown: 1, ready: false });
    expect(bolt.cooldownTotal).toBeCloseTo(w.hero.chains[0]!.moves[0].cooldown);
    // Over, and the button is ready again.
    w.t = 11;
    expect(snapshot(w, null).abilities[0]).toMatchObject({ beat: false, cooldown: 0, ready: true });
  });

  it("a skill the weapon doesn't carry has no entry, and its slot keeps its place", () => {
    // A new hero's common sword: Basic and Primary only.
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    const hud = snapshot(w, null);
    expect(hud.abilities).toHaveLength(3);
    expect(hud.abilities[0]).toMatchObject({ name: 'Fire Bolt' });
    expect(hud.abilities[1]).toBeNull();
    expect(hud.abilities[2]).toBeNull();
  });

  it("carries Obsidian's barrier and when Galvanize last fired", () => {
    const w = beginFloor(registry, startDive(registry, createDelveProfile(registry, 99), 1));
    expect(snapshot(w, null)).toMatchObject({ barrier: null, galvanizedAt: null, t: w.t });
    w.t = 3;
    w.hero.barrier = { hp: 5, max: 8, until: 7 };
    w.hero.reactionReadyAt.galvanize = 2.5;
    const cooldown = registry.getDelveBalance().reactions.reactionCooldown;
    expect(snapshot(w, null)).toMatchObject({
      barrier: { hp: 5, max: 8 },
      galvanizedAt: 2.5 - cooldown,
      t: 3,
    });
  });
});

describe('arena HUD snapshot: buffs and the map', () => {
  it("lists the hero's timed buffs with their seconds left: Riposte, Quick and the barrier", () => {
    const w = sandbox();
    w.t = 10;
    expect(snapshot(w, null).buffs).toEqual([]);
    Object.assign(w.hero, {
      riposteUntil: 11,
      quickUntil: 10.5,
      barrier: { hp: 5, max: 8, until: 14 },
    });
    const bal = registry.getDelveBalance();
    expect(snapshot(w, null).buffs).toEqual([
      { id: 'riposte', left: 1, total: bal.dodge.riposteWindow },
      { id: 'quick', left: 0.5, total: bal.reactions.lightningRodDuration },
      { id: 'barrier', left: 4, total: null },
    ]);
    w.t = 12; // Riposte and Quick are over
    expect(snapshot(w, null).buffs.map((b) => b.id)).toEqual(['barrier']);
  });

  it("lists the shrines' blessings after them, the dive's then the floor's, by their shrine's name", () => {
    const w = sandbox();
    w.hero.floorBuffs = [{ shrine: 'vigor', effect: { damage: 0.2 } }];
    w.hero.diveBuffs = [{ shrine: 'devotion', effect: { damage: 0.1 } }];
    expect(snapshot(w, null).buffs).toEqual([
      { id: 'shrine', shrine: 'devotion', name: 'Shrine of Devotion', dive: true },
      { id: 'shrine', shrine: 'vigor', name: 'Shrine of Vigor', dive: false },
    ]);
  });

  it('maps the floor: the view (the arena with no renderer), the hero, foes by rank, loot by colour', () => {
    const w = sandbox();
    w.monsters.push({ x: 3, y: 4, kind: 'elite' } as MonsterEntity);
    const at = { born: 0, amount: 0, vacuum: false, dead: false };
    w.drops.push(
      { ...at, id: 1, kind: 'item', x: 5, y: 6, item: { rarity: 'rare' } as GearItem },
      { ...at, id: 2, kind: 'rune', x: 7, y: 8, rune: { id: 'split', tier: 1 } },
      { ...at, id: 3, kind: 'orb', x: 9, y: 9 } as Drop,
    );
    const map = snapshot(w, null).map;
    expect(map).toMatchObject({
      width: w.width,
      height: w.height,
      view: { left: 0, top: 0, right: w.width, bottom: w.height },
      hero: { x: w.hero.x, y: w.hero.y },
      foes: [{ x: 3, y: 4, rank: 'elite' }],
      drops: [
        { x: 5, y: 6, color: RARITY_COLOR.rare },
        { x: 7, y: 8, color: FAMILY_STYLE[registry.getRune('split').family].color },
      ],
      terrain: [],
    });
    const view = { left: 1, top: 2, right: 49, bottom: 29 };
    expect(snapshot(w, { viewRect: () => view }).map.view).toBe(view);
  });
});

describe('arena HUD snapshot: runes', () => {
  /** A rune's id by its name in the data. */
  const idOf = (name: string) => registry.getRunes().find((r) => r.name === name)!.id;

  it('carries the runes acting on each next move and on the next blow, never a dormant one', () => {
    const split = { id: idOf('Split'), tier: 3 as const };
    const widen = { id: idOf('Widen'), tier: 1 as const }; // doesn't fit a Bolt
    const chain = { id: idOf('Chain'), tier: 2 as const };
    const w = sandbox({
      primary: {
        moves: [{ kind: 'light', form: 'bolt', elements: ['fire'], runes: [split, widen, null] }],
        payment: 'mana',
      },
    });
    let hud = snapshot(w, null);
    expect(hud.abilities[0]!.runes).toEqual([split]);
    expect(hud.abilities[2]!.runes).toEqual([]);
    expect(hud.basicRunes).toEqual([]);
    // A sword's blow: Chain fits every weapon, Split only a bow's or a wand's.
    const weapon = sandboxWeapon(registry, {
      baseId: 'sword',
      mana: 'fire',
      rarity: 'common',
      ilvl: 5,
    });
    w.hero.stats = computeHeroStats({ weapon }, registry, {
      basic: [{ kind: 'light', element: 'fire', runes: [chain, split] }],
    });
    hud = snapshot(w, null);
    expect(hud.basicRunes).toEqual([chain]);
  });

  it("during a slot's wind-up, its button names the move after it, runes and all", () => {
    const split = { id: idOf('Split'), tier: 1 as const };
    const w = sandbox({
      primary: {
        moves: [
          { kind: 'light', form: 'bolt', elements: ['fire'] },
          { kind: 'light', form: 'bolt', elements: ['frost'], runes: [split] },
        ],
        payment: 'cast',
      },
    });
    // No foe to auto-aim at in an empty sandbox: aim by hand.
    const aim = { x: w.hero.x + 3, y: w.hero.y };
    stepWorld(registry, w, { move: still, cast: { slot: 0, aim } }, STEP);
    expect(w.hero.windup).toMatchObject({ slot: 0, step: 0 });
    expect(snapshot(w, null).abilities[0]).toMatchObject({
      name: 'Frost Bolt',
      chainStep: 1,
      runes: [split],
    });
  });
});

describe('arena HUD snapshot: a generated floor', () => {
  /** The sandbox's open room marked generated, its fog all unseen: what the HUD reads from a map. */
  function generated() {
    const w = sandbox();
    w.map = { ...w.map, open: false };
    w.fog = new Uint8Array(w.width * w.height);
    return w;
  }
  const FLOOR: HudMap = {
    width: 26,
    height: 40,
    rooms: [
      {
        id: 0,
        kind: 'combat',
        rect: { x: 0, y: 0, w: 26, h: 40 },
        icon: null,
        used: false,
        cleared: false,
        sealed: false,
      },
    ],
    exit: null,
    hint: { x: 20, y: 2 },
    foes: [{ x: 3, y: 4, kind: 'elite' }],
    drops: [],
    explored: 1,
    total: 6,
    fogVersion: 4,
  };
  const prompt: PromptEvent = {
    kind: 'interactPrompt',
    id: '1:0',
    interactable: 'shrine',
    text: 'Shrine of Vigor: +20% damage for this floor',
  };

  it('maps it from the engine: its rooms, the foes in sight, the seen loot, and the grid and fog as they are', () => {
    vi.mocked(hudMapOf).mockReturnValue(FLOOR);
    const w = generated();
    w.monsters.push({ x: 9, y: 9, kind: 'normal' } as MonsterEntity); // not in sight
    const at = { born: 0, amount: 0, vacuum: false, dead: false };
    const rare = { rarity: 'rare' } as GearItem;
    w.drops.push(
      { ...at, id: 1, kind: 'item', x: 5.5, y: 6.5, item: rare },
      { ...at, id: 2, kind: 'item', x: 7.5, y: 8.5, item: rare },
    );
    w.fog[6 * w.width + 5] = 1; // the first drop's cell has been seen
    const map = snapshot(w, null).map;
    expect(hudMapOf).toHaveBeenCalledWith(w);
    expect(map.foes).toEqual([{ x: 3, y: 4, rank: 'elite' }]);
    expect(map.drops).toEqual([{ x: 5.5, y: 6.5, color: RARITY_COLOR.rare }]);
    expect(map.floor).toMatchObject({
      explored: 1,
      total: 6,
      fogVersion: 4,
      hint: { x: 20, y: 2 },
    });
    expect(map.floor!.fog).toBe(w.fog);
    expect(map.floor!.cells).toBe(w.map.cells);
  });

  it('never asks the engine on the open room', () => {
    vi.mocked(hudMapOf).mockClear();
    expect(snapshot(sandbox(), null).map.floor).toBeUndefined();
    expect(hudMapOf).not.toHaveBeenCalled();
  });

  it("shows the prompt's interactable where it stands, and a shrine's prayer as it goes", () => {
    const w = sandbox();
    w.map.rooms[0].interactable = { id: '1:0', kind: 'shrine', x: 10, y: 12, used: false };
    expect(snapshot(w, null).prompt).toBeUndefined();
    expect(snapshot(w, null, prompt).prompt).toEqual({
      id: '1:0',
      interactable: 'shrine',
      text: prompt.text,
      x: 10,
      y: 12,
      channel: null,
    });
    w.t = 5;
    w.channel = { id: '1:0', x: 10, y: 12, start: 4.75, until: 5.25 };
    expect(snapshot(w, null, prompt).prompt!.channel).toBeCloseTo(0.5);
    // The prayer keeps its plaque, prompt or not.
    expect(snapshot(w, null).prompt).toMatchObject({ id: '1:0', text: '', channel: 0.5 });
  });

  it('keeps the prompt through a step that ran no tick, and drops it after a tick without one', () => {
    const later: PromptEvent = { ...prompt, id: '1:3' };
    expect(promptAfter(null, [prompt], true)).toBe(prompt);
    expect(promptAfter(prompt, [], false)).toBe(prompt);
    expect(promptAfter(prompt, [], true)).toBeNull();
    expect(promptAfter(prompt, [prompt, later], true)).toBe(later);
  });
});
