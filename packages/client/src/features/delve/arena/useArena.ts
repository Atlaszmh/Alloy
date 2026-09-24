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
  skillCost,
  stepWorld,
  unlockedSkills,
  type ArpgEvent,
  type ArpgWorld,
  type GearItem,
  type ManaMap,
  type ReactionId,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '../registry';
import { ArenaRenderer } from './ArenaRenderer';
import { loadDelveSprites } from './sprites';
import { attachKeyboard, createArenaInput, moveVector, type ArenaInput } from './input';

/**
 * Runs a floor: owns the ArpgWorld and the Pixi renderer, drives the engine
 * from Pixi's ticker, banks pickups into the save as they happen, and hands
 * floor clears / deaths back to the dive state machine. Rules stay in the
 * engine — this hook only times and routes.
 */

export interface SlotHud {
  skillId: string | null;
  /** Seconds until ready (0 = ready). */
  cooldown: number;
  cooldownTotal: number;
  affordable: boolean;
}

export interface ArenaHud {
  hp: number;
  maxHp: number;
  mana: ManaMap;
  manaMax: ManaMap;
  slots: SlotHud[];
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
  | { kind: 'spells'; unlocked: string[] }
  | { kind: 'cleared'; bountyAdded: number; bossKilled: boolean }
  | { kind: 'fell' }
  | { kind: 'noMana'; skillId: string }
  | { kind: 'events'; events: ArpgEvent[] };

const END_DELAY = 1.3;

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
  const registry = getDelveRegistry();
  const boss =
    world.bossId !== null ? world.monsters.find((m) => m.id === world.bossId) : undefined;
  return {
    hp: h.hp,
    maxHp: h.stats.maxHp,
    mana: { ...h.mana },
    manaMax: { ...h.manaMax },
    slots: h.skillSlots.map((id) => {
      if (!id) return { skillId: null, cooldown: 0, cooldownTotal: 1, affordable: false };
      const skill = registry.getSkill(id);
      const cost = skillCost(skill, h.stats);
      return {
        skillId: id,
        cooldown: Math.max(0, (h.cooldowns[id] ?? 0) - world.t),
        cooldownTotal: skill.cooldown * h.stats.cooldownMult,
        affordable: (Object.entries(cost) as [keyof ManaMap, number][]).every(
          ([m, c]) => h.mana[m] >= c,
        ),
      };
    }),
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
          const dt = Math.min(0.1, ticker.deltaMS / 1000);
          if (!world) return;
          const paused = pausedRef.current;
          if (!paused && !finishedRef.current) {
            const input = inputRef.current;
            const events = stepWorld(
              registry,
              world,
              flags.autopilot
                ? botInput(registry, world)
                : { move: moveVector(input), cast: input.cast, potion: input.potion },
              dt * flags.timescale,
            );
            input.cast = null;
            input.potion = false;
            if (events.length > 0) {
              renderer.handleEvents(events);
              handleEvents(world, events);
            }
            checkEnd(world);
          }
          renderer.setInsets(insetsRef.current.top, insetsRef.current.bottom);
          renderer.update(paused ? 0 : dt);
          hudClock += dt;
          if (hudClock > 0.08) {
            hudClock = 0;
            setHud(snapshot(world));
          }
        });
        setReady(true);
      });

    function handleEvents(world: ArpgWorld, events: ArpgEvent[]) {
      onUiRef.current({ kind: 'events', events });
      for (const e of events)
        if (e.kind === 'noMana') onUiRef.current({ kind: 'noMana', skillId: e.skillId });
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

  // Gear or spell bar changed mid-floor → hot-swap hero stats and announce unlocks.
  const lastUnlocked = useRef<string[] | null>(null);
  useEffect(() => {
    const stats = computeHeroStats(profile.equipped, registry);
    const unlocked = unlockedSkills(stats.attunement, registry).map((s) => s.id);
    if (lastUnlocked.current) {
      const fresh = unlocked.filter((id) => !lastUnlocked.current!.includes(id));
      if (fresh.length > 0) onUiRef.current({ kind: 'spells', unlocked: fresh });
    }
    lastUnlocked.current = unlocked;
    const world = worldRef.current;
    if (world && !world.heroDead && !finishedRef.current) {
      refreshWorldHero(registry, world, stats, profile.skillSlots);
      setHud(snapshot(world));
    }
  }, [profile.equipped, profile.skillSlots, registry]);

  const cast = useCallback((slot: number) => {
    inputRef.current.cast = slot;
  }, []);
  const potion = useCallback(() => {
    inputRef.current.potion = true;
  }, []);
  const heroScreen = useCallback(() => rendererRef.current?.heroScreen() ?? null, []);
  const pixelsPerUnit = useCallback(() => rendererRef.current?.pixelsPerUnit() ?? 30, []);

  return { hud, ready, input: inputRef.current, cast, potion, heroScreen, pixelsPerUnit, worldRef };
}
