import { Glyph } from '../../kit';
import { getDelveRegistry } from '../../registry';
import { manaStyle } from '../../format';

/**
 * Every reaction, by name and its two elements once discovered (`reactionsSeen`),
 * the rest as ???. A card hovered or focused is `onActive`'s (the Codex's detail);
 * `active` marks it.
 */
export function ReactionsGrid({
  reactionsSeen,
  active = null,
  onActive,
}: {
  reactionsSeen: readonly string[];
  active?: string | null;
  onActive?: (id: string) => void;
}) {
  const registry = getDelveRegistry();
  const data = registry.getArpgData();
  return (
    <section className="flex flex-col gap-4" aria-label="Reactions">
      <div className="flex items-baseline justify-between">
        <span className="k-section">Reactions</span>
        <span className="k-caption">
          {reactionsSeen.length}/{data.reactions.length} discovered
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {data.reactions.map((r) => {
          const seen = reactionsSeen.includes(r.id);
          return (
            <button
              key={r.id}
              type="button"
              className="k-socket flex items-center gap-3 p-3 text-left"
              style={{ borderColor: active === r.id ? 'var(--k-hot)' : undefined }}
              aria-pressed={onActive ? active === r.id : undefined}
              onMouseEnter={() => onActive?.(r.id)}
              onFocus={() => onActive?.(r.id)}
              data-testid={seen ? `reaction-${r.id}` : 'reaction-unknown'}
            >
              <span aria-hidden className="flex w-12 flex-none justify-center gap-1">
                {seen ? (
                  r.elements.map((m) => (
                    <Glyph key={m} id={m} size={20} color={manaStyle(registry, m).color} />
                  ))
                ) : (
                  <span className="k-disp text-[28px] text-[var(--k-text-3)]">?</span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className="k-disp text-[20px]"
                  style={{ color: seen ? 'var(--k-text)' : 'var(--k-text-3)' }}
                >
                  {seen ? r.name : '???'}
                </span>
                <span className="k-note">
                  {seen
                    ? r.text
                    : 'Stack one element on a foe, then hit it with another, to discover.'}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
