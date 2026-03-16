import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMatchStore, selectPhase, selectPlayer } from '@/stores/matchStore';
import { useForgeStore } from '@/stores/forgeStore';
import { OrbIcon } from '@/components/OrbIcon';
import { Timer } from '@/components/Timer';
import { ToastContainer, showToast } from '@/components/Toast';
import type { AffixDef, EquippedSlot, ForgedItem, OrbInstance, BaseStat, CompoundAffixDef, SynergyDef } from '@alloy/engine';
import { calculateStats } from '@alloy/engine';

const FORGE_TIMER_MS = 90_000;
const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];

function SlotView({
  slot,
  index,
  affixMap,
  isActive,
  onDrop,
  onRemove,
}: {
  slot: EquippedSlot | null;
  index: number;
  affixMap: Map<string, AffixDef>;
  isActive: boolean;
  onDrop: (slotIndex: number) => void;
  onRemove: (slotIndex: number) => void;
}) {
  if (!slot) {
    return (
      <button
        onClick={() => onDrop(index)}
        className={`flex h-12 w-12 items-center justify-center rounded-lg border border-solid transition-all ${
          isActive
            ? 'border-accent-500/40 bg-surface-950 hover:shadow-glow-accent'
            : 'border-surface-500 bg-surface-950'
        }`}
        style={{ boxShadow: 'var(--shadow-inset)' }}
      >
        <span className={`text-lg font-light ${isActive ? 'text-surface-400 group-hover:text-surface-300' : 'text-surface-500'}`}>+</span>
      </button>
    );
  }

  const getOrbForSlot = (s: EquippedSlot): OrbInstance => {
    if (s.kind === 'single') return s.orb;
    if (s.kind === 'upgraded') return s.orb;
    return s.orbs[0]; // compound: show first orb
  };

  const orb = getOrbForSlot(slot);
  const affix = affixMap.get(orb.affixId);

  return (
    <div className="relative" style={{ animation: 'scale-in 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
      {affix && (
        <OrbIcon
          affixId={orb.affixId}
          affixName={`${affix.name}${slot.kind === 'upgraded' ? ' (Upgraded)' : slot.kind === 'compound' ? ' (Combined)' : ''}`}
          tier={orb.tier}
          category={affix.category}
          tags={affix.tags}
          size="md"
          onClick={() => onRemove(index)}
        />
      )}
      {slot.kind === 'compound' && (
        <span className="absolute -top-1 -right-1 rounded-full bg-accent-500 px-1 text-[10px] font-bold text-surface-900">
          C
        </span>
      )}
      {slot.kind === 'upgraded' && (
        <span className="absolute -top-1 -right-1 rounded-full bg-tier-4 px-1 text-[10px] font-bold text-white">
          +
        </span>
      )}
    </div>
  );
}

function ItemPanel({
  item,
  label,
  affixMap,
  isActive,
  onDropToSlot,
  onRemoveFromSlot,
}: {
  item: ForgedItem;
  label: string;
  affixMap: Map<string, AffixDef>;
  isActive: boolean;
  onDropToSlot: (slotIndex: number) => void;
  onRemoveFromSlot: (slotIndex: number) => void;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${isActive ? 'border-accent-500/40 bg-surface-700' : 'border-surface-600 bg-surface-800'}`}
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <h3
        className={`mb-2 text-sm font-bold uppercase ${isActive ? 'text-accent-400' : 'text-surface-400'}`}
        style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
      >
        {label}
      </h3>
      {item.baseStats && (
        <p className="mb-2 text-xs text-surface-400">
          Stats: {item.baseStats.stat1} / {item.baseStats.stat2}
        </p>
      )}
      <div className="grid grid-cols-6 gap-1">
        {item.slots.map((slot, i) => (
          <SlotView
            key={i}
            slot={slot}
            index={i}
            affixMap={affixMap}
            isActive={isActive}
            onDrop={onDropToSlot}
            onRemove={onRemoveFromSlot}
          />
        ))}
      </div>
    </div>
  );
}

function SynergyTracker({
  loadout,
  registry,
}: {
  loadout: { weapon: ForgedItem; armor: ForgedItem };
  registry: ReturnType<typeof useMatchStore.getState>['getRegistry'] extends () => infer R ? R : never;
}) {
  const activeSynergies = useMemo(() => {
    const affixIds = new Set<string>();
    for (const item of [loadout.weapon, loadout.armor]) {
      for (const slot of item.slots) {
        if (!slot) continue;
        if (slot.kind === 'single') affixIds.add(slot.orb.affixId);
        if (slot.kind === 'upgraded') affixIds.add(slot.orb.affixId);
        if (slot.kind === 'compound') {
          slot.orbs.forEach((o) => affixIds.add(o.affixId));
        }
      }
    }

    const synergies = registry.getAllSynergies();
    return synergies.map((s: SynergyDef) => {
      const matched = s.requiredAffixes.filter((id: string) => affixIds.has(id)).length;
      return { synergy: s, matched, total: s.requiredAffixes.length, active: matched >= s.requiredAffixes.length };
    }).filter((s) => s.matched > 0);
  }, [loadout, registry]);

  if (activeSynergies.length === 0) return null;

  return (
    <div className="rounded-lg border border-surface-600 bg-surface-800 p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
      <h4
        className="mb-1 text-xs font-bold uppercase text-surface-400"
        style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
      >
        Synergies
      </h4>
      <div className="flex flex-wrap gap-1">
        {activeSynergies.map(({ synergy, matched, total, active }) => (
          <span
            key={synergy.id}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              active ? 'bg-success/20 text-success' : 'bg-surface-600 text-surface-400'
            }`}
          >
            {synergy.name} ({matched}/{total})
          </span>
        ))}
      </div>
    </div>
  );
}

