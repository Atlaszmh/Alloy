import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { OrbInstance } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';

// ── Types ──

interface ScatterPhysics {
  uid: string;
  vx: number;
  vy: number;
  rotation: number;
  delay: number;
}

interface UseDraftEndSequenceOptions {
  pool: OrbInstance[];
  phase: { kind: string } | null;
  draftRound: number;
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
}

interface UseDraftEndSequenceResult {
  overlayElement: React.ReactNode;
  isActive: boolean;
}

// ── Hook ──

export function useDraftEndSequence({
  pool,
  phase,
  draftRound,
  gemPositionsRef,
}: UseDraftEndSequenceOptions): UseDraftEndSequenceResult {
  const [isActive, setIsActive] = useState(false);

  // Snapshot pool UIDs for scatter physics — keep last non-empty pool
  const triggeredRef = useRef(false);
  const scatterPhysicsRef = useRef<ScatterPhysics[]>([]);
  const lastPoolUidsRef = useRef<string[]>([]);

  if (pool.length > 0 && !triggeredRef.current) {
    lastPoolUidsRef.current = pool.map((o) => o.uid);
  }

  // Generate random scatter physics for each remaining gem
  const generateScatterPhysics = useCallback(() => {
    return lastPoolUidsRef.current.map((uid) => {
      const angle = (Math.random() - 0.5) * Math.PI * 1.5;
      const speed = 600 + Math.random() * 800;
      return {
        uid,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 300,
        rotation: (Math.random() - 0.5) * 1080,
        delay: Math.random() * 150,
      };
    });
  }, []);

  // Animate the ACTUAL gem DOM elements in place — no spawning copies
  const scatterActualGems = useCallback((physics: ScatterPhysics[]) => {
    for (const p of physics) {
      // Find the actual gem element in the pool grid
      const wrapper = document.querySelector(`[data-gem-uid="${p.uid}"]`) as HTMLElement;
      if (!wrapper) continue;

      // Make it break out of grid flow for the animation
      wrapper.style.position = 'relative';
      wrapper.style.zIndex = '10';
      wrapper.style.willChange = 'transform, opacity';

      wrapper.animate([
        {
          transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)',
          opacity: 1,
        },
        {
          transform: `translate3d(${p.vx * 0.5}px, ${p.vy * 0.3 + 60}px, 0) rotate(${p.rotation * 0.4}deg) scale(0.7)`,
          opacity: 0.85,
          offset: 0.45,
        },
        {
          transform: `translate3d(${p.vx}px, ${p.vy + 400}px, 0) rotate(${p.rotation}deg) scale(0.2)`,
          opacity: 0,
        },
      ], {
        duration: 1000,
        delay: p.delay,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        fill: 'forwards',
      });
    }
  }, []);

  // Detect draft completion and trigger animation
  useLayoutEffect(() => {
    if (phase?.kind === 'forge' && !triggeredRef.current) {
      triggeredRef.current = true;
      scatterPhysicsRef.current = generateScatterPhysics();
      setIsActive(true);
    }
  });

  // Build overlay — ONLY contains the forge card, no duplicate gems
  let overlayElement: React.ReactNode = null;
  if (isActive) {
    overlayElement = (
      <div
        className="fixed inset-0 z-[60] overflow-hidden pointer-events-none"
        ref={(container) => {
          if (!container) return;
          if (container.dataset.orchestrated) return;
          container.dataset.orchestrated = 'true';

          const cardEl = container.querySelector('[data-forge-card]') as HTMLElement;
          if (!cardEl) return;

          // Phase 0: Card peeks from top
          const peekAnim = cardEl.animate([
            { transform: 'translateY(-200vh) scale(1.2)', opacity: 0 },
            { transform: 'translateY(-88vh) scale(1.15)', opacity: 0.6 },
          ], {
            duration: 400,
            easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
            fill: 'forwards',
          });

          peekAnim.finished.then(() => {
            playSound('forgeCreak');

            // Phase 0b: Card trembles
            const shakeAnim = cardEl.animate([
              { transform: 'translateY(-88vh) rotate(0deg) scale(1.15)' },
              { transform: 'translateY(-87.5vh) rotate(-0.8deg) scale(1.15)', offset: 0.15 },
              { transform: 'translateY(-88.5vh) rotate(0.6deg) scale(1.15)', offset: 0.3 },
              { transform: 'translateY(-87vh) rotate(-1deg) scale(1.15)', offset: 0.5 },
              { transform: 'translateY(-88vh) rotate(0.8deg) scale(1.16)', offset: 0.7 },
              { transform: 'translateY(-86.5vh) rotate(-0.5deg) scale(1.17)', offset: 0.85 },
              { transform: 'translateY(-86vh) rotate(0deg) scale(1.18)' },
            ], {
              duration: 800,
              easing: 'linear',
              fill: 'forwards',
            });

            return shakeAnim.finished;
          }).then(() => {
            // Phase 1: Card drops
            const dropAnim = cardEl.animate([
              { transform: 'translateY(-86vh) scale(1.18)', opacity: 0.8 },
              { transform: 'translateY(0%) scale(1.08)', opacity: 1 },
            ], {
              duration: 500,
              easing: 'cubic-bezier(0.55, 0, 1, 0.45)',
              fill: 'forwards',
            });

            return dropAnim.finished;
          }).then(() => {
            // ── IMPACT ──
            playSound('forgeSlam');
            playSound('gemScatter');
            setTimeout(() => playSound('gemScatter'), 150);

            // Bounce settle
            cardEl.animate([
              { transform: 'translateY(0%) scale(1.08)' },
              { transform: 'translateY(-5%) scale(0.95)', offset: 0.2 },
              { transform: 'translateY(2%) scale(1.03)', offset: 0.45 },
              { transform: 'translateY(-1%) scale(0.99)', offset: 0.65 },
              { transform: 'translateY(0%) scale(1)', offset: 0.85 },
              { transform: 'translateY(0%) scale(1)' },
            ], {
              duration: 800,
              easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
              fill: 'forwards',
            });

            // Screen shake
            container.animate([
              { transform: 'translate(0, 0)' },
              { transform: 'translate(-6px, 4px)', offset: 0.08 },
              { transform: 'translate(7px, -3px)', offset: 0.18 },
              { transform: 'translate(-5px, 5px)', offset: 0.28 },
              { transform: 'translate(4px, -4px)', offset: 0.4 },
              { transform: 'translate(-2px, 2px)', offset: 0.55 },
              { transform: 'translate(1px, -1px)', offset: 0.7 },
              { transform: 'translate(0, 0)' },
            ], {
              duration: 500,
              easing: 'linear',
            });

            // Scatter the ACTUAL pool gems — no copies needed
            scatterActualGems(scatterPhysicsRef.current);
          });
        }}
      >
        {/* Forge card — the only element in the overlay */}
        <div
          data-forge-card
          className="fixed inset-0 flex items-center justify-center"
          style={{ transform: 'translateY(-200vh)', willChange: 'transform, opacity' }}
        >
          <div
            className="rounded-2xl border-2 border-accent-400 bg-surface-900/95 px-14 py-10 shadow-2xl"
            style={{
              boxShadow: '0 0 80px rgba(212, 168, 52, 0.5), 0 25px 50px rgba(0,0,0,0.6)',
            }}
          >
            <h1
              className="text-6xl font-black text-accent-400"
              style={{
                fontFamily: 'var(--font-family-display)',
                textShadow: '0 0 40px rgba(212, 168, 52, 0.7)',
                letterSpacing: '0.12em',
              }}
            >
              FORGE
            </h1>
            <p
              className="mt-3 text-center text-base font-bold text-surface-300"
              style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.15em' }}
            >
              ROUND {draftRound}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return { overlayElement, isActive };
}
