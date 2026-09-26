import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Application } from 'pixi.js';
import {
  bankWorld,
  beginFloor,
  botInput,
  completeFloor,
  computeHeroStats,
  failFloor,
  refreshWorldHero,
  stepWorld,
  abilityReady,
  basicStep,
  makeCtx,
  pressStep,
  type AbilityCast,
  type ArpgEvent,
  type ArpgWorld,
  type FormId,
  type GearItem,
  type ManaType,
  type ReactionId,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
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
 * Runs a floor: owns the ArpgWorld and the Pixi renderer, drives the engine
 * from Pixi's ticker, banks pickups into the save as they happen, and hands
 * floor clears / deaths back to the dive state machine. Rules stay in the
 * engine — this hook only times and routes.
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

export type ArenaUiEvent =
  | { kind: 'loot'; kept: GearItem[]; salvaged: GearItem[]; bagFull: boolean }
  | { kind: 'legendary'; item: GearItem; firstTime: boolean }
  | { kind: 'reaction'; reaction: ReactionId }
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean }
  | { kind: 'fell' }
  | { kind: 'noMana'; slot: number }
  | { kind: 'events'; events: ArpgEvent[] };

const END_DELAY = 1.3;
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
      const affordable = h.mana >= ab.cost;
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

export function useArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: ArenaUiEvent) => void;
    /** Basic attacks on a button (held or tapped) instead of automatic. */
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const phase = profile.dive?.phase ?? null;
  const depth = profile.dive?.depth ?? 0;

  const inputRef = useRef<ArenaInput>(createArenaInput());
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const worldRef = useRef<ArpgWorld | null>(null);
  const endAtRef = useRef<number | null>(null);
  const finishedRef = useRef(false);
  const pausedRef = useRef(opts.paused);
  const onUiRef = useRef(opts.onUi);
  const insetsRef = useRef(opts.insets);
  const slowUntilRef = useRef(0);
  const hitstopRef = useRef(new HitStop());
  const manualRef = useRef(opts.manualAttack);
  manualRef.current = opts.manualAttack;
  const [hud, setHud] = useState<ArenaHud | null>(null);
  const [ready, setReady] = useState(false);
  pausedRef.current = opts.paused;
  onUiRef.current = opts.onUi;
  insetsRef.current = opts.insets;

  const startFloor = useCallback(() => {
    const renderer = rendererRef.current;
    const p = useDelveStore.getState().profile;
    if (!renderer || p.dive?.phase !== 'fighting') return;
    const world = beginFloor(registry, p);
    worldRef.current = world;
    hitstopRef.current.reset();
    endAtRef.current = null;
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

        app.ticker.add((ticker) => {
          const world = worldRef.current;
          const now = performance.now();
          // A hit-stop freezes the display (a dt of 0 runs no ticks; presses are still recorded).
          const scale = hitstopRef.current.frozen(now)
            ? 0
            : now < slowUntilRef.current
              ? SLOWMO_SCALE
              : 1;
          const dt = Math.min(0.1, ticker.deltaMS / 1000) * scale;
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
            checkEnd(world);
          }
          renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
          renderer.setAim(aimView(world) ?? padAimView(world));
          renderer.update(paused ? 0 : dt);
          hudClock += dt;
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
        if (e.kind === 'heroHit' && e.amount >= world.hero.stats.maxHp * 0.15) rumble('hurt');
      }
      if (world.pending.items.length > 0 || world.pending.reactions.length > 0) bank(world);
    }

    function bank(world: ArpgWorld) {
      const store = useDelveStore.getState();
      const res = bankWorld(registry, store.profile, world);
      store.setProfile(res.profile);
      store.pushDiveDrops(res.kept.map((i) => i.uid));
      store.markNew(res.kept.map((i) => i.uid));
      if (res.kept.length + res.salvaged.length > 0) {
        onUiRef.current({
          kind: 'loot',
          kept: res.kept,
          salvaged: res.salvaged,
          bagFull: res.bagFull,
        });
      }
      for (const item of [...res.kept, ...res.salvaged]) {
        if (item.rarity === 'legendary') {
          onUiRef.current({
            kind: 'legendary',
            item,
            firstTime: !!item.legendary && res.newCodex.includes(item.legendary.id),
          });
        }
      }
      for (const r of res.newReactions) onUiRef.current({ kind: 'reaction', reaction: r });
    }

    function checkEnd(world: ArpgWorld) {
      if (finishedRef.current) return;
      const done =
        world.heroDead ||
        (world.cleared && (world.drops.length === 0 || world.t - world.clearedAt > 2.5));
      if (!done) return;
      const now = performance.now() / 1000;
      endAtRef.current ??= now;
      if (now - endAtRef.current < (world.heroDead ? END_DELAY : 0.4)) return;
      finishedRef.current = true;
      const store = useDelveStore.getState();
      if (world.heroDead) {
        const res = failFloor(registry, store.profile, world);
        store.setProfile(res.profile);
        onUiRef.current({ kind: 'fell' });
      } else {
        const res = completeFloor(registry, store.profile, world);
        store.setProfile(res.profile);
        store.pushDiveDrops(res.kept.map((i) => i.uid));
        onUiRef.current({
          kind: 'cleared',
          bountyAdded: res.bountyAdded,
          bossKilled: res.bossKilled,
        });
      }
    }

    return () => {
      destroyed = true;
      detachKeys();
      rendererRef.current?.destroy();
      rendererRef.current = null;
      worldRef.current = null;
      setReady(false);
      if (app.renderer) app.destroy(true, { children: true });
    };
  }, [hostRef, registry]);

  // Enter a new floor whenever the dive is fighting and no live floor exists.
  useEffect(() => {
    if (!ready) return;
    if (
      phase === 'fighting' &&
      (!worldRef.current || finishedRef.current || worldRef.current.depth !== depth)
    ) {
      startFloor();
    }
  }, [ready, phase, depth, startFloor]);

  // Gear changed mid-floor → hot-swap hero stats (abilities re-resolve).
  useEffect(() => {
    const stats = computeHeroStats(profile.equipped, registry);
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, stats, profile.abilities);
      setHud(snapshot(world));
    }
  }, [profile.equipped, profile.abilities, registry]);

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
