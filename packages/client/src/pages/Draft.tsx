import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useGateway } from '@/gateway';
import { useDraftStore } from '@/stores/draftStore';
import { GemCard } from '@/components/GemCard';
import { GemChip } from '@/components/GemChip';
import { Timer } from '@/components/Timer';
import { useGemSize } from '@/hooks/useGemSize';
import type { AffixDef, OrbInstance } from '@alloy/engine';
import { AI_CONFIGS } from '@alloy/engine';
import { calcAiDelay } from './ai-delay';
import { getStatLabel } from '@/shared/utils/stat-label';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { playSound } from '@/shared/utils/sound-manager';
import { DRAG_THRESHOLD, HOLD_THRESHOLD } from './draft-gestures';

const DRAFT_TIMER_MS = 15_000;

const ELEMENT_ORDER = ['fire', 'cold', 'lightning', 'poison', 'shadow', 'chaos', 'physical'];

// ── Stockpile zone using GemChip ──

function StockpileZone({
  label,
  orbs,
  maxOrbs,
  affixMap,
  isActive,
  isDropTarget,
  side,
}: {
  label: string;
  orbs: OrbInstance[];
  maxOrbs: number;
  affixMap: Map<string, AffixDef>;
  isActive: boolean;
  isDropTarget: boolean;
  side: 'top' | 'bottom';
}) {
  const emptyCount = Math.max(0, maxOrbs - orbs.length);
  const newestUid = orbs.length > 0 ? orbs[orbs.length - 1].uid : null;
  const sortedOrbs = [...orbs].sort((a, b) => {
    const aAffix = affixMap.get(a.affixId);
    const bAffix = affixMap.get(b.affixId);
    const aEl = aAffix?.tags.find((t) => ELEMENT_ORDER.includes(t)) ?? 'physical';
    const bEl = bAffix?.tags.find((t) => ELEMENT_ORDER.includes(t)) ?? 'physical';
    return ELEMENT_ORDER.indexOf(aEl) - ELEMENT_ORDER.indexOf(bEl);
  });

  return (
    <div
      className={`rounded-[10px] border px-2 py-[5px] transition-all duration-200 ${
        isDropTarget
          ? 'border-accent-400 bg-accent-500/10 shadow-[0_0_20px_rgba(212,168,52,0.15)]'
          : side === 'top'
            ? 'border-[rgba(248,113,113,0.12)]'
            : 'border-[rgba(212,168,52,0.25)]'
      }`}
      style={{
        background: isDropTarget
          ? undefined
          : side === 'top'
            ? 'linear-gradient(180deg, rgba(248,113,113,0.04), var(--color-surface-800))'
            : 'linear-gradient(0deg, rgba(212,168,52,0.06), var(--color-surface-800))',
        boxShadow: isDropTarget ? undefined : side === 'bottom' ? '0 0 14px rgba(212,168,52,0.08)' : 'var(--shadow-card)',
        margin: side === 'top' ? '5px 7px 0' : '2px 7px 5px',
      }}
    >
      <div className="mb-1 flex items-center justify-between">
        <h3
          className={`text-[11px] font-bold uppercase ${
            isDropTarget ? 'text-accent-300' :
            side === 'top' ? 'text-danger' : 'text-accent-400'
          }`}
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.06em' }}
        >
          {isDropTarget ? '↓ Drop here to draft!' : label}
        </h3>
        <span
          className="text-[10px] font-semibold text-surface-300"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          {orbs.length} / {maxOrbs}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-[3px]">
        {sortedOrbs.map((orb) => {
          const affix = affixMap.get(orb.affixId);
          if (!affix) return null;
          return (
            <GemChip
              key={orb.uid}
              affixId={orb.affixId}
              affixName={affix.name.split(' ')[0]}
              statLabel={getStatLabel(affix, orb)}
              tags={affix.tags}
              newest={orb.uid === newestUid}
            />
          );
        })}
        {Array.from({ length: emptyCount }, (_, i) => (
          <GemChip key={`empty-${i}`} empty />
        ))}
      </div>
    </div>
  );
}

// ── Drag ghost ──

