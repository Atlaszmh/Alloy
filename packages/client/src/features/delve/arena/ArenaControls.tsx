import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { Vec } from '@alloy/engine';
import { useInputDeviceStore } from '@/stores/inputDeviceStore';
import type { ArenaInput } from './input';

interface ArenaControlsProps {
  input: ArenaInput;
  /** Hero position in screen pixels, for mouse hold-to-move. */
  heroScreen: () => Vec | null;
  pixelsPerUnit: () => number;
  disabled?: boolean;
  /** Manual basic attacks: the mouse attacks toward the cursor instead of walking. */
  manualAttack?: boolean;
}

/**
 * Movement surface over the arena: hold the mouse button and the hero walks
 * toward the cursor, or (manual basic attacks) attacks toward it while WASD
 * moves. A hint for the device in use shows until the hero first moves, by
 * any device (`input.moved`; the page re-renders with the HUD).
 */
export function ArenaControls({
  input,
  heroScreen,
  pixelsPerUnit,
  disabled,
  manualAttack,
}: ArenaControlsProps) {
  const surface = useRef<HTMLDivElement>(null);
  const active = useRef<{ id: number; kind: 'mouse' | 'attack' } | null>(null);
  const device = useInputDeviceStore((s) => s.device);

  const update = (e: ReactPointerEvent) => {
    const a = active.current;
    if (!a || a.id !== e.pointerId) return;
    if (a.kind === 'attack') {
      input.attackAim = { x: e.clientX, y: e.clientY };
      return;
    }
    const r = surface.current!.getBoundingClientRect();
    const hero = heroScreen();
    if (!hero) return;
    const dx = e.clientX - r.left - hero.x;
    const dy = e.clientY - r.top - hero.y;
    const len = Math.hypot(dx, dy);
    const slow = pixelsPerUnit() * 0.6;
    input.pointer =
      len > slow * 0.3
        ? { x: (dx / len) * Math.min(1, len / slow), y: (dy / len) * Math.min(1, len / slow) }
        : { x: 0, y: 0 };
  };

  const onDown = (e: ReactPointerEvent) => {
    if (disabled || active.current) return;
    try {
      surface.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already gone */
    }
    const kind = manualAttack ? 'attack' : 'mouse';
    active.current = { id: e.pointerId, kind };
    if (kind === 'attack') {
      input.attackHeld = true;
      input.attackTap = true;
      input.attackAim = { x: e.clientX, y: e.clientY };
      return;
    }
    update(e);
  };

  const onUp = (e: ReactPointerEvent) => {
    if (active.current?.id !== e.pointerId) return;
    active.current = null;
    input.pointer = { x: 0, y: 0 };
    input.attackHeld = false;
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
      {!input.moved && (
        <div
          className="delve-display pointer-events-none absolute bottom-[34%] left-0 right-0 text-center text-[16px] uppercase tracking-[0.25em] text-white/40"
          data-testid="move-hint"
        >
          {device === 'gamepad'
            ? 'Left stick to move'
            : manualAttack
              ? 'WASD to move · hold click to attack'
              : 'WASD or hold click to move'}
        </div>
      )}
    </div>
  );
}
