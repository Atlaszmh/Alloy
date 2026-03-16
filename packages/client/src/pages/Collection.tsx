import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import type { AffixDef, AffixCategory, AffixTier, StatModifier } from '@alloy/engine';

const CATEGORIES: AffixCategory[] = ['offensive', 'defensive', 'sustain', 'utility', 'trigger'];

const CATEGORY_COLORS: Record<AffixCategory, string> = {
  offensive: 'text-red-400 border-red-500/30',
  defensive: 'text-blue-400 border-blue-500/30',
  sustain: 'text-green-400 border-green-500/30',
  utility: 'text-yellow-400 border-yellow-500/30',
  trigger: 'text-purple-400 border-purple-500/30',
};

/** Left border colors by category using element design tokens */
const CATEGORY_LEFT_BORDER: Record<AffixCategory, string> = {
  offensive: 'border-l-fire',
  defensive: 'border-l-cold',
  sustain: 'border-l-success',
  utility: 'border-l-warning',
  trigger: 'border-l-shadow',
};

const TIER_COLORS: Record<AffixTier, string> = {
  1: 'border-tier-1 text-gray-300',
  2: 'border-tier-2 text-blue-300',
  3: 'border-tier-3 text-purple-300',
  4: 'border-tier-4 text-yellow-300',
};

function formatMod(mod: StatModifier): string {
  const sign = mod.value >= 0 ? '+' : '';
  if (mod.op === 'percent') return `${sign}${mod.value}% ${mod.stat}`;
  if (mod.op === 'override') return `${mod.stat} = ${mod.value}`;
  return `${sign}${mod.value} ${mod.stat}`;
}

function AffixCard({ affix, index }: { affix: AffixDef; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`cursor-pointer rounded-lg border border-l-4 bg-surface-800 p-3 shadow-[0_2px_8px_rgba(0,0,0,0.4)] transition-all hover:translate-x-0.5 hover:bg-surface-700 ${CATEGORY_COLORS[affix.category]} ${CATEGORY_LEFT_BORDER[affix.category]}`}
      onClick={() => setExpanded(!expanded)}
      style={{ animationDelay: `${index * 40}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-white">{affix.name}</span>
        <span className="text-xs capitalize text-surface-300">{affix.category}</span>
      </div>

      <div className="mt-1 flex flex-wrap gap-1">
        {affix.tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-surface-700 px-1.5 py-0.5 text-xs text-surface-300"
          >
            {tag}
          </span>
        ))}
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {([1, 2, 3, 4] as AffixTier[]).map((tier) => {
            const tierData = affix.tiers[tier];
            if (!tierData) return null;
            return (
              <div
                key={tier}
                className={`rounded border bg-surface-900/50 p-2 ${TIER_COLORS[tier]}`}
              >
                <div className="mb-1 text-xs font-semibold">Tier {tier}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-surface-300">Weapon: </span>
                    {tierData.weaponEffect.map((m, i) => (
                      <span key={i} className="text-orange-300">
                        {formatMod(m)}{i < tierData.weaponEffect.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                  <div>
                    <span className="text-surface-300">Armor: </span>
                    {tierData.armorEffect.map((m, i) => (
                      <span key={i} className="text-blue-300">
                        {formatMod(m)}{i < tierData.armorEffect.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-1 text-xs text-surface-300">
                  Range: {tierData.valueRange[0]}–{tierData.valueRange[1]}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Collection() {
  const navigate = useNavigate();
  const registry = useMatchStore.getState().getRegistry();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<AffixCategory | null>(null);

  const affixes = useMemo(() => {
    const all = registry.getAllAffixes();
    return all.filter((affix) => {
      if (selectedCategory && affix.category !== selectedCategory) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !affix.name.toLowerCase().includes(q) &&
          !affix.id.toLowerCase().includes(q) &&
          !affix.tags.some((t) => t.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [registry, search, selectedCategory]);

  // Group by category for display
  const grouped = useMemo(() => {
    const groups: Partial<Record<AffixCategory, AffixDef[]>> = {};
    for (const affix of affixes) {
      if (!groups[affix.category]) groups[affix.category] = [];
      groups[affix.category]!.push(affix);
    }
    return groups;
  }, [affixes]);

  let cardIndex = 0;

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Collection</h2>
        <button
          onClick={() => navigate('/')}
          className="text-sm text-surface-300 hover:text-white"
        >
          Back
        </button>
      </header>

      {/* Search */}
      <input
        type="text"
        placeholder="Search affixes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-accent-500 focus:outline-none"
      />

      {/* Category Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedCategory === null
              ? 'bg-accent-500 text-surface-900'
              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              selectedCategory === cat
                ? 'bg-accent-500 text-surface-900'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <p className="mb-3 text-xs text-surface-300">
        {affixes.length} affix{affixes.length !== 1 ? 'es' : ''} found
      </p>

      {/* Grouped Affix List */}
      <div className="flex flex-col gap-6 pb-4">
        {CATEGORIES.map((cat) => {
          const group = grouped[cat];
          if (!group || group.length === 0) return null;
          return (
            <section key={cat}>
              <h3 className={`mb-2 text-sm font-semibold uppercase tracking-wider ${CATEGORY_COLORS[cat].split(' ')[0]}`}>
                {cat} ({group.length})
              </h3>
              <div className="flex flex-col gap-2">
                {group.map((affix) => {
                  const idx = cardIndex++;
                  return <AffixCard key={affix.id} affix={affix} index={idx} />;
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