function DragGhost({
  position,
  affix,
  orb,
}: {
  position: { x: number; y: number };
  affix: AffixDef;
  orb: OrbInstance;
}) {
  return (
    <div
      className="pointer-events-none fixed z-50"
      style={{
        left: position.x - 48,
        top: position.y - 48,
        filter: 'drop-shadow(0 0 16px rgba(212, 168, 52, 0.5))',
        transform: 'scale(1.1)',
        opacity: 0.9,
      }}
    >
      <GemCard
        affixId={orb.affixId}
        affixName={affix.name}
        tier={orb.tier}
        category={affix.category}
        tags={affix.tags}
        statLabel={getStatLabel(affix, orb)}
        gemSize={96}
        emojiSize={36}
        statSize={14}
        nameSize={14}
        catSize={11}
        selected
      />
    </div>
  );
}

// ── Main Draft component ──

export function Draft() {
  const { code } = useParams();

  const gateway = useGateway();
  const [, forceUpdate] = useState(0);
  const deferUpdateRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  useEffect(() => {
    return gateway.subscribe(() => {
      if (deferUpdateRef.current) {
        // Animation in flight — queue the update for when it finishes
        pendingUpdateRef.current = true;
      } else {
        forceUpdate((n) => n + 1);
      }
    });
  }, [gateway]);

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const pool = matchState?.pool ?? [];
  const player0 = matchState?.players[0] ?? null;
  const player1 = matchState?.players[1] ?? null;
  const aiController = useMatchStore((s) => s.aiController);
  const getRegistry = useMatchStore((s) => s.getRegistry);

  const selectedOrbUid = useDraftStore((s) => s.selectedOrbUid);
  const selectOrb = useDraftStore((s) => s.selectOrb);
  const confirmPick = useDraftStore((s) => s.confirmPick);
  const cancelSelection = useDraftStore((s) => s.cancelSelection);

  const [dragUid, setDragUid] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [isOverDropZone, setIsOverDropZone] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const { isDisconnected, secondsLeft } = useDisconnectTimer(gateway);

  useEffect(() => {
    if (isDisconnected) {
      playSound('phaseTransition');
    }
  }, [isDisconnected]);

  const registry = getRegistry();
  const affixMap = new Map<string, AffixDef>();
  for (const affix of registry.getAllAffixes()) {
    affixMap.set(affix.id, affix);
  }

  const isPlayerTurn = phase?.kind === 'draft' && phase.activePlayer === 0;
  const draftRound = phase?.kind === 'draft' ? phase.round : 1;

  // Track which round's pool has been animated
  const animatedRoundRef = useRef<number>(0);
  const shouldAnimate = animatedRoundRef.current !== draftRound;

  useEffect(() => {
    if (animatedRoundRef.current !== draftRound) {
      const timer = setTimeout(() => { animatedRoundRef.current = draftRound; }, 800);
      return () => clearTimeout(timer);
    }
  }, [draftRound]);

  // Measure pool container for responsive sizing
  const poolContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = poolContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Auto-scaling gem sizes
  const gemSizing = useGemSize(pool.length, containerWidth);

  // Cache gem positions — merge into existing cache so positions from
  // previous renders survive (needed for opponent pick animation, where the
  // orb is gone from pool by the time the effect fires)
  const gemPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  useLayoutEffect(() => {
    const positions = gemPositionsRef.current;
    for (const orb of pool) {
      const el = document.querySelector(`[data-gem-uid="${orb.uid}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        positions.set(orb.uid, { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }
  }, [pool]);

  // Track opponent picks for flying gem animation
  const prevPoolRef = useRef<OrbInstance[]>(pool);
  const opponentZoneRef = useRef<HTMLDivElement>(null);
  const [flyingOrb, setFlyingOrb] = useState<{
    orb: OrbInstance;
    startPos: { x: number; y: number };
    endPos: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const prevPool = prevPoolRef.current;
    prevPoolRef.current = pool;

    // Detect opponent pick: pool shrunk and the removed orb is in opponent's stockpile
    if (prevPool.length > 0 && pool.length < prevPool.length) {
      const removedOrb = prevPool.find((o) => !pool.some((p) => p.uid === o.uid));
      const inOpponentStockpile = removedOrb && player1?.stockpile.some((o) => o.uid === removedOrb.uid);
      if (removedOrb && inOpponentStockpile) {
        const cachedPos = gemPositionsRef.current.get(removedOrb.uid);
        const opRect = opponentZoneRef.current?.getBoundingClientRect();
        if (cachedPos && opRect) {
          const endPos = { x: opRect.left + opRect.width / 2, y: opRect.top + opRect.height / 2 };
          setFlyingOrb({ orb: removedOrb, startPos: cachedPos, endPos });
          playSound('orbPickOpponent');

          // Defer gateway updates so the phase doesn't change mid-animation
          deferUpdateRef.current = true;

          setTimeout(() => {
            playSound('dropSuccess');
            setFlyingOrb(null);
            // Flush deferred updates
            deferUpdateRef.current = false;
            if (pendingUpdateRef.current) {
              pendingUpdateRef.current = false;
              forceUpdate((n) => n + 1);
            }
          }, 950);
        }
      }
    }
  }, [pool, isPlayerTurn, player1?.stockpile]);

  // Max orbs per player for the current draft round
  const balance = registry.getBalance();
  const perRound = balance.draftPicksPerPlayer ?? [8, 4, 4];
  const picksPerPlayer = matchState?.mode === 'quick'
    ? Math.ceil((pool.length + (player0?.stockpile.length ?? 0) + (player1?.stockpile.length ?? 0)) / 2)
    : perRound[draftRound - 1] ?? 8;

  // ── Draft action ──
  const draftOrb = useCallback((orbUid: string) => {
    if (!isPlayerTurn) return;
    gateway.dispatch({ kind: 'draft_pick', player: 0, orbUid }).then((result) => {
      if (result.ok) {
        playSound('orbConfirm');
        confirmPick();
      } else {
        cancelSelection();
      }
    });
  }, [isPlayerTurn, gateway, confirmPick, cancelSelection]);

  // ── Pointer state refs (mutable, no re-renders, no stale closures) ──
  const pointerStartRef = useRef<{ x: number; y: number; uid: string; time: number } | null>(null);
  const hasDraggedRef = useRef(false);
  const isOverDropZoneRef = useRef(false);
  const selectedOrbUidRef = useRef(selectedOrbUid);

  // Keep selectedOrbUidRef in sync — needed because handleUp reads it via ref
  // (isOverDropZoneRef is set directly in handleMove, no sync effect needed)
  useEffect(() => { selectedOrbUidRef.current = selectedOrbUid; }, [selectedOrbUid]);

  // ── Pointer down: record start position + time, don't select yet ──
  const handlePointerDown = useCallback((uid: string, e: React.PointerEvent) => {
    if (!isPlayerTurn) return;
    e.preventDefault();
    pointerStartRef.current = { x: e.clientX, y: e.clientY, uid, time: Date.now() };
    hasDraggedRef.current = false;
  }, [isPlayerTurn]);

  // ── Global pointer move + up listeners ──
  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const start = pointerStartRef.current;
      if (!start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (!hasDraggedRef.current && Math.sqrt(dx * dx + dy * dy) >= DRAG_THRESHOLD) {
        hasDraggedRef.current = true;
        setDragUid(start.uid);
        selectOrb(start.uid);
        playSound('dragStart');
      }

      if (hasDraggedRef.current) {
        setDragPos({ x: e.clientX, y: e.clientY });
        if (dropZoneRef.current) {
          const rect = dropZoneRef.current.getBoundingClientRect();
          const over = e.clientY >= rect.top && e.clientY <= rect.bottom &&
                       e.clientX >= rect.left && e.clientX <= rect.right;
          setIsOverDropZone(over);
          isOverDropZoneRef.current = over;
        }
      }
    };

    const handleUp = () => {
      const start = pointerStartRef.current;
      if (!start) return;

      if (hasDraggedRef.current) {
        // Was dragging — check drop zone via ref (not stale state)
        if (isOverDropZoneRef.current) {
          playSound('dropSuccess');
          draftOrb(start.uid);
        }
        setDragUid(null);
        setIsOverDropZone(false);
        isOverDropZoneRef.current = false;
      } else {
        // Not a drag — classify as tap or hold based on duration only
        // (drag case already handled above via hasDraggedRef, so distance is < threshold here)
        const holdDuration = Date.now() - start.time;
        if (holdDuration < HOLD_THRESHOLD) {
          // Short press = tap — handle selection
          if (selectedOrbUidRef.current === start.uid) {
            draftOrb(start.uid);
          } else {
            selectOrb(start.uid);
            playSound('orbSelect');
          }
        }
        // Long press = hold → no-op (D04)
      }

      pointerStartRef.current = null;
      hasDraggedRef.current = false;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draftOrb, selectOrb]);

  // ── AI turn ──
  // Use stable primitives in deps to avoid timer resets from object reference changes.
  // Both PhaseRouter and Draft subscribe to the gateway, so Draft re-renders twice per
  // state change. Using pickIndex/activePlayer (numbers) prevents the 500ms timeout from
  // being cancelled and rescheduled on every re-render.
  const pickIndex = phase?.kind === 'draft' ? phase.pickIndex : -1;
  const activePlayer = phase?.kind === 'draft' ? phase.activePlayer : -1;

  useEffect(() => {
    if (!matchState || activePlayer !== 1 || !aiController) return;
    const currentState = gateway.getState();
    if (!currentState || currentState.phase.kind !== 'draft') return;
    const baseDelay = AI_CONFIGS[aiController.tier].thinkingDelayMs;
    const delay = calcAiDelay(baseDelay);
    const timeout = setTimeout(() => {
      const freshState = gateway.getState();
      if (!freshState || freshState.phase.kind !== 'draft') return;
      const orbUid = aiController.pickOrb(
        freshState.pool, freshState.players[1].stockpile, freshState.players[0].stockpile,
      );
      gateway.dispatch({ kind: 'draft_pick', player: 1, orbUid });
    }, delay);
    return () => clearTimeout(timeout);
  }, [pickIndex, activePlayer, aiController, gateway]);

  const handleTimerExpire = useCallback(() => {
    playSound('timerUrgent');
    if (!isPlayerTurn || pool.length === 0) return;
    const randomIndex = Math.floor(Math.random() * pool.length);
    draftOrb(pool[randomIndex].uid);
    cancelSelection();
  }, [isPlayerTurn, pool, draftOrb, cancelSelection]);

  const dragOrb = dragUid ? pool.find((o) => o.uid === dragUid) : null;
  const dragAffix = dragOrb ? affixMap.get(dragOrb.affixId) : null;

  return (
    <div className="page-enter flex h-full flex-col p-2">
      {!code?.startsWith('ai-') && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}
      {/* Drag ghost */}
      {dragUid && dragAffix && dragOrb && (
        <DragGhost position={dragPos} affix={dragAffix} orb={dragOrb} />
      )}

      {/* Flying gem — opponent pick animation (JS-driven for smooth GPU compositing) */}
      {flyingOrb && (() => {
        const affix = affixMap.get(flyingOrb.orb.affixId);
        if (!affix) return null;
        const halfGem = gemSizing.gemSize / 2;
        const dx = flyingOrb.endPos.x - flyingOrb.startPos.x;
        const dy = flyingOrb.endPos.y - flyingOrb.startPos.y;
        // Arc offset: swoop out 100px to the right at peak
        const arc = 100;
        return (
          <div
            className="pointer-events-none fixed z-50"
            ref={(el) => {
              if (!el) return;
              // Web Animations API — computes actual px values, GPU-composited
              el.animate([
                { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
                { transform: `translate3d(${dx * 0.1 + arc * 0.6}px, ${dy * 0.15}px, 0) scale(0.9)`, opacity: 1 },
                { transform: `translate3d(${dx * 0.3 + arc}px, ${dy * 0.4}px, 0) scale(0.7)`, opacity: 1 },
                { transform: `translate3d(${dx * 0.6 + arc * 0.7}px, ${dy * 0.65}px, 0) scale(0.5)`, opacity: 0.95 },
                { transform: `translate3d(${dx * 0.85 + arc * 0.3}px, ${dy * 0.85}px, 0) scale(0.35)`, opacity: 0.8 },
                { transform: `translate3d(${dx}px, ${dy}px, 0) scale(0.3)`, opacity: 0 },
              ], {
                duration: 900,
                easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
                fill: 'forwards',
              });
            }}
            style={{
              left: flyingOrb.startPos.x - halfGem,
              top: flyingOrb.startPos.y - halfGem,
              willChange: 'transform, opacity',
            }}
          >
            <GemCard
              affixId={flyingOrb.orb.affixId}
              affixName={affix.name}
              tier={flyingOrb.orb.tier}
              category={affix.category}
              tags={affix.tags}
              statLabel={getStatLabel(affix, flyingOrb.orb)}
              gemSize={gemSizing.gemSize}
              emojiSize={gemSizing.emojiSize}
              statSize={gemSizing.statSize}
              nameSize={gemSizing.nameSize}
              catSize={gemSizing.catSize}
              selected
            />
          </div>
        );
      })()}

      {/* ═══ TOP: Opponent zone ═══ */}
      <div ref={opponentZoneRef}>
      <StockpileZone
        label="Opponent"
        orbs={flyingOrb
          ? (player1?.stockpile ?? []).filter((o) => o.uid !== flyingOrb.orb.uid)
          : (player1?.stockpile ?? [])
        }
        maxOrbs={picksPerPlayer}
        affixMap={affixMap}
        isActive={!isPlayerTurn}
        isDropTarget={false}
        side="top"
      />
      </div>

      {/* ═══ CENTER: Status bar ═══ */}
      <div className="my-1 flex flex-wrap items-center justify-between gap-1 px-1">
        <div className="flex items-center gap-2">
          <div
            className={`rounded-lg px-3 py-1 text-xs font-bold ${
              isPlayerTurn
                ? 'bg-gradient-to-b from-accent-400 to-accent-500 text-surface-900'
                : 'bg-surface-600 text-surface-400'
            }`}
            style={{
              fontFamily: 'var(--font-family-display)',
              boxShadow: isPlayerTurn ? '0 2px 8px rgba(212, 168, 52, 0.3)' : undefined,
            }}
          >
            {isPlayerTurn ? 'YOUR PICK' : 'OPPONENT PICKING'}
          </div>
          <span className="text-xs text-surface-300" style={{ fontFamily: 'var(--font-family-display)' }}>
            ROUND {draftRound} DRAFT · {pool.length} left
          </span>
        </div>
        {isPlayerTurn && <Timer durationMs={DRAFT_TIMER_MS} onExpire={handleTimerExpire} />}
      </div>

      {/* ═══ Pool grid — auto-scaling GemCards ═══ */}
      <div
        ref={poolContainerRef}
        className="flex-1 overflow-y-auto rounded-xl border border-surface-600 bg-surface-800"
        style={{ boxShadow: 'var(--shadow-inset)', padding: 6 }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gemSizing.columns}, minmax(0, 1fr))`,
            gap: 4,
            justifyItems: 'center',
            alignContent: 'start',
            minHeight: '100%',
          }}
        >
          {pool.map((orb, index) => {
            const affix = affixMap.get(orb.affixId);
            if (!affix) return null;
            return (
              <div
                key={orb.uid}
                style={shouldAnimate ? {
                  animation: 'gem-enter 0.3s ease-out both',
                  animationDelay: `${index * 25}ms`,
                } : undefined}
              >
                <GemCard
                  uid={orb.uid}
                  affixId={orb.affixId}
                  affixName={affix.name}
                  tier={orb.tier}
                  category={affix.category}
                  tags={affix.tags}
                  statLabel={getStatLabel(affix, orb)}
                  description={affix.description}
                  gemSize={gemSizing.gemSize}
                  emojiSize={gemSizing.emojiSize}
                  statSize={gemSizing.statSize}
                  nameSize={gemSizing.nameSize}
                  catSize={gemSizing.catSize}
                  selected={orb.uid === selectedOrbUid}
                  onPointerDown={(e) => handlePointerDown(orb.uid, e)}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Instruction */}
      <p className="my-0.5 text-center text-[10px] tracking-wide" style={{ color: 'var(--color-bronze-400)' }}>
        Drag gems down · tap twice to pick
      </p>

      {/* ═══ BOTTOM: Player drop zone ═══ */}
      <div ref={dropZoneRef}>
        <StockpileZone
          label="Your Orbs"
          orbs={player0?.stockpile ?? []}
          maxOrbs={picksPerPlayer}
          affixMap={affixMap}
          isActive={isPlayerTurn}
          isDropTarget={isOverDropZone && !!dragUid}
          side="bottom"
        />
      </div>
    </div>
  );
}
