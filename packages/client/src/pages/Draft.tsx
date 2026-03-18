import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useMatchGateway } from '@/gateway';
import { useDraftStore } from '@/stores/draftStore';
import { GemCard } from '@/components/GemCard';
import { GemChip } from '@/components/GemChip';
import { Timer } from '@/components/Timer';
import { useGemSize } from '@/hooks/useGemSize';
import type { AffixDef, OrbInstance } from '@alloy/engine';
import { getStatLabel } from '@/shared/utils/stat-label';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { playSound } from '@/shared/utils/sound-manager';

const DRAFT_TIMER_MS = 15_000;

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
        {orbs.map((orb, i) => {
          const affix = affixMap.get(orb.affixId);
          if (!affix) return null;
          return (
            <GemChip
              key={orb.uid}
              affixId={orb.affixId}
              affixName={affix.name.split(' ')[0]}
              statLabel={getStatLabel(affix, orb)}
              tags={affix.tags}
              newest={i === orbs.length - 1 && orbs.length > 0}
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
  const navigate = useNavigate();

  const gateway = useMatchGateway(code!);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
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

  const registry = getRegistry();
  const affixMap = new Map<string, AffixDef>();
  for (const affix of registry.getAllAffixes()) {
    affixMap.set(affix.id, affix);
  }

  const isPlayerTurn = phase?.kind === 'draft' && phase.activePlayer === 0;
  const draftRound = phase?.kind === 'draft' ? phase.round : 1;

  // Auto-scaling gem sizes
  const gemSizing = useGemSize(pool.length);

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
      if (result.ok) { playSound('orbConfirm'); confirmPick(); }
    });
  }, [isPlayerTurn, gateway, confirmPick]);

  // ── Drag handlers ──
  const handleDragStart = useCallback((uid: string, e: React.PointerEvent) => {
    if (!isPlayerTurn) return;
    e.preventDefault();
    setDragUid(uid);
    setDragPos({ x: e.clientX, y: e.clientY });
    selectOrb(uid);
    playSound('dragStart');
  }, [isPlayerTurn, selectOrb]);

  useEffect(() => {
    if (!dragUid) return;
    const handleMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      if (dropZoneRef.current) {
        const rect = dropZoneRef.current.getBoundingClientRect();
        setIsOverDropZone(
          e.clientY >= rect.top && e.clientY <= rect.bottom &&
          e.clientX >= rect.left && e.clientX <= rect.right,
        );
      }
    };
    const handleUp = () => {
      if (isOverDropZone && dragUid) { playSound('dropSuccess'); draftOrb(dragUid); }
      setDragUid(null);
      setIsOverDropZone(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragUid, isOverDropZone, draftOrb]);

  // ── AI turn ──
  useEffect(() => {
    if (!matchState || phase?.kind !== 'draft' || phase.activePlayer !== 1 || !aiController) return;
    const timeout = setTimeout(() => {
      const orbUid = aiController.pickOrb(
        matchState.pool, matchState.players[1].stockpile, matchState.players[0].stockpile,
      );
      gateway.dispatch({ kind: 'draft_pick', player: 1, orbUid });
    }, 500);
    return () => clearTimeout(timeout);
  }, [matchState, phase, aiController, gateway]);

  // ── Phase transitions ──
  useEffect(() => {
    if (phase?.kind === 'forge') navigate(`/match/${code}/forge`, { replace: true });
  }, [phase, navigate, code]);

  const handleTimerExpire = useCallback(() => {
    playSound('timerUrgent');
    if (!isPlayerTurn || pool.length === 0) return;
    draftOrb(pool[0].uid);
    cancelSelection();
  }, [isPlayerTurn, pool, draftOrb, cancelSelection]);

  if (!matchState || phase?.kind !== 'draft') {
    return <Navigate to="/queue" replace />;
  }

  const dragOrb = dragUid ? pool.find((o) => o.uid === dragUid) : null;
  const dragAffix = dragOrb ? affixMap.get(dragOrb.affixId) : null;

  return (
    <div className="page-enter flex h-full flex-col p-2">
      {!code?.startsWith('ai-') && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}
      {/* Drag ghost */}
      {dragUid && dragAffix && dragOrb && (
        <DragGhost position={dragPos} affix={dragAffix} orb={dragOrb} />
      )}

      {/* ═══ TOP: Opponent zone ═══ */}
      <StockpileZone
        label="Opponent"
        orbs={player1?.stockpile ?? []}
        maxOrbs={picksPerPlayer}
        affixMap={affixMap}
        isActive={!isPlayerTurn}
        isDropTarget={false}
        side="top"
      />

      {/* ═══ CENTER: Status bar ═══ */}
      <div className="my-1 flex items-center justify-between px-1">
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
            {isPlayerTurn ? 'YOUR PICK' : 'AI PICKING'}
          </div>
          <span className="text-xs text-surface-300" style={{ fontFamily: 'var(--font-family-display)' }}>
            R{draftRound} · {pool.length} left
          </span>
        </div>
        {isPlayerTurn && <Timer durationMs={DRAFT_TIMER_MS} onExpire={handleTimerExpire} />}
      </div>

      {/* ═══ Pool grid — auto-scaling GemCards ═══ */}
      <div
        className="flex-1 overflow-y-auto rounded-xl border border-surface-600 bg-surface-800"
        style={{ boxShadow: 'var(--shadow-inset)', padding: 6 }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${gemSizing.columns}, 1fr)`,
            gap: 4,
            justifyItems: 'center',
            alignContent: 'center',
            minHeight: '100%',
          }}
        >
          {pool.map((orb) => {
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
                gemSize={gemSizing.gemSize}
                emojiSize={gemSizing.emojiSize}
                statSize={gemSizing.statSize}
                nameSize={gemSizing.nameSize}
                catSize={gemSizing.catSize}
                selected={orb.uid === selectedOrbUid}
                onClick={() => {
                  if (selectedOrbUid === orb.uid) {
                    draftOrb(orb.uid);
                  } else {
                    selectOrb(orb.uid);
                    playSound('orbSelect');
                  }
                }}
                onPointerDown={(e) => handleDragStart(orb.uid, e)}
              />
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
