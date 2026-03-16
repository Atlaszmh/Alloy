import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { RecipeEntry } from '@/features/meta/components/RecipeEntry';

const ALL_TAGS = ['fire', 'cold', 'lightning', 'physical', 'elemental', 'crit', 'defensive', 'sustain'] as const;

/** Map element names to Tailwind text color classes */
const ELEMENT_COLOR_CLASS: Record<string, string> = {
  ignite: 'text-fire',
  burn: 'text-fire',
  fire: 'text-fire',
  chill: 'text-cold',
  freeze: 'text-cold',
  cold: 'text-cold',
  shock: 'text-lightning',
  lightning: 'text-lightning',
  electrocute: 'text-lightning',
  poison: 'text-poison',
  venom: 'text-poison',
  blight: 'text-poison',
  shadow: 'text-shadow',
  curse: 'text-shadow',
  wither: 'text-shadow',
  chaos: 'text-chaos',
};

/**
 * Translates raw compound stat keys into human-readable descriptions.
 * Examples:
 *   "compound.ignite.chance" + 15    → "15% proc chance"
 *   "compound.ignite.dotMultiplier" + 2 → "2x DOT multiplier"
 *   "compound.freeze.duration" + 3   → "3 tick duration"
 *   "compound.shock.chainDamage" + 120 → "+120 chain damage"
 */
export function formatCompoundStat(key: string, value: number): string {
  const parts = key.split('.');

  // Only handle compound.X.Y format
  if (parts.length === 3 && parts[0] === 'compound') {
    const suffix = parts[2];

    switch (suffix) {
      case 'chance':
        return `${value}% proc chance`;
      case 'dotMultiplier':
        return `${value}x DOT multiplier`;
      case 'duration':
        return `${value} tick duration`;
      case 'chainDamage':
        return `+${value} chain damage`;
      case 'damageMultiplier':
        return `${value}x damage multiplier`;
      case 'radius':
        return `${value} radius`;
      case 'stacks':
        return `${value} max stacks`;
      case 'penetration':
        return `${value}% penetration`;
      case 'slowAmount':
        return `${value}% slow`;
      case 'healAmount':
        return `+${value} heal`;
      case 'drainPercent':
        return `${value}% drain`;
      default:
        // Unknown suffix — show as-is but cleaned up
        return `${value >= 0 ? '+' : ''}${value} ${suffix}`;
    }
  }

  // Non-compound keys: show as-is
  return `${value >= 0 ? '+' : ''}${value} ${key}`;
}

/** Extract the element name from a compound stat key */
function getElementFromKey(key: string): string | null {
  const parts = key.split('.');
  if (parts.length >= 2 && parts[0] === 'compound') {
    return parts[1];
  }
  return null;
}

/** Get the Tailwind color class for a stat key based on its element */
function getStatColorClass(key: string): string {
  const element = getElementFromKey(key);
  if (element && ELEMENT_COLOR_CLASS[element]) {
    return ELEMENT_COLOR_CLASS[element];
  }
  return 'text-surface-300';
}

export function RecipeBook() {
  const navigate = useNavigate();
  const registry = useMatchStore.getState().getRegistry();

  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const combinations = useMemo(() => {
    const allCombos = registry.getAllCombinations();
    return allCombos.filter((combo) => {
      // Search filter
      if (search) {
        const q = search.toLowerCase();
        const comp1 = registry.findAffix(combo.components[0]);
        const comp2 = registry.findAffix(combo.components[1]);
        const matchesSearch =
          combo.name.toLowerCase().includes(q) ||
          combo.id.toLowerCase().includes(q) ||
          (comp1?.name.toLowerCase().includes(q) ?? false) ||
          (comp2?.name.toLowerCase().includes(q) ?? false);
        if (!matchesSearch) return false;
      }
      // Tag filter
      if (selectedTag) {
        if (!combo.tags.includes(selectedTag)) return false;
      }
      return true;
    });
  }, [registry, search, selectedTag]);

  return (
    <div className="page-enter flex h-full flex-col overflow-y-auto p-4">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-accent-400">Recipe Book</h2>
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
        placeholder="Search recipes..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-accent-500 focus:outline-none"
      />

      {/* Tag Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedTag(null)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            selectedTag === null
              ? 'bg-accent-500 text-surface-900'
              : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
          }`}
        >
          All
        </button>
        {ALL_TAGS.map((tag) => (
          <button
            key={tag}
            onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
              selectedTag === tag
                ? 'bg-accent-500 text-surface-900'
                : 'bg-surface-700 text-surface-300 hover:bg-surface-600'
            }`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Count */}
      <p className="mb-3 text-xs text-surface-300">
        {combinations.length} recipe{combinations.length !== 1 ? 's' : ''} found
      </p>

      {/* Recipe List */}
      <div className="flex flex-col gap-3 pb-4">
        {combinations.length === 0 ? (
          <p className="text-sm italic text-surface-300">No recipes match your filters.</p>
        ) : (
          combinations.map((combo) => {
            const comp1 = registry.findAffix(combo.components[0]);
            const comp2 = registry.findAffix(combo.components[1]);
            return (
              <RecipeEntry
                key={combo.id}
                component1Name={comp1?.name ?? combo.components[0]}
                component2Name={comp2?.name ?? combo.components[1]}
                resultName={combo.name}
                weaponEffects={combo.weaponEffect}
                armorEffects={combo.armorEffect}
                tags={combo.tags}
                discovered={true}
                formatCompoundStat={formatCompoundStat}
                getStatColorClass={getStatColorClass}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
