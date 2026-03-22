import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { OrbInstance } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';

// ── Types ──

interface UseOpponentPickAnimationOptions {
  pool: OrbInstance[];
  opponentStockpile: OrbInstance[];
  isPlayerTurn: boolean;
  opponentZoneRef: React.RefObject<HTMLDivElement | null>;
}

interface UseOpponentPickAnimationResult {
  /** Pre-animate a specific orb's swoop (for last AI pick before dispatch) */
  startSwoopAnimation: (orb: OrbInstance) => Promise<void>;
  /** Opponent stockpile with the in-flight orb filtered out */
  filteredOpponentStockpile: OrbInstance[];
  /** Shared position cache — used by useDraftEndSequence */
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
  /** UID of gem currently animating (used to set long exit hold on AnimatePresence) */
  swoopingUid: string | null;
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
  const [swoopingUid, setSwoopingUid] = useState<string | null>(null);
  // Track UIDs that were manually swooped (e.g. last AI pick) so auto-detect skips them
  const manuallySwoopedRef = useRef<Set<string>>(new Set());

  // Animate the actual DOM element to fly to opponent stockpile
  const animateGemToStockpile = useCallback((uid: string): Promise<void> => {
    const el = document.querySelector(`[data-gem-uid="${uid}"]`) as HTMLElement;
    const opRect = opponentZoneRef.current?.getBoundingClientRect();
    if (!el || !opRect) return Promise.resolve();

    const gemRect = el.getBoundingClientRect();
    const dx = (opRect.left + opRect.width / 2) - (gemRect.left + gemRect.width / 2);
    const dy = (opRect.top + opRect.height / 2) - (gemRect.top + gemRect.height / 2);
    const arc = 100;

    setSwoopingUid(uid);
    playSound('orbPickOpponent');

    // Switch to fixed positioning so it escapes the overflow:hidden pool container
    const rect = el.getBoundingClientRect();
    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.zIndex = '999';

    const anim = el.animate([
      { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      { transform: `translate3d(${dx * 0.1 + arc * 0.6}px, ${dy * 0.15}px, 0) scale(0.9)`, opacity: 1 },
      { transform: `translate3d(${dx * 0.3 + arc}px, ${dy * 0.4}px, 0) scale(0.7)`, opacity: 1 },
      { transform: `translate3d(${dx * 0.6 + arc * 0.7}px, ${dy * 0.65}px, 0) scale(0.5)`, opacity: 0.95 },
      { transform: `translate3d(${dx * 0.85 + arc * 0.3}px, ${dy * 0.85}px, 0) scale(0.35)`, opacity: 0.8 },
      { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.3)`, opacity: 0 },
    ], {
      duration: 900,
      easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      fill: 'forwards',
    });

    return anim.finished.then(() => {
      playSound('dropSuccess');
      setSwoopingUid(null);
    });
  }, [opponentZoneRef]);

  // Start swoop for a specific orb (called by AI turn effect for last pick)
  const startSwoopAnimation = useCallback((orb: OrbInstance): Promise<void> => {
    manuallySwoopedRef.current.add(orb.uid);
    return animateGemToStockpile(orb.uid);
  }, [animateGemToStockpile]);

  // Detect opponent picks in useLayoutEffect — fires before paint,
  // element is still in DOM (AnimatePresence hasn't removed it yet)
  useLayoutEffect(() => {
    const prevPool = prevPoolRef.current;
    prevPoolRef.current = pool;

    if (prevPool.length > 0 && pool.length < prevPool.length) {
      const removedOrb = prevPool.find((o) => !pool.some((p) => p.uid === o.uid));
      const inOpponentStockpile = removedOrb && opponentStockpile.some((o) => o.uid === removedOrb.uid);
      if (removedOrb && inOpponentStockpile && !manuallySwoopedRef.current.has(removedOrb.uid)) {
        animateGemToStockpile(removedOrb.uid);
      }
    }
  });

  // Filter swooping orb from opponent stockpile display
  const filteredOpponentStockpile = swoopingUid
    ? opponentStockpile.filter((o) => o.uid !== swoopingUid)
    : opponentStockpile;

  return {
    startSwoopAnimation,
    filteredOpponentStockpile,
    gemPositionsRef,
    swoopingUid,
  };
}
