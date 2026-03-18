import { useEffect, useRef } from 'react';
import { playSound } from '@/shared/utils/sound-manager';
import type { TickEvent } from '@alloy/engine';

export function useDuelSounds(
  visibleEvents: Array<{ tick: number; event: TickEvent }>,
  isPlaying: boolean,
  showBreakdown: boolean,
  currentResult: { winner: number } | null,
): void {
  const lastProcessedCount = useRef(0);

  // Reset when replaying (isPlaying becomes true and events reset to 0)
  useEffect(() => {
    if (isPlaying && visibleEvents.length === 0) {
      lastProcessedCount.current = 0;
    }
  }, [isPlaying, visibleEvents.length]);

  // Play sounds for new combat events
  useEffect(() => {
    const count = visibleEvents.length;
    if (count <= lastProcessedCount.current) return;

    const newEvents = visibleEvents.slice(lastProcessedCount.current);
    lastProcessedCount.current = count;

    for (const { event } of newEvents) {
      switch (event.type) {
        case 'attack':
          playSound(event.isCrit ? 'crit' : 'attack');
          break;
        case 'dodge':
          playSound('dodge');
          break;
        case 'block':
          playSound('block');
          break;
        case 'death':
          playSound('death');
          break;
      }
    }
  }, [visibleEvents]);

  // Play victory/defeat when breakdown appears
  useEffect(() => {
    if (showBreakdown && currentResult) {
      playSound(currentResult.winner === 0 ? 'victory' : 'defeat');
    }
  }, [showBreakdown, currentResult]);
}
