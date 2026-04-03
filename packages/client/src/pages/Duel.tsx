import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useGateway } from '@/gateway';
import type { CombatLog, CombatEvent, DuelResult, DerivedStats } from '@alloy/engine';
import { calculateStats } from '@alloy/engine';
import { DuelRenderer } from '@/components/DuelRenderer';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { useDuelSounds } from '@/hooks/useDuelSounds';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';
import { CombatLogPanel } from '@/features/duel/CombatLogPanel.js';
import { useMatchStore } from '@/stores/matchStore';

/* ═══════════════════════════════════════════════════════════════
   HPBar — slim bar used for both top (enemy) and bottom (player)
   ═══════════════════════════════════════════════════════════════ */

function HPBar({ current, max, label }: { current: number; max: number; label: string }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const isLow = pct < 30;

  return (
    <div className="flex items-center gap-2">
      <span
        className="w-10 shrink-0 text-xs font-bold text-surface-400"
        style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
      >
        {label}
      </span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-600">
        <div
          className={`h-full rounded-full ${
            isLow ? 'bg-danger' : pct < 60 ? 'bg-warning' : 'bg-success'
          }`}
          style={{ width: `${pct}%`, transition: 'width 80ms linear' }}
        />
      </div>
      <span
        className={`stat-number w-20 shrink-0 text-right text-xs ${isLow ? 'text-danger' : 'text-white'}`}
        style={isLow ? { animation: 'pulse-glow 1.5s ease-in-out infinite' } : undefined}
      >
        {Math.round(current)} / {Math.round(max)}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PostDuelBreakdown — shown at the end of playback
   ═══════════════════════════════════════════════════════════════ */

function PostDuelBreakdown({ result, combatLog }: { result: DuelResult; combatLog: CombatLog }) {
  const totalDamage = [0, 0];
  const totalHealing = [0, 0];
  const critCount = [0, 0];
  const attackCount = [0, 0];

  for (const frame of combatLog.frames) {
    for (const event of frame.events) {
      if (event.type === 'attack') {
        totalDamage[event.attacker] += event.breakdown.totalNet;
        attackCount[event.attacker]++;
        if (event.breakdown.isCrit) critCount[event.attacker]++;
      }
      if (event.type === 'lifesteal') totalHealing[event.player] += event.healed;
      if (event.type === 'heal') totalHealing[event.player] += event.breakdown.effectiveHeal;
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
      {[0, 1].map((p) => (
        <div key={p} className="flex-1 rounded-lg bg-surface-700 p-3" style={{ boxShadow: 'var(--shadow-card)' }}>
          <h4
            className={`mb-2 font-bold ${result.winner === p ? 'text-success' : 'text-danger'}`}
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
          >
            {p === 0 ? 'You' : 'AI'} {result.winner === p ? '(Winner)' : '(Defeated)'}
          </h4>
          <div className="space-y-1 text-xs text-surface-400">
            <p>Final HP: <span className="stat-number text-white">{Math.round(result.finalHP[p])}</span></p>
            <p>Total Damage: <span className="stat-number text-white">{Math.round(totalDamage[p])}</span></p>
            <p>Attacks: <span className="stat-number text-white">{attackCount[p]}</span></p>
            <p>Crit Rate: <span className="stat-number text-white">{attackCount[p] > 0 ? Math.round((critCount[p] / attackCount[p]) * 100) : 0}%</span></p>
            <p>Healing: <span className="stat-number text-white">{Math.round(totalHealing[p])}</span></p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Duel — main page
   ═══════════════════════════════════════════════════════════════ */

export function Duel() {
  const { code } = useParams();

  const gateway = useGateway();
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const duelLogs = matchState?.duelLogs ?? [];
  const roundResults = matchState?.roundResults ?? [];
  const player0 = matchState?.players[0] ?? null;
  const player1 = matchState?.players[1] ?? null;
  const getRegistry = useMatchStore((s) => s.getRegistry);

  const { isDisconnected, secondsLeft } = useDisconnectTimer(gateway);

  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const animationRef = useRef<number>(0);

  // Run the duel (engine simulation) when we enter duel phase
  useEffect(() => {
    if (phase?.kind === 'duel' && matchState) {
      const currentRound = phase.round;
      if (duelLogs.length < currentRound) {
        gateway.dispatch({ kind: 'advance_phase' });
      }
    }
  }, [phase, matchState, duelLogs.length, gateway]);

  const currentLog = useMemo(() => {
    if (!phase) return null;
    const round = phase.kind === 'duel' ? phase.round :
                  phase.kind === 'forge' ? phase.round - 1 :
                  phase.kind === 'complete' ? duelLogs.length :
                  duelLogs.length;
    return duelLogs[round - 1] ?? null;
  }, [phase, duelLogs]);

  const currentResult = useMemo(() => {
    if (!currentLog) return null;
    return currentLog.result;
  }, [currentLog]);

  // Playback animation — advance in real time
  useEffect(() => {
    if (!isPlaying || !currentLog) return;

    const maxTime = currentLog.frames[currentLog.frames.length - 1]?.time ?? 0;
    let startTimestamp: number | null = null;
    let startPlaybackTime = playbackTime;

    const step = (timestamp: number) => {
      if (startTimestamp === null) startTimestamp = timestamp;
      const elapsed = (timestamp - startTimestamp) / 1000;
      const newTime = Math.min(startPlaybackTime + elapsed, maxTime);
      setPlaybackTime(newTime);
      if (newTime < maxTime) {
        animationRef.current = requestAnimationFrame(step);
      }
    };

    animationRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, currentLog]);

  // Handle playback completion
  useEffect(() => {
    if (!currentLog || isPlaying) return;
    const maxTime = currentLog.frames[currentLog.frames.length - 1]?.time ?? 0;
    if (playbackTime >= maxTime && maxTime > 0 && !showBreakdown) {
      setIsPlaying(false);
      setShowBreakdown(true);
      if (currentLog.result.winner === 0) {
        setShowCelebration(true);
      }
    }
  }, [playbackTime, currentLog, isPlaying, showBreakdown]);

  // Compute HP at current playback tick
  const hpState = useMemo(() => {
    if (!currentLog || !player0 || !player1) return null;
    const reg = getRegistry();
    const stats0 = calculateStats(player0.loadout, reg);
    const stats1 = calculateStats(player1.loadout, reg);
    let hp = [stats0.maxHP, stats1.maxHP];
    const maxHp = [...hp];

    for (const frame of currentLog.frames) {
      if (frame.time > playbackTime) break;
      for (const event of frame.events) {
        if (event.type === 'hp_change') {
          hp[event.player] = event.newHP;
        }
      }
    }

    return { hp, maxHp, stats: [stats0, stats1] as [DerivedStats, DerivedStats] };
  }, [currentLog, playbackTime, player0, player1, getRegistry]);

  // Collect events up to current tick for the combat log
  const visibleEvents = useMemo(() => {
    if (!currentLog) return [];
    const events: { time: number; event: CombatEvent }[] = [];
    for (const frame of currentLog.frames) {
      if (frame.time > playbackTime) break;
      for (const event of frame.events) {
        events.push({ time: frame.time, event });
      }
    }
    return events;
  }, [currentLog, playbackTime]);

  useDuelSounds(visibleEvents, isPlaying, showBreakdown, currentResult);

  const handleContinue = () => {
    gateway.dispatch({ kind: 'duel_continue' });
  };

  // currentLog/hpState may not be ready yet (duel simulation runs in useEffect)
  if (!currentLog || !hpState) {
    return null;
  }

  const round = currentResult?.round ?? 1;

  return (
    <div className="page-enter flex h-full flex-col" style={{ minHeight: 0 }}>
      {!code?.startsWith('ai-') && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}
      {showCelebration && <CelebrationOverlay onComplete={() => setShowCelebration(false)} />}

      {/* ═══ TOP BAR (~5%): Round pips + Enemy HP + Timer ═══ */}
      <div className="shrink-0 border-b border-surface-700 px-3 py-1.5">
        <div className="flex items-center gap-2">
          {/* Round pips */}
          <div className="flex items-center gap-1">
            {roundResults.map((r, i) => (
              <span
                key={`round-${i}-${r.round}`}
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  r.winner === 0 ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                }`}
              >
                R{i + 1}
              </span>
            ))}
            <span className="text-xs text-surface-400" style={{ fontFamily: 'var(--font-family-display)' }}>
              R{round}
            </span>
          </div>

          {/* Enemy HP bar */}
          <div className="flex-1">
            <HPBar current={hpState.hp[1]} max={hpState.maxHp[1]} label="AI" />
          </div>

          {/* Timer */}
          <span className="stat-number shrink-0 text-xs text-surface-400">
            {playbackTime.toFixed(1)}s / {currentResult ? currentResult.duration.toFixed(1) : '?'}s
          </span>
        </div>
      </div>

      {/* ═══ ARENA (~50%): PixiJS canvas + playback controls overlay ═══ */}
      <div className="relative" style={{ flex: '5 1 0%', minHeight: 0 }}>
        <div className="h-full w-full">
          <DuelRenderer
            combatLog={currentLog}
            stats={hpState.stats}
            currentTime={playbackTime}
            isPlaying={isPlaying}
          />
        </div>

        {/* Playback controls overlay — bottom of arena */}
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-2">
          <button
            onClick={() => {
              if (!isPlaying) {
                if (playbackTime >= (currentLog.frames[currentLog.frames.length - 1]?.time ?? 0)) {
                  setPlaybackTime(0);
                  setShowBreakdown(false);
                  setShowCelebration(false);
                }
                setIsPlaying(true);
              } else {
                setIsPlaying(false);
              }
            }}
            className="rounded bg-surface-600/80 px-3 py-1 text-sm text-white backdrop-blur-sm hover:bg-surface-500/80"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => {
              setPlaybackTime(currentLog.frames[currentLog.frames.length - 1]?.time ?? 0);
              setIsPlaying(false);
              setShowBreakdown(true);
              if (currentLog.result.winner === 0) setShowCelebration(true);
            }}
            className="rounded bg-surface-600/80 px-3 py-1 text-sm text-surface-400 backdrop-blur-sm hover:bg-surface-500/80"
            style={{ fontFamily: 'var(--font-family-display)' }}
          >
            Skip
          </button>
        </div>
      </div>

      {/* ═══ PLAYER HP BAR (~5%) ═══ */}
      <div className="shrink-0 border-t border-surface-700 px-3 py-1.5">
        <HPBar current={hpState.hp[0]} max={hpState.maxHp[0]} label="You" />
      </div>

      {/* ═══ COMBAT LOG (~40%) ═══ */}
      <div style={{ flex: '4 1 0%', minHeight: 0 }} className="overflow-hidden">
        <CombatLogPanel events={visibleEvents} />
      </div>

      {/* Post-duel breakdown */}
      {showBreakdown && currentResult && (
        <div style={{ animation: 'slide-up 0.2s ease-out' }} className="shrink-0 space-y-3 p-3">
          <PostDuelBreakdown result={currentResult} combatLog={currentLog} />
          <button
            onClick={handleContinue}
            className="w-full rounded-lg bg-gradient-to-b from-accent-400 to-accent-500 py-3 font-bold text-surface-900"
            style={{ boxShadow: 'var(--shadow-button)', fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            {(() => {
              const wins = [0, 0];
              for (const r of roundResults) {
                if (r.winner === 0) wins[0]++;
                else if (r.winner === 1) wins[1]++;
              }
              if (wins[0] >= 2 || wins[1] >= 2 || round >= 3) return 'SEE RESULTS';
              return 'CONTINUE';
            })()}
          </button>
        </div>
      )}
    </div>
  );
}
