import { useEffect, useRef } from 'react';

/**
 * Small gold chip in the run header showing total discoveries.
 * Replays a pop animation whenever the count increments.
 */
export function DiscoveryCounter({ count }: { count: number }) {
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count > prevCountRef.current && chipRef.current) {
      // Re-trigger the CSS keyframe by removing and re-adding the class
      const el = chipRef.current;
      el.classList.remove('discovery-pop');
      // Force reflow so the class removal takes effect before re-adding
      void el.offsetWidth;
      el.classList.add('discovery-pop');
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <span
      ref={chipRef}
      data-testid="discovery-counter"
      data-count={count}
      className="flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: 'rgb(var(--color-compound-rgb) / 0.12)',
        border: '1px solid rgb(var(--color-compound-rgb) / 0.3)',
        fontFamily: 'var(--font-family-display)',
        fontSize: '11px',
        fontWeight: 700,
        color: 'var(--color-compound)',
        letterSpacing: '0.04em',
        display: 'inline-flex',
      }}
    >
      ★ {count}
    </span>
  );
}
