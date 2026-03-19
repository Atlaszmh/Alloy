import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useMatchGateway } from '@/gateway';
import { CelebrationOverlay } from '@/components/CelebrationOverlay';
import type { CombatLog } from '@alloy/engine';

function MatchStatistics({ duelLogs }: { duelLogs: CombatLog[] }) {
  const stats = useMemo(() => {
    let totalDamage = [0, 0];
    let totalHealing = [0, 0];
    let critHits = [0, 0];
    let attacks = [0, 0];

    for (const log of duelLogs) {
      for (const tick of log.ticks) {
        for (const event of tick.events) {
          if (event.type === 'attack') {
            totalDamage[event.attacker] += event.damage;
            attacks[event.attacker]++;
            if (event.isCrit) critHits[event.attacker]++;
          }
          if (event.type === 'lifesteal') {
            totalHealing[event.player] += event.healed;
          }
        }
      }
    }

    return { totalDamage, totalHealing, critHits, attacks };
  }, [duelLogs]);

  const statRows = [
    { label: 'Total Damage', player: Math.round(stats.totalDamage[0]), ai: Math.round(stats.totalDamage[1]) },
    { label: 'Total Healing', player: Math.round(stats.totalHealing[0]), ai: Math.round(stats.totalHealing[1]) },
    { label: 'Critical Hits', player: stats.critHits[0], ai: stats.critHits[1] },
    { label: 'Total Attacks', player: stats.attacks[0], ai: stats.attacks[1] },
  ];

  return (
    <div className="w-full max-w-md rounded-lg border border-surface-600 bg-surface-800 p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
      <h3
        className="mb-3 text-sm font-bold uppercase text-surface-400"
        style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.04em' }}
      >
        Match Statistics
      </h3>
      <div className="mb-2 flex justify-between text-xs text-surface-400">
        <span style={{ fontFamily: 'var(--font-family-display)' }}>YOU</span>
        <span />
        <span style={{ fontFamily: 'var(--font-family-display)' }}>AI</span>
      </div>
      <div className="space-y-2">
        {statRows.map(({ label, player, ai }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span className="stat-number w-16 text-right text-white">{player}</span>
            <span className="flex-1 text-center text-surface-400" style={{ fontFamily: 'var(--font-family-display)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
            <span className="stat-number w-16 text-white">{ai}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PostMatch() {
  const { code } = useParams();
  const navigate = useNavigate();

  const gateway = useMatchGateway(code!);
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return gateway.subscribe(() => forceUpdate((n) => n + 1));
  }, [gateway]);

  const matchState = gateway.getState();
  const phase = matchState?.phase ?? null;
  const roundResults = matchState?.roundResults ?? [];
  const duelLogs = matchState?.duelLogs ?? [];
  const reset = useMatchStore((s) => s.reset);

  const winner = phase?.kind === 'complete' ? phase.winner : null;
  const scores = phase?.kind === 'complete' ? phase.scores : [0, 0];
  const isVictory = winner === 0;
  const isDraw = winner === 'draw';

  const handlePlayAgain = () => {
    reset();
    navigate('/queue');
  };

  const handleMainMenu = () => {
    reset();
    navigate('/');
  };

  return (
    <div className="page-enter flex h-full flex-col items-center justify-center gap-6 p-6">
      {isVictory && <CelebrationOverlay />}

      <h2
        className={`text-4xl font-bold ${
          isDraw ? 'text-surface-400' : isVictory ? 'text-accent-400' : 'text-danger'
        }`}
        style={{
          fontFamily: 'var(--font-family-display)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          ...(isVictory
            ? { textShadow: '0 0 24px rgba(224, 188, 74, 0.5), 0 0 48px rgba(224, 188, 74, 0.2)' }
            : !isDraw
              ? { animation: 'shake 0.4s ease-out' }
              : {}),
        }}
      >
        {isDraw ? 'DRAW!' : isVictory ? 'VICTORY!' : 'DEFEAT'}
      </h2>

      <p className="text-lg text-surface-400" style={{ fontFamily: 'var(--font-family-display)' }}>
        Score: <span className="stat-number text-white">{scores[0]}</span> — <span className="stat-number text-white">{scores[1]}</span>
      </p>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {roundResults.map((r, i) => (
          <div
            key={`round-${i}-${r.round}`}
            className={`flex items-center justify-between rounded-lg border-l-4 px-4 py-2 ${
              r.winner === 0
                ? 'border-l-success bg-success/10'
                : 'border-l-danger bg-danger/10'
            }`}
            style={{
              animation: `scale-in 0.25s cubic-bezier(0.34,1.56,0.64,1) ${i * 0.2}s both`,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <span
              className="text-sm font-medium text-surface-400"
              style={{ fontFamily: 'var(--font-family-display)' }}
            >
              Round {i + 1}
            </span>
            <span
              className={`text-sm font-bold ${r.winner === 0 ? 'text-success' : 'text-danger'}`}
              style={{ fontFamily: 'var(--font-family-display)' }}
            >
              {r.winner === 0 ? 'Won' : 'Lost'}
            </span>
            <span className="stat-number text-xs text-surface-400">
              {Math.round(r.finalHP[0])} vs {Math.round(r.finalHP[1])} HP
            </span>
          </div>
        ))}
      </div>

      {/* Match statistics */}
      {duelLogs.length > 0 && <MatchStatistics duelLogs={duelLogs} />}

      <div className="flex gap-3">
        <button
          onClick={handlePlayAgain}
          className="rounded-lg bg-accent-500 px-6 py-3 font-semibold text-surface-900 hover:bg-accent-400"
          style={{ boxShadow: 'var(--shadow-button)', fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
        >
          Play Again
        </button>
        <button
          onClick={handleMainMenu}
          className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white hover:bg-surface-500"
          style={{ fontFamily: 'var(--font-family-display)' }}
        >
          Main Menu
        </button>
      </div>
    </div>
  );
}
