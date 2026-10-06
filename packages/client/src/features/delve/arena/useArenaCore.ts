import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Application } from 'pixi.js';
import {
  botInput,
  refreshWorldHero,
  stepWorld,
  activeMove,
  basicStep,
  canAfford,
  chainMove,
  holdCharge,
  holdFull,
  hudMapOf,
  moveNumbers,
  pressIndex,
  pressMove,
  type ArpgEvent,
  type ArpgWorld,
  type Chains,
  type Drop,
  type FormId,
  type GearItem,
  type HeroStats,
  type HudMap as FloorHudMap,
  type InteractableKind,
  type ManaType,
  type MoveKind,
  type ResolvedAbility,
  type RuneRef,
  type Vec,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { ArenaRenderer, seenAt } from './ArenaRenderer';
import { floatPay } from './hud/floatPay';
import type { AimView } from './fx/draw-world';
import type { ViewRect } from './fx/pixel-layer';
import { RARITY_COLOR } from '../format';
import { FAMILY_STYLE } from '../runes/rune-style';
import { MANA_HEX } from './palette';
import { hasZoomedAncestor } from '../kit/zoom';
import { loadDelveSprites } from './sprites';
import {
  attachKeyboard,
  createArenaInput,
  frameInput,
  labelsHeld,
  pressJournal,
  pressMenu,
  pressPeek,
  type Aiming,
  type ArenaInput,
} from './input';
import { TAP_MS, aimMarkerFor } from './aim';
import { padState, takeArenaPresses } from '@/features/gamepad/gamepad-hub';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import { useControlsStore } from '@/stores/controlsStore';
import {
  padMemory,
  padToArena,
  stickAimPoint,
  type ArenaPadActions,
} from '@/features/gamepad/arena-pad';
import { rumble } from '@/features/gamepad/rumble';
import { HitStop } from './fx/hitstop';
import { arenaResolution, type Insets } from './camera';
import { useUIStore } from '@/stores/uiStore';

export type { Insets } from './camera';

/**
 * The arena shared by the dive and the Training Grounds: the Pixi app and
 * renderer, the ticker, keyboard, mouse and controller input, hit-stop, the
 * HUD snapshot, and the cast, dodge and attack actions. A mode (`ArenaMode`)
 * says which world to run and what to do with it. Rules stay in the engine:
 * this only times and routes.
 */

export interface AbilityHud {
  /** The next move's name, icon, form and elements. */
  name: string;
  icon: string;
  form: FormId;
  element: ManaType;
  elements: ManaType[];
  payment: 'mana' | 'charge' | 'cast';
  cost: number;
  /**
   * Seconds until the next move can go (0 = ready): the longer of its cooldown
   * and the slot's beat, and that wait's whole length.
   */
  cooldown: number;
  cooldownTotal: number;
  /** The wait is the slot's beat, not a cooldown: the button sweeps without a countdown. */
  beat: boolean;
  /** Charge-paid: the meter over the next move's need, 0..1; otherwise null. */
  charge: number | null;
  /** The chain's move the next press makes (0-based), the chain's length, and that move's kind. */
  chainStep: number;
  chainLength: number;
  nextKind: MoveKind;
  /** This slot's hold charging: its charge 0..1 and stage 0..2, or null. */
  hold: { charge: number; stage: number } | null;
  /** This slot's channel progress 0..1, or null (a conjure shows in the arena, not here). */
  windup: number | null;
  affordable: boolean;
  ready: boolean;
  /** The runes acting on the move a press now casts (`pressMove`), in socket order. */
  runes: RuneRef[];
}

/** A buff on the hero, for the HUD's buff row. No Galvanize: its spark is on the slots. */
export type HudBuff =
  | {
      id: 'riposte' | 'quick' | 'barrier';
      /** Seconds left, from riposteUntil, quickUntil and barrier.until. */
      left: number;
      /** Its whole length when the balance fixes one; null for the barrier (its source sets it). */
      total: number | null;
    }
  /** A shrine's blessing (see the floor maps spec): for this floor or the rest of the dive. */
  | { id: 'shrine'; shrine: string; name: string; dive: boolean };

/** The minimap's floor, in world units. */
export interface HudMap {
  width: number;
  height: number;
  /** The camera's view; the whole arena when there is no renderer. */
  view: ViewRect;
  hero: { x: number; y: number };
  foes: { x: number; y: number; rank: 'normal' | 'elite' | 'boss' }[];
  drops: { x: number; y: number; color: string }[];
  /** Blocked cells, if the engine ever adds terrain; [] today. */
  terrain: { x: number; y: number; w: number; h: number }[];
  /**
   * A generated floor's map (`hudMapOf`: revealed rooms and their icons, the exit, its hint, the
   * rooms explored), with the grid and the fog it is drawn from (the world's own arrays, never
   * copied: the minimap redraws its fog when `fogVersion` or the map's `version` moves), and the
   * hazards in seen cells in their element's colour; absent on the open room, whose `foes` are
   * then every foe and `drops` every drop.
   */
  floor?: FloorHudMap & {
    cells: Uint8Array;
    fog: Uint8Array;
    version: number;
    hazards: { x: number; y: number; color: string }[];
  };
}

/** The interactable in reach, for its plaque: the engine's prompt, where it stands, and a prayer's progress. */
export interface InteractHud {
  id: string;
  interactable: InteractableKind;
  /** The engine's words (`interactPrompt.text`): its name, and a shrine's blessing. */
  text: string;
  x: number;
  y: number;
  /** A shrine's prayer under way (`world.channel`), 0..1; null when none. */
  channel: number | null;
}

/** An `interactPrompt` event. */
export type PromptEvent = Extract<ArpgEvent, { kind: 'interactPrompt' }>;

export interface ArenaHud {
  hp: number;
  maxHp: number;
  mana: number;
  manaMax: number;
  /** By slot; null for a skill the weapon doesn't carry (its button hides). */
  abilities: (AbilityHud | null)[];
  /** An ability is channelling or a hold is charging (presses wait for it). */
  busy: boolean;
  dodgeCharges: number;
  dodgeMax: number;
  /** Progress of the next dodge charge, 0..1 (1 when full). */
  dodgeRefill: number;
  /** A perfect dodge armed the riposte: the next real hit crits and staggers. */
  riposte: boolean;
  /** The basic chain's blow that lands next (0-based), the chain's length, and that blow's kind. */
  basicChainStep: number;
  basicChainLength: number;
  basicNextKind: MoveKind;
  /** A manual hold blow held at its strike point: its charge 0..1 and stage 0..2, or null. */
  basicHold: { charge: number; stage: number } | null;
  /** The runes acting on the blow that lands next, in socket order. */
  basicRunes: RuneRef[];
  potions: number;
  monstersLeft: number;
  monstersTotal: number;
  boss: { name: string; icon: string; hp: number; maxHp: number } | null;
  cleared: boolean;
  /** Obsidian's barrier (the life bar's pale segment), or null. */
  barrier: { hp: number; max: number } | null;
  /** When Galvanize last fired (world seconds), or null: cooling buttons spark just after. */
  galvanizedAt: number | null;
  /** The world's time, for `galvanizedAt`. */
  t: number;
  /** Riposte, Quick and the barrier while they last, in that order. */
  buffs: HudBuff[];
  map: HudMap;
  /** The interactable in reach (or the shrine being prayed at); absent when none. */
  prompt?: InteractHud;
}

/** What the core reports to the page, from any fight. */
export type CoreUiEvent =
  | { kind: 'noMana'; slot: number }
  | { kind: 'events'; events: ArpgEvent[] };

/** What runs in the arena. The core reads the latest one on every frame. */
export interface ArenaMode {
  /**
   * A new world is made whenever this changes to a string (from null back to
   * the same string included, so "Dive again" at the same depth starts a
   * fresh floor). While it is null the current world stays on screen.
   */
  worldKey: string | null;
  /** The world for the current (non-null) key. */
  createWorld: () => ArpgWorld;
  /**
   * The hero's stats and chains (a skill without one has no button), hot-swapped whenever this
   * object changes: memoise it.
   */
  loadout: { stats: HeroStats; chains: Partial<Chains> };
  /**
   * On every frame the core steps the world (never while paused, never after
   * the world is finished); true once the mode is done with it, and the core
   * stops stepping it until a new world is made.
   */
  frame: (world: ArpgWorld) => boolean;
  /** After each step that had events. */
  onEvents: (world: ArpgWorld, events: ArpgEvent[]) => void;
  /** Once, on the frame the hero dies. */
  onHeroDead: (world: ArpgWorld) => void;
  /** Display speed (1 = normal), times the perfect-dodge slow motion and the timescale hook. */
  speed: number;
  /** Whether an item is an upgrade as it comes (▲ on its loot label); none when absent. */
  isUpgrade?: (item: GearItem) => boolean;
}

export interface ArenaOpts {
  paused: boolean;
  /** The screen the HUD covers (viewport px): the camera centres in the rest. */
  insets: Insets;
  onUi: (e: CoreUiEvent) => void;
  /** Basic attacks on a button (held or tapped) instead of automatic. */
  manualAttack: boolean;
}

/** A perfect dodge slows the display (not the rules) for a beat. */
const SLOWMO_MS = 200;
const SLOWMO_SCALE = 0.3;

/**
 * Test/tuning hooks, off unless set by hand or by an E2E init script:
 * `alloy:delve:autopilot` = "1" lets the engine bot play ("ask": the bot plays, but its interact
 * presses wait for the player's, and the gate and the alcove open their dialogs: `ask`), and
 * `alloy:delve:timescale` speeds the simulation up (max 4×).
 */
export function readArenaFlags(): { autopilot: boolean; ask: boolean; timescale: number } {
  try {
    const scale = Number(localStorage.getItem('alloy:delve:timescale'));
    const bot = localStorage.getItem('alloy:delve:autopilot');
    return {
      autopilot: bot === '1' || bot === 'ask',
      ask: bot === 'ask',
      timescale: scale > 0 ? Math.min(4, scale) : 1,
    };
  } catch {
    return { autopilot: false, ask: false, timescale: 1 };
  }
}

/** A loot drop's colour on the minimap: its rarity's, or its rune family's; null for anything else. */
function mapColor(d: Drop): string | null {
  if (d.item) return RARITY_COLOR[d.item.rarity];
  const def = d.rune && getDelveRegistry().findRune(d.rune.id);
  return def ? FAMILY_STYLE[def.family].color : null;
}

/**
 * The interact prompt after a step: the last one it sent; none when it ran a tick without one
 * (the engine sends it every tick while one is in reach); the one before when it ran no tick.
 */
export function promptAfter(
  prev: PromptEvent | null,
  events: readonly ArpgEvent[],
  ticked: boolean,
): PromptEvent | null {
  if (!ticked) return prev;
  let last: PromptEvent | null = null;
  for (const e of events) if (e.kind === 'interactPrompt') last = e;
  return last;
}

/** The plaque's interactable: the prompt's, else the shrine being prayed at; with its prayer's progress. */
function promptOf(world: ArpgWorld, e: PromptEvent | null): InteractHud | undefined {
  const id = e?.id ?? world.channel?.id;
  const it = id ? world.map.rooms.find((r) => r.interactable?.id === id)?.interactable : undefined;
  if (!it) return undefined;
  const ch = world.channel?.id === it.id ? world.channel : null;
  return {
    id: it.id,
    interactable: it.kind,
    text: e?.text ?? '',
    x: it.x,
    y: it.y,
    channel: ch ? Math.min(1, (world.t - ch.start) / Math.max(0.01, ch.until - ch.start)) : null,
  };
}

/** The shrines' blessings on the hero, the dive's then the floor's, by their shrine's name. */
function blessings(h: ArpgWorld['hero']): HudBuff[] {
  const shrines = getDelveRegistry().getDelveData().shrines;
  return [h.diveBuffs, h.floorBuffs].flatMap((list, i) =>
    list.map((b) => ({
      id: 'shrine' as const,
      shrine: b.shrine,
      name: shrines.find((s) => s.id === b.shrine)?.name ?? b.shrine,
      dive: i === 0,
    })),
  );
}

export function snapshot(
  world: ArpgWorld,
  renderer: { viewRect(): ViewRect } | null,
  prompt: PromptEvent | null = null,
): ArenaHud {
  const h = world.hero;
  const t = world.t;
  const bal = getDelveRegistry().getDelveBalance();
  const comboWindow = bal.abilities.comboWindow;
  const dodgeBal = bal.dodge;
  const boss =
    world.bossId !== null ? world.monsters.find((m) => m.id === world.bossId) : undefined;
  // Only a channel or a hold dims the buttons: a conjure is anticipation in the arena, like any other.
  const w = h.windup;
  const channel = w && (activeMove(h, w.slot)?.channel ?? 0) > 0 && t >= w.conjureUntil ? w : null;
  const busy = !!channel || !!h.hold;
  const blow = basicStep(h, t, bal);
  // A hold blow's charge shows until it is let go (not through its leap).
  const held = h.swing?.released === null ? h.swing.held : null;
  // A generated floor's map comes from the engine: only the foes in sight, only seen loot.
  const floor = world.map.open ? null : hudMapOf(world);
  return {
    hp: h.hp,
    maxHp: h.stats.maxHp,
    mana: h.mana,
    manaMax: h.manaMax,
    abilities: h.chains.map((chain, i) => {
      if (!chain) return null;
      // The move a press now casts (`pressMove`'s).
      const step = pressIndex(h, i, t, comboWindow);
      const ab = chain.moves[step];
      // The longer wait shows: the next move's cooldown, or the slot's beat.
      const cooling = Math.max(0, h.cooldowns[i][step] - t);
      const beat = Math.max(0, h.beatUntil[i] - t) > cooling;
      const cooldown = beat ? h.beatUntil[i] - t : cooling;
      const charged = ab.payment !== 'charge' || h.charge[i] >= ab.chargeNeed - 1e-9;
      const affordable = canAfford(world, ab);
      return {
        name: ab.name,
        icon: ab.icon,
        form: ab.form.id,
        element: ab.element,
        elements: ab.elements,
        payment: ab.payment,
        cost: ab.cost,
        cooldown,
        cooldownTotal: Math.max(
          0.01,
          beat ? h.beatUntil[i] - h.beatFrom[i] : ab.channel + ab.cooldown,
        ),
        beat,
        charge:
          ab.payment === 'charge' ? Math.min(1, h.charge[i] / Math.max(1e-9, ab.chargeNeed)) : null,
        chainStep: step,
        chainLength: chain.moves.length,
        nextKind: ab.kind,
        hold: h.hold?.slot === i ? holdCharge(bal, h.hold.start, t, h.hold.full) : null,
        // Only a channel shows: a conjure is anticipation in the arena, not a HUD bar.
        windup:
          channel?.slot === i
            ? Math.min(
                1,
                (t - channel.conjureUntil) / Math.max(0.01, channel.until - channel.conjureUntil),
              )
            : null,
        affordable,
        ready: cooldown <= 0 && charged && affordable && !busy,
        runes: ab.runes,
      };
    }),
    busy,
    dodgeCharges: h.dodgeCharges,
    dodgeMax: dodgeBal.charges,
    dodgeRefill:
      h.dodgeRechargeAt > 0 ? Math.max(0, 1 - (h.dodgeRechargeAt - t) / dodgeBal.recharge) : 1,
    riposte: t < h.riposteUntil,
    basicChainStep: blow,
    basicChainLength: h.stats.weapon.blows.length,
    basicNextKind: h.stats.weapon.blows[blow].kind,
    basicHold: held !== null ? holdCharge(bal, held, t, holdFull(bal, h.stats.tempo)) : null,
    basicRunes: h.stats.weapon.blows[blow].runes,
    potions: h.potions,
    monstersLeft: world.monsters.length,
    monstersTotal: world.totalMonsters,
    boss: boss ? { name: boss.name, icon: boss.icon, hp: boss.hp, maxHp: boss.maxHp } : null,
    cleared: world.cleared,
    barrier: h.barrier ? { hp: h.barrier.hp, max: h.barrier.max } : null,
    galvanizedAt:
      h.reactionReadyAt.galvanize === undefined
        ? null
        : h.reactionReadyAt.galvanize - bal.reactions.reactionCooldown,
    t,
    buffs: [
      ...(
        [
          ['riposte', h.riposteUntil, bal.dodge.riposteWindow],
          ['quick', h.quickUntil, bal.reactions.lightningRodDuration],
          ['barrier', h.barrier?.until ?? 0, null],
        ] as const
      ).flatMap(([id, until, total]) => (until > t ? [{ id, left: until - t, total }] : [])),
      ...blessings(h),
    ],
    map: {
      width: world.width,
      height: world.height,
      view: renderer?.viewRect() ?? { left: 0, top: 0, right: world.width, bottom: world.height },
      hero: { x: h.x, y: h.y },
      foes: (floor?.foes ?? world.monsters).map((m) => ({ x: m.x, y: m.y, rank: m.kind })),
      drops: world.drops.flatMap((d) => {
        const color = mapColor(d);
        return color && (!floor || seenAt(world, d.x, d.y)) ? [{ x: d.x, y: d.y, color }] : [];
      }),
      terrain: [],
      ...(floor && {
        floor: {
          ...floor,
          cells: world.map.cells,
          fog: world.fog,
          version: world.map.version,
          hazards: world.hazards.flatMap((z) =>
            seenAt(world, z.x, z.y)
              ? [{ x: z.x, y: z.y, color: `#${MANA_HEX[z.element].toString(16).padStart(6, '0')}` }]
              : [],
          ),
        },
      }),
    },
    prompt: promptOf(world, prompt),
  };
}

/**
 * The move a slot's button would fire: its hold at the stage it has reached
 * while one charges, else the move a press now casts (`pressMove`: during the
 * slot's own wind-up, the one after the winding move).
 */
function aimedMove(world: ArpgWorld, slot: number): ResolvedAbility | null {
  const h = world.hero;
  const bal = getDelveRegistry().getDelveBalance();
  const hold = h.hold?.slot === slot ? h.hold : null;
  return hold
    ? chainMove(h.chains[slot]!, hold.step, holdCharge(bal, hold.start, world.t, hold.full).stage)
    : pressMove(h, slot, world.t, bal.abilities.comboWindow);
}

/**
 * The aim marker for a key held long enough to aim, at `point` (world units:
 * the mouse). A charging hold's marker has its stage's size, and a later
 * move's its step's (`moveNumbers`).
 */
export function aimView(world: ArpgWorld, a: Aiming, point: Vec, now: number): AimView | null {
  if (now - a.since < TAP_MS) return null;
  const ab = aimedMove(world, a.slot);
  if (!ab) return null;
  return {
    marker: aimMarkerFor(ab.form.id),
    point,
    radius: moveNumbers(world.hero.stats, getDelveRegistry().getDelveBalance(), ab).radius,
    range: ab.range,
    element: ab.element,
  };
}

export function useArenaCore(
  hostRef: RefObject<HTMLDivElement | null>,
  mode: ArenaMode,
  opts: ArenaOpts,
) {
  const registry = getDelveRegistry();
  const inputRef = useRef<ArenaInput>(createArenaInput());
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const worldRef = useRef<ArpgWorld | null>(null);
  const finishedRef = useRef(false);
  const modeRef = useRef(mode);
  const pausedRef = useRef(opts.paused);
  const onUiRef = useRef(opts.onUi);
  const insetsRef = useRef(opts.insets);
  const slowUntilRef = useRef(0);
  const hitstopRef = useRef(new HitStop());
  const manualRef = useRef(opts.manualAttack);
  /** The engine's latest interact prompt (`promptAfter`), for the snapshot. */
  const promptRef = useRef<PromptEvent | null>(null);
  modeRef.current = mode;
  manualRef.current = opts.manualAttack;
  const [hud, setHud] = useState<ArenaHud | null>(null);
  const [ready, setReady] = useState(false);
  pausedRef.current = opts.paused;
  onUiRef.current = opts.onUi;
  insetsRef.current = opts.insets;

  const startWorld = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const world = modeRef.current.createWorld();
    worldRef.current = world;
    hitstopRef.current.reset();
    finishedRef.current = false;
    promptRef.current = null;
    renderer.loadFloor(world, registry.getBiomeForDepth(world.depth));
    setHud(snapshot(world, renderer));
  }, [registry]);

  // Pixi application lifecycle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // A zoomed ancestor would desync Pixi's pointer mapping and its whole-pixel scale.
    if (import.meta.env.DEV && hasZoomedAncestor(host))
      console.error('The arena host sits under a CSS zoom (Delve UI, decided item 31)');
    let destroyed = false;
    const app = new Application();
    const detachKeys = attachKeyboard(inputRef.current, () => !pausedRef.current);
    const flags = readArenaFlags();
    let hudClock = 0;
    /** What the pad remembers from the frame before (a hold's release, a chord's press, the attack button). */
    const padMem = padMemory();
    // `resizeTo` only follows the window; the host can also change size on its own (the
    // Training panel docking beside it), so the canvas follows the host too.
    const hostResize = new ResizeObserver(() => app.queueResize());
    let stopViewUnits = () => {};

    app
      .init({
        resizeTo: host,
        background: 0x050407,
        antialias: true,
        resolution: arenaResolution(),
        autoDensity: true,
      })
      // The loot labels' font, before Pixi measures any; its failure never blocks the arena.
      .then(() =>
        Promise.all([loadDelveSprites(), document.fonts?.load('14px "Jersey 10"').catch(() => {})]),
      )
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.prepend(app.canvas);
        app.canvas.style.position = 'absolute';
        app.canvas.style.inset = '0';
        const renderer = new ArenaRenderer(app);
        renderer.setInsets(insetsRef.current);
        renderer.setUpgradeTest((item) => modeRef.current.isUpgrade?.(item) ?? false);
        rendererRef.current = renderer;
        app.renderer.on('resize', () => renderer.resize());
        // Settings → View distance zooms at once.
        stopViewUnits = useUIStore.subscribe((s, prev) => {
          if (s.arenaViewUnits !== prev.arenaViewUnits) renderer.resize();
        });
        hostResize.observe(host); // only now: `queueResize` exists once the app is initialised

        app.ticker.add((ticker) => {
          const world = worldRef.current;
          const now = performance.now();
          const mode = modeRef.current;
          // A hit-stop freezes the display (a dt of 0 runs no ticks; presses are still
          // recorded); a perfect dodge and the mode's speed slow it.
          const scale = hitstopRef.current.frozen(now)
            ? 0
            : now < slowUntilRef.current
              ? SLOWMO_SCALE
              : 1;
          const real = Math.min(0.1, ticker.deltaMS / 1000);
          const dt = real * scale * mode.speed;
          if (!world) return;
          const paused = pausedRef.current;
          const pad = padFrame(paused);
          if (!paused && !finishedRef.current) {
            const input = frameInput(registry, world, inputRef.current, pad, padMem, {
              manual: manualRef.current,
              aimReach: useControlsStore.getState().config.aimReach,
              holdToggle: useControlsStore.getState().config.holdToggle,
              toWorld: (p) => renderer.screenToWorld(p.x, p.y),
              device: useInputDeviceStore.getState().device,
            });
            const wasDead = world.heroDead;
            const t0 = world.t;
            const events = stepWorld(
              registry,
              world,
              !flags.autopilot
                ? input
                : flags.ask
                  ? { ...botInput(registry, world), interact: input.interact }
                  : botInput(registry, world),
              dt * flags.timescale,
            );
            promptRef.current = promptAfter(promptRef.current, events, world.t > t0);
            if (events.length > 0) {
              renderer.handleEvents(events);
              // The bot-driven E2E runs would otherwise spend a large share of wall time frozen.
              if (!flags.autopilot) hitstopRef.current.onEvents(
                  events,
                  performance.now(),
                  useUIStore.getState().hitstop,
                );
              handleEvents(world, events);
            }
            if (!wasDead && world.heroDead) mode.onHeroDead(world);
            if (mode.frame(world)) finishedRef.current = true;
          }
          renderer.setInsets(insetsRef.current);
          renderer.setLabelsHeld(
            labelsHeld(useInputDeviceStore.getState().device, inputRef.current, pad),
          );
          renderer.setAim(heldAim(world) ?? padAimView(world));
          renderer.update(paused ? 0 : dt);
          // The HUD refresh ignores the mode's speed, so the sandbox's slow motion doesn't slow
          // it (for the dive, speed 1, this is exactly today's `hudClock += dt`).
          hudClock += real * scale;
          if (hudClock > 0.08) {
            hudClock = 0;
            setHud(snapshot(world, renderer, promptRef.current));
          }
        });
        setReady(true);
      });

    /**
     * The controller's part of this frame (see gamepad-hub), or null with none
     * or while paused; Menu opens the dive menu, View the journal and D-pad up the peek.
     * `frameInput` turns it into the step's input (a press, a hold's release,
     * `holding`: see `padFrameCast`).
     */
    function padFrame(paused: boolean): ArenaPadActions | null {
      const state = padState();
      if (!state || paused) return null;
      const acts = padToArena(state, takeArenaPresses(), useControlsStore.getState().config);
      if (acts.menu) pressMenu();
      if (acts.journal) pressJournal();
      if (acts.peek) pressPeek();
      return acts;
    }

    /** While the pad has the input lock and its right stick is tilted, show where the Primary's next move (or its hold) would go. */
    function padAimView(world: ArpgWorld) {
      const state = padState();
      if (!state || useInputDeviceStore.getState().device !== 'gamepad') return null;
      if (state.right.x === 0 && state.right.y === 0) return null;
      const ab = aimedMove(world, 0);
      if (!ab) return null;
      const tilt = Math.hypot(state.right.x, state.right.y);
      const dir = { x: state.right.x / tilt, y: state.right.y / tilt };
      const marker = aimMarkerFor(ab.form.id);
      const reach = useControlsStore.getState().config.aimReach;
      return {
        marker: marker === 'none' ? ('line' as const) : marker,
        point: stickAimPoint(world.hero, dir, tilt, ab.range, marker === 'circle', reach),
        radius: moveNumbers(world.hero.stats, registry.getDelveBalance(), ab).radius,
        range: ab.range,
        element: ab.element,
      };
    }

    /** The marker for a press held to aim, at the pointer (a key's follows the mouse). */
    function heldAim(world: ArpgWorld) {
      const a = inputRef.current.aiming;
      const at = a?.at ?? inputRef.current.mouse;
      const r = rendererRef.current;
      return a && at && r
        ? aimView(world, a, r.screenToWorld(at.x, at.y), performance.now())
        : null;
    }

    function handleEvents(world: ArpgWorld, events: ArpgEvent[]) {
      onUiRef.current({ kind: 'events', events });
      for (const e of events) {
        if (e.kind === 'noMana') onUiRef.current({ kind: 'noMana', slot: e.slot });
        if (e.kind === 'pay') floatPay(e);
        if (e.kind === 'perfectDodge') {
          slowUntilRef.current = performance.now() + SLOWMO_MS;
          rumble('perfect');
        }
        if (e.kind === 'dodge') rumble('dodge');
        if (e.kind === 'heroHit' && !e.blocked && e.amount >= world.hero.stats.maxHp * 0.15)
          rumble('hurt');
      }
      modeRef.current.onEvents(world, events);
    }

    return () => {
      destroyed = true;
      hostResize.disconnect();
      stopViewUnits();
      detachKeys();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      worldRef.current = null;
      setReady(false);
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [hostRef, registry]);

  // A new world whenever the mode's key changes to a string; null keeps the current one.
  useEffect(() => {
    if (ready && mode.worldKey !== null) startWorld();
  }, [ready, mode.worldKey, startWorld]);

  // The loadout changed mid-fight → hot-swap the hero (chains re-resolve, changed moves swap).
  useEffect(() => {
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.chains);
      setHud(snapshot(world, rendererRef.current, promptRef.current));
    }
  }, [mode.loadout, registry]);

  /** Use an ability; `aim` is a screen point (client px), or omitted to auto-aim. */
  const cast = useCallback((slot: number, aim?: { x: number; y: number } | null) => {
    inputRef.current.cast = { slot, aim: aim ?? null };
  }, []);
  /** The HUD attack button: held or released (it auto-aims). */
  const attack = useCallback((held: boolean) => {
    const input = inputRef.current;
    input.attackHeld = held;
    if (held) {
      input.attackTap = true;
      input.attackAim = null;
    }
  }, []);
  const dodge = useCallback(() => {
    inputRef.current.dodge = true;
  }, []);
  const potion = useCallback(() => {
    inputRef.current.potion = true;
  }, []);
  const heroScreen = useCallback(() => rendererRef.current?.heroScreen() ?? null, []);
  const pixelsPerUnit = useCallback(() => rendererRef.current?.pixelsPerUnit() ?? 30, []);

  return {
    hud,
    ready,
    input: inputRef.current,
    cast,
    attack,
    dodge,
    potion,
    heroScreen,
    pixelsPerUnit,
    worldRef,
  };
}
