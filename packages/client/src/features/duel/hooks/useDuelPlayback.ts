import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatLog } from '@alloy/engine';
import { DuelScene } from '../pixi/DuelScene.js';

export interface PlaybackControls {
  currentTick: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  skip: () => void;
  setSpeed: (speed: number) => void;
  speed: number;
  totalTicks: number;
  progress: number;
}

export function useDuelPlayback(
  combatLog: CombatLog | null,
  scene: DuelScene | null,
): PlaybackControls {
  const [currentTick, setCurrentTick] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const stateRef = useRef({
    currentTick: -1,
    isPlaying: false,
    speed: 1,
    lastTimestamp: 0,
    accumulator: 0,
    rafId: 0,
  });

  const totalTicks = combatLog
    ? combatLog.ticks.length > 0
      ? combatLog.ticks[combatLog.ticks.length - 1].tick
      : 0
    : 0;

  // Process events for a given tick range
  const processTickRange = useCallback(
    (fromTick: number, toTick: number) => {
      if (!combatLog || !scene) return;

      for (const tickData of combatLog.ticks) {
        if (tickData.tick <= fromTick) continue;
        if (tickData.tick > toTick) break;

        for (const event of tickData.events) {
          scene.processEvent(tickData.tick, event);
        }
      }

      scene.processedTick = toTick;
    },
    [combatLog, scene],
  );

  // Animation frame loop
  useEffect(() => {
    const state = stateRef.current;

    const tick = (timestamp: number) => {
      if (!state.isPlaying || !combatLog) {
        state.rafId = 0;
        return;
      }

      if (state.lastTimestamp === 0) {
        state.lastTimestamp = timestamp;
      }

      const deltaMs = timestamp - state.lastTimestamp;
      state.lastTimestamp = timestamp;

      // Accumulate time; each "tick" is ~33ms at 30 ticks/sec base
      const tickDuration = 33 / state.speed;
      state.accumulator += deltaMs;

      let ticksToAdvance = 0;
      while (state.accumulator >= tickDuration) {
        state.accumulator -= tickDuration;
        ticksToAdvance++;
      }

      if (ticksToAdvance > 0) {
        const prevTick = state.currentTick;
        const newTick = Math.min(state.currentTick + ticksToAdvance, totalTicks);
        state.currentTick = newTick;

        processTickRange(prevTick, newTick);
        scene?.update(ticksToAdvance);
        setCurrentTick(newTick);

        if (newTick >= totalTicks) {
          state.isPlaying = false;
          setIsPlaying(false);
          return;
        }
      } else {
        // Still update visual animations even if no new tick
        scene?.update(deltaMs / 16.67);
      }

      state.rafId = requestAnimationFrame(tick);
    };

    if (state.isPlaying) {
      state.lastTimestamp = 0;
      state.accumulator = 0;
      state.rafId = requestAnimationFrame(tick);
    }

    return () => {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
    };
  }, [isPlaying, combatLog, scene, totalTicks, processTickRange]);

  // Sync scene update loop for animations even when paused
  useEffect(() => {
    if (isPlaying || !scene) return;

    let rafId = 0;
    let lastTs = 0;

    const animate = (ts: number) => {
      if (lastTs > 0) {
        const dt = (ts - lastTs) / 16.67;
        scene.update(dt);
      }
      lastTs = ts;
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, scene]);

  const play = useCallback(() => {
    const state = stateRef.current;
    if (state.currentTick >= totalTicks && totalTicks > 0) {
      // Reset to beginning
      state.currentTick = -1;
      scene?.reset();
      setCurrentTick(-1);
    }
    state.isPlaying = true;
    setIsPlaying(true);
  }, [totalTicks, scene]);

  const pause = useCallback(() => {
    stateRef.current.isPlaying = false;
    setIsPlaying(false);
  }, []);

  const skip = useCallback(() => {
    if (!combatLog || !scene) return;
    const state = stateRef.current;

    // Process all remaining events
    processTickRange(state.currentTick, totalTicks);
    state.currentTick = totalTicks;
    state.isPlaying = false;
    setCurrentTick(totalTicks);
    setIsPlaying(false);
  }, [combatLog, scene, totalTicks, processTickRange]);

  const setSpeed = useCallback((newSpeed: number) => {
    const clamped = Math.max(0.25, Math.min(4, newSpeed));
    stateRef.current.speed = clamped;
    setSpeedState(clamped);
  }, []);

  const progress = totalTicks > 0 ? Math.max(0, currentTick) / totalTicks : 0;

  return {
    currentTick,
    isPlaying,
    play,
    pause,
    skip,
    setSpeed,
    speed,
    totalTicks,
    progress,
  };
}
