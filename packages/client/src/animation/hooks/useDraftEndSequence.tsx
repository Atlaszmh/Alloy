import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GemInstance } from '@alloy/engine';
import { playSound } from '@/shared/utils/sound-manager';

// ── Types ──

interface PhysicsBody {
  uid: string;
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotX: number;    // flip around horizontal axis (card flopping face-down/up)
  rotY: number;    // flip around vertical axis (card turning edge-on)
  rotZ: number;    // in-plane spin
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  w: number;
  h: number;
  r: number;
  originX: number;
  originY: number;
  resting: boolean;
}

interface UseDraftEndSequenceOptions {
  pool: GemInstance[];
  phase: { kind: string } | null;
  draftRound: number;
  gemPositionsRef: React.RefObject<Map<string, { x: number; y: number }>>;
  /** UID of gem currently swooping — end sequence waits for this to clear */
  swoopingUid: string | null;
}

interface UseDraftEndSequenceResult {
  overlayElement: React.ReactNode;
  isActive: boolean;
}

// ── Physics constants ──

const GRAVITY = 2800;            // px/s²
const AIR_DRAG = 0.992;          // per-frame velocity damping
const WALL_RESTITUTION = 0.55;
const FLOOR_RESTITUTION = 0.48;
const CEILING_RESTITUTION = 0.4;
const GEM_RESTITUTION = 0.55;
const FLOOR_FRICTION = 0.78;
const REST_VY = 90;              // |vy| below this on floor contact → rest
const REST_VX = 35;              // |vx| below this on floor → rest
const REST_VROT = 2.5;           // |vRot*| below this on floor → rest
const DT_CLAMP = 0.032;          // max integrated dt (~30fps worst case)
const PERSPECTIVE = 1400;        // px — gives depth to 3D tumble
const FLOP_DAMP_X = 0.35;        // floor contact damps out-of-plane spin hard
const FLOP_DAMP_Y = 0.35;        // so cards settle flat instead of tumbling
const SPIN_DAMP_Z = 0.6;         // in-plane spin damps less on floor contact

// ── Hook ──

