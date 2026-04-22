import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMatchStore, selectIsRunMode } from '@/stores/matchStore';
import { useGateway } from '@/gateway';
import { useForgeStore } from '@/stores/forgeStore';
import { ForgeHeader } from '@/components/ForgeHeader';
import { ForgeGemTray } from '@/components/ForgeGemTray';
import { Workbench } from '@/components/Workbench';
import { ItemSocketView } from '@/components/ItemSocketView';
import { HapticButton } from '@/components/HapticButton';
import { Modal } from '@/components/Modal';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { useFrameMode } from '@/hooks/useFrameMode';
import { BaseItemSelector } from '@/features/forge/BaseItemSelector';
import { playSound } from '@/shared/utils/sound-manager';
import { showToast } from '@/components/Toast';
import { DRAG_THRESHOLD, INSPECT_THRESHOLD } from '@/pages/draft-gestures';
import { GemInspectPanel } from '@/components/GemInspectPanel';
import { ForgeDesktop } from '@/components/forge-desktop/ForgeDesktop';
import { buildGemDamageBreakdown } from '@/shared/utils/gem-damage-breakdown';
import type { AffixDef, BaseStat, BaseItemDef, CompoundAffixDef, GemInstance, CombinePreview, RunState, DataRegistry } from '@alloy/engine';
import { createForgeState, CombinationEngine, DiscoveryState, getPoolConfigForRound, SeededRNG } from '@alloy/engine';

const FORGE_TIMER_MS = 90_000;

// Fixed default base-stat pairs. Player-facing stat selection was removed —
// the engine's baseStatScaling pipeline still requires values, so we seed
// sensible defaults (STR/VIT weapon, VIT/STR armor) on R1 init.
const DEFAULT_WEAPON_STATS: [BaseStat, BaseStat] = ['STR', 'VIT'];
const DEFAULT_ARMOR_STATS: [BaseStat, BaseStat] = ['VIT', 'STR'];

// ══════════════════════════════════════════════════
// ── Forge orchestrator ──
// ══════════════════════════════════════════════════

