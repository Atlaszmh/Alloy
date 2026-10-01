import { useId } from 'react';
import { runeText, type RunePouch, type RuneRef, type RuneTier } from '@alloy/engine';
import { formatNumber } from '../format';
import { getDelveRegistry } from '../registry';
import { RuneGlyph } from './RuneGlyph';
import { runeName } from './rune-style';

export interface RunePouchPanelProps {
  pouch: RunePouch;
  fuseCount: number;
  /** Scrap to fuse `fuseCount` of a rune into one of the next tier; null: it doesn't fuse (tier V). */
  fusePrice: (ref: RuneRef) => number | null;
  scrap: number;
  locked: boolean;
  onFuse: (ref: RuneRef) => void;
}

/**
 * The Forge tab's runes: every rune held, by tier, with its count, effect and
 * raw price (its full load: no move, no ease), and Fuse 3 → 1 at its scrap
 * price where enough are held (never at tier V).
 * Locked mid-dive, as the rest of the forge; a fuse it can't pay says why.
 */
export function RunePouchPanel({
  pouch,
  fuseCount,
  fusePrice,
  scrap,
  locked,
  onFuse,
}: RunePouchPanelProps) {
  const registry = getDelveRegistry();
  const id = useId();
  // In the data's order, then by tier; ids the data doesn't know are skipped.
  const held = registry
    .getRunes()
    .flatMap((def) =>
      (pouch[def.id] ?? []).flatMap((n, i) =>
        n > 0 ? [{ rune: { id: def.id, tier: (i + 1) as RuneTier }, n }] : [],
      ),
    );
  return (
    <section className="delve-panel flex flex-col gap-2 p-3" data-testid="rune-pouch">
      <div className="delve-display text-[11px] font-bold uppercase tracking-widest text-amber-300/80">
        Runes
      </div>
      {locked && (
        <div id={`${id}-locked`} className="text-xs text-amber-200" data-testid="rune-pouch-locked">
          A dive is under way: fuse runes between dives.
        </div>
      )}
      {held.length === 0 && (
        <div className="text-xs text-stone-400">
          No runes yet. Foes drop them now and then, and every boss drops one.
        </div>
      )}
      {held.map(({ rune, n }) => {
        const key = `${rune.id}-${rune.tier}`;
        const price = n >= fuseCount ? fusePrice(rune) : null;
        const short = price !== null && price > scrap;
        const text = runeText(registry, rune);
        return (
          <div key={key} className="flex items-center gap-2" data-testid={`pouch-${key}`}>
            <RuneGlyph rune={rune} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-stone-200">
                {runeName(registry, rune)} ×{n}
              </span>
              <span className="text-[11px] leading-snug text-stone-400">
                {text.effect}
                {text.cost && ' · '}
                {text.cost && <span className="text-amber-200/80">{text.cost}</span>}
              </span>
            </span>
            {price !== null && (
              <span className="flex flex-col items-end gap-0.5">
                <button
                  type="button"
                  className="delve-btn whitespace-nowrap px-2 py-1 text-xs"
                  disabled={locked || short}
                  onClick={() => onFuse(rune)}
                  aria-describedby={locked ? `${id}-locked` : short ? `${id}-${key}` : undefined}
                  data-testid={`rune-fuse-${key}`}
                >
                  Fuse {fuseCount} → 1 · ⚙ {formatNumber(price)}
                </button>
                {short && !locked && (
                  <span id={`${id}-${key}`} className="text-[10px] text-amber-200/80">
                    Needs ⚙ {formatNumber(price)} scrap
                  </span>
                )}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}