export function useDraftEndSequence({
  pool,
  phase,
  draftRound,
  gemPositionsRef: _gemPositionsRef,
  swoopingUid,
}: UseDraftEndSequenceOptions): UseDraftEndSequenceResult {
  const [isActive, setIsActive] = useState(false);

  const triggeredRef = useRef(false);
  const pendingForgeRef = useRef(false);
  const lastPoolUidsRef = useRef<string[]>([]);
  const rafIdRef = useRef<number | null>(null);
  const bodiesRef = useRef<PhysicsBody[]>([]);

  if (pool.length > 0 && !triggeredRef.current) {
    lastPoolUidsRef.current = pool.map((o) => o.uid);
  }

  // Pin each remaining gem to its current viewport position and start a physics
  // sim: the forge card slamming at center imparts an outward+upward impulse,
  // then gravity/wall/gem-gem collisions settle them on the floor.
  const startPhysicsSimulation = () => {
    const cardX = window.innerWidth / 2;
    const cardY = window.innerHeight / 2;

    // Floor is the bottom edge of the draft pool pane — gems settle inside the
    // pool, not against the viewport floor. Fall back to the viewport if the
    // pool element isn't in the DOM.
    const poolEl = document.querySelector('[data-screen-section="draft-pool"]') as HTMLElement | null;
    const floorY = poolEl ? poolEl.getBoundingClientRect().bottom : window.innerHeight;

    // Pass 1 — measure every gem's live rect BEFORE mutating any of them.
    // Pinning one gem removes it from grid flow, reflowing siblings; measuring
    // upfront keeps all starting positions accurate.
    type Measured = { uid: string; el: HTMLElement; rect: DOMRect };
    const measured: Measured[] = [];
    for (const uid of lastPoolUidsRef.current) {
      const el = document.querySelector(`[data-gem-uid="${uid}"]`) as HTMLElement | null;
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      measured.push({ uid, el, rect });
    }

    // Pass 2 — pin every element, then build physics bodies.
    const bodies: PhysicsBody[] = [];
    for (const { uid, el, rect } of measured) {
      // Cancel any in-flight Web Animations API / framer-motion transform so
      // our per-frame transform isn't fought over.
      if (typeof el.getAnimations === 'function') {
        for (const anim of el.getAnimations()) anim.cancel();
      }
      el.style.transform = 'none';
      el.style.transition = 'none';
      el.style.position = 'fixed';
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      el.style.margin = '0';
      el.style.zIndex = '50';
      el.style.willChange = 'transform';
      el.style.pointerEvents = 'none';

      const bcx = rect.left + rect.width / 2;
      const bcy = rect.top + rect.height / 2;
      const dx = bcx - cardX;
      const dy = bcy - cardY;
      const dist = Math.max(40, Math.hypot(dx, dy));
      const nx = dx / dist;
      const ny = dy / dist;
      const push = 700 + Math.random() * 450;

      bodies.push({
        uid,
        el,
        x: rect.left,
        y: rect.top,
        vx: nx * push + (Math.random() - 0.5) * 360,
        vy: ny * push * 0.25 - (620 + Math.random() * 520),
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        vRotX: (Math.random() - 0.5) * 16,
        vRotY: (Math.random() - 0.5) * 16,
        vRotZ: (Math.random() - 0.5) * 14,
        w: rect.width,
        h: rect.height,
        r: Math.min(rect.width, rect.height) * 0.45,
        originX: rect.left,
        originY: rect.top,
        resting: false,
      });
    }
    bodiesRef.current = bodies;

    let lastT = performance.now();
    const step = (t: number) => {
      let dt = (t - lastT) / 1000;
      lastT = t;
      if (dt > DT_CLAMP) dt = DT_CLAMP;

      const maxX = window.innerWidth;
      const maxY = floorY;

      // Integrate + wall/floor collisions
      for (const b of bodies) {
        if (b.resting) continue;

        b.vy += GRAVITY * dt;
        b.vx *= AIR_DRAG;
        b.vy *= AIR_DRAG;
        b.vRotX *= 0.993;
        b.vRotY *= 0.993;
        b.vRotZ *= 0.992;

        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rotX += b.vRotX * dt;
        b.rotY += b.vRotY * dt;
        b.rotZ += b.vRotZ * dt;

        if (b.x < 0) {
          b.x = 0;
          if (b.vx < 0) b.vx = -b.vx * WALL_RESTITUTION;
        }
        if (b.x + b.w > maxX) {
          b.x = maxX - b.w;
          if (b.vx > 0) b.vx = -b.vx * WALL_RESTITUTION;
        }
        if (b.y < 0) {
          b.y = 0;
          if (b.vy < 0) b.vy = -b.vy * CEILING_RESTITUTION;
        }
        if (b.y + b.h > maxY) {
          b.y = maxY - b.h;
          if (b.vy > 0) {
            b.vy = -b.vy * FLOOR_RESTITUTION;
            b.vx *= FLOOR_FRICTION;
            // Heavy damping on out-of-plane spin — cards flop flat, not tumble.
            b.vRotX *= FLOP_DAMP_X;
            b.vRotY *= FLOP_DAMP_Y;
            b.vRotZ *= SPIN_DAMP_Z;
            if (
              Math.abs(b.vy) < REST_VY &&
              Math.abs(b.vx) < REST_VX &&
              Math.abs(b.vRotX) < REST_VROT &&
              Math.abs(b.vRotY) < REST_VROT &&
              Math.abs(b.vRotZ) < REST_VROT
            ) {
              b.vx = 0;
              b.vy = 0;
              b.vRotX = 0;
              b.vRotY = 0;
              b.vRotZ = 0;
              // rotX snaps to nearest quarter-turn so a card can rest either
              // upright (0, π) OR flat on its face/back (±π/2) — whichever it
              // was closest to when it ran out of energy. rotY snaps to the
              // nearest half-turn so it doesn't freeze edge-on sideways (which
              // would render as a thin vertical sliver).
              const HALF_PI = Math.PI / 2;
              b.rotX = Math.round(b.rotX / HALF_PI) * HALF_PI;
              b.rotY = Math.round(b.rotY / Math.PI) * Math.PI;
              b.resting = true;
            }
          }
        }
      }

      // Pairwise gem-gem collisions (circle approximation)
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const c = bodies[j];
          const acx = a.x + a.w / 2;
          const acy = a.y + a.h / 2;
          const ccx = c.x + c.w / 2;
          const ccy = c.y + c.h / 2;
          const dx = ccx - acx;
          const dy = ccy - acy;
          const d2 = dx * dx + dy * dy;
          const minD = a.r + c.r;
          if (d2 === 0 || d2 >= minD * minD) continue;

          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const overlap = (minD - d) / 2;

          a.x -= nx * overlap;
          a.y -= ny * overlap;
          c.x += nx * overlap;
          c.y += ny * overlap;

          const dvx = c.vx - a.vx;
          const dvy = c.vy - a.vy;
          const vn = dvx * nx + dvy * ny;
          if (vn >= 0) continue;

          const impulse = -(1 + GEM_RESTITUTION) * vn / 2;
          a.vx -= impulse * nx;
          a.vy -= impulse * ny;
          c.vx += impulse * nx;
          c.vy += impulse * ny;
          a.resting = false;
          c.resting = false;

          const spin = (a.vx - c.vx) * 0.02;
          a.vRotZ += spin;
          c.vRotZ -= spin;
          // Small tumble impulse from collision — makes cards flip mid-air
          const tumble = (a.vy - c.vy) * 0.015;
          a.vRotX += tumble;
          c.vRotX -= tumble;
        }
      }

      // Apply transforms — perspective first so the rotations get depth.
      for (const b of bodies) {
        const tx = b.x - b.originX;
        const ty = b.y - b.originY;
        b.el.style.transform =
          `perspective(${PERSPECTIVE}px) ` +
          `translate3d(${tx}px, ${ty}px, 0) ` +
          `rotateX(${b.rotX}rad) ` +
          `rotateY(${b.rotY}rad) ` +
          `rotateZ(${b.rotZ}rad)`;
      }

      rafIdRef.current = requestAnimationFrame(step);
    };

    rafIdRef.current = requestAnimationFrame(step);
  };

  // Detect draft completion and trigger animation (wait for any in-flight swoop)
  useLayoutEffect(() => {
    if (phase?.kind === 'forge' && !triggeredRef.current) {
      if (swoopingUid) {
        pendingForgeRef.current = true;
      } else {
        triggeredRef.current = true;
        pendingForgeRef.current = false;
        setIsActive(true);
      }
    }
  });

  // Fire deferred forge trigger once swoop completes
  useEffect(() => {
    if (pendingForgeRef.current && !swoopingUid && !triggeredRef.current) {
      triggeredRef.current = true;
      pendingForgeRef.current = false;
      setIsActive(true);
    }
  }, [swoopingUid]);

  // Stop rAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

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

            startPhysicsSimulation();
          });
        }}
      >
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
              Let's Forge!
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
