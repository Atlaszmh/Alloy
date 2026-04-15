import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { GemCard } from '@/components/GemCard';
import { GemInspectPanel } from '@/components/GemInspectPanel';
import type { AffixCategory, GemRarity } from '@alloy/engine';

type FilterTab = 'all' | AffixCategory | 'compound';

interface EncyclopediaEntry {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  tags: string[];
  category: AffixCategory | 'combined';
  isCompound: boolean;
  weaponEffect?: Array<{ stat: string; op: string; value: number }>;
  armorEffect?: Array<{ stat: string; op: string; value: number }>;
  tiers?: Record<string, {
    weaponEffect: Array<{ stat: string; op: string; value: number }>;
    armorEffect: Array<{ stat: string; op: string; value: number }>;
  }>;
  /** Compound gems: input affix IDs */
  components?: [string, string];
}

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'defensive', label: 'Defensive' },
  { key: 'sustain', label: 'Sustain' },
  { key: 'utility', label: 'Utility' },
  { key: 'trigger', label: 'Trigger' },
  { key: 'compound', label: 'Compound' },
];

export function GemEncyclopedia() {
  const navigate = useNavigate();
  const getRegistry = useMatchStore((s) => s.getRegistry);
  const registry = getRegistry();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRarity, setSelectedRarity] = useState<GemRarity>('common');

  const entries = useMemo<EncyclopediaEntry[]>(() => {
    const base: EncyclopediaEntry[] = registry.getAllAffixes().map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      weaponFlavorText: a.weaponFlavorText,
      armorFlavorText: a.armorFlavorText,
      tags: a.tags,
      category: a.category,
      isCompound: false,
      tiers: a.tiers as EncyclopediaEntry['tiers'],
    }));
    const compounds: EncyclopediaEntry[] = registry.getAllCombinations().map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      weaponFlavorText: c.weaponFlavorText,
      armorFlavorText: c.armorFlavorText,
      tags: c.tags,
      category: 'combined' as const,
      isCompound: true,
      weaponEffect: c.weaponEffect,
      armorEffect: c.armorEffect,
      components: c.components as [string, string],
    }));
    return [...base, ...compounds];
  }, [registry]);

  const filtered = useMemo(() => {
    let result = entries;

    // Category/compound filter
    if (activeTab === 'compound') {
      result = result.filter((e) => e.isCompound);
    } else if (activeTab !== 'all') {
      result = result.filter((e) => !e.isCompound && e.category === activeTab);
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [entries, activeTab, search]);

  const selected = selectedId ? entries.find((e) => e.id === selectedId) ?? null : null;

  // Resolve recipe component names for compound gems
  const recipe = selected?.isCompound && selected.components
    ? {
        component1Name: registry.findAffix(selected.components[0])?.name ?? selected.components[0],
        component2Name: registry.findAffix(selected.components[1])?.name ?? selected.components[1],
      }
    : undefined;

  // Compute statLabel for a base affix at tier 1 common rarity (grid baseline)
  function getGridStatLabel(entry: EncyclopediaEntry): string {
    if (entry.isCompound || !entry.tiers) return '';
    const tier1 = entry.tiers['1'];
    if (!tier1) return '';
    const stat = tier1.weaponEffect[0];
    if (!stat) return '';
    return stat.op === 'percent'
      ? `${Math.round(stat.value * 100)}%`
      : `+${stat.value}`;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-surface-600 p-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-surface-400 hover:text-white"
        >
          ← Back
        </button>
        <h1
          className="text-xl font-bold"
          style={{ fontFamily: 'var(--font-family-display)', color: 'var(--color-accent-400)' }}
        >
          Gem Library
        </h1>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-surface-600 px-4 py-2">
        {FILTER_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === key
                ? 'bg-accent-500/20 text-accent-400'
                : 'text-surface-400 hover:bg-surface-700 hover:text-surface-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div className="border-b border-surface-600 px-4 py-2">
        <input
          type="text"
          placeholder="Search gems..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-accent-500 focus:outline-none"
        />
      </div>

      {/* Gem card grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="grid gap-4"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(var(--gem-size), 1fr))',
          }}
        >
          {filtered.map((entry) => (
            <GemCard
              key={entry.id}
              affixId={entry.id}
              affixName={entry.name}
              tier={1}
              rarity="common"
              category={entry.isCompound ? 'combined' : entry.category}
              tags={entry.tags}
              statLabel={getGridStatLabel(entry)}
              description={entry.description}
              selected={selectedId === entry.id}
              onClick={() => setSelectedId(entry.id)}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="text-sm text-surface-500">No gems match your filters.</p>
        )}
      </div>

      {/* Inspect panel overlay */}
      {selected && (
        <GemInspectPanel
          gem={{
            name: selected.name,
            affixId: selected.id,
            description: selected.description,
            weaponFlavorText: selected.weaponFlavorText,
            armorFlavorText: selected.armorFlavorText,
            category: selected.isCompound ? 'combined' : selected.category,
            tags: selected.tags,
            tier: selected.isCompound ? undefined : 1,
            rarity: selectedRarity,
            weaponEffect: selected.weaponEffect,
            armorEffect: selected.armorEffect,
            tiers: selected.tiers,
          }}
          context="both"
          onClose={() => setSelectedId(null)}
          recipe={recipe}
          selectedRarity={selectedRarity}
          onRarityChange={setSelectedRarity}
        />
      )}
    </div>
  );
}
