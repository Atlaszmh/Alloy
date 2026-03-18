import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { playSound } from '@/shared/utils/sound-manager';

/** Phase segments within a match route that trigger phase transition sounds. */
const PHASE_SEGMENTS = new Set(['draft', 'forge', 'duel', 'adapt', 'result']);

/**
 * Plays a phase-transition sound when navigating between game phases.
 * Plays a match-found sound when entering a match for the first time.
 */
export function useRouteSound(): void {
  const { pathname } = useLocation();
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;

    if (prev === pathname) return;

    // Extract the last segment of the path
    const segment = pathname.split('/').filter(Boolean).pop();
    const prevSegment = prev.split('/').filter(Boolean).pop();

    // Match found: entering a match route for the first time
    if (pathname.includes('/match/') && !prev.includes('/match/')) {
      playSound('matchFound');
      return;
    }

    // Phase transition within a match
    if (segment && PHASE_SEGMENTS.has(segment) && segment !== prevSegment) {
      playSound('phaseTransition');
    }
  }, [pathname]);
}
