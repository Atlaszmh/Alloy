import { useCallback, useEffect, useRef, useState } from 'react';
import {
  beginFight,
  computeHeroStats,
  drinkPotion,
  isEnraged,
  isSlamReady,
  refreshFightHero,
  resolveFight,
  slamChargeMax,
  stepFight,
  triggerSlam,
  type FightEvent,
  type FightOutcome,
  type FightState,
  type MonsterInstance,
} from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from './registry';

/**
 * Orchestrates a dive on the client: creates the current encounter via the
 * engine, advances it from requestAnimationFrame at the chosen speed, and
 * resolves finished fights back into the persisted profile. No game rules
 * live here — only timing and hand-off between engine calls.
 */

export type DiveStage =
  | 'approach'
  | 'fighting'
  | 'looting'
  | 'choosing'
  | 'dead'
  | 'extracted'
  | 'none';

export interface DiveHud {
  heroHp: number;
  heroMax: number;
  monsterHp: number;
  monsterMax: number;
  slamCharge: number;
  slamMax: number;
  burning: boolean;
  chilled: boolean;
  enraged: boolean;
}

export interface DiveCallbacks {
  onFightStart: (fight: FightState) => void;
  onEvents: (events: FightEvent[], fight: FightState) => void;
  onResolved: (outcome: FightOutcome, fight: FightState) => void;
}

const APPROACH_MS = 650;

function beatMs(outcome: FightOutcome): number {
  if (!outcome.victory) return 1400;
  const legendary = outcome.drops.some((d) => d.rarity === 'legendary');
  const base =
    outcome.monster.kind === 'boss' ? 1900 : outcome.monster.kind === 'elite' ? 1200 : 850;
  return base + (legendary ? 400 : 0) + (outcome.depthCleared ? 500 : 0);
}

function snapshot(f: FightState): DiveHud {
  const registry = getDelveRegistry();
  return {
    heroHp: f.heroHp,
    heroMax: f.hero.maxHp,
    monsterHp: f.monsterHp,
    monsterMax: f.monster.maxHp,
    slamCharge: f.slamCharge,
    slamMax: slamChargeMax(registry, f),
    burning: f.t < f.burnUntil,
    chilled: f.t < f.chillUntil,
    enraged: isEnraged(registry, f),
  };
}

function sameHud(a: DiveHud | null, b: DiveHud): boolean {
  return (
    !!a &&
    Math.round(a.heroHp) === Math.round(b.heroHp) &&
    a.heroMax === b.heroMax &&
    Math.round(a.monsterHp) === Math.round(b.monsterHp) &&
    a.slamCharge === b.slamCharge &&
    a.slamMax === b.slamMax &&
    a.burning === b.burning &&
    a.chilled === b.chilled &&
    a.enraged === b.enraged
  );
}

export function useDiveController(callbacks: DiveCallbacks, paused: boolean) {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const phase = profile.dive?.phase ?? null;

  const fightRef = useRef<FightState | null>(null);
  const [monster, setMonster] = useState<MonsterInstance | null>(null);
  const [hud, setHud] = useState<DiveHud | null>(null);
  const [stage, setStageState] = useState<DiveStage>('none');
  const stageRef = useRef<DiveStage>('none');
  /** Timed beat (monster approach / loot pause), advanced by the RAF loop. */
  const pendingRef = useRef<{ kind: 'approach' | 'loot'; until: number } | null>(null);
  const cbRef = useRef(callbacks);
  const pausedRef = useRef(paused);
  cbRef.current = callbacks;
  pausedRef.current = paused;

  const setStage = useCallback((s: DiveStage) => {
    stageRef.current = s;
    setStageState(s);
  }, []);

  const pushHud = useCallback((f: FightState) => {
    const next = snapshot(f);
    setHud((prev) => (sameHud(prev, next) ? prev : next));
  }, []);

  const startFight = useCallback(() => {
    const p = useDelveStore.getState().profile;
    const fight = beginFight(registry, p);
    fightRef.current = fight;
    setMonster(fight.monster);
    pushHud(fight);
    setStage('approach');
    pendingRef.current = {
      kind: 'approach',
      until: performance.now() + APPROACH_MS / Math.sqrt(useDelveStore.getState().speed),
    };
    cbRef.current.onFightStart(fight);
  }, [registry, pushHud, setStage]);

  // Start (or restore) the encounter whenever the dive is fighting and idle.
  useEffect(() => {
    if (stageRef.current === 'looting') return;
    if (phase === 'choosing' || phase === 'dead' || phase === 'extracted') {
      setStage(phase);
      return;
    }
    if (phase === 'fighting' && !fightRef.current) startFight();
  }, [phase, profile.dive?.depth, profile.dive?.encounterIndex, startFight, setStage]);

  // Gear swapped mid-dive → hot-swap hero stats into the live fight.
  useEffect(() => {
    const f = fightRef.current;
    if (!f || f.over) return;
    refreshFightHero(f, computeHeroStats(profile.equipped, registry));
    pushHud(f);
  }, [profile.equipped, registry, pushHud]);

  const finishFight = useCallback(
    (f: FightState) => {
      setStage('looting');
      const res = resolveFight(registry, useDelveStore.getState().profile, f);
      useDelveStore.getState().setProfile(res.profile);
      cbRef.current.onResolved(res.outcome, f);
      pendingRef.current = {
        kind: 'loot',
        until: performance.now() + beatMs(res.outcome) / Math.sqrt(useDelveStore.getState().speed),
      };
    },
    [registry, setStage],
  );

  // Main loop: advances the live fight and the timed beats between fights.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      const pending = pendingRef.current;
      if (pending && !pausedRef.current && now >= pending.until) {
        pendingRef.current = null;
        if (pending.kind === 'approach') {
          setStage('fighting');
        } else {
          fightRef.current = null;
          const nextPhase = useDelveStore.getState().profile.dive?.phase;
          if (nextPhase === 'fighting') startFight();
          else setStage(nextPhase ?? 'none');
        }
      }
      const f = fightRef.current;
      if (f && stageRef.current === 'fighting' && !pausedRef.current) {
        const { speed, autoSlam } = useDelveStore.getState();
        const events = f.over ? [] : stepFight(registry, f, dtReal * speed);
        if (!f.over && autoSlam && isSlamReady(registry, f))
          events.push(...triggerSlam(registry, f));
        if (events.length > 0) cbRef.current.onEvents(events, f);
        pushHud(f);
        if (f.over) finishFight(f);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [registry, pushHud, finishFight, startFight, setStage]);

  const slam = useCallback(() => {
    const f = fightRef.current;
    if (!f || stageRef.current !== 'fighting') return false;
    const events = triggerSlam(registry, f);
    if (events.length === 0) return false;
    cbRef.current.onEvents(events, f);
    pushHud(f);
    return true;
  }, [registry, pushHud]);

  const potion = useCallback(() => {
    const f = fightRef.current;
    const live =
      f && !f.over && (stageRef.current === 'fighting' || stageRef.current === 'approach')
        ? f
        : null;
    const res = drinkPotion(registry, useDelveStore.getState().profile, live);
    if (!res.event) return false;
    useDelveStore.getState().setProfile(res.profile);
    if (live) {
      cbRef.current.onEvents([res.event], live);
      pushHud(live);
    }
    return true;
  }, [registry, pushHud]);

  return { stage, monster, hud, fightRef, slam, potion };
}