export function Forge() {
  const { code } = useParams();
  const isAiMatch = code?.startsWith('ai-') ?? false;
  const isRunMode = useMatchStore(selectIsRunMode);

  // ── Gateway subscription ──
  const gateway = useGateway();
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate(n => n + 1));
  }, [gateway]);

  // ── Frame mode (drives portrait vs desktop HUD tree) ──
  const frameMode = useFrameMode();
  const navigate = useNavigate();

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const player = matchState?.players[0] ?? null;
  const aiController = useMatchStore(s => s.aiController);
  const aiOpponentTier = useMatchStore(s => s.aiOpponentTier);
  const getRegistry = useMatchStore(s => s.getRegistry);
  const registry = getRegistry();

  // ── Store selectors ──
  const plan = useForgeStore(s => s.plan);
  const selectedOrbUid = useForgeStore(s => s.selectedOrbUid);
  const confirmModalOpen = useForgeStore(s => s.confirmModalOpen);
  const comboSlots = useForgeStore(s => s.comboSlots);
  const selectedWeaponId = useForgeStore(s => s.selectedWeaponId);
  const selectedArmorId = useForgeStore(s => s.selectedArmorId);
  const {
    initPlan,
    applyAction,
    getCommitActions,
    selectOrb,
    selectBaseItem,
    setComboSlotByIndex,
    clearComboSlots,
    openConfirmModal,
    closeConfirmModal,
    setHasSelectedBaseItems,
  } = useForgeStore();

  const { isDisconnected, secondsLeft } = useDisconnectTimer(gateway);

  const round = phase?.kind === 'forge' ? phase.round : (1 as 1 | 2 | 3);

  // ── Per-match base item selection flag (run mode only) ──
  const matchId = matchState?.matchId ?? '';
  const hasSelectedBaseItems = useForgeStore(s => s.hasSelectedBaseItems(matchId));

  // Show selector only in run mode, round 1, and not yet completed
  const showBaseItemSelector = isRunMode && round === 1 && !hasSelectedBaseItems;

  const weaponRoster = useMemo(() => registry.getBaseItemsByType('weapon'), [registry]);
  const armorRoster = useMemo(() => registry.getBaseItemsByType('armor'), [registry]);

  const handleLoadoutSelect = useCallback((weapon: BaseItemDef, armor: BaseItemDef) => {
    const weaponResult = applyAction(
      { kind: 'select_base_item', target: 'weapon', baseItemId: weapon.id },
      registry,
    );
    if (!weaponResult.ok) {
      showToast(weaponResult.error ?? 'Could not select weapon');
      return;
    }
    const armorResult = applyAction(
      { kind: 'select_base_item', target: 'armor', baseItemId: armor.id },
      registry,
    );
    if (!armorResult.ok) {
      showToast(armorResult.error ?? 'Could not select armor');
      return;
    }
    selectBaseItem('weapon', weapon.id);
    selectBaseItem('armor', armor.id);
    setHasSelectedBaseItems(matchId, true);
  }, [applyAction, registry, selectBaseItem, setHasSelectedBaseItems, matchId]);

  // ── Extract flux from RunState ──
  const runState = matchState?.runState;
  const currentFlux = runState?.flux ?? 0;
  const maxFlux = 20; // Max flux per round (can be configured via balance config)

  // ── Local state ──
  const committedRef = useRef(false);

  const [fluxToast, setFluxToast] = useState<string | null>(null);
  const [inspectGem, setInspectGem] = useState<{
    gem: GemInstance;
    affixDef: AffixDef | CompoundAffixDef;
  } | null>(null);

  // ── Shared gem size — measure the Forge page and set --gem-size so that
  // combine workbench slots, equip sockets, and stockpile gems all render at
  // the same size. Target: 5 gems per row in the stockpile.
  // Uses a state-based callback ref because the main UI is conditionally
  // rendered after item selection — a plain useRef + useEffect([]) wouldn't
  // see the element on first mount. ──
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null);
  const [sharedGemSize, setSharedGemSize] = useState<number | null>(null);
  useEffect(() => {
    if (!pageEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      // The tray/workbench have var(--gap-md) padding on each side (~10-15px).
      const effectiveWidth = Math.max(0, width - 32);
      const gap = 10;
      const maxForFive = Math.floor((effectiveWidth - 4 * gap) / 5);
      const size = Math.max(80, Math.min(maxForFive, 140));
      setSharedGemSize(size);
    });
    ro.observe(pageEl);
    return () => ro.disconnect();
  }, [pageEl]);

  // ── Drag state — ALL refs, ZERO React state during drag to avoid re-render fighting ──
  const pointerStartRef = useRef<{ x: number; y: number; uid: string; time: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const draggedElRef = useRef<HTMLElement | null>(null);
  const dragOriginalElRef = useRef<HTMLElement | null>(null);
  const dragUidRef = useRef<string | null>(null);
  const dragSourceRef = useRef<
    | { type: 'stockpile' }
    | { type: 'combo'; slotIndex: number }
    | { type: 'socket'; target: 'weapon' | 'armor'; slotIndex: number }
    | null
  >(null);
  const selectedOrbUidRef = useRef(selectedOrbUid);
  useEffect(() => { selectedOrbUidRef.current = selectedOrbUid; }, [selectedOrbUid]);

  // ── Initialize plan on mount / round change ──
  useEffect(() => {
    if (!matchState || phase?.kind !== 'forge' || !player) return;
    committedRef.current = false;


    const forgeState = createForgeState(
      player.stockpile,
      selectedWeaponId ?? matchState.baseWeaponId,
      selectedArmorId ?? matchState.baseArmorId,
      round,
      registry.getBalance(),
      matchState.mode === 'quick',
    );
    forgeState.loadout = {
      weapon: { ...player.loadout.weapon, slots: [...player.loadout.weapon.slots] },
      armor: { ...player.loadout.armor, slots: [...player.loadout.armor.slots] },
    };

    initPlan(forgeState, registry, new SeededRNG(matchState.seed).fork(`forge_${round}`));

    if (round === 1) {
      applyAction({ kind: 'set_base_stats', target: 'weapon', stat1: DEFAULT_WEAPON_STATS[0], stat2: DEFAULT_WEAPON_STATS[1] }, registry);
      applyAction({ kind: 'set_base_stats', target: 'armor', stat1: DEFAULT_ARMOR_STATS[0], stat2: DEFAULT_ARMOR_STATS[1] }, registry);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.kind === 'forge' ? `${round}` : 'none']);

  // ── Derived stats ──
  const statsResult = useForgeStore(s => s.getStats)(registry);
  const derivedStats = statsResult?.stats ?? null;

  // ── Gem-damage breakdown (drives the DMG tooltip + poison/shadow top-up) ──
  const gemDamage = useMemo(
    () => (plan ? buildGemDamageBreakdown(plan, registry) : []),
    [plan, registry],
  );

  // Memoize categoryMap — only changes if registry changes (never during a match)
  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const affix of registry.getAllAffixes()) {
      map[affix.id] = affix.category;
    }
    return map;
  }, [registry]);

  const combinePreview: CombinePreview | null = useMemo(() => {
    const filled = comboSlots.filter((s): s is GemInstance => s !== null);
    if (filled.length < 2) return null;

    try {
      const recipeRegistry = registry.getRecipeRegistry();
      const discovery = matchState?.discoveryState ?? new DiscoveryState();
      const engine = new CombinationEngine(recipeRegistry, discovery, categoryMap, {
        matchingRarityBonus: registry.getBalance().gem.matchingRarityBonus,
      });
      if (filled.length === 3) {
        return engine.previewCombineTriple(filled[0], filled[1], filled[2]);
      }
      return engine.previewCombine(filled[0], filled[1]);
    } catch {
      return null;
    }
  }, [comboSlots, registry, categoryMap, matchState?.discoveryState]);

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
        0,
        round,
        matchState.players[0].stockpile,
      );
      for (const action of aiActions) {
        await gateway.dispatch({ kind: 'forge_action', player: 1, action });
      }
      await gateway.dispatch({ kind: 'forge_complete', player: 1 });
    }

    closeConfirmModal();
  }, [matchState, aiController, gateway, phase, round, isAiMatch, getCommitActions, closeConfirmModal]);

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
    // Remove the drag ghost clone
    const ghost = draggedElRef.current;
    if (ghost && ghost.parentNode) {
      ghost.remove();
    }
    draggedElRef.current = null;

    // Restore original element opacity
    const orig = dragOriginalElRef.current;
    if (orig) {
      orig.style.opacity = '';
    }
    dragOriginalElRef.current = null;
  }

  function findDropTarget(x: number, y: number):
    | { type: 'combo'; slotIndex: number }
    | { type: 'socket'; slotIndex: number; cardId: 'weapon' | 'armor' }
    | { type: 'tray' }
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
      const cardEl = (socketEl as HTMLElement).closest('[data-item-card]');
      const cardId = (cardEl?.getAttribute('data-item-card') ?? 'weapon') as 'weapon' | 'armor';
      return { type: 'socket', slotIndex: index, cardId };
    }

    const trayEl = (el as HTMLElement).closest('[data-gem-tray]');
    if (trayEl) {
      return { type: 'tray' };
    }

    return null;
  }

  // ── Drag: pointerdown handler (passed to ForgeGemTray) — matches Draft exactly ──
  const handlePointerDown = useCallback((uid: string, e: React.PointerEvent) => {
    if (pointerStartRef.current && hasDraggedRef.current) return;
    e.preventDefault();
    pointerStartRef.current = { x: e.clientX, y: e.clientY, uid, time: Date.now() };
    hasDraggedRef.current = false;
  }, []);

  // ── Drag: global pointermove + pointerup (matches Draft pattern exactly) ──
  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      const start = pointerStartRef.current;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (!hasDraggedRef.current && Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        hasDraggedRef.current = true;
        dragUidRef.current = start.uid;
        playSound('dragStart');

        // Detect drag source
        const comboSlotsCurrent = useForgeStore.getState().comboSlots;
        const comboIdx = comboSlotsCurrent.findIndex(s => s?.uid === start.uid);
        if (comboIdx !== -1) {
          dragSourceRef.current = { type: 'combo', slotIndex: comboIdx };
        } else {
          const planCurrent = useForgeStore.getState().plan;
          let foundSocket = false;
          if (planCurrent) {
            for (const target of ['weapon', 'armor'] as const) {
              const item = planCurrent.loadout[target];
              for (let si = 0; si < item.slots.length; si++) {
                const slot = item.slots[si];
                if (slot && slot.gem.uid === start.uid) {
                  dragSourceRef.current = { type: 'socket', target, slotIndex: si };
                  foundSocket = true;
                  break;
                }
              }
              if (foundSocket) break;
            }
          }
          if (!foundSocket) {
            dragSourceRef.current = { type: 'stockpile' };
          }
        }

        // Find the original element and create a drag ghost clone
        const origEl = document.querySelector(`[data-gem-uid="${start.uid}"]`) as HTMLElement | null;
        if (origEl) {
          const rect = origEl.getBoundingClientRect();

          // Create a clone for the drag ghost
          const ghost = origEl.cloneNode(true) as HTMLElement;
          ghost.removeAttribute('data-gem-uid'); // prevent querySelector from finding the ghost
          ghost.style.position = 'fixed';
          ghost.style.left = `${rect.left}px`;
          ghost.style.top = `${rect.top}px`;
          ghost.style.width = `${rect.width}px`;
          ghost.style.height = `${rect.height}px`;
          ghost.style.zIndex = '999';
          ghost.style.filter = 'drop-shadow(0 0 16px rgba(212, 168, 52, 0.5))';
          ghost.style.pointerEvents = 'none';
          ghost.style.margin = '0';
          // Disable transitions on the ghost AND all descendants so position
          // updates snap instantly to the pointer (GemCard has transition-all).
          ghost.style.transition = 'none';
          ghost.querySelectorAll<HTMLElement>('*').forEach((child) => {
            child.style.transition = 'none';
          });
          ghost.dataset.origLeft = String(rect.left);
          ghost.dataset.origTop = String(rect.top);
          document.body.appendChild(ghost);

          draggedElRef.current = ghost;
          dragOriginalElRef.current = origEl;

          // Dim the original
          origEl.style.opacity = '0.3';
        }

        // Lock pointer events on non-dragged gems via DOM (no React re-render)
        document.querySelectorAll('[data-gem-uid]').forEach(gem => {
          if ((gem as HTMLElement).dataset.gemUid !== start.uid) {
            (gem as HTMLElement).style.pointerEvents = 'none';
          }
        });

        // Add isDragging class to drop target containers for glow feedback
        document.querySelectorAll('[data-combo-slot], [data-forge-socket]').forEach(el => {
          (el as HTMLElement).classList.add('forge-drop-active');
        });
      }

      const draggedEl = draggedElRef.current;
      if (hasDraggedRef.current && draggedEl) {
        // Move relative to start — matches Draft exactly
        const origLeft = parseFloat(draggedEl.dataset.origLeft ?? '0');
        const origTop = parseFloat(draggedEl.dataset.origTop ?? '0');
        draggedEl.style.left = `${origLeft + dx}px`;
        draggedEl.style.top = `${origTop + dy}px`;
        draggedEl.style.transform = 'scale(1.08)';
      }
    }

    function onPointerUp(e: PointerEvent) {
      const start = pointerStartRef.current;
      if (!start) return;

      if (hasDraggedRef.current) {
        // Was a drag — check drop target
        const target = findDropTarget(e.clientX, e.clientY);
        const draggedUid = start.uid;
        const source = dragSourceRef.current;

        let handled = false;

        // Helper: remove gem from its drag source
        function removeFromSource() {
          if (source?.type === 'combo') {
            setComboSlotByIndex(source.slotIndex, null);
          } else if (source?.type === 'socket') {
            applyAction({ kind: 'unsocket_gem', target: source.target, slotIndex: source.slotIndex }, registry);
          }
        }

        if (target && target.type === 'combo') {
          const isSameSlot = source?.type === 'combo' && source.slotIndex === target.slotIndex;
          if (isSameSlot) {
            resetDraggedEl();
            handled = true;
          } else {
            const slots = useForgeStore.getState().comboSlots;
            if (!slots[target.slotIndex]) {
              removeFromSource();
              const orb = useForgeStore.getState().plan?.stockpile.find(o => o !== null && o.uid === draggedUid);
              if (orb) {
                setComboSlotByIndex(target.slotIndex, orb);
                playSound('orbSelect');
                resetDraggedEl();
                handled = true;
              }
            }
            if (!handled) {
              resetDraggedEl();
              handled = true;
            }
          }
        } else if (target && target.type === 'socket') {
          const isSameSlot = source?.type === 'socket'
            && source.target === target.cardId
            && source.slotIndex === target.slotIndex;
          if (isSameSlot) {
            resetDraggedEl();
            handled = true;
          } else {
            removeFromSource();
            const result = applyAction(
              { kind: 'socket_gem', gemUid: draggedUid, target: target.cardId, slotIndex: target.slotIndex },
              registry,
            );
            if (result.ok) {
              playSound('orbPlace');
              resetDraggedEl();
            } else {
              playSound('combineFail');
              resetDraggedEl();
            }
            handled = true;
          }
        } else if (target && target.type === 'tray') {
          if (source?.type === 'combo' || source?.type === 'socket') {
            removeFromSource();
            playSound('orbRemove');
          }
          resetDraggedEl();
          handled = true;
        }

        if (!handled) {
          // No valid target — snap back
          resetDraggedEl();
        }

        // Clean up drag state
        dragUidRef.current = null;
        dragSourceRef.current = null;
        // Unlock pointer events + restore opacity on all gems
        document.querySelectorAll('[data-gem-uid]').forEach(gem => {
          (gem as HTMLElement).style.pointerEvents = '';
          (gem as HTMLElement).style.opacity = '';
        });
        // Remove drop target glow
        document.querySelectorAll('.forge-drop-active').forEach(el => {
          el.classList.remove('forge-drop-active');
        });
      } else {
        // Not a drag — classify as tap, hold, or inspect.
        //
        // Desktop: single click opens the inspect panel. Socketing on desktop
        // is drag-and-drop, so tap-to-select has no purpose and the inspect
        // panel is the expected single-click affordance.
        //
        // Portrait: single tap selects/deselects (for the tap-then-socket
        // flow). Long-press (>=500ms) opens inspect. 300-499ms is a dead zone
        // to avoid accidental triggers.
        const holdDuration = Date.now() - start.time;
        const planNow = useForgeStore.getState().plan;
        const gem = planNow?.stockpile.find(g => g !== null && g.uid === start.uid) ?? null;
        // Inspect is a stockpile-only affordance — gems already staged into a
        // combo slot or socketed onto weapon/armor should not surface the
        // tooltip on click. Drag/socket-management remains the intended
        // interaction in those zones.
        const isStaged = useForgeStore.getState().comboSlots.some(s => s?.uid === start.uid);
        const isSocketed = planNow
          ? (['weapon', 'armor'] as const).some(target =>
              planNow.loadout[target].slots.some(slot => slot?.gem.uid === start.uid),
            )
          : false;
        const inStockpileOnly = !isStaged && !isSocketed;
        const openInspect = () => {
          if (!gem || !inStockpileOnly) return;
          const affixDef = registry.findAffix(gem.affixId)
            ?? registry.getCombinationById(gem.affixId);
          if (affixDef) setInspectGem({ gem, affixDef });
        };
        if (frameMode === 'desktop' && holdDuration < INSPECT_THRESHOLD) {
          // Desktop tap: open inspect immediately for any quick click.
          openInspect();
        } else if (holdDuration >= INSPECT_THRESHOLD) {
          // Portrait long-press (or desktop held-click): open inspect.
          openInspect();
        } else if (holdDuration < 300) {
          // Portrait tap: select or deselect.
          if (selectedOrbUidRef.current === start.uid) {
            selectOrb(null);
          } else {
            selectOrb(start.uid);
            playSound('orbSelect');
          }
        }
        // Portrait 300-499ms: no-op (existing behavior).
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
  }, [applyAction, registry, setComboSlotByIndex, selectOrb, frameMode]);

  // ── Combine slot click ──
  const handleComboSlotClick = useCallback((index: number) => {
    const slot = comboSlots[index];
    if (slot) {
      setComboSlotByIndex(index, null);
      playSound('orbRemove');
    } else if (selectedOrbUid) {
      const orb = plan?.stockpile.find(o => o !== null && o.uid === selectedOrbUid) ?? null;
      if (orb) {
        setComboSlotByIndex(index, orb);
        selectOrb(null);
        playSound('orbSelect');
      }
    }
  }, [comboSlots, selectedOrbUid, plan, setComboSlotByIndex, selectOrb]);

  // ── Combine handler ──
  // Slot 0 is the KEEP slot: its gem is the one preserved/upgraded in mismatched combines.
  // Ingredients come from slots 1 or 2.
  const handleCombine = useCallback(() => {
    if (!plan) return;
    const keep = comboSlots[0];
    if (!keep) return;
    const filled = comboSlots.filter((s): s is GemInstance => s !== null);

    // Snapshot state for discovery-toast detection:
    //   • known recipes (from authoritative match-level DiscoveryState)
    //   • UIDs already in the stockpile (to diff the output gem after)
    const knownRecipes = new Set(
      matchState?.discoveryState?.serialize().discoveredRecipes ?? [],
    );
    const beforeUids = new Set<string>();
    for (const g of plan.stockpile) {
      if (g !== null) beforeUids.add(g.uid);
    }

    const fireDiscoveryToast = (nextPlan: typeof plan) => {
      const newGem = nextPlan.stockpile.find((g) => g !== null && !beforeUids.has(g.uid)) ?? null;
      const recipeId = newGem?.sourceRecipe;
      if (!recipeId || knownRecipes.has(recipeId)) return;
      const recipeDef = registry.getRecipeRegistry().get(recipeId);
      showToast(`New Recipe: ${recipeDef?.name ?? recipeId}`, {
        variant: 'discovery',
      });
    };

    if (filled.length === 3) {
      const b = comboSlots[1]!;
      const c = comboSlots[2]!;
      const result = applyAction(
        {
          kind: 'combine3',
          gemUid1: keep.uid, gemUid2: b.uid, gemUid3: c.uid,
          keepGemUid: keep.uid,
        },
        registry,
      );
      if (result.ok) {
        playSound('combineMerge');
        fireDiscoveryToast(result.plan);
        clearComboSlots();
      } else {
        playSound('combineFail');
      }
      return;
    }

    // Binary path
    const other = comboSlots[1] ?? comboSlots[2];
    if (!other) return;
    const result = applyAction(
      { kind: 'combine', gemUid1: keep.uid, gemUid2: other.uid, keepGemUid: keep.uid },
      registry,
    );
    if (result.ok) {
      playSound('combineMerge');
      fireDiscoveryToast(result.plan);
      clearComboSlots();
    } else {
      playSound('combineFail');
    }
  }, [plan, comboSlots, applyAction, registry, clearComboSlots, matchState?.discoveryState]);

  // ── Socket click (equip tab) ──
  const handleSocketClick = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
    if (!selectedOrbUid || !plan) return;
    const result = applyAction(
      { kind: 'socket_gem', gemUid: selectedOrbUid, target: cardId, slotIndex },
      registry,
    );
    if (result.ok) {
      playSound('orbPlace');
      selectOrb(null);
    } else {
      setFluxToast('Slot occupied or gem not found!');
      setTimeout(() => setFluxToast(null), 800);
    }
  }, [selectedOrbUid, plan, applyAction, registry, selectOrb]);

  // ── Socket remove (equip tab) ──
  const handleSocketRemove = useCallback((cardId: 'weapon' | 'armor', slotIndex: number) => {
    if (!plan) return;
    applyAction({ kind: 'unsocket_gem', target: cardId, slotIndex }, registry);
    playSound('orbRemove');
  }, [plan, applyAction, registry]);

  // ── Computed UID sets for gem tray ──
  const equippedUids = useMemo(() => {
    const uids = new Set<string>();
    if (!plan) return uids;
    for (const item of [plan.loadout.weapon, plan.loadout.armor]) {
      for (const slot of item.slots) {
        if (!slot) continue;
        uids.add(slot.gem.uid);
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

  // ── Base item selector (run mode, round 1, before main forge UI) ──
  if (showBaseItemSelector) {
    return (
      <div className="flex h-full w-full items-center justify-center overflow-auto">
        <BaseItemSelector
          weapons={weaponRoster}
          armors={armorRoster}
          onSelect={handleLoadoutSelect}
        />
      </div>
    );
  }

  // ── Wait for plan ──
  if (!plan) return null;

  const sharedGemStyle: React.CSSProperties = sharedGemSize
    ? ({
        '--gem-size': `${sharedGemSize}px`,
        '--gem-radius': `${sharedGemSize * 0.16}px`,
      } as React.CSSProperties)
    : {};

  // Desktop HUD prop assembly — see buildForgeDesktopProps at the bottom of this file.
  const forgeDesktopProps = plan
    ? buildForgeDesktopProps({
        plan, registry, runState, isRunMode, isAiMatch, aiOpponentTier,
        round, derivedStats, gemDamage, currentFlux, maxFlux, comboSlots, combinePreview,
        selectedOrbUid, equippedUids, stagedUids,
        gateway, navigate, setFluxToast,
        openConfirmModal, clearComboSlots,
        handleSocketClick, handleSocketRemove,
        handleComboSlotClick, handleCombine, handleSelectOrb, handlePointerDown,
        handleTimerExpire,
        activeSynergies: statsResult?.activeSynergies ?? [],
      })
    : null;

  // Shared overlays for portrait + desktop — see ForgeOverlays at the bottom of this file.
  const overlays = (
    <ForgeOverlays
      isAiMatch={isAiMatch}
      isDisconnected={isDisconnected}
      secondsLeft={secondsLeft}
      inspectGem={inspectGem}
      setInspectGem={setInspectGem}
      confirmModalOpen={confirmModalOpen}
      closeConfirmModal={closeConfirmModal}
      handleCommit={handleCommit}
      fluxToast={fluxToast}
    />
  );

  if (frameMode === 'desktop' && forgeDesktopProps) {
    return (
      <div
        ref={setPageEl}
        className="page-enter"
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'var(--color-surface-950)',
          ...sharedGemStyle,
        }}
      >
        <ForgeDesktop {...forgeDesktopProps} />
        {overlays}
      </div>
    );
  }

  return (
    <div
      ref={setPageEl}
      className="page-enter flex h-full flex-col"
      style={{ background: 'var(--color-surface-950)', ...sharedGemStyle }}
    >
      {/* 1. Header — stats only (flux tracker lives inline with flux actions) */}
      <ForgeHeader
        round={round}
        stats={derivedStats}
        gemDamage={gemDamage}
        activeSynergies={statsResult?.activeSynergies ?? []}
        registry={registry}
        timerDurationMs={isRunMode ? undefined : FORGE_TIMER_MS}
        onTimerExpire={isRunMode ? undefined : handleTimerExpire}
        onDone={openConfirmModal}
      />

      {/* 2. Items area — scrollable middle */}
      <div
        className="overflow-y-auto"
        data-screen-section="forge-items"
        style={{ flex: 1, minHeight: 0, padding: 'var(--gap-sm) var(--gap-md)' }}
      >
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 'var(--gap-md)' }} data-item-card="weapon">
            <ItemSocketView
              item={plan.loadout.weapon}
              cardId="weapon"
              registry={registry}
              plan={plan}
              selectedOrbUid={selectedOrbUid}
              onSocketClick={(slotIndex) => handleSocketClick('weapon', slotIndex)}
              onSocketRemove={(slotIndex) => handleSocketRemove('weapon', slotIndex)}
              onGemPointerDown={handlePointerDown}
            />
          </div>
          <div style={{
            width: 1,
            alignSelf: 'stretch',
            background: 'linear-gradient(to bottom, transparent, var(--color-surface-500) 15%, var(--color-surface-500) 85%, transparent)',
            flexShrink: 0,
          }} />
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 'var(--gap-md)' }} data-item-card="armor">
            <ItemSocketView
              item={plan.loadout.armor}
              cardId="armor"
              registry={registry}
              plan={plan}
              selectedOrbUid={selectedOrbUid}
              onSocketClick={(slotIndex) => handleSocketClick('armor', slotIndex)}
              onSocketRemove={(slotIndex) => handleSocketRemove('armor', slotIndex)}
              onGemPointerDown={handlePointerDown}
            />
          </div>
        </div>
      </div>

      {/* 3. Combine workbench — pinned above stockpile */}
      <div style={{ flexShrink: 0 }} data-screen-section="forge-combine">
        <Workbench
          comboSlots={comboSlots}
          registry={registry}
          canAfford={true}
          preview={combinePreview}
          onSlotClick={handleComboSlotClick}
          onCombine={handleCombine}
          onClearAll={() => { clearComboSlots(); playSound('buttonClick'); }}
          onPointerDown={handlePointerDown}
        />
      </div>

      {/* 3b. Flux spend actions — inline flux tracker + 3 actions in one row */}
      {runState && (
        <div data-screen-section="forge-flux" data-run-flux={currentFlux} style={{
          flexShrink: 0,
          padding: 'var(--gap-sm) var(--gap-md)',
          borderTop: '1px solid var(--color-surface-600)',
          backgroundColor: 'var(--color-surface-900)',
        }}>
          {/* Compact flux tracker: pip bar + count, inline with the label */}
          <div
            className="flex items-center"
            style={{ gap: 'var(--gap-sm)', marginBottom: 'var(--gap-xs)' }}
          >
            <span
              style={{
                fontFamily: 'var(--font-family-display)',
                fontWeight: 700,
                fontSize: 'var(--text-2xs)',
                letterSpacing: '0.04em',
                color: 'var(--color-bronze-light)',
                textTransform: 'uppercase',
              }}
            >
              Flux
            </span>
            <div
              className="flex items-stretch"
              style={{ flex: 1, gap: '2px', height: 'calc(var(--text-2xs) * 0.9)' }}
              role="meter"
              aria-valuenow={currentFlux}
              aria-valuemin={0}
              aria-valuemax={maxFlux}
              aria-label={`${currentFlux} of ${maxFlux} flux`}
            >
              {Array.from({ length: maxFlux }, (_, i) => (
                <div
                  key={i}
                  style={{
                    flex: '1 1 0',
                    minWidth: 0,
                    borderRadius: '1px',
                    background: i < currentFlux ? 'var(--color-warning)' : 'var(--color-surface-600)',
                    boxShadow: i < currentFlux ? '0 0 4px var(--color-warning)' : undefined,
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontFamily: 'var(--font-family-display)',
                fontWeight: 700,
                fontSize: 'var(--text-2xs)',
                color: currentFlux === 0 ? 'var(--color-danger)' : 'var(--color-surface-300)',
                minWidth: '3ch',
                textAlign: 'right',
              }}
            >
              {currentFlux}/{maxFlux}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--gap-xs)' }}>
            <HapticButton
              onClick={() => {
                gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'boost_combine' } }).then(result => {
                  if (result.ok) {
                    setFluxToast('Boost applied to next combine!');
                    playSound('buttonClick');
                  } else {
                    setFluxToast(result.error ?? 'Cannot boost combine');
                  }
                });
              }}
              disabled={currentFlux < 3}
              style={{
                padding: 'var(--gap-xs) var(--gap-sm)',
                fontSize: 'var(--text-2xs)',
                opacity: currentFlux < 3 ? 0.5 : 1,
              }}
            >
              Boost (3)
            </HapticButton>
            <HapticButton
              onClick={() => {
                gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'reroll_pool' } }).then(result => {
                  if (result.ok) {
                    setFluxToast('Pool will reroll next draft!');
                    playSound('buttonClick');
                  } else {
                    setFluxToast(result.error ?? 'Cannot reroll pool');
                  }
                });
              }}
              disabled={currentFlux < 5}
              style={{
                padding: 'var(--gap-xs) var(--gap-sm)',
                fontSize: 'var(--text-2xs)',
                opacity: currentFlux < 5 ? 0.5 : 1,
              }}
            >
              Reroll (5)
            </HapticButton>
            <HapticButton
              onClick={() => {
                gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind: 'guarantee_rarity' } }).then(result => {
                  if (result.ok) {
                    setFluxToast('Next draft gem guaranteed Rare!');
                    playSound('buttonClick');
                  } else {
                    setFluxToast(result.error ?? 'Cannot guarantee rarity');
                  }
                });
              }}
              disabled={currentFlux < 4}
              style={{
                padding: 'var(--gap-xs) var(--gap-sm)',
                fontSize: 'var(--text-2xs)',
                opacity: currentFlux < 4 ? 0.5 : 1,
              }}
            >
              Rarity (4)
            </HapticButton>
          </div>
        </div>
      )}

      {/* 4. Gem tray — pinned at bottom */}
      <div style={{ flexShrink: 0, padding: '0 var(--gap-md) var(--gap-sm)' }} data-screen-section="forge-tray">
        <ForgeGemTray
          stockpile={plan.stockpile}
          registry={registry}
          selectedOrbUid={selectedOrbUid}
          equippedUids={equippedUids}
          stagedUids={stagedUids}
          onSelectOrb={handleSelectOrb}
          onPointerDown={handlePointerDown}
          dragUid={null}
        />
      </div>

      {overlays}
    </div>
  );
}

