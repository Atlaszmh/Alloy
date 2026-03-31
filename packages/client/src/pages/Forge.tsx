import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useGateway } from '@/gateway';
import { useForgeStore } from '@/stores/forgeStore';
import { ForgeHeader } from '@/components/ForgeHeader';
import { ForgeGemTray } from '@/components/ForgeGemTray';
import { CombineWorkbench } from '@/components/CombineWorkbench';
import { ItemSocketView } from '@/components/ItemSocketView';
import { ItemMiniPreview } from '@/components/ItemMiniPreview';
import { HapticButton } from '@/components/HapticButton';
import { Modal } from '@/components/Modal';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { playSound } from '@/shared/utils/sound-manager';
import { DRAG_THRESHOLD } from '@/pages/draft-gestures';
import type { BaseStat, OrbInstance } from '@alloy/engine';
import { createForgeState } from '@alloy/engine';

const FORGE_TIMER_MS = 90_000;
const BASE_STATS: BaseStat[] = ['STR', 'INT', 'DEX', 'VIT'];

// ══════════════════════════════════════════════════
// ── Forge orchestrator ──
// ══════════════════════════════════════════════════

export function Forge() {
  const { code } = useParams();
  const isAiMatch = code?.startsWith('ai-') ?? false;

  // ── Gateway subscription ──
  const gateway = useGateway();
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate(n => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const player = matchState?.players[0] ?? null;
  const aiController = useMatchStore(s => s.aiController);
  const getRegistry = useMatchStore(s => s.getRegistry);
  const registry = getRegistry();

  // ── Store selectors ──
  const plan = useForgeStore(s => s.plan);
  const selectedOrbUid = useForgeStore(s => s.selectedOrbUid);
  const confirmModalOpen = useForgeStore(s => s.confirmModalOpen);
  const activeTab = useForgeStore(s => s.activeTab);
  const activeItemTab = useForgeStore(s => s.activeItemTab);
  const comboSlots = useForgeStore(s => s.comboSlots);
  const {
    initPlan,
    applyAction,
    getCommitActions,
    selectOrb,
    setActiveTab,
    setActiveItemTab,
    setComboSlotByIndex,
    clearComboSlots,
    openConfirmModal,
    closeConfirmModal,
    reset: resetForgeStore,
  } = useForgeStore();

  const { isDisconnected, secondsLeft } = useDisconnectTimer(gateway);

  const round = phase?.kind === 'forge' ? phase.round : (1 as 1 | 2 | 3);

  // ── Local state ──
  const committedRef = useRef(false);
  const prevFluxRef = useRef<number | null>(null);
  const initialPoolCountRef = useRef(0);
  const [baseStatWeapon, setBaseStatWeapon] = useState<[BaseStat, BaseStat]>(['STR', 'VIT']);
  const [baseStatArmor, setBaseStatArmor] = useState<[BaseStat, BaseStat]>(['VIT', 'STR']);
  const [fluxToast, setFluxToast] = useState<string | null>(null);

  // ── Drag state (matches Draft screen pattern) ──
  const pointerStartRef = useRef<{ x: number; y: number; uid: string; time: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const draggedElRef = useRef<HTMLElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragUidRef = useRef<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // ── Initialize plan on mount / round change ──
  useEffect(() => {
    if (!matchState || phase?.kind !== 'forge' || !player) return;
    committedRef.current = false;
    initialPoolCountRef.current = 0;

    const forgeState = createForgeState(
      player.stockpile,
      matchState.baseWeaponId,
      matchState.baseArmorId,
      round,
      registry.getBalance(),
      matchState.mode === 'quick',
    );
    forgeState.loadout = {
      weapon: { ...player.loadout.weapon, slots: [...player.loadout.weapon.slots] },
      armor: { ...player.loadout.armor, slots: [...player.loadout.armor.slots] },
    };
    forgeState.fluxRemaining = matchState.forgeFlux?.[0] ?? forgeState.fluxRemaining;

    initPlan(forgeState, registry);

    if (round === 1) {
      applyAction({ kind: 'set_base_stats', target: 'weapon', stat1: baseStatWeapon[0], stat2: baseStatWeapon[1] }, registry);
      applyAction({ kind: 'set_base_stats', target: 'armor', stat1: baseStatArmor[0], stat2: baseStatArmor[1] }, registry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.kind === 'forge' ? `${round}` : 'none']);

  // ── Lock initial pool count for gem sizing ──
  useEffect(() => {
    if (plan && initialPoolCountRef.current === 0) {
      initialPoolCountRef.current = plan.stockpile.length;
    }
  }, [plan]);

  // ── Flux change tracking ──
  useEffect(() => {
    if (!plan) return;
    if (prevFluxRef.current !== null && prevFluxRef.current !== plan.tentativeFlux) {
      const diff = plan.tentativeFlux - prevFluxRef.current;
      if (diff < 0) playSound('fluxSpend');
    }
    prevFluxRef.current = plan.tentativeFlux;
  }, [plan?.tentativeFlux]);

  // ── Derived stats ──
  const derivedStats = useForgeStore(s => s.getStats)(registry);

  // ── Commit flow ──
  const handleCommit = useCallback(async () => {
    if (committedRef.current || !matchState) return;
    committedRef.current = true;
    playSound('forgeSubmit');

    const actions = getCommitActions();
    for (const action of actions) {
      await gateway.dispatch({ kind: 'forge_action', player: 0, action });
    }
    await gateway.dispatch({ kind: 'forge_complete', player: 0 });

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
  }, [matchState, aiController, gateway, phase, round, isAiMatch, getCommitActions, closeConfirmModal, resetForgeStore]);

  // ── Timer auto-commit ──
  const handleTimerExpire = useCallback(() => {
    playSound('timerUrgent');
    handleCommit();
  }, [handleCommit]);

  // ── Gem selection ──
  const handleSelectOrb = useCallback((uid: string) => {
    selectOrb(uid === selectedOrbUid ? null : uid);
    playSound('orbSelect');
  }, [selectedOrbUid, selectOrb]);

  // ── Drag helpers ──
  function resetDraggedEl() {
    const el = draggedElRef.current;
    if (el) {
      el.style.position = '';
      el.style.left = '';
      el.style.top = '';
      el.style.width = '';
      el.style.zIndex = '';
      el.style.transform = '';
      el.style.filter = '';
      el.style.pointerEvents = '';
      delete el.dataset.origLeft;
      delete el.dataset.origTop;
      draggedElRef.current = null;
    }
  }

  function findDropTarget(x: number, y: number):
    | { type: 'combo'; slotIndex: number }
    | { type: 'socket'; slotIndex: number }
    | null {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;

    const comboEl = (el as HTMLElement).closest('[data-combo-slot]');
    if (comboEl) {
      const index = parseInt(comboEl.getAttribute('data-combo-slot')!, 10);
      return { type: 'combo', slotIndex: index };
    }

    const socketEl = (el as HTMLElement).closest('[data-forge-socket]');
    if (socketEl) {
      const index = parseInt(socketEl.getAttribute('data-forge-socket')!, 10);
      return { type: 'socket', slotIndex: index };
    }

    return null;
  }

  // ── Drag: pointerdown handler (passed to ForgeGemTray) ──
  const handlePointerDown = useCallback((uid: string, e: React.PointerEvent) => {
    if (isDraggingRef.current) return;
    e.preventDefault();
    pointerStartRef.current = { x: e.clientX, y: e.clientY, uid, time: Date.now() };
    hasDraggedRef.current = false;
  }, []);

  // ── Drag: global pointermove + pointerup ──
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const start = pointerStartRef.current;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!hasDraggedRef.current && dist >= DRAG_THRESHOLD) {
        hasDraggedRef.current = true;
        isDraggingRef.current = true;
        dragUidRef.current = start.uid;
        setIsDragging(true);
        // Lock pointer events on non-dragged gems via DOM (avoids per-move re-render)
        document.querySelectorAll('[data-gem-uid]').forEach(el => {
          if ((el as HTMLElement).dataset.gemUid !== start.uid) {
            (el as HTMLElement).style.pointerEvents = 'none';
          }
        });

        const el = document.querySelector(`[data-gem-uid="${start.uid}"]`) as HTMLElement | null;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        el.dataset.origLeft = String(rect.left);
        el.dataset.origTop = String(rect.top);
        el.style.position = 'fixed';
        el.style.left = `${rect.left}px`;
        el.style.top = `${rect.top}px`;
        el.style.width = `${rect.width}px`;
        el.style.zIndex = '999';
        el.style.filter = 'drop-shadow(0 0 8px rgba(212,168,52,0.6))';
        el.style.pointerEvents = 'none';

        draggedElRef.current = el;
        playSound('dragStart');
      }

      if (hasDraggedRef.current && draggedElRef.current) {
        const origLeft = parseFloat(draggedElRef.current.dataset.origLeft!);
        const origTop = parseFloat(draggedElRef.current.dataset.origTop!);
        draggedElRef.current.style.left = `${origLeft + dx}px`;
        draggedElRef.current.style.top = `${origTop + dy}px`;
        draggedElRef.current.style.transform = 'scale(1.08)';
      }
    }

    function onPointerUp(e: PointerEvent) {
      const start = pointerStartRef.current;
      if (!start) return;

      if (hasDraggedRef.current) {
        // Was a drag — check drop target
        const target = findDropTarget(e.clientX, e.clientY);
        const draggedUid = start.uid;

        if (target && target.type === 'combo') {
          const orb = useForgeStore.getState().plan?.stockpile.find(o => o.uid === draggedUid);
          const slots = useForgeStore.getState().comboSlots;
          if (orb && !slots[target.slotIndex]) {
            setComboSlotByIndex(target.slotIndex, orb);
            playSound('orbSelect');
            if (draggedElRef.current) draggedElRef.current.style.opacity = '0';
          } else {
            resetDraggedEl();
          }
        } else if (target && target.type === 'socket') {
          const result = applyAction(
            { kind: 'assign_orb', orbUid: draggedUid, target: activeItemTab, slotIndex: target.slotIndex },
            registry,
          );
          if (result.ok) {
            playSound('orbPlace');
            if (draggedElRef.current) draggedElRef.current.style.opacity = '0';
          } else {
            playSound('combineFail');
            resetDraggedEl();
          }
        } else {
          // No valid target — snap back
          resetDraggedEl();
        }

        // Clean up after a short delay to let opacity transition
        setTimeout(() => {
          resetDraggedEl();
          dragUidRef.current = null;
          isDraggingRef.current = false;
          setIsDragging(false);
          // Unlock pointer events on all gems
          document.querySelectorAll('[data-gem-uid]').forEach(el => {
            (el as HTMLElement).style.pointerEvents = '';
          });
        }, 50);
      } else {
        // Was a tap — toggle selection
        handleSelectOrb(start.uid);
      }

      pointerStartRef.current = null;
      hasDraggedRef.current = false;
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [activeItemTab, registry, applyAction, setComboSlotByIndex, handleSelectOrb]);

  // ── Combine slot click ──
  const handleComboSlotClick = useCallback((index: number) => {
    const slot = comboSlots[index];
    if (slot) {
      setComboSlotByIndex(index, null);
      playSound('orbRemove');
    } else if (selectedOrbUid) {
      const orb = plan?.stockpile.find(o => o.uid === selectedOrbUid);
      if (orb) {
        setComboSlotByIndex(index, orb);
        selectOrb(null);
        playSound('orbSelect');
      }
    }
  }, [comboSlots, selectedOrbUid, plan, setComboSlotByIndex, selectOrb]);

  // ── Combine handler ──
  const handleCombine = useCallback(() => {
    if (!plan) return;
    const filled = comboSlots.filter((s): s is OrbInstance => s !== null);
    if (filled.length < 2) return;
    const result = applyAction({ kind: 'combine', orbUid1: filled[0].uid, orbUid2: filled[1].uid }, registry);
    if (result.ok) {
      playSound('combineMerge');
      clearComboSlots();
    } else {
      playSound('combineFail');
    }
  }, [plan, comboSlots, applyAction, registry, clearComboSlots]);

  // ── Socket click (equip tab) ──
  const handleSocketClick = useCallback((slotIndex: number) => {
    if (!selectedOrbUid || !plan) return;
    const cardId = activeItemTab;
    const result = applyAction(
      { kind: 'assign_orb', orbUid: selectedOrbUid, target: cardId, slotIndex },
      registry,
    );
    if (result.ok) {
      playSound('orbPlace');
      selectOrb(null);
    } else {
      setFluxToast('Not enough flux!');
      setTimeout(() => setFluxToast(null), 800);
    }
  }, [selectedOrbUid, plan, activeItemTab, applyAction, registry, selectOrb]);

  // ── Socket remove (equip tab) ──
  const handleSocketRemove = useCallback((slotIndex: number) => {
    if (!plan || plan.round === 1) return;
    const cardId = activeItemTab;
    applyAction({ kind: 'remove_orb', target: cardId, slotIndex }, registry);
    playSound('orbRemove');
  }, [plan, activeItemTab, applyAction, registry]);

  // ── Base stat change ──
  const handleBaseStatChange = useCallback((target: 'weapon' | 'armor', index: 0 | 1, value: BaseStat) => {
    const setter = target === 'weapon' ? setBaseStatWeapon : setBaseStatArmor;
    setter(prev => {
      const next = [...prev] as [BaseStat, BaseStat];
      next[index] = value;
      applyAction({ kind: 'set_base_stats', target, stat1: next[0], stat2: next[1] }, registry);
      return next;
    });
  }, [applyAction, registry]);

  // ── Computed UID sets for gem tray ──
  const equippedUids = useMemo(() => {
    const uids = new Set<string>();
    if (!plan) return uids;
    for (const item of [plan.loadout.weapon, plan.loadout.armor]) {
      for (const slot of item.slots) {
        if (!slot) continue;
        if (slot.kind === 'compound') slot.orbs.forEach(o => uids.add(o.uid));
        else uids.add(slot.orb.uid);
      }
    }
    return uids;
  }, [plan]);

  const stagedUids = useMemo(() => {
    const uids = new Set<string>();
    for (const slot of comboSlots) {
      if (slot) uids.add(slot.uid);
    }
    return uids;
  }, [comboSlots]);

  // ── Wait for plan ──
  if (!plan) return null;

  const balance = registry.getBalance();

  // ── Base stat selectors JSX (R1 only) ──
  const baseStatSelectorJSX = round === 1 ? (
    <div className="flex flex-wrap gap-2 px-3 py-1" style={{ background: 'var(--color-surface-900)' }}>
      {(['weapon', 'armor'] as const).map(target => {
        const statPair = target === 'weapon' ? baseStatWeapon : baseStatArmor;
        return (
          <div
            key={target}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs"
            style={{ background: 'var(--color-surface-700)', fontFamily: 'var(--font-family-display)' }}
          >
            <span className="capitalize" style={{ color: 'var(--color-surface-400)' }}>{target}:</span>
            {([0, 1] as const).map(i => (
              <select
                key={i}
                value={statPair[i]}
                onChange={e => handleBaseStatChange(target, i, e.target.value as BaseStat)}
                className="rounded px-1.5 py-0.5 text-xs text-white"
                style={{ background: 'var(--color-surface-600)' }}
              >
                {BASE_STATS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ))}
          </div>
        );
      })}
    </div>
  ) : undefined;

  // ── Tab bar JSX ──
  const tabBarJSX = (
    <div className="flex" style={{ background: 'var(--color-surface-900)' }}>
      <button
        className={`flex-1 py-2 text-center text-sm font-semibold ${activeTab === 'combine' ? 'text-accent-400' : 'text-surface-300'}`}
        style={{
          fontFamily: 'var(--font-family-display)',
          borderBottom: activeTab === 'combine' ? '2px solid var(--color-accent-500)' : '2px solid transparent',
        }}
        aria-selected={activeTab === 'combine'}
        onClick={() => { setActiveTab('combine'); playSound('buttonClick'); }}
      >
        {'\u2692'} Plan & Combine
      </button>
      <button
        className={`flex-1 py-2 text-center text-sm font-semibold ${activeTab === 'equip' ? 'text-accent-400' : 'text-surface-300'}`}
        style={{
          fontFamily: 'var(--font-family-display)',
          borderBottom: activeTab === 'equip' ? '2px solid var(--color-accent-500)' : '2px solid transparent',
        }}
        aria-selected={activeTab === 'equip'}
        onClick={() => { setActiveTab('equip'); playSound('buttonClick'); }}
      >
        {'\u2694'} Equip
      </button>
    </div>
  );

  return (
    <div className="page-enter flex h-full flex-col" style={{ background: 'var(--color-surface-950)' }}>
      {/* PvP disconnect overlay */}
      {!isAiMatch && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}

      {/* 1. Header with flux bar and stats */}
      <ForgeHeader
        round={round}
        flux={plan.tentativeFlux}
        maxFlux={plan.maxFlux}
        stats={derivedStats}
        timerDurationMs={FORGE_TIMER_MS}
        onTimerExpire={handleTimerExpire}
        onDone={openConfirmModal}
        baseStatSelectors={baseStatSelectorJSX}
      />

      {/* 2. Tab bar */}
      {tabBarJSX}

      {/* 3. Action area (flex-1 to fill middle) */}
      <div className="flex-1 overflow-y-auto px-3 py-2" key={activeTab} style={{ animation: 'fade-in 0.2s ease-out' }}>
        {activeTab === 'combine' ? (
          <CombineWorkbench
            comboSlots={comboSlots}
            registry={registry}
            canAfford={plan.tentativeFlux >= balance.fluxCosts.combineOrbs}
            isDragging={isDragging}
            onSlotClick={handleComboSlotClick}
            onCombine={handleCombine}
            onClearAll={() => { clearComboSlots(); playSound('buttonClick'); }}
          />
        ) : (
          <>
            {/* Item tab switcher */}
            <div className="flex gap-2 mb-2">
              <HapticButton
                variant={activeItemTab === 'weapon' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveItemTab('weapon')}
              >
                {'\u2694'} Sword
              </HapticButton>
              <HapticButton
                variant={activeItemTab === 'armor' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveItemTab('armor')}
              >
                {'\uD83D\uDEE1'} Chainmail
              </HapticButton>
            </div>
            <ItemSocketView
              item={plan.loadout[activeItemTab]}
              cardId={activeItemTab}
              registry={registry}
              plan={plan}
              selectedOrbUid={selectedOrbUid}
              isDragging={isDragging}
              onSocketClick={handleSocketClick}
              onSocketRemove={handleSocketRemove}
            />
            <ItemMiniPreview
              item={plan.loadout[activeItemTab === 'weapon' ? 'armor' : 'weapon']}
              itemType={activeItemTab === 'weapon' ? 'armor' : 'weapon'}
              registry={registry}
              onClick={() => setActiveItemTab(activeItemTab === 'weapon' ? 'armor' : 'weapon')}
            />
          </>
        )}
      </div>

      {/* 4. Gem tray at bottom */}
      <ForgeGemTray
        stockpile={plan.stockpile}
        registry={registry}
        selectedOrbUid={selectedOrbUid}
        equippedUids={equippedUids}
        stagedUids={stagedUids}
        onSelectOrb={handleSelectOrb}
        onPointerDown={handlePointerDown}
        dragUid={null}
        initialPoolCount={initialPoolCountRef.current || plan.stockpile.length}
      />

      {/* Confirmation modal */}
      <Modal open={confirmModalOpen} onClose={closeConfirmModal} title="Commit your forge?">
        <p className="mb-4 text-sm" style={{ color: 'var(--color-surface-300)' }}>
          Your forged loadout will be locked in for the upcoming duel.
        </p>
        <div className="flex justify-end gap-2">
          <HapticButton variant="secondary" size="sm" onClick={closeConfirmModal}>CANCEL</HapticButton>
          <HapticButton variant="primary" size="sm" onClick={handleCommit}>CONFIRM</HapticButton>
        </div>
      </Modal>

      {/* Flux toast */}
      {fluxToast && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2"
          style={{
            top: 100,
            color: 'var(--color-danger)',
            animation: 'fadeInOut 0.8s ease-out forwards',
            fontFamily: 'var(--font-family-display)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          {fluxToast}
        </div>
      )}
    </div>
  );
}
