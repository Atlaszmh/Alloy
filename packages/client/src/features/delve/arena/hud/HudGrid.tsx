import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useUiScale } from '@/features/delve/kit';

import type { Insets } from '../camera';

export type { Insets };

export interface HudGridProps {
  top: ReactNode;
  right: ReactNode;
  dock: ReactNode;
  onInsets: (insets: Insets) => void;
  testId?: string;
  /** The centre slot, under the top bar in the middle column, stacked: Hesta's strip, then the BossBar. */
  centre?: ReactNode;
  /** The right column's width in design px: 340, or the Training Grounds' 400 px dock (3F). */
  rightWidth?: number;
  /** Under a screen (the stop, the pause): no focus or click reaches it. */
  inert?: boolean;
  /** Under the stop: not drawn, but still laid out, so its insets hold. */
  hidden?: boolean;
}

/**
 * The dive HUD as one grid under the HUD's zoom (never over the arena host): a 24 px margin, a
 * 48 px top bar over columns 1–2, a 340 px right column over both rows, the 600 px dock at
 * the bottom of columns 1–2, and a centre slot at the top of the middle column, with the rest of
 * the middle clear. Only its panels and slots take the pointer.
 * It reports the camera's insets (`onInsets`, stable; only when they change) on mount, on a
 * resize of any part or of the window, and on a HUD scale change: the top bar's bottom edge, the
 * window's width less the right column's left edge (0 while it is empty), and its height less the life bar's top edge
 * (the dock's while there is none).
 */
export function HudGrid({
  top,
  right,
  dock,
  onInsets,
  testId,
  centre,
  rightWidth = 340,
  inert,
  hidden,
}: HudGridProps) {
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
        // An empty right column (Training's panel closed or a sheet) takes nothing from the view.
        right: r.childElementCount ? window.innerWidth - r.getBoundingClientRect().left : 0,
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
    const mo = new MutationObserver(measure);
    if (rightRef.current) mo.observe(rightRef.current, { childList: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hud, onInsets]);

  return (
    <div
      className="delve-ui delve-hud-zoom pointer-events-none absolute inset-6 z-20 grid grid-rows-[48px_minmax(0,1fr)] gap-4"
      style={{
        gridTemplateColumns: `380px minmax(0,1fr) ${rightWidth}px`,
        visibility: hidden ? 'hidden' : undefined,
      }}
      data-testid={testId}
      inert={inert}
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
      <div
        data-hud="centre"
        className="flex min-w-0 flex-col items-center gap-4"
        style={{ gridColumn: 2, gridRow: 2, alignSelf: 'start' }}
      >
        {centre}
      </div>
    </div>
  );
}
