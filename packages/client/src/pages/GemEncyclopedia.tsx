import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import type { AffixCategory, GemRarity } from '@alloy/engine';
import { RARITY_MULTIPLIERS, RARITY_ORDER } from '@alloy/engine';

type FilterTab = 'all' | AffixCategory | 'compound';

interface EncyclopediaEntry {
  id: string;
  name: string;
  description: string;
  weaponFlavorText: string;
  armorFlavorText: string;
  tags: string[];
  category?: AffixCategory;
  isCompound: boolean;
  weaponEffect?: Array<{ stat: string; op: string; value: number }>;
  armorEffect?: Array<{ stat: string; op: string; value: number }>;
  tiers?: Record<string, {
    weaponEffect: Array<{ stat: string; op: string; value: number }>;
    armorEffect: Array<{ stat: string; op: string; value: number }>;
  }>;
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRarity, setSelectedRarity] = useState<GemRarity>('common');

  const RARITY_COLORS: Record<GemRarity, string> = {
    common: '#9ca3af', magic: '#3b82f6', rare: '#eab308', epic: '#a855f7', legendary: '#f59e0b',
  };

  const mult = RARITY_MULTIPLIERS[selectedRarity];

  function fmtVal(value: number, op: string): string {
    const eff = value * mult;
    if (op === 'percent') return `${Math.round(eff * 100)}%`;
    return `+${Number.isInteger(eff) ? eff : eff.toFixed(1)}`;
  }

  function fmtBase(value: number, op: string): string {
    if (op === 'percent') return `${Math.round(value * 100)}%`;
    return `+${value}`;
  }

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
      isCompound: true,
      weaponEffect: c.weaponEffect,
      armorEffect: c.armorEffect,
    }));
    return [...base, ...compounds];
  }, [registry]);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return entries;
    if (activeTab === 'compound') return entries.filter((e) => e.isCompound);
    return entries.filter((e) => !e.isCompound && e.category === activeTab);
  }, [entries, activeTab]);

  const selected = selectedId ? entries.find((e) => e.id === selectedId) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header with back button */}
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

      {/* Content: list + detail */}
      <div className="flex min-h-0 flex-1">
        {/* Gem list */}
        <div className="w-48 overflow-y-auto border-r border-surface-600">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setSelectedId(entry.id)}
              className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                selectedId === entry.id
                  ? 'bg-surface-700 text-white'
                  : 'text-surface-300 hover:bg-surface-700/50'
              }`}
            >
              {entry.name}
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-4">
          {selected ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-bold text-white">{selected.name}</h2>
              <p className="text-sm text-surface-300">{selected.description}</p>

              {/* Rarity selector tabs */}
              <div className="flex gap-1">
                {RARITY_ORDER.map((r) => (
                  <button
                    key={r}
                    onClick={() => setSelectedRarity(r)}
                    className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
                      selectedRarity === r
                        ? 'text-white'
                        : 'text-surface-500 hover:text-surface-300'
                    }`}
                    style={selectedRarity === r ? {
                      backgroundColor: `${RARITY_COLORS[r]}20`,
                      color: RARITY_COLORS[r],
                      border: `1px solid ${RARITY_COLORS[r]}40`,
                    } : undefined}
                  >
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>

              {/* Weapon section */}
              {selected.weaponFlavorText.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    Weapon
                  </h3>
                  <p className="mb-2 text-sm leading-relaxed text-surface-200">
                    {selected.weaponFlavorText}
                  </p>
                  {selected.tiers ? (
                    <div className="flex flex-col gap-1">
                      {Object.entries(selected.tiers).map(([tier, data]) =>
                        data.weaponEffect.length > 0 ? (
                          <div key={tier} className="flex gap-2 text-xs text-surface-300">
                            <span className="w-8 font-semibold text-surface-500">T{tier}</span>
                            {data.weaponEffect.map((e, i) => (
                              <span key={i}>
                                {e.stat}:{' '}
                                <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
                                {selectedRarity !== 'common' && (
                                  <span className="ml-1 text-surface-600">(base {fmtBase(e.value, e.op)})</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : selected.weaponEffect && selected.weaponEffect.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs text-surface-300">
                      {selected.weaponEffect.map((e, i) => (
                        <span key={i}>
                          {e.stat}:{' '}
                          <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
                          {selectedRarity !== 'common' && (
                            <span className="ml-1 text-surface-600">(base {fmtBase(e.value, e.op)})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Armor section */}
              {selected.armorFlavorText.length > 0 && (
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-surface-400">
                    Armor
                  </h3>
                  <p className="mb-2 text-sm leading-relaxed text-surface-200">
                    {selected.armorFlavorText}
                  </p>
                  {selected.tiers ? (
                    <div className="flex flex-col gap-1">
                      {Object.entries(selected.tiers).map(([tier, data]) =>
                        data.armorEffect.length > 0 ? (
                          <div key={tier} className="flex gap-2 text-xs text-surface-300">
                            <span className="w-8 font-semibold text-surface-500">T{tier}</span>
                            {data.armorEffect.map((e, i) => (
                              <span key={i}>
                                {e.stat}:{' '}
                                <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
                                {selectedRarity !== 'common' && (
                                  <span className="ml-1 text-surface-600">(base {fmtBase(e.value, e.op)})</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : null
                      )}
                    </div>
                  ) : selected.armorEffect && selected.armorEffect.length > 0 ? (
                    <div className="flex flex-wrap gap-2 text-xs text-surface-300">
                      {selected.armorEffect.map((e, i) => (
                        <span key={i}>
                          {e.stat}:{' '}
                          <span style={{ color: RARITY_COLORS[selectedRarity] }}>{fmtVal(e.value, e.op)}</span>
                          {selectedRarity !== 'common' && (
                            <span className="ml-1 text-surface-600">(base {fmtBase(e.value, e.op)})</span>
                          )}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Rarity multiplier footer */}
              {selectedRarity !== 'common' && (
                <p className="text-xs" style={{ color: RARITY_COLORS[selectedRarity] }}>
                  {selectedRarity.charAt(0).toUpperCase() + selectedRarity.slice(1)}: {mult}x multiplier
                </p>
              )}

              {/* Tags */}
              {selected.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map((tag) => (
                    <span key={tag} className="rounded bg-surface-700 px-2 py-0.5 text-xs text-surface-300">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-surface-500">Select a gem to view details</p>
          )}
        </div>
      </div>
    </div>
  );
}
