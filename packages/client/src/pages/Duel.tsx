import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useMatchGateway } from '@/gateway';
import type { CombatLog, TickEvent, DuelResult, DerivedStats } from '@alloy/engine';
import { calculateStats } from '@alloy/engine';
import { DuelRenderer } from '@/components/DuelRenderer';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import { useDisconnectTimer } from '@/hooks/useDisconnectTimer';
import { useDuelSounds } from '@/hooks/useDuelSounds';
import { DisconnectOverlay } from '@/components/DisconnectOverlay';

function HPBar({ current, max, label, side }: { current: number; max: number; label: string; side: 'left' | 'right' }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const isLow = pct < 30;

  return (
    <div className={`flex-1 ${side === 'right' ? 'text-right' : ''}`}>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span
          className="font-bold text-surface-400"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em', textTransform: 'uppercase' }}
        >
          {label}
        </span>
        <span className={`stat-number ${isLow ? 'text-danger' : 'text-white'}`} style={isLow ? { animation: 'pulse-glow 1.5s ease-in-out infinite' } : undefined}>
          {Math.round(current)} / {Math.round(max)}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-600">
        <div
          className={`hp-bar-fill h-full rounded-full ${
            isLow ? 'bg-danger' : pct < 60 ? 'bg-warning' : 'bg-success'
          }`}
          style={{ width: `${pct}%`, float: side }}
        />
      </div>
    </div>
  );
}

