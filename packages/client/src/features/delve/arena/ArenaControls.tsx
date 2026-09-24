import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Vec } from '@alloy/engine';
import type { ArenaInput } from './input';

const STICK_RADIUS = 56;

interface ArenaControlsProps {
  input: ArenaInput;
  /** Hero position in screen pixels, for mouse hold-to-move. */
  heroScreen: () => Vec | null;
  pixelsPerUnit: () => number;
  disabled?: boolean;
}

/**
 * Movement surface over the arena.
 * - Touch/pen: a floating joystick appears where the finger lands.
 * - Mouse: hold the button and the hero walks toward the cursor.
 */
export function ArenaControls({ input, heroScreen, pixelsPerUnit, disabled }: ArenaControlsProps) {
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; kind: 'stick' | 'mouse'; origin: Vec } | null>(null);
  const [stick, setStick] = useState<{ origin: Vec; knob: Vec } | null>(null);
  const [hint, setHint] = useState(true);

  const local = (e: ReactPointerEvent): Vec => {
    const r = surface.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const update = (e: ReactPointerEvent) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    const p = local(e);
    if (a.kind === 'stick') {
      const dx = p.x - a.origin.x;
      const dy = p.y - a.origin.y;
      const len = Math.hypot(dx, dy);
      const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
      const mag = Math.min(1, len / STICK_RADIUS);
      input.pointer = len > 6 ? { x: (dx / len) * mag, y: (dy / len) * mag } : { x: 0, y: 0 };
      setStick({ origin: a.origin, knob: { x: a.origin.x + dx * k, y: a.origin.y + dy * k } });
    } else {
      const hero = heroScreen();
      if (!hero) return;
      const dx = p.x - hero.x;
      const dy = p.y - hero.y;
      const len = Math.hypot(dx, dy);
      const slow = pixelsPerUnit() * 0.6;
      input.pointer =
        len > slow * 0.3
          ? { x: (dx / len) * Math.min(1, len / slow), y: (dy / len) * Math.min(1, len / slow) }
          : { x: 0, y: 0 };
    }
  };

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || active.current) return;
    try {
      surface.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const kind = e.pointerType === 'mouse' ? 'mouse' : 'stick';
    const origin = local(e);
    active.current = { id: e.pointerId, kind, origin };
    setHint(false);
    if (kind === 'stick') setStick({ origin, knob: origin });
    update(e);
  };

  const onUp = (e: ReactPointerEvent) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    input.pointer = { x: 0, y: 0 };
    setStick(null);
  };

  return (
    <div
      ref={surface}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={update}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      data-testid="arena-controls"
    >
      {stick && (
        <>
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white/25 bg-white/5"
            style={{
              left: stick.origin.x - STICK_RADIUS,
              top: stick.origin.y - STICK_RADIUS,
              width: STICK_RADIUS * 2,
              height: STICK_RADIUS * 2,
            }}
          />
          <div
            className="pointer-events-none absolute h-12 w-12 rounded-full border-2 border-amber-200/70 bg-amber-300/30"
            style={{
              left: stick.knob.x - 24,
              top: stick.knob.y - 24,
              boxShadow: '0 0 16px rgba(252,211,77,0.4)',
            }}
          />
        </>
      )}
      {hint && (
        <div className="delve-display pointer-events-none absolute bottom-[34%] left-0 right-0 text-center text-xs uppercase tracking-[0.25em] text-white/40">
          Drag to move · hold click on desktop · WASD
        </div>
      )}
    </div>
  );
}
