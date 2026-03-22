import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AffixDef, OrbInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';
import { playSound } from '@/shared/utils/sound-manager';
import type { GemSizeConfig } from '@/hooks/useGemSize';

// ── Types ──

interface UseOpponentPickAnimationOptions {
  pool: OrbInstance[];
  opponentStockpile: OrbInstance[];
  isPlayerTurn: boolean;
  affixMap: Map<string, AffixDef>;
  gemSizing: GemSizeConfig;
  opponentZoneRef: React.RefObject<HTMLDivElement | null>;
}

interface UseOpponentPickAnimationResult {
  flyingGemElement: React.ReactNode;
  startSwoopAnimation: (orb: OrbInstance) => Promise<void>;
  filteredOpponentStockpile: OrbInstance[];
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
}

// ── Hook ──

export function useOpponentPickAnimation({
  pool,
  opponentStockpile,
  isPlayerTurn,
  affixMap,
  gemSizing,
  opponentZoneRef,
}: UseOpponentPickAnimationOptions): UseOpponentPickAnimationResult {
  // Cache gem positions — merge into existing cache so positions from
  // previous renders survive (needed for opponent pick animation, where the
  // orb is gone from pool by the time the effect fires)
  const gemPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    const positions = gemPositionsRef.current;
    for (const orb of pool) {
      // Query the GemCard's outer div (data-gem), not the motion.div wrapper (data-gem-uid),
      // because the grid cell may be wider than the GemCard content due to 1fr columns
      const el = document.querySelector(`[data-gem-uid="${orb.uid}"] [data-gem]`) ??
                 document.querySelector(`[data-gem-uid="${orb.uid}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions.set(orb.uid, { x: rect.left, y: rect.top });
      }
    }
  }, [pool]);

  // Track opponent picks for flying gem animation
  const prevPoolRef = useRef<OrbInstance[]>(pool);
  const [flyingOrb, setFlyingOrb] = useState<{
    orb: OrbInstance;
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
  } | null>(null);

  // Start swoop animation for a given orb — returns a Promise that resolves when animation finishes
  const startSwoopAnimation = useCallback((orb: OrbInstance): Promise<void> => {
    const cachedPos = gemPositionsRef.current.get(orb.uid);
    const opRect = opponentZoneRef.current?.getBoundingClientRect();
    if (!cachedPos || !opRect) return Promise.resolve();

    const endPos = { x: opRect.left + opRect.width / 2, y: opRect.top + opRect.height / 2 };
    setFlyingOrb({ orb, startPos: cachedPos, endPos });
    playSound('orbPickOpponent');

    return new Promise((resolve) => {
      setTimeout(() => {
        playSound('dropSuccess');
        setFlyingOrb(null);
        resolve();
      }, 950);
    });
  }, [opponentZoneRef]);

  // Detect opponent pick: pool shrunk and the removed orb is in opponent's stockpile
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

  // Filter flying orb from opponent stockpile display
  const filteredOpponentStockpile = flyingOrb
    ? opponentStockpile.filter((o) => o.uid !== flyingOrb.orb.uid)
    : opponentStockpile;

  // Build flying gem JSX
  let flyingGemElement: React.ReactNode = null;
  if (flyingOrb) {
    const affix = affixMap.get(flyingOrb.orb.affixId);
    if (affix) {
      const dx = flyingOrb.endPos.x - flyingOrb.startPos.x;
      const dy = flyingOrb.endPos.y - flyingOrb.startPos.y;
      // Arc offset: swoop out 100px to the right at peak
      const arc = 100;
      flyingGemElement = (
        <div
          className="pointer-events-none fixed z-50"
          ref={(el) => {
            if (!el) return;
            // Web Animations API — computes actual px values, GPU-composited
            el.animate([
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
          }}
          style={{
            left: flyingOrb.startPos.x,
            top: flyingOrb.startPos.y,
            willChange: 'transform, opacity',
          }}
        >
          <GemCard
            affixId={flyingOrb.orb.affixId}
            affixName={affix.name}
            tier={flyingOrb.orb.tier}
            category={affix.category}
            tags={affix.tags}
            statLabel={getStatLabel(affix, flyingOrb.orb)}
            gemSize={gemSizing.gemSize}
            emojiSize={gemSizing.emojiSize}
            statSize={gemSizing.statSize}
            nameSize={gemSizing.nameSize}
            catSize={gemSizing.catSize}
            selected
          />
        </div>
      );
    }
  }

  return {
    flyingGemElement,
    startSwoopAnimation,
    filteredOpponentStockpile,
    gemPositionsRef,
  };
}