function EventLog({ events, maxHeight }: { events: { tick: number; event: TickEvent }[]; maxHeight: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  const formatEvent = (tick: number, event: TickEvent): string => {
    const t = `[${(tick / 30).toFixed(1)}s]`;
    switch (event.type) {
      case 'attack': return `${t} P${event.attacker + 1} attacks for ${Math.round(event.damage)} ${event.damageType}${event.isCrit ? ' CRIT!' : ''}`;
      case 'block': return `${t} P${event.blocker + 1} blocks ${Math.round(event.blockedDamage)} damage`;
      case 'dodge': return `${t} P${event.dodger + 1} dodges!`;
      case 'dot_apply': return `${t} P${event.target + 1} afflicted with ${event.element} DOT`;
      case 'dot_tick': return `${t} P${event.target + 1} takes ${Math.round(event.damage)} ${event.element} DOT`;
      case 'lifesteal': return `${t} P${event.player + 1} heals ${Math.round(event.healed)} (lifesteal)`;
      case 'thorns': return `${t} P${event.reflector + 1} reflects ${Math.round(event.damage)} (thorns)`;
      case 'barrier_absorb': return `${t} P${event.player + 1} barrier absorbs ${Math.round(event.absorbed)}`;
      case 'hp_change': return `${t} P${event.player + 1}: ${Math.round(event.oldHP)} → ${Math.round(event.newHP)} HP`;
      case 'death': return `${t} P${event.player + 1} is defeated!`;
      case 'stun': return `${t} P${event.target + 1} stunned for ${(event.durationTicks / 30).toFixed(1)}s`;
      default: return `${t} ${event.type}`;
    }
  };

  return (
    <div ref={ref} className="overflow-y-auto font-mono text-xs leading-5" style={{ maxHeight }}>
      {events.map((e, i) => (
        <div
          key={`${e.tick}-${e.event.type}-${i}`}
          className={`${
            e.event.type === 'death' ? 'text-danger font-bold' :
            e.event.type === 'attack' && e.event.isCrit ? 'text-warning' :
            'text-surface-400'
          }`}
        >
          {formatEvent(e.tick, e.event)}
        </div>
      ))}
    </div>
  );
}

function PostDuelBreakdown({ result, combatLog }: { result: DuelResult; combatLog: CombatLog }) {
  const totalDamage = [0, 0];
  const totalHealing = [0, 0];
  const critCount = [0, 0];
  const attackCount = [0, 0];

  for (const tick of combatLog.ticks) {
    for (const event of tick.events) {
      if (event.type === 'attack') {
        totalDamage[event.attacker] += event.damage;
        attackCount[event.attacker]++;
        if (event.isCrit) critCount[event.attacker]++;
      }
      if (event.type === 'lifesteal') totalHealing[event.player] += event.healed;
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

export function Duel() {
  const { code } = useParams();
  const navigate = useNavigate();

  const gateway = useMatchGateway(code!);
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

  const [playbackTick, setPlaybackTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [viewMode, setViewMode] = useState<'pixi' | 'text'>('pixi');
  const [showCelebration, setShowCelebration] = useState(false);
  const animationRef = useRef<number>(0);

  // Run the duel (engine simulation) when we enter duel phase
  useEffect(() => {
    if (phase?.kind === 'duel' && matchState) {
      // Check if this round's duel hasn't been run yet
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

  // Playback animation
  useEffect(() => {
    if (!isPlaying || !currentLog) return;

    const maxTick = currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0;

    const step = () => {
      setPlaybackTick((prev) => {
        if (prev >= maxTick) {
          // Don't call setState inside setState — return value and handle in effect
          return prev;
        }
        return prev + 1;
      });
      animationRef.current = requestAnimationFrame(step);
    };

    animationRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, currentLog]);

  // Handle playback completion — separate effect to avoid setState inside setState
  useEffect(() => {
    if (!currentLog || isPlaying) return;
    const maxTick = currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0;
    if (playbackTick >= maxTick && maxTick > 0 && !showBreakdown) {
      setIsPlaying(false);
      setShowBreakdown(true);
      if (currentLog.result.winner === 0) {
        setShowCelebration(true);
      }
    }
  }, [playbackTick, currentLog, isPlaying, showBreakdown]);

  // Compute HP at current playback tick
  const hpState = useMemo(() => {
    if (!currentLog || !player0 || !player1) return null;
    const reg = getRegistry();
    const stats0 = calculateStats(player0.loadout, reg);
    const stats1 = calculateStats(player1.loadout, reg);
    let hp = [stats0.maxHP, stats1.maxHP];
    const maxHp = [...hp];

    for (const tick of currentLog.ticks) {
      if (tick.tick > playbackTick) break;
      for (const event of tick.events) {
        if (event.type === 'hp_change') {
          hp[event.player] = event.newHP;
        }
      }
    }

    return { hp, maxHp, stats: [stats0, stats1] as [DerivedStats, DerivedStats] };
  }, [currentLog, playbackTick, player0, player1, getRegistry]);

  // Collect events up to current tick for the log
  const visibleEvents = useMemo(() => {
    if (!currentLog) return [];
    const events: { tick: number; event: TickEvent }[] = [];
    for (const tick of currentLog.ticks) {
      if (tick.tick > playbackTick) break;
      for (const event of tick.events) {
        events.push({ tick: tick.tick, event });
      }
    }
    return events;
  }, [currentLog, playbackTick]);

  useDuelSounds(visibleEvents, isPlaying, showBreakdown, currentResult);

  const handleContinue = () => {
    // Navigate to next phase
    if (phase?.kind === 'draft') {
      navigate(`/match/${code}/draft`, { replace: true });
    } else if (phase?.kind === 'forge') {
      navigate(`/match/${code}/forge`, { replace: true });
    } else if (phase?.kind === 'complete') {
      navigate(`/match/${code}/result`, { replace: true });
    } else if (phase?.kind === 'adapt') {
      navigate(`/match/${code}/forge`, { replace: true });
    }
  };

  // Auto-navigate when phase changes away from duel
  useEffect(() => {
    if (phase?.kind === 'draft') {
      setShowBreakdown(true);
    } else if (phase?.kind === 'complete') {
      setShowBreakdown(true);
    }
  }, [phase]);

  if (!matchState) {
    return <Navigate to="/queue" replace />;
  }

  // currentLog/hpState may not be ready yet (duel simulation runs in useEffect)
  if (!currentLog || !hpState) {
    return null;
  }

  const round = currentResult?.round ?? 1;

  return (
    <div className="page-enter flex h-full flex-col p-3">
      {!code?.startsWith('ai-') && <DisconnectOverlay isDisconnected={isDisconnected} secondsLeft={secondsLeft} />}
      {showCelebration && <CelebrationOverlay onComplete={() => setShowCelebration(false)} />}

      {/* ═══ TOP: Opponent HP + round info ═══ */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between">
          <span
            className="text-xs font-bold uppercase text-danger"
            style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.06em' }}
          >
            Opponent
          </span>
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
            <span
              className="ml-1 text-xs text-surface-400"
              style={{ fontFamily: 'var(--font-family-display)' }}
            >
              Round {round}
            </span>
          </div>
        </div>
        <HPBar current={hpState.hp[1]} max={hpState.maxHp[1]} label="AI" side="left" />
      </div>

      {/* Playback controls */}
      <div className="mb-2 flex items-center gap-2">
        <button
          onClick={() => {
            if (!isPlaying) {
              if (playbackTick >= (currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0)) {
                setPlaybackTick(0);
                setShowBreakdown(false);
                setShowCelebration(false);
              }
              setIsPlaying(true);
            } else {
              setIsPlaying(false);
            }
          }}
          className="rounded bg-surface-600 px-3 py-1 text-sm text-white hover:bg-surface-500"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          onClick={() => {
            setPlaybackTick(currentLog.ticks[currentLog.ticks.length - 1]?.tick ?? 0);
            setIsPlaying(false);
            setShowBreakdown(true);
            if (currentLog.result.winner === 0) setShowCelebration(true);
          }}
          className="rounded bg-surface-600 px-3 py-1 text-sm text-surface-400 hover:bg-surface-500"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          Skip
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'pixi' ? 'text' : 'pixi')}
            className="rounded bg-surface-700 px-2 py-0.5 text-xs text-surface-400 hover:bg-surface-600"
          >
            {viewMode === 'pixi' ? 'Text View' : 'Visual View'}
          </button>
          <span className="stat-number text-xs text-surface-400">
            {(playbackTick / 30).toFixed(1)}s / {currentResult ? currentResult.duration.toFixed(1) : '?'}s
          </span>
        </div>
      </div>

      {/* Duel view — mobile: canvas stacked above log; desktop: side-by-side */}
      {viewMode === 'pixi' && hpState ? (
        <div className="flex flex-1 flex-col gap-2 overflow-hidden">
          <div className="flex-1" style={{ minHeight: 280 }}>
            <DuelRenderer
              combatLog={currentLog}
              stats={hpState.stats}
              currentTick={playbackTick}
              isPlaying={isPlaying}
            />
          </div>
          <div
            className="max-h-32 overflow-hidden rounded-lg border border-surface-600 bg-surface-800 p-2"
            style={{ boxShadow: 'var(--shadow-card)' }}
          >
            <EventLog events={visibleEvents.slice(-5)} maxHeight="120px" />
          </div>
        </div>
      ) : (
        <div
          className="flex-1 overflow-hidden rounded-lg border border-surface-600 bg-surface-800 p-3"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <EventLog events={visibleEvents} maxHeight="100%" />
        </div>
      )}

      {/* ═══ BOTTOM: Player HP ═══ */}
      <div className="mt-2">
        <HPBar current={hpState.hp[0]} max={hpState.maxHp[0]} label="You" side="left" />
        <span
          className="mt-0.5 block text-xs uppercase text-accent-400"
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.06em' }}
        >
          You
        </span>
      </div>

      {/* Post-duel breakdown */}
      {showBreakdown && currentResult && (
        <div style={{ animation: 'slide-up 0.2s ease-out' }} className="mt-2 space-y-3">
          <PostDuelBreakdown result={currentResult} combatLog={currentLog} />
          <button
            onClick={handleContinue}
            className="w-full rounded-lg bg-gradient-to-b from-accent-400 to-accent-500 py-3 font-bold text-surface-900"
            style={{ boxShadow: 'var(--shadow-button)', fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
          >
            {phase?.kind === 'complete' ? 'SEE RESULTS' :
             phase?.kind === 'draft' ? 'CONTINUE TO DRAFT' :
             'CONTINUE TO FORGE'}
          </button>
        </div>
      )}
    </div>
  );
}
