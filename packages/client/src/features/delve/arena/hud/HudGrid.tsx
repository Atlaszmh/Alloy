import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useUiScale } from '@/features/delve/kit';

/** The camera's insets, in viewport px (the spec's contract; 3C's renderer takes them). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HudGridProps {
  top: ReactNode;
  right: ReactNode;
  dock: ReactNode;
  onInsets: (insets: Insets) => void;
  testId?: string;
  /** Laid on the grid itself, e.g. the BossBar (3A's addition to the contract). */
  children?: ReactNode;
}

/**
 * The dive HUD as one grid under the HUD's zoom (never over the arena host): a 24 px margin, a
 * 48 px top bar over columns 1–2, a 340 px right column over both rows, and the 600 px dock at
 * the bottom of columns 1–2, with the middle clear. Only its panels and slots take the pointer.
 * It reports the camera's insets (`onInsets`, stable; only when they change) on mount, on a
 * resize of any part or of the window, and on a HUD scale change: the top bar's bottom edge, the
 * window's width less the right column's left edge, and its height less the life bar's top edge
 * (the dock's while there is none).
 */
export function HudGrid({ top, right, dock, onInsets, testId, children }: HudGridProps) {
  const topRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const { hud } = useUiScale();

  useLayoutEffect(() => {
    let last = '';
    const measure = () => {
      const [t, r, d] = [topRef.current, rightRef.current, dockRef.current];
      if (!t || !r || !d) return;
      const life = d.querySelector('[data-testid="hero-hp"]') ?? d;
      const insets: Insets = {
        top: t.getBoundingClientRect().bottom,
        right: window.innerWidth - r.getBoundingClientRect().left,
        bottom: window.innerHeight - life.getBoundingClientRect().top,
        left: 0,
      };
      const key = `${insets.top} ${insets.right} ${insets.bottom}`;
      if (key === last) return;
      last = key;
      onInsets(insets);
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [topRef.current, rightRef.current, dockRef.current]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hud, onInsets]);

  return (
    <div
      className="delve-ui delve-hud-zoom pointer-events-none absolute inset-6 z-20 grid grid-cols-[380px_minmax(0,1fr)_340px] grid-rows-[48px_minmax(0,1fr)] gap-4"
      data-testid={testId}
    >
      <div
        ref={topRef}
        className="min-w-0"
        data-hud="top"
        style={{ gridColumn: '1 / 3', gridRow: 1 }}
      >
        {top}
      </div>
      <div
        ref={rightRef}
        data-hud="right"
        className="flex min-h-0 flex-col gap-4"
        style={{ gridColumn: 3, gridRow: '1 / 3' }}
      >
        {right}
      </div>
      <div
        ref={dockRef}
        data-hud="dock"
        className="w-[600px]"
        style={{ gridColumn: '1 / 3', gridRow: 2, alignSelf: 'end' }}
      >
        {dock}
      </div>
      {children}
    </div>
  );
}
