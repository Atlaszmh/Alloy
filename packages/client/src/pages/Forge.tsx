import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useMatchGateway } from '@/gateway';
import { useForgeStore } from '@/stores/forgeStore';
import type { DragSource } from '@/stores/forgeStore';
import { GemCard } from '@/components/GemCard';
import { Timer } from '@/components/Timer';
import { Modal } from '@/components/Modal';
import { getStatLabel } from '@/shared/utils/stat-label';
import { getAffixDisplayIndex } from '@/shared/utils/affix-order';
import { ELEMENT_EMOJIS } from '@/shared/utils/element-theme';
import type {
  AffixDef,
  EquippedSlot,
  ForgedItem,
  OrbInstance,
  BaseStat,
  SynergyDef,
  CompoundAffixDef,
  DataRegistry,
  ForgePlan,
} from '@alloy/engine';
import { createForgeState } from '@alloy/engine';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { playSound } from '@/shared/utils/sound-manager';

const FORGE_TIMER_MS = 90_000;
const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];
const DRAG_THRESHOLD = 6;

// ── Color constants (from spec) ──
const COLOR_AFFIX = '#1eff00';
const COLOR_COMPOUND = '#ecd06a';
const COLOR_INHERENT = '#2dd4bf';
const COLOR_BASE_STAT = '#b89868';
const COLOR_EMPTY_SOCKET = '#4a4a68';
const COLOR_LOCKED = '#6a6a88';

// ── Stat label for inherent bonuses ──
function formatStatMod(stat: string, op: string, value: number): string {
  if (op === 'percent') return `${value > 0 ? '+' : ''}${Math.round(value * 100)}% ${formatStatName(stat)}`;
  return `${value > 0 ? '+' : ''}${value} ${formatStatName(stat)}`;
}

function formatStatName(stat: string): string {
  const names: Record<string, string> = {
    critChance: 'Crit Chance', critMultiplier: 'Crit Multiplier',
    attackInterval: 'Attack Speed', physicalDamage: 'Physical Damage',
    maxHP: 'Max HP', stunChance: 'Stun Chance', armor: 'Armor',
    allElementalDamage: 'All Elemental Damage', allResistances: 'All Resistances',
    blockChance: 'Block Chance', dodgeChance: 'Dodge', hpRegen: 'HP Regen',
    thornsDamage: 'Thorns',
  };
  return names[stat] ?? stat;
}

// ── Helpers ──

function getOrbsForSlot(slot: EquippedSlot): OrbInstance[] {
  if (slot.kind === 'single') return [slot.orb];
  if (slot.kind === 'upgraded') return [slot.orb];
  return slot.orbs;
}

function getFirstOrbUid(slot: EquippedSlot): string {
  if (slot.kind === 'compound') return slot.orbs[0].uid;
  return slot.orb.uid;
}

/** Collect filled slots with their indexes, sorted by affix display order */
function getSortedSlots(item: ForgedItem): Array<{ slot: EquippedSlot; index: number }> {
  const filled: Array<{ slot: EquippedSlot; index: number; affixId: string }> = [];
  const seen = new Set<number>();
  for (let i = 0; i < item.slots.length; i++) {
    const s = item.slots[i];
    if (!s || seen.has(i)) continue;
    // Compounds occupy two consecutive slots — only add once
    if (s.kind === 'compound') {
      seen.add(i);
      seen.add(i + 1);
    } else {
      seen.add(i);
    }
    const affixId = s.kind === 'compound' ? s.compoundId : s.orb.affixId;
    filled.push({ slot: s, index: i, affixId });
  }
  // Sort singles/upgraded by affix order; compounds go last
  filled.sort((a, b) => {
    const aIsCompound = a.slot.kind === 'compound';
    const bIsCompound = b.slot.kind === 'compound';
    if (aIsCompound && !bIsCompound) return 1;
    if (!aIsCompound && bIsCompound) return -1;
    if (aIsCompound && bIsCompound) return 0;
    return getAffixDisplayIndex(a.affixId) - getAffixDisplayIndex(b.affixId);
  });
  return filled;
}

function countEmptySlots(item: ForgedItem): number {
  return item.slots.filter(s => s === null).length;
}

// ── ItemCard (WoW-style tooltip) ──

