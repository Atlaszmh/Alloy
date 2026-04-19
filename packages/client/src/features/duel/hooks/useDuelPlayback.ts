import { useCallback, useEffect, useRef, useState } from 'react';
import type { CombatLog } from '@alloy/engine';
import { DuelScene } from '../pixi/DuelScene.js';

export interface PlaybackControls {
  currentTime: number;
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  skip: () => void;
  setSpeed: (speed: number) => void;
  speed: number;
  maxTime: number;
  progress: number;
}

export function useDuelPlayback(
  combatLog: CombatLog | null,
  scene: DuelScene | null,
): PlaybackControls {
  const [currentTime, setCurrentTime] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);

  const stateRef = useRef({
    currentTime: -1,
    isPlaying: false,
    speed: 1,
    lastTimestamp: 0,
    accumulator: 0,
    rafId: 0,
    /** Timestamp (ms, `performance.now()` clock) until which time advancement is paused. */
    pauseUntil: 0,
  });

  const maxTime = combatLog
    ? combatLog.frames.length > 0
      ? combatLog.frames[combatLog.frames.length - 1].time
      : 0
    : 0;

  // Process events for a given time range
  const processTimeRange = useCallback(
    (fromTime: number, toTime: number) => {
      if (!combatLog || !scene) return;

      for (const frame of combatLog.frames) {
        if (frame.time <= fromTime) continue;
        if (frame.time > toTime) break;

        for (const event of frame.events) {
          scene.processEvent(frame.time, event);
        }
      }

      scene.processedTime = toTime;
    },
    [combatLog, scene],
  );

  // Animation frame loop — advance in real time (seconds)
  useEffect(() => {
    const state = stateRef.current;

    const step = (timestamp: number) => {
      if (!state.isPlaying || !combatLog) {
        state.rafId = 0;
        return;
      }

      if (state.lastTimestamp === 0) {
        state.lastTimestamp = timestamp;
      }

      // Hit-pause: hold world still while still ticking visual animations.
      if (state.pauseUntil > timestamp) {
        const deltaMs = timestamp - state.lastTimestamp;
        state.lastTimestamp = timestamp;
        scene?.update(deltaMs / 16.67);
        state.rafId = requestAnimationFrame(step);
        return;
      }

      const deltaMs = timestamp - state.lastTimestamp;
      state.lastTimestamp = timestamp;

      // Convert delta to seconds scaled by playback speed
      const deltaSec = (deltaMs / 1000) * state.speed;
      const prevTime = state.currentTime;
      const newTime = Math.min(state.currentTime + deltaSec, maxTime);
      state.currentTime = newTime;

      if (newTime > prevTime) {
        processTimeRange(prevTime, newTime);
        scene?.update(deltaMs / 16.67);
        setCurrentTime(newTime);

        // Scan events just processed — a crit triggers an 80ms hit-pause.
        for (const frame of combatLog.frames) {
          if (frame.time <= prevTime) continue;
          if (frame.time > newTime) break;
          for (const event of frame.events) {
            if (event.type === 'attack' && event.breakdown.isCrit) {
              state.pauseUntil = timestamp + 80;
            }
          }
        }

        if (newTime >= maxTime) {
          state.isPlaying = false;
          setIsPlaying(false);
          return;
        }
      } else {
        // Still update visual animations even if no new time
        scene?.update(deltaMs / 16.67);
      }

      state.rafId = requestAnimationFrame(step);
    };

    if (state.isPlaying) {
      state.lastTimestamp = 0;
      state.rafId = requestAnimationFrame(step);
    }

    return () => {
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = 0;
      }
    };
  }, [isPlaying, combatLog, scene, maxTime, processTimeRange]);

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
    if (state.currentTime >= maxTime && maxTime > 0) {
      // Reset to beginning
      state.currentTime = -1;
      scene?.reset();
      setCurrentTime(-1);
    }
    state.pauseUntil = 0;
    state.isPlaying = true;
    setIsPlaying(true);
  }, [maxTime, scene]);

  const pause = useCallback(() => {
    stateRef.current.isPlaying = false;
    setIsPlaying(false);
  }, []);

  const skip = useCallback(() => {
    if (!combatLog || !scene) return;
    const state = stateRef.current;

    // Process all remaining events
    processTimeRange(state.currentTime, maxTime);
    state.currentTime = maxTime;
    state.isPlaying = false;
    setCurrentTime(maxTime);
    setIsPlaying(false);
  }, [combatLog, scene, maxTime, processTimeRange]);

  const setSpeed = useCallback((newSpeed: number) => {
    const clamped = Math.max(0.25, Math.min(4, newSpeed));
    stateRef.current.speed = clamped;
    setSpeedState(clamped);
  }, []);

  const progress = maxTime > 0 ? Math.max(0, currentTime) / maxTime : 0;

  return {
    currentTime,
    isPlaying,
    play,
    pause,
    skip,
    setSpeed,
    speed,
    maxTime,
    progress,
  };
}
