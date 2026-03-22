import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OrbInstance } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';

// ── Types ──

interface UseOpponentPickAnimationOptions {
  pool: OrbInstance[];
  opponentStockpile: OrbInstance[];
  isPlayerTurn: boolean;
  opponentZoneRef: React.RefObject<HTMLDivElement | null>;
}

export interface SwoopTarget {
  uid: string;
  dx: number;  // delta X from gem's current position to opponent stockpile
  dy: number;  // delta Y
}

interface UseOpponentPickAnimationResult {
  /** Currently swooping gem UID + target delta — pass to pool grid for custom exit animation */
  swoopTarget: SwoopTarget | null;
  /** Pre-animate a specific orb's swoop (for last AI pick before dispatch) */
  startSwoopAnimation: (orb: OrbInstance) => Promise<void>;
  /** Opponent stockpile with the in-flight orb filtered out */
  filteredOpponentStockpile: OrbInstance[];
  /** Shared position cache — used by useDraftEndSequence */
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
}

// ── Hook ──

export function useOpponentPickAnimation({
  pool,
  opponentStockpile,
  isPlayerTurn,
  opponentZoneRef,
}: UseOpponentPickAnimationOptions): UseOpponentPickAnimationResult {
  // Cache gem positions — merge so positions survive across pool changes
  const gemPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    const positions = gemPositionsRef.current;
    for (const orb of pool) {
      const el = document.querySelector(`[data-gem-uid="${orb.uid}"] [data-gem]`) ??
                 document.querySelector(`[data-gem-uid="${orb.uid}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions.set(orb.uid, { x: rect.left, y: rect.top });
      }
    }
  }, [pool]);

  const prevPoolRef = useRef<OrbInstance[]>(pool);
  const [swoopTarget, setSwoopTarget] = useState<SwoopTarget | null>(null);

  // Compute swoop delta from a gem's cached position to the opponent stockpile center
  const computeSwoopDelta = useCallback((uid: string): SwoopTarget | null => {
    const gemPos = gemPositionsRef.current.get(uid);
    const opRect = opponentZoneRef.current?.getBoundingClientRect();
    if (!gemPos || !opRect) return null;

    return {
      uid,
      dx: (opRect.left + opRect.width / 2) - gemPos.x,
      dy: (opRect.top + opRect.height / 2) - gemPos.y,
    };
  }, [opponentZoneRef]);

  // Start swoop for a specific orb — returns Promise that resolves when done
  const startSwoopAnimation = useCallback((orb: OrbInstance): Promise<void> => {
    const target = computeSwoopDelta(orb.uid);
    if (!target) return Promise.resolve();

    setSwoopTarget(target);
    playSound('orbPickOpponent');

    return new Promise((resolve) => {
      setTimeout(() => {
        playSound('dropSuccess');
        setSwoopTarget(null);
        resolve();
      }, 950);
    });
  }, [computeSwoopDelta]);

  // Detect opponent picks automatically
  useEffect(() => {
    const prevPool = prevPoolRef.current;
    prevPoolRef.current = pool;

    if (prevPool.length > 0 && pool.length < prevPool.length) {
      const removedOrb = prevPool.find((o) => !pool.some((p) => p.uid === o.uid));
      const inOpponentStockpile = removedOrb && opponentStockpile.some((o) => o.uid === removedOrb.uid);
      if (removedOrb && inOpponentStockpile) {
        startSwoopAnimation(removedOrb);
      }
    }
  }, [pool, isPlayerTurn, opponentStockpile, startSwoopAnimation]);

  // Filter swooping orb from opponent stockpile display
  const filteredOpponentStockpile = swoopTarget
    ? opponentStockpile.filter((o) => o.uid !== swoopTarget.uid)
    : opponentStockpile;

  return {
    swoopTarget,
    startSwoopAnimation,
    filteredOpponentStockpile,
    gemPositionsRef,
  };
}
