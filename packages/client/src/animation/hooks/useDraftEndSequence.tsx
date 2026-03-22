import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { AffixDef, OrbInstance } from '@alloy/engine';
import { GemCard } from '@/components/GemCard';
import { getStatLabel } from '@/shared/utils/stat-label';
import { playSound } from '@/shared/utils/sound-manager';
import type { GemSizeConfig } from '@/hooks/useGemSize';

// ── Types ──

interface DraftEndGem {
  orb: OrbInstance;
  pos: { x: number; y: number };
  vx: number;
  vy: number;
  rotation: number;
  delay: number;
}

interface UseDraftEndSequenceOptions {
  pool: OrbInstance[];
  phase: { kind: string } | null;
  gemSizing: GemSizeConfig;
  draftRound: number;
  affixMap: Map<string, AffixDef>;
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
  poolContainerRef: React.RefObject<HTMLDivElement | null>;
}

interface UseDraftEndSequenceResult {
  overlayElement: React.ReactNode;
  isActive: boolean;
}

// ── Hook ──

export function useDraftEndSequence({
  pool,
  phase,
  gemSizing,
  draftRound,
  affixMap,
  gemPositionsRef,
  poolContainerRef,
}: UseDraftEndSequenceOptions): UseDraftEndSequenceResult {
  const [draftEndGems, setDraftEndGems] = useState<DraftEndGem[] | null>(null);

  // Snapshot the pool for the scatter animation. Always keep the last non-empty pool
  // so it survives the phase change to forge (where pool may be empty/different).
  // Once the end animation has been triggered, stop updating so we keep the final state.
  const triggeredRef = useRef(false);
  const lastDraftPoolRef = useRef<OrbInstance[]>([]);
  if (pool.length > 0 && !triggeredRef.current) {
    lastDraftPoolRef.current = pool;
  }

  // Freeze gem sizing alongside the pool snapshot so the scatter uses the same gem sizes
  const frozenGemSizingRef = useRef<GemSizeConfig>(gemSizing);
  if (pool.length > 0 && !triggeredRef.current) {
    frozenGemSizingRef.current = gemSizing;
  }

  // Trigger the draft-end animation: capture remaining gems + positions, show "FORGE" slam
  const startDraftEndAnimation = useCallback((): Promise<void> => {
    const remaining = lastDraftPoolRef.current
      .map((orb) => {
        const pos = gemPositionsRef.current.get(orb.uid);
        if (!pos) return null;
        // Random scatter physics
        const angle = (Math.random() - 0.5) * Math.PI * 1.5; // wide spread
        const speed = 600 + Math.random() * 800;
        return {
          orb,
          pos,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 300, // bias downward
          rotation: (Math.random() - 0.5) * 1080, // up to 3 full rotations
          delay: Math.random() * 150, // stagger
        };
      })
      .filter(Boolean) as DraftEndGem[];

    if (remaining.length === 0) return Promise.resolve();

    setDraftEndGems(remaining);
    // Sound + scatter timing handled by the orchestrator ref via .finished promises
    // Don't clear draftEndGems — let the forge card persist on screen until
    // PhaseRouter slides the entire draft screen away and unmounts Draft.
    return new Promise((resolve) => {
      // Resolve immediately — PhaseRouter controls the timing via DRAFT_END_HOLD_MS
      resolve();
    });
  }, [gemPositionsRef]); // reads from lastDraftPoolRef and gemPositionsRef

  // Detect draft completion and trigger end animation.
  // CRITICAL: We must hide the pool grid via direct DOM manipulation in useLayoutEffect
  // BEFORE the browser paints. Calling setDraftEndGems alone would schedule a new render,
  // allowing the browser to paint the reflowed grid first (causing a visual blink).
  useLayoutEffect(() => {
    if (phase?.kind === 'forge' && !triggeredRef.current) {
      triggeredRef.current = true;
      // Hide the pool grid IMMEDIATELY via DOM before the browser paints
      if (poolContainerRef.current) {
        poolContainerRef.current.style.visibility = 'hidden';
      }
      startDraftEndAnimation();
    }
  });

  // Use frozen sizing for the scatter overlay
  const sizing = draftEndGems ? frozenGemSizingRef.current : gemSizing;

  // Build overlay JSX
  let overlayElement: React.ReactNode = null;
  if (draftEndGems) {
    overlayElement = (
      <div
        className="fixed inset-0 z-[60] overflow-hidden pointer-events-none"
        data-draft-end-container
        ref={(container) => {
          if (!container) return;
          // Guard: only run the orchestrator once (React may call ref callback on re-renders)
          if (container.dataset.orchestrated) return;
          container.dataset.orchestrated = 'true';
          // ── ORCHESTRATOR: chain animations with .finished promises ──
          const cardEl = container.querySelector('[data-forge-card]') as HTMLElement;
          const gemEls = container.querySelectorAll('[data-scatter-gem]') as NodeListOf<HTMLElement>;
          if (!cardEl) return;

          // Phase 0: Buildup — card peeks from top with a warning shake/creak
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

            // Card trembles in place — "about to fall"
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
            // Phase 1: Card drops from peek position to center (the "fall")
            const dropAnim = cardEl.animate([
              { transform: 'translateY(-86vh) scale(1.18)', opacity: 0.8 },
              { transform: 'translateY(0%) scale(1.08)', opacity: 1 },
            ], {
              duration: 500,
              easing: 'cubic-bezier(0.55, 0, 1, 0.45)', // accelerating fall
              fill: 'forwards',
            });

            return dropAnim.finished;
          }).then(() => {
            // ── IMPACT MOMENT ──
            playSound('forgeSlam');
            playSound('gemScatter'); // backgammon tiles scattering
            // Stagger a second scatter for a richer "gems flying" effect
            setTimeout(() => playSound('gemScatter'), 150);

            // Phase 2: Card bounces and settles
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

            // Phase 2: Screen shake on impact
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

            // Phase 2: Gems scatter outward FROM THE IMPACT
            gemEls.forEach((el, i) => {
              const gem = draftEndGems[i];
              if (!gem) return;
              el.animate([
                {
                  transform: 'translate3d(0, 0, 0) rotate(0deg) scale(1)',
                  opacity: 1,
                },
                {
                  transform: `translate3d(${gem.vx * 0.5}px, ${gem.vy * 0.3 + 60}px, 0) rotate(${gem.rotation * 0.4}deg) scale(0.7)`,
                  opacity: 0.85,
                  offset: 0.45,
                },
                {
                  transform: `translate3d(${gem.vx}px, ${gem.vy + 400}px, 0) rotate(${gem.rotation}deg) scale(0.2)`,
                  opacity: 0,
                },
              ], {
                duration: 1000,
                delay: gem.delay, // small stagger between gems
                easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                fill: 'forwards',
              });
            });
          });
        }}
      >
        {/* Remaining gems — positioned at their last pool locations, waiting to scatter */}
        {draftEndGems.map((gem) => {
          const affix = affixMap.get(gem.orb.affixId);
          if (!affix) return null;
          return (
            <div
              key={gem.orb.uid}
              data-scatter-gem
              className="fixed"
              style={{
                left: gem.pos.x - sizing.gemSize / 2,
                top: gem.pos.y - sizing.gemSize / 2,
                willChange: 'transform, opacity',
              }}
            >
              <GemCard
                affixId={gem.orb.affixId}
                affixName={affix.name}
                tier={gem.orb.tier}
                category={affix.category}
                tags={affix.tags}
                statLabel={getStatLabel(affix, gem.orb)}
                gemSize={sizing.gemSize}
                emojiSize={sizing.emojiSize}
                statSize={sizing.statSize}
                nameSize={sizing.nameSize}
                catSize={sizing.catSize}
              />
            </div>
          );
        })}

        {/* "FORGE" card — positioned center, animated by orchestrator */}
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

  return {
    overlayElement,
    isActive: draftEndGems !== null,
  };
}