// ══════════════════════════════════════════════════
// ── Private helpers (same file, not exported) ──
// ══════════════════════════════════════════════════

type ForgeDesktopProps = React.ComponentProps<typeof ForgeDesktop>;

/**
 * Desktop HUD prop assembly. Balance-driven flux costs + round-aware pool size
 * flow from the engine so tuning happens in one place. Balance lookups use
 * optional-chain so tests with a minimal stubbed BalanceConfig still mount.
 * `isDragging: false` matches portrait — Forge drag state is ref-only.
 */
function buildForgeDesktopProps(a: {
  plan: ForgeDesktopProps['plan'];
  registry: DataRegistry;
  runState: RunState | undefined;
  isRunMode: boolean;
  isAiMatch: boolean;
  aiOpponentTier: number | null;
  round: number;
  derivedStats: ForgeDesktopProps['derivedStats'];
  gemDamage: ForgeDesktopProps['gemDamage'];
  currentFlux: number;
  maxFlux: number;
  comboSlots: ForgeDesktopProps['comboSlots'];
  combinePreview: CombinePreview | null;
  selectedOrbUid: string | null;
  equippedUids: Set<string>;
  stagedUids: Set<string>;
  gateway: ReturnType<typeof useGateway>;
  navigate: ReturnType<typeof useNavigate>;
  setFluxToast: (msg: string | null) => void;
  openConfirmModal: () => void;
  clearComboSlots: () => void;
  handleSocketClick: ForgeDesktopProps['onSocketClick'];
  handleSocketRemove: ForgeDesktopProps['onSocketRemove'];
  handleComboSlotClick: ForgeDesktopProps['onComboSlotClick'];
  handleCombine: () => void;
  handleSelectOrb: ForgeDesktopProps['onSelectOrb'];
  handlePointerDown: ForgeDesktopProps['onGemPointerDown'];
  handleTimerExpire: () => void;
  activeSynergies: ForgeDesktopProps['activeSynergies'];
}): ForgeDesktopProps {
  const bal = a.registry.getBalance();
  const costs = bal.gem?.flux?.costs;
  const pool = bal.gem?.poolScaling;
  const runRound = a.runState?.round ?? 1;
  const maxStockpileCapacity = a.isRunMode && pool ? getPoolConfigForRound(runRound, pool).poolSize : 20;

  const dispatchFlux = (kind: 'boost_combine' | 'reroll_pool' | 'guarantee_rarity', okMsg: string, errMsg: string) => {
    a.gateway.dispatch({ kind: 'forge_action', player: 0, action: { kind } }).then(result => {
      if (result.ok) { a.setFluxToast(okMsg); playSound('buttonClick'); }
      else { a.setFluxToast(result.error ?? errMsg); }
    });
  };

  return {
    round: a.round,
    lives: a.runState?.lives ?? 3,
    maxLives: a.runState?.startingLives ?? 3,
    opponentLabel: a.isAiMatch ? `AI T${a.aiOpponentTier ?? 1}` : 'Player',
    streak: a.runState?.consecutiveWins ?? 0,
    totalRounds: a.runState?.goalRound ?? 10,
    derivedStats: a.derivedStats,
    gemDamage: a.gemDamage,
    activeSynergies: a.activeSynergies,
    plan: a.plan,
    registry: a.registry,
    currentFlux: a.currentFlux,
    maxFlux: a.maxFlux,
    boostCost: costs?.boostCombine ?? 3,
    rerollCost: costs?.rerollPool ?? 5,
    rarityCost: costs?.guaranteeRarity ?? 4,
    comboSlots: a.comboSlots,
    combinePreview: a.combinePreview,
    // Workbench gates combine internally; pass the literal `true` the
    // portrait tree uses so the dock's button behaves identically.
    canAffordCombine: true,
    // Quick-match 90s auto-commit countdown — mirrors portrait ForgeHeader.
    // Omitted in run mode (async, no wall-clock timer there).
    timerDurationMs: a.isRunMode ? undefined : FORGE_TIMER_MS,
    onTimerExpire: a.isRunMode ? undefined : a.handleTimerExpire,
    onDone: a.openConfirmModal,
    // Matches portrait ForgeHeader's Gem Library shortcut → GemEncyclopedia.
    onOpenGemLibrary: () => a.navigate('/gems'),
    onBoost: () => dispatchFlux('boost_combine', 'Boost applied to next combine!', 'Cannot boost combine'),
    onReroll: () => dispatchFlux('reroll_pool', 'Pool will reroll next draft!', 'Cannot reroll pool'),
    onGuaranteeRarity: () => dispatchFlux('guarantee_rarity', 'Next draft gem guaranteed Rare!', 'Cannot guarantee rarity'),
    onSocketClick: a.handleSocketClick,
    onSocketRemove: a.handleSocketRemove,
    onComboSlotClick: a.handleComboSlotClick,
    onCombine: a.handleCombine,
    onClearComboSlots: () => { a.clearComboSlots(); playSound('buttonClick'); },
    onSelectOrb: a.handleSelectOrb,
    onGemPointerDown: a.handlePointerDown,
    selectedOrbUid: a.selectedOrbUid,
    isDragging: false,
    equippedUids: a.equippedUids,
    stagedUids: a.stagedUids,
    maxStockpileCapacity,
  };
}

