import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  clearMonsters,
  createSandboxWorld,
  fillCharge as fillWorldCharge,
  resetDummies as resetWorldDummies,
  respawnHero,
  setSandboxToggles,
  spawnDummies,
  spawnMonsters,
  type DummyLayout,
  type MonsterKind,
} from '@alloy/engine';
import { MAX_DUMMY_GROUPS, useSandboxStats, useSandboxStore } from '@/stores/sandboxStore';
import { getDelveRegistry } from '../registry';
import { useArenaCore, type ArenaMode, type CoreUiEvent } from '../arena/useArenaCore';
import { DamageMeter, type MeterSummary } from './meter';

/** How often the meter readout refreshes (real time), in ms. */
const METER_EVERY_MS = 250;

/**
 * The Training Grounds on the shared arena core: a sandbox world from the
 * sandbox store (its dummy groups replayed from heroStart on every rebuild),
 * the toggles and loadout hot-swapped mid-fight, a respawn at once on death,
 * and the damage meter fed from the events. Panel actions go through the
 * engine's sandbox functions; nothing here touches the Delve save.
 */
export function useTrainingArena(
  hostRef: RefObject<HTMLDivElement | null>,
  opts: {
    paused: boolean;
    insets: { top: number; bottom: number };
    onUi: (e: CoreUiEvent) => void;
    manualAttack: boolean;
  },
) {
  const registry = getDelveRegistry();
  const stats = useSandboxStats();
  const abilities = useSandboxStore((s) => s.abilities);
  const depth = useSandboxStore((s) => s.depth);
  const toggles = useSandboxStore((s) => s.toggles);
  const slowmo = useSandboxStore((s) => s.slowmo);
  const meterRef = useRef(new DamageMeter());
  const [meter, setMeter] = useState<MeterSummary>(() => meterRef.current.summary(0));
  const loadout = useMemo(() => ({ stats, abilities }), [stats, abilities]);

  const mode: ArenaMode = {
    // A new depth rebuilds the arena: dummy groups are replayed, spawned monsters go.
    worldKey: `depth:${depth}`,
    createWorld: () => {
      const s = useSandboxStore.getState();
      const world = createSandboxWorld(registry, {
        depth: s.depth,
        stats: loadout.stats,
        abilities: loadout.abilities,
        toggles: s.toggles,
      });
      for (const group of s.dummies) spawnDummies(registry, world, group);
      meterRef.current.reset();
      return world;
    },
    loadout,
    frame: () => false,
    onEvents: (world, events) => meterRef.current.record(events, world.t),
    onHeroDead: (world) => respawnHero(registry, world),
    speed: slowmo,
  };
  const arena = useArenaCore(hostRef, mode, opts);
  const { worldRef } = arena;

  useEffect(() => {
    if (worldRef.current) setSandboxToggles(worldRef.current, toggles);
  }, [toggles, worldRef]);

  useEffect(() => {
    const id = setInterval(
      () => setMeter(meterRef.current.summary(worldRef.current?.t ?? 0)),
      METER_EVERY_MS,
    );
    return () => clearInterval(id);
  }, [worldRef]);

  // Stable across renders, so the memoised panel doesn't re-render with the HUD.
  const actions = useMemo(
    () => ({
      /** Add a group of dummies (in the store's dummy element) above the hero, up to the cap. */
      addDummies: (layout: DummyLayout) => {
        const s = useSandboxStore.getState();
        if (s.dummies.length >= MAX_DUMMY_GROUPS) return;
        if (worldRef.current)
          spawnDummies(registry, worldRef.current, { layout, element: s.dummyElement });
        s.addDummyGroup({ layout, element: s.dummyElement });
      },
      spawn: (defId: string, kind: MonsterKind, count: number) => {
        if (worldRef.current) spawnMonsters(registry, worldRef.current, { defId, kind, count });
      },
      clear: (which: 'monsters' | 'dummies' | 'all') => {
        if (worldRef.current) clearMonsters(worldRef.current, which);
        if (which !== 'monsters') useSandboxStore.getState().clearDummyGroups();
      },
      resetDummies: () => {
        if (worldRef.current) resetWorldDummies(worldRef.current);
      },
      fillCharge: () => {
        if (worldRef.current) fillWorldCharge(worldRef.current);
      },
      resetMeter: () => {
        meterRef.current.reset();
        setMeter(meterRef.current.summary(worldRef.current?.t ?? 0));
      },
    }),
    [registry, worldRef],
  );

  return { ...arena, meter, actions };
}

export type TrainingArena = ReturnType<typeof useTrainingArena>;
export type TrainingActions = TrainingArena['actions'];