function ItemCard({
  item,
  cardId,
  affixMap,
  registry,
  plan,
  selectedOrbUid,
  onSlotClick,
  onRemoveClick,
  onSlotPointerDown,
  isDragTarget,
}: {
  item: ForgedItem;
  cardId: 'weapon' | 'armor';
  affixMap: Map<string, AffixDef>;
  registry: DataRegistry;
  plan: ForgePlan;
  selectedOrbUid: string | null;
  onSlotClick: (cardId: 'weapon' | 'armor', slotIndex: number) => void;
  onRemoveClick: (cardId: 'weapon' | 'armor', slotIndex: number) => void;
  onSlotPointerDown: (e: React.PointerEvent, cardId: 'weapon' | 'armor', slotIndex: number, orb: OrbInstance) => void;
  isDragTarget: boolean;
}) {
  const baseItem = registry.getBaseItem(item.baseItemId);
  const sortedSlots = getSortedSlots(item);
  const emptyCount = countEmptySlots(item);
  const hasSelection = selectedOrbUid !== null;

  // Find first empty slot index
  const firstEmptySlot = item.slots.findIndex(s => s === null);

  return (
    <div
      data-card={cardId}
      className="flex-1 rounded-lg border border-surface-500 p-3 transition-all"
      style={{
        boxShadow: isDragTarget
          ? '0 0 12px rgba(236,208,106,0.5), inset 0 0 6px rgba(236,208,106,0.15)'
          : 'var(--shadow-card)',
        borderColor: isDragTarget ? COLOR_COMPOUND : undefined,
        background: 'linear-gradient(180deg, rgba(30,30,46,0.95), rgba(20,20,32,0.98))',
        minWidth: 0,
      }}
    >
      {/* Card header */}
      <div className="mb-1">
        <h3
          className="text-sm font-bold text-white"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
        >
          {baseItem.name}
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-surface-400">
          {baseItem.type === 'weapon' ? 'Weapon' : 'Armor'} &mdash; {baseItem.name}
        </span>
      </div>

      <hr className="border-surface-600 mb-2" />

      {/* Inherent bonuses */}
      {baseItem.inherentBonuses.length > 0 && (
        <>
          <div className="mb-1.5">
            {baseItem.inherentBonuses.map((mod, i) => (
              <div key={i} className="text-xs" style={{ color: COLOR_INHERENT }}>
                {formatStatMod(mod.stat, mod.op, mod.value)}
              </div>
            ))}
          </div>
          <hr className="border-surface-600 mb-2" />
        </>
      )}

      {/* Base stats */}
      {item.baseStats && (
        <>
          <div className="mb-1.5 flex gap-4">
            <span className="text-sm font-bold" style={{ color: COLOR_BASE_STAT, fontFamily: 'var(--font-family-display)' }}>
              {item.baseStats.stat1}
            </span>
            <span className="text-sm font-bold" style={{ color: COLOR_BASE_STAT, fontFamily: 'var(--font-family-display)' }}>
              {item.baseStats.stat2}
            </span>
          </div>
          <hr className="border-surface-600 mb-2" />
        </>
      )}

      {/* Affix lines (sorted) */}
      {sortedSlots.map(({ slot, index }) => {
        if (slot.kind === 'compound') {
          const combo = registry.getCombinationById(slot.compoundId);
          const locked = !plan || slot.orbs.every(o => plan.lockedOrbUids.has(o.uid));
          return (
            <div
              key={`compound-${index}`}
              className="group mb-1 flex items-center gap-1.5 rounded px-1 py-0.5"
            >
              <span style={{ color: COLOR_COMPOUND, fontSize: 12 }}>{'\u2726'}</span>
              <span className="flex-1 text-xs font-semibold" style={{ color: COLOR_COMPOUND }}>
                {combo?.name ?? slot.compoundId}
              </span>
              {locked && <span style={{ color: COLOR_LOCKED, fontSize: 11 }}>{'\uD83D\uDD12'}</span>}
            </div>
          );
        }

        const orb = slot.kind === 'single' ? slot.orb : slot.orb;
        const affix = affixMap.get(orb.affixId);
        if (!affix) return null;

        const locked = plan.lockedOrbUids.has(orb.uid);
        const canRemove = plan.round !== 1 && !locked;
        const primaryTag = affix.tags.find(t => t in ELEMENT_EMOJIS) ?? 'physical';
        const emoji = ELEMENT_EMOJIS[primaryTag] ?? '\u2694';
        const label = getStatLabel(affix, orb, cardId);
        const tierLabel = `T${orb.tier}`;

        return (
          <div
            key={`slot-${index}`}
            className="group mb-1 flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 hover:bg-surface-600/40"
            data-slot-index={index}
            data-card-id={cardId}
            style={{ touchAction: 'none' }}
            onClick={() => canRemove ? onRemoveClick(cardId, index) : undefined}
            onPointerDown={canRemove ? (e) => onSlotPointerDown(e, cardId, index, orb) : undefined}
          >
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span className="flex-1 text-xs font-medium" style={{ color: COLOR_AFFIX }}>
              {affix.name} {label}
            </span>
            <span
              className="rounded-sm px-1 text-[10px] font-bold"
              style={{
                backgroundColor: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              {tierLabel}
            </span>
            {slot.kind === 'upgraded' && (
              <span className="text-[10px] font-bold text-tier-4">+</span>
            )}
            {locked && <span style={{ color: COLOR_LOCKED, fontSize: 11 }}>{'\uD83D\uDD12'}</span>}
            {canRemove && (
              <span className="text-xs text-danger opacity-0 transition-opacity group-hover:opacity-100">
                {'\u2715'}
              </span>
            )}
          </div>
        );
      })}

      {/* Empty sockets */}
      {emptyCount > 0 && (
        <>
          <hr className="border-surface-600 my-1.5" />
          <div className="flex flex-wrap gap-1.5">
            {item.slots.map((slot, i) => {
              if (slot !== null) return null;
              return (
                <button
                  key={`empty-${i}`}
                  data-empty-socket={i}
                  data-card-id={cardId}
                  onClick={() => onSlotClick(cardId, i)}
                  className="flex items-center justify-center rounded-full border-2 border-dashed transition-all"
                  style={{
                    width: 28,
                    height: 28,
                    borderColor: hasSelection ? COLOR_COMPOUND : COLOR_EMPTY_SOCKET,
                    animation: hasSelection ? 'orb-glow 1.5s ease-in-out infinite' : undefined,
                    boxShadow: hasSelection ? `0 0 6px ${COLOR_COMPOUND}40` : undefined,
                  }}
                >
                  <span style={{ color: COLOR_EMPTY_SOCKET, fontSize: 12, fontWeight: 300 }}>+</span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 text-[10px] text-surface-500">
            {emptyCount} empty socket{emptyCount !== 1 ? 's' : ''}
          </div>
        </>
      )}
    </div>
  );
}

// ── StatsBar ──

function StatsBar({ plan, registry }: { plan: ForgePlan; registry: DataRegistry }) {
  const forgeStore = useForgeStore();
  const derivedStats = forgeStore.getStats(registry);

  if (!derivedStats) return null;

  const items = [
    { label: 'HP', value: String(derivedStats.maxHP) },
    { label: 'DMG', value: String(derivedStats.physicalDamage) },
    { label: 'Armor', value: `${Math.round(derivedStats.armor * 100)}%` },
    { label: 'Crit', value: `${Math.round(derivedStats.critChance * 100)}%` },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 text-xs">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded bg-surface-700 px-2 py-1.5" style={{ boxShadow: 'var(--shadow-inset)' }}>
          <span
            className="text-surface-400"
            style={{ fontFamily: 'var(--font-family-display)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}
          >
            {label}
          </span>{' '}
          <span className="stat-number text-white">{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── SynergyTracker ──

function SynergyTracker({
  loadout,
  registry,
}: {
  loadout: { weapon: ForgedItem; armor: ForgedItem };
  registry: DataRegistry;
}) {
  const activeSynergies = useMemo(() => {
    const affixIds = new Set<string>();
    for (const item of [loadout.weapon, loadout.armor]) {
      for (const slot of item.slots) {
        if (!slot) continue;
        if (slot.kind === 'single') affixIds.add(slot.orb.affixId);
        if (slot.kind === 'upgraded') affixIds.add(slot.orb.affixId);
        if (slot.kind === 'compound') slot.orbs.forEach(o => affixIds.add(o.affixId));
      }
    }
    const synergies = registry.getAllSynergies();
    return synergies
      .map((s: SynergyDef) => {
        const matched = s.requiredAffixes.filter((id: string) => affixIds.has(id)).length;
        return { synergy: s, matched, total: s.requiredAffixes.length, active: matched >= s.requiredAffixes.length };
      })
      .filter(s => s.matched > 0);
  }, [loadout, registry]);

  if (activeSynergies.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {activeSynergies.map(({ synergy, matched, total, active }) => (
        <span
          key={synergy.id}
          className={`rounded px-2 py-0.5 text-[10px] font-medium ${
            active ? 'bg-success/20 text-success' : 'bg-surface-600 text-surface-400'
          }`}
        >
          {synergy.name} ({matched}/{total})
        </span>
      ))}
    </div>
  );
}

// ── FluxCounter ──

function FluxCounter({ flux, maxFlux }: { flux: number; maxFlux: number }) {
  const color = flux === 0 ? 'text-danger' : flux <= 2 ? 'text-warning' : 'text-success';
  return (
    <span className={`stat-number text-sm ${color}`}>
      {'\u26A1'}{flux}
    </span>
  );
}

// ── FluxPopup ──

function FluxPopup({ amount, id }: { amount: number; id: number }) {
  const isPositive = amount > 0;
  return (
    <span
      key={id}
      className="pointer-events-none absolute text-xs font-bold"
      style={{
        color: isPositive ? '#22c55e' : '#ef4444',
        animation: 'flux-pop 0.8s ease-out forwards',
        top: 0,
        right: 0,
      }}
    >
      {isPositive ? '+' : ''}{amount}{'\u26A1'}
    </span>
  );
}

// ── CombinationWorkbench ──

function CombinationWorkbench({
  plan,
  registry,
  affixMap,
  onCombine,
  onClear,
  onSocketPointerDown,
}: {
  plan: ForgePlan;
  registry: DataRegistry;
  affixMap: Map<string, AffixDef>;
  onCombine: (orbUid1: string, orbUid2: string) => void;
  onClear: () => void;
  onSocketPointerDown: (e: React.PointerEvent, slot: 'a' | 'b', orb: OrbInstance) => void;
}) {
  const comboSlotA = useForgeStore(s => s.comboSlotA);
  const comboSlotB = useForgeStore(s => s.comboSlotB);

  const recipe: CompoundAffixDef | null = useMemo(() => {
    if (!comboSlotA || !comboSlotB) return null;
    return registry.getCombination(comboSlotA.affixId, comboSlotB.affixId);
  }, [comboSlotA, comboSlotB, registry]);

  const balance = registry.getBalance();
  const canAfford = plan.tentativeFlux >= balance.fluxCosts.combineOrbs;

  function renderComboSocket(orb: OrbInstance | null, slotKey: 'a' | 'b') {
    if (!orb) {
      return (
        <div
          data-combo-socket={slotKey}
          className="flex items-center justify-center rounded-lg border-2 border-dashed"
          style={{ width: 56, height: 56, borderColor: COLOR_EMPTY_SOCKET }}
        >
          <span className="text-sm" style={{ color: COLOR_EMPTY_SOCKET }}>?</span>
        </div>
      );
    }
    const affix = affixMap.get(orb.affixId);
    if (!affix) return null;
    return (
      <div data-combo-socket={slotKey} style={{ touchAction: 'none' }}>
        <GemCard
          affixId={orb.affixId}
          affixName={affix.name}
          tier={orb.tier}
          category={affix.category}
          tags={affix.tags}
          statLabel={getStatLabel(affix, orb)}
          gemSize={48}
          emojiSize={16}
          statSize={10}
          nameSize={0}
          onPointerDown={(e) => onSocketPointerDown(e, slotKey, orb)}
          catSize={0}
        />
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-surface-600 bg-surface-800 p-2"
      style={{ boxShadow: 'var(--shadow-card)' }}
    >
      <h4
        className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest"
        style={{ color: COLOR_COMPOUND, fontFamily: 'var(--font-family-display)' }}
      >
        {'\u25C6'} FORGE {'\u25C6'}
      </h4>
      <div className="flex items-center justify-center gap-2">
        {renderComboSocket(comboSlotA, 'a')}
        <span className="text-lg font-bold text-surface-400">+</span>
        {renderComboSocket(comboSlotB, 'b')}
        <span className="text-lg font-bold text-surface-400">{'\u25B6'}</span>
        <div className="flex min-w-[56px] items-center justify-center">
          {recipe ? (
            <span className="text-center text-xs font-bold" style={{ color: COLOR_COMPOUND }}>
              {recipe.name}
            </span>
          ) : (
            <span className="text-xs text-surface-500">?</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-2">
        <button
          disabled={!recipe || !canAfford}
          onClick={() => {
            if (comboSlotA && comboSlotB) onCombine(comboSlotA.uid, comboSlotB.uid);
          }}
          className="rounded bg-accent-500 px-3 py-1 text-xs font-bold text-surface-900 transition-colors hover:bg-accent-400 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          COMBINE
        </button>
        <button
          disabled={!comboSlotA && !comboSlotB}
          onClick={onClear}
          className="rounded bg-surface-600 px-3 py-1 text-xs font-medium text-surface-300 transition-colors hover:bg-surface-500 disabled:opacity-40"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          CLEAR
        </button>
      </div>
    </div>
  );
}

// ── DragGhost ──

function DragGhost({
  orb,
  affixMap,
  position,
}: {
  orb: OrbInstance;
  affixMap: Map<string, AffixDef>;
  position: { x: number; y: number };
}) {
  const affix = affixMap.get(orb.affixId);
  if (!affix) return null;

  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: position.x - 40,
        top: position.y - 40,
        filter: 'drop-shadow(0 0 12px rgba(236,208,106,0.6))',
      }}
    >
      <GemCard
        affixId={orb.affixId}
        affixName={affix.name}
        tier={orb.tier}
        category={affix.category}
        tags={affix.tags}
        statLabel={getStatLabel(affix, orb)}
        gemSize={80}
        emojiSize={24}
        statSize={12}
        nameSize={0}
        catSize={0}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════
// ── Main Forge component ──
// ══════════════════════════════════════════════════

export function Forge() {
  const { code } = useParams();
  const navigate = useNavigate();

  const gateway = useMatchGateway(code!);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const player = matchState?.players[0] ?? null;
  const aiController = useMatchStore(s => s.aiController);
  const getRegistry = useMatchStore(s => s.getRegistry);

  const plan = useForgeStore(s => s.plan);
  const selectedOrbUid = useForgeStore(s => s.selectedOrbUid);
  const dragSource = useForgeStore(s => s.dragSource);
  const confirmModalOpen = useForgeStore(s => s.confirmModalOpen);
  const comboSlotA = useForgeStore(s => s.comboSlotA);
  const comboSlotB = useForgeStore(s => s.comboSlotB);
  const {
    initPlan,
    applyAction,
    getCommitActions,
    selectOrb,
    startDrag,
    endDrag,
    openConfirmModal,
    closeConfirmModal,
    setComboSlot,
    clearComboSlots,
    reset: resetForgeStore,
  } = useForgeStore();

  const { isDisconnected, secondsLeft } = useDisconnectTimer(gateway);

  const registry = getRegistry();
  const affixMap = useMemo(() => {
    const m = new Map<string, AffixDef>();
    for (const affix of registry.getAllAffixes()) m.set(affix.id, affix);
    return m;
  }, [registry]);

  const round = phase?.kind === 'forge' ? phase.round : (1 as 1 | 2 | 3);

  // Flux popup state
  const [fluxPopups, setFluxPopups] = useState<Array<{ amount: number; id: number }>>([]);
  const popupIdRef = useRef(0);
  const prevFluxRef = useRef<number | null>(null);

  // Committed flag for double-commit prevention
  const committedRef = useRef(false);

  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [dragOrb, setDragOrb] = useState<OrbInstance | null>(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragThresholdMet = useRef(false);

  // Base stat selectors for round 1
  const [baseStatWeapon, setBaseStatWeapon] = useState<[BaseStat, BaseStat]>(['STR', 'VIT']);
  const [baseStatArmor, setBaseStatArmor] = useState<[BaseStat, BaseStat]>(['VIT', 'STR']);

  // ── Initialize plan on mount / round change ──
  useEffect(() => {
    if (!matchState || phase?.kind !== 'forge' || !player) return;
    committedRef.current = false;

    const forgeState = createForgeState(
      player.stockpile,
      matchState.baseWeaponId,
      matchState.baseArmorId,
      round,
      registry.getBalance(),
      matchState.mode === 'quick',
    );
    // Copy existing loadout into forge state
    forgeState.loadout = {
      weapon: { ...player.loadout.weapon, slots: [...player.loadout.weapon.slots] },
      armor: { ...player.loadout.armor, slots: [...player.loadout.armor.slots] },
    };
    forgeState.fluxRemaining = matchState.forgeFlux?.[0] ?? forgeState.fluxRemaining;

    initPlan(forgeState, registry);

    // Apply base stats in round 1
    if (round === 1) {
      applyAction({ kind: 'set_base_stats', target: 'weapon', stat1: baseStatWeapon[0], stat2: baseStatWeapon[1] }, registry);
      applyAction({ kind: 'set_base_stats', target: 'armor', stat1: baseStatArmor[0], stat2: baseStatArmor[1] }, registry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.kind === 'forge' ? `${round}` : 'none']);

  // ── Flux change popup tracking ──
  useEffect(() => {
    if (!plan) return;
    if (prevFluxRef.current !== null && prevFluxRef.current !== plan.tentativeFlux) {
      const diff = plan.tentativeFlux - prevFluxRef.current;
      if (diff < 0) playSound('fluxSpend');
      const popupId = popupIdRef.current++;
      setFluxPopups(prev => [...prev, { amount: diff, id: popupId }]);
      setTimeout(() => {
        setFluxPopups(prev => prev.filter(p => p.id !== popupId));
      }, 800);
    }
    prevFluxRef.current = plan.tentativeFlux;
  }, [plan?.tentativeFlux]);

  // ── Navigate to duel when phase changes ──
  useEffect(() => {
    if (phase?.kind === 'duel') {
      navigate(`/match/${code}/duel`, { replace: true });
    }
  }, [phase, navigate, code]);

  // ── Commit flow ──
  const handleCommit = useCallback(async () => {
    if (committedRef.current || !matchState) return;
    committedRef.current = true;
    playSound('forgeSubmit');

    // Replay plan actions through gateway.dispatch
    const actions = getCommitActions();
    for (const action of actions) {
      await gateway.dispatch({ kind: 'forge_action', player: 0, action });
    }
    await gateway.dispatch({ kind: 'forge_complete', player: 0 });

    // AI forge (only for local/AI matches)
    const isAiMatch = code?.startsWith('ai-');
    if (isAiMatch && aiController && phase?.kind === 'forge') {
      if (round === 1) {
        await gateway.dispatch({ kind: 'forge_action', player: 1, action: { kind: 'set_base_stats', target: 'weapon', stat1: 'STR', stat2: 'DEX' } });
        await gateway.dispatch({ kind: 'forge_action', player: 1, action: { kind: 'set_base_stats', target: 'armor', stat1: 'VIT', stat2: 'STR' } });
      }
      const aiActions = aiController.planForge(
        matchState.players[1].stockpile,
        matchState.players[1].loadout,
        matchState.forgeFlux?.[1] ?? 0,
        round,
        matchState.players[0].stockpile,
      );
      for (const action of aiActions) {
        await gateway.dispatch({ kind: 'forge_action', player: 1, action });
      }
      await gateway.dispatch({ kind: 'forge_complete', player: 1 });
    }

    closeConfirmModal();
    resetForgeStore();
  }, [matchState, aiController, gateway, phase, round, code, getCommitActions, closeConfirmModal, resetForgeStore]);

  // ── Timer auto-commit ──
  const handleTimerExpire = useCallback(() => {
    playSound('timerUrgent');
    handleCommit();
  }, [handleCommit]);

  // ── Click interactions ──
  const handleEmptySocketClick = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
    if (!selectedOrbUid || !plan) return;
    const result = applyAction(
      { kind: 'assign_orb', orbUid: selectedOrbUid, target: cardId, slotIndex },
      registry,
    );
    if (result.ok) {
      playSound('orbPlace');
      selectOrb(null);
    }
  }, [selectedOrbUid, plan, applyAction, registry, selectOrb]);

  const handleRemoveClick = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
    if (!plan || plan.round === 1) return;
    applyAction({ kind: 'remove_orb', target: cardId, slotIndex }, registry);
    playSound('orbRemove');
  }, [plan, applyAction, registry]);

  const handleStockpileClick = useCallback((orb: OrbInstance) => {
    if (orb.uid !== selectedOrbUid) playSound('orbSelect');
    selectOrb(orb.uid === selectedOrbUid ? null : orb.uid);
  }, [selectedOrbUid, selectOrb]);

  // ── Drag-and-drop (pointer events) ──

  const findDropTarget = useCallback((x: number, y: number): { type: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number } | { type: 'stockpile' } | { type: 'combo'; slot: 'a' | 'b' } | null => {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;

    // Check empty sockets
    const socketEl = (el as HTMLElement).closest('[data-empty-socket]');
    if (socketEl) {
      const slotIndex = parseInt(socketEl.getAttribute('data-empty-socket')!, 10);
      const cardId = socketEl.getAttribute('data-card-id') as 'weapon' | 'armor';
      return { type: 'card', cardId, slotIndex };
    }

    // Check item cards (drop on card itself)
    const cardEl = (el as HTMLElement).closest('[data-card]');
    if (cardEl) {
      const cardId = cardEl.getAttribute('data-card') as 'weapon' | 'armor';
      // Find first empty slot
      if (plan) {
        const item = plan.loadout[cardId];
        const emptyIdx = item.slots.findIndex(s => s === null);
        if (emptyIdx >= 0) return { type: 'card', cardId, slotIndex: emptyIdx };
      }
    }

    // Check combo sockets
    const comboEl = (el as HTMLElement).closest('[data-combo-socket]');
    if (comboEl) {
      const slot = comboEl.getAttribute('data-combo-socket') as 'a' | 'b';
      return { type: 'combo', slot };
    }

    // Check stockpile
    const stockEl = (el as HTMLElement).closest('[data-stockpile]');
    if (stockEl) return { type: 'stockpile' };

    return null;
  }, [plan]);

  const handlePointerDown = useCallback((e: React.PointerEvent, source: DragSource, orb: OrbInstance) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragThresholdMet.current = false;
    setDragOrb(orb);
    startDrag(source);

    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - dragStartPos.current.x;
      const dy = moveEvent.clientY - dragStartPos.current.y;
      if (!dragThresholdMet.current && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
      dragThresholdMet.current = true;
      setIsDragging(true);
      playSound('dragStart');
      setDragPos({ x: moveEvent.clientX, y: moveEvent.clientY });
    };

    const handleUp = (upEvent: PointerEvent) => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);

      if (!dragThresholdMet.current) {
        // Short click, not a drag
        setIsDragging(false);
        setDragOrb(null);
        endDrag();
        // If from stockpile, toggle selection
        if (source.from === 'stockpile') {
          handleStockpileClick(orb);
        }
        return;
      }

      // Complete drag
      const target = findDropTarget(upEvent.clientX, upEvent.clientY);
      if (target && plan) {
        executeDrop(source, target, orb);
      }

      setIsDragging(false);
      setDragOrb(null);
      endDrag();
    };

    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
  }, [plan, startDrag, endDrag, findDropTarget, handleStockpileClick]);

  const executeDrop = useCallback((
    source: DragSource,
    target: { type: 'card'; cardId: 'weapon' | 'armor'; slotIndex: number } | { type: 'stockpile' } | { type: 'combo'; slot: 'a' | 'b' },
    orb: OrbInstance,
  ) => {
    if (!plan) return;

    // Stockpile -> Card (assign_orb)
    if (source.from === 'stockpile' && target.type === 'card') {
      applyAction(
        { kind: 'assign_orb', orbUid: source.orbUid, target: target.cardId, slotIndex: target.slotIndex },
        registry,
      );
      playSound('dropSuccess');
    }
    // Stockpile -> Combo socket (free, just stage)
    else if (source.from === 'stockpile' && target.type === 'combo') {
      // Move orb from plan stockpile to combo slot visually
      setComboSlot(target.slot, orb);
    }
    // Card -> Stockpile (remove_orb)
    else if (source.from === 'card' && target.type === 'stockpile') {
      applyAction(
        { kind: 'remove_orb', target: source.cardId, slotIndex: source.slotIndex },
        registry,
      );
    }
    // Card -> Other card (remove + assign)
    else if (source.from === 'card' && target.type === 'card') {
      const removeResult = applyAction(
        { kind: 'remove_orb', target: source.cardId, slotIndex: source.slotIndex },
        registry,
      );
      if (removeResult.ok) {
        applyAction(
          { kind: 'assign_orb', orbUid: source.orbUid, target: target.cardId, slotIndex: target.slotIndex },
          registry,
        );
      }
    }
    // Combo socket -> Stockpile (free, return to stockpile)
    else if (source.from === 'combo' && target.type === 'stockpile') {
      setComboSlot(source.slot, null);
    }
    // Combo socket -> Card (assign_orb, need to move from combo first)
    else if (source.from === 'combo' && target.type === 'card') {
      setComboSlot(source.slot, null);
      applyAction(
        { kind: 'assign_orb', orbUid: source.orbUid, target: target.cardId, slotIndex: target.slotIndex },
        registry,
      );
      playSound('dropSuccess');
    }
  }, [plan, applyAction, registry, setComboSlot]);

  // ── Equipped slot drag handler ──
  const handleSlotPointerDown = useCallback((e: React.PointerEvent, cardId: 'weapon' | 'armor', slotIndex: number, orb: OrbInstance) => {
    handlePointerDown(e, { from: 'card', cardId, slotIndex, orbUid: orb.uid }, orb);
  }, [handlePointerDown]);

  // ── Combination workbench handlers ──
  const handleCombine = useCallback((orbUid1: string, orbUid2: string) => {
    if (!plan) return;
    // Find first item with 2 consecutive empty slots
    for (const target of ['weapon', 'armor'] as const) {
      const item = plan.loadout[target];
      for (let i = 0; i < item.slots.length - 1; i++) {
        if (item.slots[i] === null && item.slots[i + 1] === null) {
          const result = applyAction(
            { kind: 'combine', orbUid1, orbUid2, target, slotIndex: i },
            registry,
          );
          if (result.ok) {
            playSound('combineMerge');
            clearComboSlots();
            return;
          }
        }
      }
    }
    playSound('combineFail');
  }, [plan, applyAction, registry, clearComboSlots]);

  const handleClearCombo = useCallback(() => {
    clearComboSlots();
    playSound('buttonClick');
  }, [clearComboSlots]);

  // ── Base stat change handler ──
  const handleBaseStatChange = useCallback((target: 'weapon' | 'armor', index: 0 | 1, value: BaseStat) => {
    const setter = target === 'weapon' ? setBaseStatWeapon : setBaseStatArmor;
    setter(prev => {
      const next = [...prev] as [BaseStat, BaseStat];
      next[index] = value;
      // Apply to plan
      applyAction({ kind: 'set_base_stats', target, stat1: next[0], stat2: next[1] }, registry);
      return next;
    });
  }, [applyAction, registry]);

  // ── Render guard ──
  if (!matchState || phase?.kind !== 'forge' || !player || !plan) {
    return <Navigate to="/queue" replace />;
  }

  const flux = plan.tentativeFlux;
  const maxFlux = plan.maxFlux;

  // Filter out combo-staged orbs from stockpile display
  const comboStagedUids = new Set<string>();
  if (comboSlotA) comboStagedUids.add(comboSlotA.uid);
  if (comboSlotB) comboStagedUids.add(comboSlotB.uid);
  const displayStockpile = comboStagedUids.size > 0
    ? plan.stockpile.filter(o => !comboStagedUids.has(o.uid))
    : plan.stockpile;

  return (
    <div className="page-enter flex h-full flex-col gap-2 overflow-y-auto p-3">
      {!code?.startsWith('ai-') && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}
      {/* ForgeHeader */}
      <header className="flex items-center justify-between">
        <div>
          <h2
            className="text-base font-bold text-accent-400"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            FORGE PHASE
          </h2>
          <div className="flex items-center gap-2 text-xs text-surface-400">
            <span>Round {round}</span>
            <span className="relative">
              <FluxCounter flux={flux} maxFlux={maxFlux} />
              {fluxPopups.map(p => (
                <FluxPopup key={p.id} amount={p.amount} id={p.id} />
              ))}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Timer durationMs={FORGE_TIMER_MS} onExpire={handleTimerExpire} />
          <button
            onClick={openConfirmModal}
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
          {(['weapon', 'armor'] as const).map(target => {
            const statPair = target === 'weapon' ? baseStatWeapon : baseStatArmor;
            return (
              <div
                key={target}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-700 px-3 py-1 text-xs"
                style={{ fontFamily: 'var(--font-family-display)' }}
              >
                <span className="capitalize text-surface-400">{target}:</span>
                {([0, 1] as const).map(i => (
                  <select
                    key={i}
                    value={statPair[i]}
                    onChange={e => handleBaseStatChange(target, i, e.target.value as BaseStat)}
                    className="rounded bg-surface-600 px-1.5 py-0.5 text-xs text-white"
                  >
                    {BASE_STATS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Item cards row — side by side, always visible */}
      <div className="flex gap-2">
        <ItemCard
          item={plan.loadout.weapon}
          cardId="weapon"
          affixMap={affixMap}
          registry={registry}
          plan={plan}
          selectedOrbUid={selectedOrbUid}
          onSlotClick={handleEmptySocketClick}
          onRemoveClick={handleRemoveClick}
          onSlotPointerDown={handleSlotPointerDown}
          isDragTarget={isDragging && (dragSource?.from === 'stockpile' || dragSource?.from === 'combo')}
        />
        <ItemCard
          item={plan.loadout.armor}
          cardId="armor"
          affixMap={affixMap}
          registry={registry}
          plan={plan}
          selectedOrbUid={selectedOrbUid}
          onSlotClick={handleEmptySocketClick}
          onRemoveClick={handleRemoveClick}
          onSlotPointerDown={handleSlotPointerDown}
          isDragTarget={isDragging && (dragSource?.from === 'stockpile' || dragSource?.from === 'combo')}
        />
      </div>

      {/* Synergy tracker */}
      <SynergyTracker loadout={plan.loadout} registry={registry} />

      {/* Combination workbench */}
      <CombinationWorkbench
        plan={plan}
        registry={registry}
        affixMap={affixMap}
        onCombine={handleCombine}
        onClear={handleClearCombo}
        onSocketPointerDown={(e, slot, orb) => handlePointerDown(e, { from: 'combo', slot, orbUid: orb.uid }, orb)}
      />

      {/* Stockpile */}
      <div
        data-stockpile
        className="flex-1 overflow-y-auto rounded-lg border border-surface-600 bg-surface-800 p-3"
        style={{ boxShadow: 'var(--shadow-card)' }}
      >
        <h3
          className="mb-2 text-xs font-bold uppercase text-surface-400"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
        >
          Stockpile ({displayStockpile.length})
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {displayStockpile.map(orb => {
            const affix = affixMap.get(orb.affixId);
            if (!affix) return null;
            return (
              <GemCard
                key={orb.uid}
                affixId={orb.affixId}
                affixName={affix.name}
                tier={orb.tier}
                category={affix.category}
                tags={affix.tags}
                statLabel={getStatLabel(affix, orb)}
                gemSize={72}
                emojiSize={22}
                statSize={11}
                nameSize={9}
                catSize={8}
                selected={orb.uid === selectedOrbUid}
                onClick={() => handleStockpileClick(orb)}
                onPointerDown={e => handlePointerDown(e, { from: 'stockpile', orbUid: orb.uid }, orb)}
              />
            );
          })}
        </div>
      </div>

      {/* Stats bar */}
      <StatsBar plan={plan} registry={registry} />

      {/* Drag ghost */}
      {isDragging && dragOrb && (
        <DragGhost orb={dragOrb} affixMap={affixMap} position={dragPos} />
      )}

      {/* Confirmation modal */}
      <Modal
        open={confirmModalOpen}
        onClose={closeConfirmModal}
        title="Commit your forge?"
      >
        <p className="mb-4 text-sm text-surface-300">
          Your forged loadout will be locked in for the upcoming duel.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={closeConfirmModal}
            className="rounded-lg bg-surface-600 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-500"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            CANCEL
          </button>
          <button
            onClick={handleCommit}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-bold text-surface-900 hover:bg-accent-400"
            style={{ boxShadow: 'var(--shadow-button)', fontFamily: 'var(--font-family-display)' }}
          >
            CONFIRM
          </button>
        </div>
      </Modal>
    </div>
  );
}
