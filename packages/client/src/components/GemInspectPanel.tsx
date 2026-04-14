import type { StatModifier } from '@alloy/engine';

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

          {/* Tier effects for current tier (base affixes) */}
          {showWeapon && gem.tiers && gem.tier && gem.tiers[String(gem.tier)] && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                Weapon Stats (Tier {gem.tier})
              </h3>
              <div className="flex flex-col gap-0.5">
                {gem.tiers[String(gem.tier)].weaponEffect.map((e, i) => (
                  <span key={i} className="text-xs text-surface-300">
                    {e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {showArmor && gem.tiers && gem.tier && gem.tiers[String(gem.tier)] && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                Armor Stats (Tier {gem.tier})
              </h3>
              <div className="flex flex-col gap-0.5">
                {gem.tiers[String(gem.tier)].armorEffect.map((e, i) => (
                  <span key={i} className="text-xs text-surface-300">
                    {e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Compound single-row effects */}
          {showWeapon && !gem.tiers && gem.weaponEffect && gem.weaponEffect.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-surface-300">
              {gem.weaponEffect.map((e, i) => (
                <span key={i}>{e.stat}: <span className="text-accent-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span></span>
              ))}
            </div>
          )}
          {showArmor && !gem.tiers && gem.armorEffect && gem.armorEffect.length > 0 && (
            <div className="flex flex-wrap gap-2 text-xs text-surface-300">
              {gem.armorEffect.map((e, i) => (
                <span key={i}>{e.stat}: <span className="text-emerald-400">{e.op === 'flat' ? '+' : ''}{e.value}{e.op === 'percent' ? '%' : ''}</span></span>
              ))}
            </div>
          )}

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
