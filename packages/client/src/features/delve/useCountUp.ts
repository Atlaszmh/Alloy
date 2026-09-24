import { useEffect, useRef, useState } from 'react';

/** Animate a displayed number toward `value` (ease-out) whenever it changes. */
export function useCountUp(value: number, durationMs = 450): number {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const shownRef = useRef(value);

  useEffect(() => {
    const from = shownRef.current;
    if (from === value) return;
    fromRef.current = from;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = fromRef.current + (value - fromRef.current) * eased;
      shownRef.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return shown;
}
