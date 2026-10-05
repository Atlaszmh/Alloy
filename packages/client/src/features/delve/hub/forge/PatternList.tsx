import { Panel } from '../../kit';
import { ItemIcon } from '../../ItemIcon';
import { SLOT_LABEL } from '../../format';
import { getDelveRegistry } from '../../registry';

/**
 * The Forge bench's patterns: the learned ones (a row picks the pattern), then
 * the unknown ones greyed with where they come from. With an essence chosen,
 * each learned pattern says whether its legendary fits that slot.
 */
export function PatternList({
  known,
  selected,
  essence,
  onSelect,
}: {
  known: readonly string[];
  selected: string | null;
  /** The chosen essence (a legendary id), if any. */
  essence: string | null;
  onSelect: (baseId: string) => void;
}) {
  const registry = getDelveRegistry();
  const bases = registry.getDelveData().bases;
  const fits = essence ? registry.getLegendary(essence).slots : null;
  return (
    <Panel title="Patterns" testId="pattern-list" data-tutorial="forge.pattern">
      <div className="flex flex-col gap-2">
        {bases
          .filter((b) => known.includes(b.id))
          .map((b) => (
            <button
              key={b.id}
              type="button"
              className="flex items-center gap-3 p-2 text-left"
              style={{ boxShadow: selected === b.id ? 'inset 4px 0 0 var(--k-hot)' : undefined }}
              aria-pressed={selected === b.id}
              onClick={() => onSelect(b.id)}
              data-testid={`pattern-${b.id}`}
              data-tutorial={`forge.pattern:${b.id}`}
            >
              <span
                aria-hidden
                className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              >
                <ItemIcon baseId={b.id} rarity="common" size={28} />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[18px]">{b.name}</span>
                <span className="k-caption">
                  {SLOT_LABEL[b.slot]}
                  {fits &&
                    (fits.includes(b.slot) ? (
                      <span style={{ color: 'var(--k-ok)' }}> · Fits the essence</span>
                    ) : (
                      ' · The essence does not fit'
                    ))}
                </span>
              </span>
            </button>
          ))}
        {bases
          .filter((b) => !known.includes(b.id))
          .map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 p-2"
              aria-disabled
              data-testid={`pattern-unknown-${b.id}`}
            >
              <span
                aria-hidden
                className="k-socket flex h-14 w-14 flex-none items-center justify-center"
              >
                <ItemIcon baseId={b.id} rarity="common" size={28} ghost />
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-[18px] text-[var(--k-text-3)]">{b.name}</span>
                <span className="k-caption">
                  Unknown · salvage a {b.name}, or find its pattern on elites and bosses
                </span>
              </span>
            </div>
          ))}
      </div>
    </Panel>
  );
}
