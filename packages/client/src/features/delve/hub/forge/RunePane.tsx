import { useId } from 'react';
import { runeText, type RunePouch, type RuneRef, type RuneTier } from '@alloy/engine';
import { Button, Panel, Price } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { RuneGlyph } from '../../runes/RuneGlyph';
import { runeName } from '../../runes/rune-style';

export interface RunePaneProps {
  pouch: RunePouch;
  fuseCount: number;
  /** Scrap to fuse `fuseCount` of a rune into one of the next tier; null: it doesn't fuse (tier V). */
  fusePrice: (ref: RuneRef) => number | null;
  scrap: number;
  locked: boolean;
  onFuse: (ref: RuneRef) => void;
}

/**
 * The Forge's rune pane: every rune held, by tier, with its count, effect and
 * raw price (its full load: no move, no ease), and "Fuse 3 → 1" at its scrap
 * price where enough are held (never at tier V).
 * Locked mid-dive, as the rest of the forge; a fuse it can't pay says why.
 */
export function RunePane({ pouch, fuseCount, fusePrice, scrap, locked, onFuse }: RunePaneProps) {
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
    <Panel title="Runes" testId="rune-pouch">
      {locked && (
        <p id={`${id}-locked`} className="k-body-2" data-testid="rune-pouch-locked">
          A dive is under way: fuse runes between dives.
        </p>
      )}
      {held.length === 0 && (
        <p className="k-body-2">
          No runes yet. Foes drop them now and then, and every boss drops one.
        </p>
      )}
      {held.map(({ rune, n }) => {
        const key = `${rune.id}-${rune.tier}`;
        const price = n >= fuseCount ? fusePrice(rune) : null;
        const short = price !== null && price > scrap;
        const text = runeText(registry, rune);
        return (
          <div key={key} className="flex items-start gap-3" data-testid={`pouch-${key}`}>
            <RuneGlyph rune={rune} />
            {/* The text keeps the row's width; Fuse sits under it. */}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[18px] text-[var(--k-text)]">
                {runeName(registry, rune)} ×{n}
              </span>
              <span className="k-caption">
                {text.effect}
                {text.cost && ' · '}
                {text.cost && <span className="text-[var(--k-hot)]">{text.cost}</span>}
              </span>
              {price !== null && (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Button
                    size="sm"
                    disabled={locked || short}
                    onClick={() => onFuse(rune)}
                    aria-describedby={locked ? `${id}-locked` : short ? `${id}-${key}` : undefined}
                    testId={`rune-fuse-${key}`}
                  >
                    Fuse {fuseCount} → 1 · <Price scrap={price} />
                  </Button>
                  {short && !locked && (
                    <span id={`${id}-${key}`} className="k-caption">
                      Needs <Price scrap={price} />
                    </span>
                  )}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </Panel>
  );
}
