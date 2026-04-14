import type { GemRarity, StatModifier } from '@alloy/engine';
import { RARITY_MULTIPLIERS } from '@alloy/engine';

type InspectContext = 'weapon' | 'armor' | 'both';

interface GemInspectPanelProps {
  gem: {
    name: string;
    description: string;
    weaponFlavorText: string;
    armorFlavorText: string;
    category?: string;
    tags: string[];
    tier?: number;
    rarity?: GemRarity;
    weaponEffect?: StatModifier[];
    armorEffect?: StatModifier[];
    tiers?: Record<string, { weaponEffect: StatModifier[]; armorEffect: StatModifier[] }>;
  };
  context: InspectContext;
  onClose: () => void;
}

export function GemInspectPanel({ gem, context, onClose }: GemInspectPanelProps) {
  const showWeapon = context === 'weapon' || context === 'both';
  const showArmor = context === 'armor' || context === 'both';

  const mult = gem.rarity ? RARITY_MULTIPLIERS[gem.rarity] : 1;
  const rarityName = gem.rarity ? gem.rarity.charAt(0).toUpperCase() + gem.rarity.slice(1) : 'Common';
  const RARITY_COLORS: Record<string, string> = {
    common: '#9ca3af', magic: '#3b82f6', rare: '#eab308', epic: '#a855f7', legendary: '#f59e0b',
  };
  const rarityColor = gem.rarity ? RARITY_COLORS[gem.rarity] ?? '#9ca3af' : '#9ca3af';

  function formatVal(value: number, op: string, multiplier: number): string {
    const eff = value * multiplier;
    if (op === 'percent') return `${Math.round(eff * 100)}%`;
    return `+${Number.isInteger(eff) ? eff : eff.toFixed(1)}`;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/60"
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col overflow-y-auto bg-surface-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-600 p-4">
          <h2
            className="text-lg font-bold"
            style={{ fontFamily: 'var(--font-family-display)', color: 'var(--color-accent-400)' }}
          >
            {gem.name}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-surface-400 hover:bg-surface-700 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          {/* Brief description */}
          <p className="text-sm leading-relaxed text-surface-300">{gem.description}</p>

          {/* Weapon flavor text */}
          {showWeapon && gem.weaponFlavorText.length > 0 && (
            <div>
              {context === 'both' && (
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                  On Weapon
                </h3>
              )}
              <p className="text-sm leading-relaxed text-surface-200">{gem.weaponFlavorText}</p>
            </div>
          )}

          {/* Armor flavor text */}
          {showArmor && gem.armorFlavorText.length > 0 && (
            <div>
              {context === 'both' && (
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                  On Armor
                </h3>
              )}
              <p className="text-sm leading-relaxed text-surface-200">{gem.armorFlavorText}</p>
            </div>
          )}

          {/* Stat breakdown table — tiered affixes */}
          {gem.tiers && gem.tier && (() => {
            const tierKeys = Object.keys(gem.tiers).sort((a, b) => Number(a) - Number(b));
            const axes: Array<{ key: 'weaponEffect' | 'armorEffect'; label: string; show: boolean }> = [
              { key: 'weaponEffect', label: 'Weapon Stats', show: showWeapon },
              { key: 'armorEffect', label: 'Armor Stats', show: showArmor },
            ];
            // Filter to only axes that have non-empty effects in at least one tier
            const visibleAxes = axes.filter(a => a.show && tierKeys.some(
              tk => gem.tiers![tk][a.key].length > 0,
            ));

            return visibleAxes.map(axis => {
              // First stat of current tier for the footer math
              const currentTierEffects = gem.tiers![String(gem.tier)][axis.key];
              const firstStat = currentTierEffects[0] ?? null;

              return (
                <div key={axis.key}>
                  {context === 'both' && (
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                      {axis.label}
                    </h3>
                  )}
                  <div className="overflow-hidden rounded border border-surface-600">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-surface-600 text-surface-400">
                          <th className="px-2 py-1 text-left font-medium"></th>
                          <th className="px-2 py-1 text-right font-medium">Base</th>
                          <th className="px-2 py-1 text-right font-medium" style={{ color: rarityColor }}>
                            {rarityName} ({mult}x)
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {tierKeys.map(tk => {
                          const effects = gem.tiers![tk][axis.key];
                          if (effects.length === 0) return null;
                          const isCurrent = Number(tk) === gem.tier;
                          return (
                            <tr
                              key={tk}
                              className={isCurrent ? '' : 'text-surface-400'}
                              style={isCurrent ? { backgroundColor: `${rarityColor}15` } : undefined}
                            >
                              <td className="px-2 py-0.5 font-medium text-surface-300">T{tk}</td>
                              <td className="px-2 py-0.5 text-right text-surface-300">
                                {effects.map((e, i) => (
                                  <span key={i}>{i > 0 && ', '}{formatVal(e.value, e.op, 1)}</span>
                                ))}
                              </td>
                              <td className="px-2 py-0.5 text-right" style={{ color: isCurrent ? rarityColor : undefined }}>
                                {effects.map((e, i) => (
                                  <span key={i}>{i > 0 && ', '}{formatVal(e.value, e.op, mult)}</span>
                                ))}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Footer math */}
                  {firstStat && mult !== 1 && (
                    <p className="mt-1 text-xs text-surface-400">
                      Base: {formatVal(firstStat.value, firstStat.op, 1)}{' '}
                      <span style={{ color: rarityColor }}>
                        x {rarityName} ({mult}x)
                      </span>{' '}
                      = <span className="text-surface-200">{formatVal(firstStat.value, firstStat.op, mult)}</span>
                    </p>
                  )}
                </div>
              );
            });
          })()}

          {/* Stat breakdown — compound affixes (no tiers, flat effects) */}
          {!gem.tiers && (() => {
            const axes: Array<{ effects: StatModifier[] | undefined; label: string; show: boolean }> = [
              { effects: gem.weaponEffect, label: 'Weapon Stats', show: showWeapon },
              { effects: gem.armorEffect, label: 'Armor Stats', show: showArmor },
            ];
            const visibleAxes = axes.filter(a => a.show && a.effects && a.effects.length > 0);

            return visibleAxes.map(axis => (
              <div key={axis.label}>
                {context === 'both' && (
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    {axis.label}
                  </h3>
                )}
                <div className="overflow-hidden rounded border border-surface-600">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-surface-600 text-surface-400">
                        <th className="px-2 py-1 text-left font-medium">Stat</th>
                        <th className="px-2 py-1 text-right font-medium">Base</th>
                        {mult !== 1 && (
                          <th className="px-2 py-1 text-right font-medium" style={{ color: rarityColor }}>
                            {rarityName} ({mult}x)
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {axis.effects!.map((e, i) => (
                        <tr key={i} className="text-surface-300">
                          <td className="px-2 py-0.5 font-medium">{e.stat}</td>
                          <td className="px-2 py-0.5 text-right">{formatVal(e.value, e.op, 1)}</td>
                          {mult !== 1 && (
                            <td className="px-2 py-0.5 text-right" style={{ color: rarityColor }}>
                              {formatVal(e.value, e.op, mult)}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ));
          })()}

          {/* Tags */}
          {gem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {gem.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-surface-700 px-2 py-0.5 text-xs text-surface-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
