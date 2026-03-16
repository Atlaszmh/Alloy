import { create } from 'zustand';
import type { CombatLog, TickEvent } from '@alloy/engine';

interface DuelStore {
  combatLog: CombatLog | null;
  currentTick: number;
  playbackSpeed: number;
  isPlaying: boolean;

  setCombatLog: (log: CombatLog) => void;
  setTick: (tick: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  getEventsAtTick: (tick: number) => TickEvent[];
}

export const useDuelStore = create<DuelStore>((set, get) => ({
  combatLog: null,
  currentTick: 0,
  playbackSpeed: 1,
  isPlaying: false,

  setCombatLog: (log) => set({ combatLog: log, currentTick: 0, isPlaying: false }),
  setTick: (tick) => set({ currentTick: tick }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  reset: () => set({ combatLog: null, currentTick: 0, isPlaying: false }),

  getEventsAtTick: (tick) => {
    const { combatLog } = get();
    if (!combatLog) return [];
    const tickData = combatLog.ticks.find((t) => t.tick === tick);
    return tickData?.events ?? [];
  },
}));
