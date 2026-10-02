import { MANA_TYPES, manaPool, type HeroStats, type ManaType } from '@alloy/engine';
import { Glyph } from '../kit';
import { getDelveRegistry } from '../registry';
import { manaStyle } from '../format';

/**
 * Attunement per element (all six, or just `elements`) with the mastery threshold, and the one
 * mana pool it feeds. `compact` (the Loadout) draws the bars only: no pool line, no line under
 * each element.
 */
export function AttunementBars({
  stats,
  elements = MANA_TYPES,
  compact = false,
}: {
  stats: HeroStats;
  elements?: readonly ManaType[];
  compact?: boolean;
}) {
  const registry = getDelveRegistry();
  const bal = registry.getDelveBalance().mana;
  const masteries = registry.getArpgData().masteries;
  const attunement = stats.attunement;
  const scale = Math.max(bal.masteryThreshold + 2, ...elements.map((m) => attunement[m] + 1));
  const pool = manaPool(stats, registry);

  // Spans only: the Loadout draws it inside a button.
  return (
    <span className="flex flex-col gap-2">
      {!compact && (
        <span className="k-caption" data-testid="mana-pool">
          Mana pool <b className="text-[var(--k-mana)]">{Math.round(pool.max)}</b> · +
          {pool.regen.toFixed(1)}/s · every point of attunement adds {bal.poolPerAttune}
        </span>
      )}
      {elements.map((m) => {
        const style = manaStyle(registry, m);
        const a = attunement[m];
        const mastery = masteries.find((x) => x.mana === m);
        const mastered = a >= bal.masteryThreshold;
        return (
          <span
            key={m}
            className="flex flex-col gap-0.5"
            data-testid={`attune-${m}`}
            data-value={a}
          >
            <span className="flex items-center gap-2">
              <span className="flex w-5 justify-center">
                <Glyph id={m} size={16} color={style.color} />
              </span>
              <span
                className="k-disp w-16 text-[16px]"
                style={{ color: a > 0 ? style.color : 'var(--k-steel-2)' }}
              >
                {style.name}
              </span>
              <span className="relative h-2.5 flex-1 overflow-visible rounded-full bg-white/5">
                <span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{
                    width: `${Math.min(1, a / scale) * 100}%`,
                    background: style.color,
                    boxShadow: a > 0 ? `0 0 8px ${style.color}88` : undefined,
                  }}
                />
                <span
                  className="absolute -top-0.5 h-3.5 w-0.5 rounded"
                  style={{
                    left: `${(bal.masteryThreshold / scale) * 100}%`,
                    background: mastered ? 'var(--k-text)' : 'rgba(255,255,255,0.25)',
                  }}
                />
              </span>
              <span className="k-disp w-6 text-right text-[18px] text-[var(--k-text)]">{a}</span>
            </span>
            {!compact && (
              <span className="k-caption pl-7 leading-snug">
                {a > 0 && (
                  <span className="text-[var(--k-text-2)]">
                    +{Math.round(a * bal.powerPerAttune * 100)}% to {style.name} abilities ·{' '}
                  </span>
                )}
                {mastery &&
                  (mastered ? (
                    <span style={{ color: style.color }}>
                      ★ {mastery.name}: {mastery.text}
                    </span>
                  ) : (
                    <span>
                      At {bal.masteryThreshold}: {mastery.name}
                    </span>
                  ))}
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
