import { useState, useEffect, useRef, useCallback } from 'react';

export function useCountdown(
  durationMs: number,
  onExpire?: () => void,
  paused = false,
): number {
  const [remaining, setRemaining] = useState(durationMs);
  const onExpireRef = useRef(onExpire);
  const expiredRef = useRef(false);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setRemaining(durationMs);
    expiredRef.current = false;
  }, [durationMs]);

  useEffect(() => {
    if (paused || remaining <= 0) return;

    const interval = setInterval(() => {
      setRemaining((prev) => {
        const next = Math.max(0, prev - 100);
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [paused, remaining > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire onExpire outside of the setState updater to avoid React warnings
  useEffect(() => {
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpireRef.current?.();
    }
  }, [remaining]);

  return remaining;
}
