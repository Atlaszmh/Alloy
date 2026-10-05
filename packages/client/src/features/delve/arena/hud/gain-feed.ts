import type { DataRegistry, GearItem, Haul } from '@alloy/engine';
import { RARITY_TEXT, formatNumber } from '../../format';
import { haulRows } from '../../materials/material-style';

/**
 * The lean HUD's gain feed (the pad-first spec, 3): each pickup a line at the top left for a few
 * seconds, a kind's gains merging into its line while it shows ("+159 Scrap" growing), at most
 * `FEED_MAX` lines, then a fade; the dive's notices join it as lines of their own.
 */

/** How long a pickup's line shows after its last gain, in ms. */
export const FEED_MS = 4000;
/** How long a notice's line shows. */
export const NOTICE_MS = 5000;
/** The fade at the end of a line's life. */
export const FADE_MS = 600;
/** The most lines the feed holds: the oldest gives way. */
export const FEED_MAX = 5;
/** A notice's colour. */
const NOTICE_COLOR = 'var(--k-hot-hi)';

/** One kind the dive holds: its name, its colour and how many; a plain one (an item) shows its name alone. */
export interface FeedEntry {
  name: string;
  color: string;
  count: number;
  plain?: boolean;
}

/** What the dive has picked up, by kind: `haulRows`' keys, and `item:<uid>` for each item found. */
export type FeedTally = ReadonlyMap<string, FeedEntry>;

/** A line of the feed: a kind's gain since it began to show (or a notice), and when it goes. */
export interface FeedLine extends FeedEntry {
  key: string;
  until: number;
}

/** The dive's tally: its haul and banked (`haul`), as the purse names them, and the items it found. */
export function feedTally(registry: DataRegistry, haul: Haul, items: readonly GearItem[]): FeedTally {
  const out = new Map<string, FeedEntry>();
  for (const r of haulRows(registry, haul)) out.set(r.key, { name: r.name, color: r.color, count: r.count });
  for (const item of items)
    out.set(`item:${item.uid}`, { name: item.name, color: RARITY_TEXT[item.rarity], count: 1, plain: true });
  return out;
}

/**
 * The lines after the tally moved from `before` to `after` at `now`: the expired gone, each kind
 * that grew added to its showing line (held `FEED_MS` more) or a new line at the end. A kind that
 * fell (a death's share, a stop's spend) makes no line.
 */
export function feedAfter(
  lines: readonly FeedLine[],
  before: FeedTally,
  after: FeedTally,
  now: number,
): FeedLine[] {
  let out = lines.filter((l) => l.until > now);
  for (const [key, e] of after) {
    const gained = e.count - (before.get(key)?.count ?? 0);
    if (gained <= 0) continue;
    const live = out.find((l) => l.key === key);
    out = live
      ? out.map((l) => (l === live ? { ...l, count: l.count + gained, until: now + FEED_MS } : l))
      : [...out, { ...e, key, count: gained, until: now + FEED_MS }];
  }
  return out.slice(-FEED_MAX);
}

let notices = 0;

/** The lines with a notice (a toast while the fight is live) added at the end, a line of its own. */
export function feedNotice(lines: readonly FeedLine[], text: string, now: number): FeedLine[] {
  const line: FeedLine = {
    key: `notice:${++notices}`,
    name: text,
    color: NOTICE_COLOR,
    count: 1,
    plain: true,
    until: now + NOTICE_MS,
  };
  return [...lines.filter((l) => l.until > now), line].slice(-FEED_MAX);
}

/** A line's words: "+159 Scrap", or a plain line's name. */
export function feedText(line: FeedLine): string {
  return line.plain ? line.name : `+${formatNumber(line.count)} ${line.name}`;
}