/**
 * Shared overlay surfaces rendered by both portrait and desktop branches:
 * PvP disconnect overlay, gem inspect panel (long-press), commit-confirmation
 * modal, and the transient flux action toast. Extracted to dedupe the JSX
 * across the two layout trees.
 */
type ForgeOverlaysProps = {
  isAiMatch: boolean;
  isDisconnected: boolean;
  secondsLeft: number;
  inspectGem: { gem: GemInstance; affixDef: AffixDef | CompoundAffixDef } | null;
  setInspectGem: (v: { gem: GemInstance; affixDef: AffixDef | CompoundAffixDef } | null) => void;
  confirmModalOpen: boolean;
  closeConfirmModal: () => void;
  handleCommit: () => void;
  fluxToast: string | null;
};

function ForgeOverlays(props: ForgeOverlaysProps) {
  const {
    isAiMatch, isDisconnected, secondsLeft,
    inspectGem, setInspectGem,
    confirmModalOpen, closeConfirmModal, handleCommit,
    fluxToast,
  } = props;

  return (
    <>
      {!isAiMatch && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}

      {/* Gem inspect panel (long-press on tray gem) */}
      {inspectGem && (
        <GemInspectPanel
          gem={{
            name: inspectGem.affixDef.name,
            description: inspectGem.affixDef.description,
            weaponFlavorText: inspectGem.affixDef.weaponFlavorText,
            armorFlavorText: inspectGem.affixDef.armorFlavorText,
            tags: inspectGem.affixDef.tags,
            rarity: inspectGem.gem.rarity,
            tier: inspectGem.gem.tier,
            tiers: 'tiers' in inspectGem.affixDef
              ? (inspectGem.affixDef as AffixDef).tiers
              : undefined,
            weaponEffect: 'weaponEffect' in inspectGem.affixDef
              ? inspectGem.affixDef.weaponEffect
              : undefined,
            armorEffect: 'armorEffect' in inspectGem.affixDef
              ? inspectGem.affixDef.armorEffect
              : undefined,
          }}
          context="both"
          onClose={() => setInspectGem(null)}
        />
      )}

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
    </>
  );
}