export function Forge() {
  const { id } = useParams();
  const navigate = useNavigate();

  const phase = useMatchStore(selectPhase);
  const player = useMatchStore(selectPlayer(0));
  const matchState = useMatchStore((s) => s.state);
  const dispatch = useMatchStore((s) => s.dispatch);
  const aiController = useMatchStore((s) => s.aiController);
  const getRegistry = useMatchStore((s) => s.getRegistry);

  const activeTab = useForgeStore((s) => s.activeTab);
  const setActiveTab = useForgeStore((s) => s.setActiveTab);
  const selectedOrbUid = useForgeStore((s) => s.selectedOrbUid);
  const selectOrb = useForgeStore((s) => s.selectOrb);

  const [baseStatWeapon, setBaseStatWeapon] = useState<[BaseStat, BaseStat]>(['STR', 'VIT']);
  const [baseStatArmor, setBaseStatArmor] = useState<[BaseStat, BaseStat]>(['VIT', 'STR']);
  const [baseStatsSet, setBaseStatsSet] = useState(false);

  const registry = getRegistry();
  const affixMap = useMemo(() => {
    const m = new Map<string, AffixDef>();
    for (const affix of registry.getAllAffixes()) m.set(affix.id, affix);
    return m;
  }, [registry]);

  const round = phase?.kind === 'forge' ? phase.round : 1;
  const flux = matchState?.forgeFlux?.[0] ?? 0;

  // Set base stats for round 1
  useEffect(() => {
    if (round === 1 && !baseStatsSet && matchState) {
      dispatch({ kind: 'forge_action', player: 0, action: { kind: 'set_base_stats', target: 'weapon', stat1: baseStatWeapon[0], stat2: baseStatWeapon[1] } });
      dispatch({ kind: 'forge_action', player: 0, action: { kind: 'set_base_stats', target: 'armor', stat1: baseStatArmor[0], stat2: baseStatArmor[1] } });
      setBaseStatsSet(true);
    }
  }, [round, baseStatsSet, matchState, dispatch, baseStatWeapon, baseStatArmor]);

  // Handle AI forge when player completes
  const handleComplete = useCallback(() => {
    if (!matchState || !aiController) return;

    dispatch({ kind: 'forge_complete', player: 0 });

    // AI forges
    if (phase?.kind === 'forge') {
      // Set AI base stats in round 1
      if (round === 1) {
        dispatch({ kind: 'forge_action', player: 1, action: { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' } });
        dispatch({ kind: 'forge_action', player: 1, action: { kind: 'set_base_stats', target: 'armor', stat1: 'VIT', stat2: 'STR' } });
      }

      const aiActions = aiController.planForge(
        matchState.players[1].stockpile,
        matchState.players[1].loadout,
        matchState.forgeFlux?.[1] ?? 0,
        round as 1 | 2 | 3,
        matchState.players[0].stockpile,
      );

      for (const action of aiActions) {
        dispatch({ kind: 'forge_action', player: 1, action });
      }
      dispatch({ kind: 'forge_complete', player: 1 });
    }
  }, [matchState, aiController, dispatch, phase, round]);

  // Navigate when forge transitions to duel
  useEffect(() => {
    if (phase?.kind === 'duel') {
      navigate(`/match/${id}/duel`, { replace: true });
    }
  }, [phase, navigate, id]);

  const handleDropToSlot = (slotIndex: number) => {
    if (!selectedOrbUid) return;
    const target = activeTab;
    const result = dispatch({
      kind: 'forge_action',
      player: 0,
      action: { kind: 'assign_orb', orbUid: selectedOrbUid, target, slotIndex },
    });
    if (result.ok) {
      showToast(`Orb placed in Slot ${slotIndex + 1}`);
      selectOrb(null);
    }
  };

  const handleRemoveFromSlot = (slotIndex: number) => {
    if (round === 1) return; // Can't remove in round 1
    dispatch({
      kind: 'forge_action',
      player: 0,
      action: { kind: 'remove_orb', target: activeTab, slotIndex },
    });
  };

  // Find possible combinations from stockpile
  const possibleCombos = useMemo(() => {
    if (!player) return [];
    const combos: { combo: CompoundAffixDef; orb1: OrbInstance; orb2: OrbInstance }[] = [];
    const stockpile = player.stockpile;
    for (let i = 0; i < stockpile.length; i++) {
      for (let j = i + 1; j < stockpile.length; j++) {
        const combo = registry.getCombination(stockpile[i].affixId, stockpile[j].affixId);
        if (combo) combos.push({ combo, orb1: stockpile[i], orb2: stockpile[j] });
      }
    }
    return combos;
  }, [player, registry]);

  if (!matchState || phase?.kind !== 'forge' || !player) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-surface-400">Loading forge...</p>
      </div>
    );
  }

  const currentItem = activeTab === 'weapon' ? player.loadout.weapon : player.loadout.armor;

  // Calculate live stats preview
  const stats = calculateStats(player.loadout, registry);

  return (
    <div className="page-enter flex h-full flex-col gap-2 p-4">
      <ToastContainer />

      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2
            className="text-lg font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            Forge Phase
          </h2>
          <p className="text-xs text-surface-400">
            Round {round} — Flux: <span className="stat-number text-accent-300">{flux}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Timer durationMs={FORGE_TIMER_MS} onExpire={handleComplete} />
          <button
            onClick={handleComplete}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-surface-900 hover:bg-accent-400"
            style={{ boxShadow: 'var(--shadow-button)', fontFamily: 'var(--font-family-display)' }}
          >
            Done Forging
          </button>
        </div>
      </header>

      {/* Base stat selectors (round 1 only) */}
      {round === 1 && (
        <div className="flex flex-wrap gap-2">
          {(['weapon', 'armor'] as const).map((target) => {
            const statPair = target === 'weapon' ? baseStatWeapon : baseStatArmor;
            const setter = target === 'weapon' ? setBaseStatWeapon : setBaseStatArmor;
            return (
              <div
                key={target}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-700 px-3 py-1 text-xs"
                style={{ fontFamily: 'var(--font-family-display)' }}
              >
                <span className="text-surface-400 capitalize">{target}:</span>
                {[0, 1].map((i) => (
                  <select
                    key={i}
                    value={statPair[i]}
                    onChange={(e) => {
                      const newStats = [...statPair] as [BaseStat, BaseStat];
                      newStats[i] = e.target.value as BaseStat;
                      setter(newStats);
                    }}
                    className="rounded bg-surface-600 px-1.5 py-0.5 text-xs text-white"
                  >
                    {BASE_STATS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Tabbed weapon/armor view */}
      <div>
        <div className="mb-2 flex gap-1">
          {(['weapon', 'armor'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-1 text-sm font-medium capitalize ${
                activeTab === tab ? 'bg-accent-500 text-surface-900' : 'bg-surface-600 text-surface-400'
              }`}
              style={{ fontFamily: 'var(--font-family-display)' }}
            >
              {tab}
            </button>
          ))}
        </div>
        <ItemPanel
          item={currentItem}
          label={activeTab}
          affixMap={affixMap}
          isActive
          onDropToSlot={handleDropToSlot}
          onRemoveFromSlot={handleRemoveFromSlot}
        />
      </div>

      {/* Synergy tracker */}
      <SynergyTracker loadout={player.loadout} registry={registry} />

      {/* Available combinations */}
      {possibleCombos.length > 0 && (
        <div className="rounded-lg border border-surface-600 bg-surface-800 p-2" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h4
            className="mb-1 text-xs font-bold uppercase text-surface-400"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            Available Combinations
          </h4>
          <div className="flex flex-wrap gap-1">
            {possibleCombos.map(({ combo, orb1, orb2 }, idx) => (
              <button
                key={`${combo.id}-${orb1.uid}-${orb2.uid}`}
                onClick={() => {
                  const item = activeTab === 'weapon' ? player.loadout.weapon : player.loadout.armor;
                  for (let s = 0; s < 5; s++) {
                    if (item.slots[s] === null && item.slots[s + 1] === null) {
                      dispatch({
                        kind: 'forge_action',
                        player: 0,
                        action: { kind: 'combine', orbUid1: orb1.uid, orbUid2: orb2.uid, target: activeTab, slotIndex: s },
                      });
                      showToast(`Combined: ${combo.name}!`);
                      break;
                    }
                  }
                }}
                className="rounded bg-surface-600 px-2 py-1 text-xs text-accent-400 hover:bg-surface-500"
              >
                {combo.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stockpile */}
      <div
        className="flex-1 overflow-y-auto rounded-lg border border-surface-600 bg-surface-800 p-3"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <h3
          className="mb-2 text-xs font-bold uppercase text-surface-400"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
        >
          Stockpile ({player.stockpile.length})
        </h3>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {player.stockpile.map((orb) => {
            const affix = affixMap.get(orb.affixId);
            if (!affix) return null;
            return (
              <OrbIcon
                key={orb.uid}
                affixId={orb.affixId}
                affixName={affix.name}
                tier={orb.tier}
                category={affix.category}
                tags={affix.tags}
                size="md"
                selected={orb.uid === selectedOrbUid}
                onClick={() => selectOrb(orb.uid === selectedOrbUid ? null : orb.uid)}
              />
            );
          })}
        </div>
      </div>

      {/* Live stats preview bar */}
      <div className="grid grid-cols-4 gap-1 text-xs">
        {[
          { label: 'HP', value: String(stats.maxHP) },
          { label: 'DMG', value: String(stats.physicalDamage) },
          { label: 'Armor', value: `${Math.round(stats.armor * 100)}%` },
          { label: 'Crit', value: `${Math.round(stats.critChance * 100)}%` },
        ].map(({ label, value }) => (
          <div key={label} className="rounded bg-surface-700 px-2 py-1.5" style={{ boxShadow: 'var(--shadow-inset)' }}>
            <span className="text-surface-400" style={{ fontFamily: 'var(--font-family-display)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>{' '}
            <span className="stat-number text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
