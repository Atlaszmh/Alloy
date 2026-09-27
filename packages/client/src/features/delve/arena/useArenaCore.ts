import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Application } from 'pixi.js';
import {
  botInput,
  refreshWorldHero,
  stepWorld,
  abilityReady,
  basicStep,
  canAfford,
  makeCtx,
  pressStep,
  type AbilityBuilds,
  type AbilityCast,
  type ArpgEvent,
  type ArpgWorld,
  type FormId,
  type HeroStats,
  type ManaType,
} from '@alloy/engine';
import { getDelveRegistry } from '../registry';
import { ArenaRenderer } from './ArenaRenderer';
import { loadDelveSprites } from './sprites';
import {
  attachKeyboard,
  createArenaInput,
  moveVector,
  type ArenaInput,
  type CastPress,
} from './input';
import { TAP_MS, aimMarkerFor } from './aim-gestures';
import { padState, takeArenaPresses } from '@/features/gamepad/gamepad-hub';
import { useControlsStore } from '@/stores/controlsStore';
import { padToArena, stickAimPoint, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { rumble } from '@/features/gamepad/rumble';
import { HitStop } from './fx/hitstop';

/**
 * The arena shared by the dive and the Training Grounds: the Pixi app and
 * renderer, the ticker, keyboard, mouse and controller input, hit-stop, the
 * HUD snapshot, and the cast, dodge and attack actions. A mode (`ArenaMode`)
 * says which world to run and what to do with it. Rules stay in the engine:
 * this only times and routes.
 */

export interface AbilityHud {
  name: string;
  icon: string;
  form: FormId;
  element: ManaType;
  elements: ManaType[];
  payment: 'mana' | 'charge' | 'cast';
  cost: number;
  /** Seconds until ready (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
  /** Charge-paid: 0..1 of the meter; otherwise null. */
  charge: number | null;
  /** Press-combo step that the next press makes (0-based), and the combo's length. */
  comboNext: number;
  comboLength: number;
  /** This slot's channel progress 0..1, or null (a conjure shows in the arena, not here). */
  windup: number | null;
  affordable: boolean;
  ready: boolean;
}

export interface ArenaHud {
  hp: number;
  maxHp: number;
  mana: number;
  manaMax: number;
  abilities: AbilityHud[];
  /** An ability is channelling (presses wait for it). */
  busy: boolean;
  dodgeCharges: number;
  dodgeMax: number;
  /** Progress of the next dodge charge, 0..1 (1 when full). */
  dodgeRefill: number;
  /** A perfect dodge armed the riposte: the next real hit crits and staggers. */
  riposte: boolean;
  /** The blow of the weapon's string that lands next (0-based). */
  basicComboNext: number;
  /** How many blows the weapon's string has. */
  basicComboLength: number;
  potions: number;
  monstersLeft: number;
  monstersTotal: number;
  boss: { name: string; icon: string; hp: number; maxHp: number } | null;
  cleared: boolean;
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
  /** The hero's stats and builds, hot-swapped whenever this object changes: memoise it. */
  loadout: { stats: HeroStats; abilities: AbilityBuilds };
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
}

export interface ArenaOpts {
  paused: boolean;
  insets: { top: number; bottom: number };
  onUi: (e: CoreUiEvent) => void;
  /** Basic attacks on a button (held or tapped) instead of automatic. */
  manualAttack: boolean;
}

/** A perfect dodge slows the display (not the rules) for a beat. */
const SLOWMO_MS = 200;
const SLOWMO_SCALE = 0.3;

/**
 * Test/tuning hooks, off unless set by hand or by an E2E init script:
 * `alloy:delve:autopilot` = "1" lets the engine bot play, and
 * `alloy:delve:timescale` speeds the simulation up (max 4×).
 */
function readArenaFlags(): { autopilot: boolean; timescale: number } {
  try {
    const scale = Number(localStorage.getItem('alloy:delve:timescale'));
    return {
      autopilot: localStorage.getItem('alloy:delve:autopilot') === '1',
      timescale: scale > 0 ? Math.min(4, scale) : 1,
    };
  } catch {
    return { autopilot: false, timescale: 1 };
  }
}

export function snapshot(world: ArpgWorld): ArenaHud {
  const h = world.hero;
  const t = world.t;
  const bal = getDelveRegistry().getDelveBalance();
  const comboWindow = bal.abilities.comboWindow;
  const dodgeBal = bal.dodge;
  const boss =
    world.bossId !== null ? world.monsters.find((m) => m.id === world.bossId) : undefined;
  // Only a channel dims the buttons: its conjure is anticipation in the arena, like any other.
  const busy =
    !!h.windup && (h.abilities[h.windup.slot]?.channel ?? 0) > 0 && t >= h.windup.conjureUntil;
  return {
    hp: h.hp,
    maxHp: h.stats.maxHp,
    mana: h.mana,
    manaMax: h.manaMax,
    abilities: h.abilities.map((ab, i) => {
      const cooldown = Math.max(0, h.cooldowns[i] - t);
      const charged = ab.build.payment !== 'charge' || h.charge[i] >= ab.chargeNeed - 1e-9;
      const affordable = canAfford(world, ab);
      return {
        name: ab.name,
        icon: ab.icon,
        form: ab.form.id,
        element: ab.element,
        elements: ab.elements,
        payment: ab.build.payment,
        cost: ab.cost,
        cooldown,
        cooldownTotal: Math.max(0.01, ab.channel + ab.cooldown),
        charge:
          ab.build.payment === 'charge'
            ? Math.min(1, h.charge[i] / Math.max(1e-9, ab.chargeNeed))
            : null,
        comboNext: pressStep(h, i, t, comboWindow),
        comboLength: ab.combo.length,
        // Only a channel shows: a conjure is anticipation in the arena, not a HUD bar.
        windup:
          h.windup?.slot === i && ab.channel > 0 && t >= h.windup.conjureUntil
            ? Math.min(
                1,
                (t - h.windup.conjureUntil) /
                  Math.max(0.01, h.windup.until - h.windup.conjureUntil),
              )
            : null,
        affordable,
        ready: cooldown <= 0 && charged && affordable && !busy,
      };
    }),
    busy,
    dodgeCharges: h.dodgeCharges,
    dodgeMax: dodgeBal.charges,
    dodgeRefill:
      h.dodgeRechargeAt > 0 ? Math.max(0, 1 - (h.dodgeRechargeAt - t) / dodgeBal.recharge) : 1,
    riposte: t < h.riposteUntil,
    basicComboNext: basicStep(h, t, bal),
    basicComboLength: h.stats.weapon.combo.length,
    potions: h.potions,
    monstersLeft: world.monsters.length,
    monstersTotal: world.totalMonsters,
    boss: boss ? { name: boss.name, icon: boss.icon, hp: boss.hp, maxHp: boss.maxHp } : null,
    cleared: world.cleared,
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
    renderer.loadFloor(world, registry.getBiomeForDepth(world.depth));
    setHud(snapshot(world));
  }, [registry]);

  // Pixi application lifecycle.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let destroyed = false;
    const app = new Application();
    const detachKeys = attachKeyboard(inputRef.current, () => !pausedRef.current);
    const flags = readArenaFlags();
    let hudClock = 0;
    // `resizeTo` only follows the window; the host can also change size on its own (the
    // Training panel docking beside it), so the canvas follows the host too.
    const hostResize = new ResizeObserver(() => app.queueResize());

    app
      .init({
        resizeTo: host,
        background: 0x050407,
        antialias: true,
        resolution: Math.min(2, window.devicePixelRatio || 1),
        autoDensity: true,
      })
      .then(() => loadDelveSprites())
      .then(() => {
        if (destroyed) {
          app.destroy(true);
          return;
        }
        host.prepend(app.canvas);
        app.canvas.style.position = 'absolute';
        app.canvas.style.inset = '0';
        const renderer = new ArenaRenderer(app);
        renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
        rendererRef.current = renderer;
        app.renderer.on('resize', () => renderer.resize());
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
          const pad = padFrame(world, paused);
          if (!paused && !finishedRef.current) {
            const input = inputRef.current;
            const padMove = pad && (pad.move.x !== 0 || pad.move.y !== 0) ? pad.move : null;
            const padAttackAim =
              pad?.attackHeld && pad.aimDir
                ? stickAimPoint(world.hero, pad.aimDir, 1, world.hero.stats.weapon.range, false)
                : null;
            const wasDead = world.heroDead;
            const events = stepWorld(
              registry,
              world,
              flags.autopilot
                ? botInput(registry, world)
                : {
                    move: padMove ?? moveVector(input),
                    cast: toCast(input.cast),
                    potion: input.potion || !!pad?.potion,
                    dodge: input.dodge || !!pad?.dodge,
                    ...(manualRef.current
                      ? {
                          attack: input.attackHeld || input.attackTap || !!pad?.attackHeld,
                          attackTap: input.attackTap || !!pad?.attackTap,
                          attackAim: padAttackAim
                            ? padAttackAim
                            : input.attackAim
                              ? renderer.screenToWorld(input.attackAim.x, input.attackAim.y)
                              : null,
                        }
                      : {}),
                  },
              dt * flags.timescale,
            );
            input.cast = null;
            input.potion = false;
            input.dodge = false;
            input.attackTap = false;
            if (events.length > 0) {
              renderer.handleEvents(events);
              // The bot-driven E2E runs would otherwise spend a large share of wall time frozen.
              if (!flags.autopilot) hitstopRef.current.onEvents(events, performance.now());
              handleEvents(world, events);
            }
            if (!wasDead && world.heroDead) mode.onHeroDead(world);
            if (mode.frame(world)) finishedRef.current = true;
          }
          renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
          renderer.setAim(aimView(world) ?? padAimView(world));
          renderer.update(paused ? 0 : dt);
          // The HUD refresh ignores the mode's speed, so the sandbox's slow motion doesn't slow
          // it (for the dive, speed 1, this is exactly today's `hudClock += dt`).
          hudClock += real * scale;
          if (hudClock > 0.08) {
            hudClock = 0;
            setHud(snapshot(world));
          }
        });
        setReady(true);
      });

    /** A press's screen aim point → world units. */
    function toCast(press: CastPress | null): AbilityCast | null {
      if (!press) return null;
      if (press.aimWorld) return { slot: press.slot, aim: press.aimWorld };
      const r = rendererRef.current;
      return {
        slot: press.slot,
        aim: press.aim && r ? r.screenToWorld(press.aim.x, press.aim.y) : null,
      };
    }

    /**
     * The controller's part of this frame (see gamepad-hub): Menu opens the
     * dive menu, and an ability press is queued, aimed by the right stick.
     */
    function padFrame(world: ArpgWorld, paused: boolean): ArenaPadActions | null {
      const state = padState();
      if (!state || paused) return null;
      const pressed = takeArenaPresses();
      const controls = useControlsStore.getState().config;
      const acts = padToArena(state, pressed, controls);
      if (acts.menu) (document.querySelector('[data-pad-menu]') as HTMLElement | null)?.click();
      // A press always tries (so an unaffordable one still says so); holding RT
      // casts the Primary again as soon as it's ready.
      const slot =
        acts.cast ??
        (acts.castHeld !== null && abilityReady(makeCtx(registry, world, []), acts.castHeld)
          ? acts.castHeld
          : null);
      if (slot !== null) {
        const ab = world.hero.abilities[slot];
        const aimWorld =
          acts.aimDir && ab
            ? stickAimPoint(
                world.hero,
                acts.aimDir,
                acts.aimTilt,
                ab.range,
                aimMarkerFor(ab.form.id) === 'circle',
                controls.aimReach,
              )
            : null;
        inputRef.current.cast = { slot, aim: null, aimWorld };
      }
      return acts;
    }

    /** While the right stick is tilted, show where the Primary would go. */
    function padAimView(world: ArpgWorld) {
      const state = padState();
      const ab = world.hero.abilities[0];
      if (!state || !ab || (state.right.x === 0 && state.right.y === 0)) return null;
      const tilt = Math.hypot(state.right.x, state.right.y);
      const dir = { x: state.right.x / tilt, y: state.right.y / tilt };
      const marker = aimMarkerFor(ab.form.id);
      const reach = useControlsStore.getState().config.aimReach;
      return {
        marker: marker === 'none' ? ('line' as const) : marker,
        point: stickAimPoint(world.hero, dir, tilt, ab.range, marker === 'circle', reach),
        radius: ab.radius,
        range: ab.range,
        element: ab.element,
      };
    }

    /** The marker for a press held long enough to aim (a key follows the mouse). */
    function aimView(world: ArpgWorld) {
      const a = inputRef.current.aiming;
      const r = rendererRef.current;
      const ab = a ? world.hero.abilities[a.slot] : undefined;
      if (!a || !r || !ab || performance.now() - a.since < TAP_MS) return null;
      const at = a.at ?? inputRef.current.mouse;
      if (!at) return null;
      return {
        marker: aimMarkerFor(ab.form.id),
        point: r.screenToWorld(at.x, at.y),
        radius: ab.radius,
        range: ab.range,
        element: ab.element,
      };
    }

    function handleEvents(world: ArpgWorld, events: ArpgEvent[]) {
      onUiRef.current({ kind: 'events', events });
      for (const e of events) {
        if (e.kind === 'noMana') onUiRef.current({ kind: 'noMana', slot: e.slot });
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

  // The loadout changed mid-fight → hot-swap the hero (abilities re-resolve, changed builds swap).
  useEffect(() => {
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, mode.loadout.stats, mode.loadout.abilities);
      setHud(snapshot(world));
    }
  }, [mode.loadout, registry]);

  /** Use an ability; `aim` is a screen point (client px), or omitted to auto-aim. */
  const cast = useCallback((slot: number, aim?: { x: number; y: number } | null) => {
    inputRef.current.cast = { slot, aim: aim ?? null };
  }, []);
  /** Show the aim marker for a held button at a screen point, or hide it (null). */
  const aim = useCallback((slot: number | null, at?: { x: number; y: number }) => {
    inputRef.current.aiming =
      slot === null || !at
        ? null
        : { slot, since: inputRef.current.aiming?.since ?? performance.now(), at };
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
    aim,
    attack,
    dodge,
    potion,
    heroScreen,
    pixelsPerUnit,
    worldRef,
  };
}
