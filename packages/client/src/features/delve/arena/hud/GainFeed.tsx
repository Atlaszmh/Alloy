import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { addHaul, emptyHaul, findItem, type GearItem } from '@alloy/engine';
import { useDelveStore } from '@/stores/delveStore';
import { routeToasts } from '@/components/Toast';
import { getDelveRegistry } from '../../registry';
import { reducedMotion } from '../../kit';
import { FADE_MS, feedAfter, feedNotice, feedTally, feedText, type FeedLine } from './gain-feed';

/**
 * The lean HUD's top left (the pad-first spec, 3): what the dive picks up as lines (`gain-feed.ts`),
 * from its haul and banked and the items it found, diffed on each change of the save; what it held
 * when the feed mounted makes no line. While `live` (the fight running) every toast is a line too
 * (`routeToasts`). It never takes the pointer.
 */
export function GainFeed({ live }: { live: boolean }): ReactElement {
  const registry = getDelveRegistry();
  const profile = useDelveStore((s) => s.profile);
  const drops = useDelveStore((s) => s.diveDrops);
  const tally = useMemo(() => {
    const dive = profile.dive;
    const items = drops.flatMap((uid): GearItem[] => {
      const found = findItem(profile, uid);
      return found ? [found.item] : [];
    });
    return feedTally(registry, dive ? addHaul(dive.haul, dive.banked) : emptyHaul(), items);
  }, [registry, profile, drops]);
  const before = useRef(tally);
  const [lines, setLines] = useState<FeedLine[]>([]);

  useEffect(() => {
    const prev = before.current;
    if (prev === tally) return;
    before.current = tally;
    setLines((ls) => feedAfter(ls, prev, tally, Date.now()));
  }, [tally]);

  useEffect(() => {
    if (!live) return;
    return routeToasts((text) => setLines((ls) => feedNotice(ls, text, Date.now())));
  }, [live]);

  // Each line goes at its time: wake for the next one due.
  useEffect(() => {
    if (lines.length === 0) return;
    const next = Math.min(...lines.map((l) => l.until));
    const t = setTimeout(
      () => setLines((ls) => ls.filter((l) => l.until > Date.now())),
      Math.max(0, next - Date.now()),
    );
    return () => clearTimeout(t);
  }, [lines]);

  return (
    <ol
      className="pointer-events-none m-0 flex w-[380px] list-none flex-col gap-1 p-0"
      aria-live="polite"
      data-testid="gain-feed"
    >
      {lines.map((line) => (
        <FeedRow key={line.key} line={line} />
      ))}
    </ol>
  );
}

/** One line, fading out over its last `FADE_MS` (again from full when a gain holds it longer; none under reduced motion). */
function FeedRow({ line }: { line: FeedLine }): ReactElement {
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    const left = line.until - Date.now();
    const anim = ref.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: FADE_MS,
      delay: Math.max(0, left - FADE_MS),
      fill: 'forwards',
    });
    return () => anim?.cancel();
  }, [line.until]);
  return (
    <li
      ref={ref}
      className="k-disp w-fit px-3 py-1 text-[20px] [text-shadow:2px_2px_0_#181425]"
      style={{ color: line.color, background: 'rgb(24 20 37 / 0.8)' }}
      data-key={line.key}
      data-testid="feed-line"
    >
      {feedText(line)}
    </li>
  );
}
