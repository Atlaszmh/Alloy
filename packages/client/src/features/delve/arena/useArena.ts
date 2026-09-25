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
  makeCtx,
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
import { padToArena, stickAimPoint, type ArenaPadActions } from '@/features/gamepad/arena-pad';
import { rumble } from '@/features/gamepad/rumble';

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
  /** This slot's wind-up progress 0..1, or null. */
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
  /** Another ability is winding up: presses are ignored. */
  busy: boolean;
  dodgeCharges: number;
  dodgeMax: number;
  /** Progress of the next dodge charge, 0..1 (1 when full). */
  dodgeRefill: number;
  /** A perfect dodge armed the riposte: the next real hit crits and staggers. */
  riposte: boolean;
  melee: boolean;
  /** Which hit of the 3-hit melee combo comes next (0-based). */
  basicComboNext: number;
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

function snapshot(world: ArpgWorld): ArenaHud {
  const h = world.hero;
  const t = world.t;
  const bal = getDelveRegistry().getDelveBalance();
  const comboWindow = bal.abilities.comboWindow;
  const dodgeBal = bal.dodge;
  const boss =
    world.bossId !== null ? world.monsters.find((m) => m.id === world.bossId) : undefined;
  return {
    hp: h.hp,
    maxHp: h.stats.maxHp,
    mana: h.mana,
    manaMax: h.manaMax,
    abilities: h.abilities.map((ab, i) => {
      const cooldown = Math.max(0, h.cooldowns[i] - t);
      const charged = ab.build.payment !== 'charge' || h.charge[i] >= ab.chargeNeed - 1e-9;
      const affordable = h.mana >= ab.cost;
      const chained = t - h.comboAt[i] <= comboWindow;
      return {
        name: ab.name,
        icon: ab.icon,
        form: ab.form.id,
        element: ab.element,
        elements: ab.elements,
        payment: ab.build.payment,
        cost: ab.cost,
        cooldown,
        cooldownTotal: Math.max(0.01, ab.castTime + ab.cooldown),
        charge:
          ab.build.payment === 'charge'
            ? Math.min(1, h.charge[i] / Math.max(1e-9, ab.chargeNeed))
            : null,
        comboNext: chained ? (h.comboStep[i] + 1) % ab.combo.length : 0,
        comboLength: ab.combo.length,
        windup:
          h.windup?.slot === i
            ? Math.min(1, (t - h.windup.start) / Math.max(0.01, h.windup.until - h.windup.start))
            : null,
        affordable,
        ready: cooldown <= 0 && charged && affordable && !h.windup,
      };
    }),
    busy: !!h.windup,
    dodgeCharges: h.dodgeCharges,
    dodgeMax: dodgeBal.charges,
    dodgeRefill:
      h.dodgeRechargeAt > 0 ? Math.max(0, 1 - (h.dodgeRechargeAt - t) / dodgeBal.recharge) : 1,
    riposte: t < h.riposteUntil,
    melee: h.stats.weapon.kind === 'melee',
    basicComboNext:
      t - h.lastBasicAt > h.stats.attackInterval + bal.hero.basicComboGrace ? 0 : h.attackCount % 3,
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
          const slow = performance.now() < slowUntilRef.current ? SLOWMO_SCALE : 1;
          const dt = Math.min(0.1, ticker.deltaMS / 1000) * slow;
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
      const acts = padToArena(state, pressed);
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
      return {
        marker: marker === 'none' ? ('line' as const) : marker,
        point: stickAimPoint(world.hero, dir, tilt, ab.range, marker === 'circle'),
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
