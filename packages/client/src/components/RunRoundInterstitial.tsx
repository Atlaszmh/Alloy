import type { RunState } from '@alloy/engine';

interface FluxBreakdown {
  win: number;
  discovery: number;
  milestone: number;
  total: number;
}

interface RunRoundInterstitialProps {
  roundNumber: number;
  won: boolean;
  before: RunState;
  after: RunState;
  fluxEarned: FluxBreakdown;
  discoveriesThisRound: number;
  streakJustTriggered: boolean;
  milestoneJustHit: boolean;
  onContinue: () => void;
}

/**
 * Fat between-round interstitial. Reports what happened in the round that just
 * finished: verdict, lives change (with reason), streak progress, flux earned,
 * and discoveries this round. All props are pure data — the engine-side
 * preview (previewRoundResult) does the math so this component is purely view.
 */
export function RunRoundInterstitial({
  roundNumber,
  won,
  before,
  after,
  fluxEarned,
  discoveriesThisRound,
  streakJustTriggered,
  milestoneJustHit,
  onContinue,
}: RunRoundInterstitialProps) {
  const livesBefore = before.lives;
  const livesAfter = after.lives;
  const gainedLife = livesAfter > livesBefore;
  const livesToShow = Math.max(livesAfter, livesBefore, before.startingLives);

  // Streak progress (pre-recovery state): show only when the player has a
  // non-zero streak but hasn't JUST triggered the recovery (that's shown as
  // the life-gain callout instead).
  const streakThreshold = before.lifeRecovery.winStreak;
  const streakShown = after.consecutiveWins;
  const roundsToStreak = Math.max(0, streakThreshold - streakShown);
  const showStreakProgress =
    !streakJustTriggered && won && streakThreshold > 0 && streakShown > 0 && roundsToStreak > 0;

  // Life-gain callout reason (only if a life was actually gained)
  let lifeGainReason: string | null = null;
  if (gainedLife) {
    if (streakJustTriggered && milestoneJustHit) {
      lifeGainReason = `+1 LIFE — ${streakThreshold}-win streak + milestone round`;
    } else if (streakJustTriggered) {
      lifeGainReason = `+1 LIFE — ${streakThreshold}-win streak`;
    } else if (milestoneJustHit) {
      lifeGainReason = `+1 LIFE — round ${roundNumber} milestone`;
    } else {
      // Discovery threshold or other — fall back to a generic message
      lifeGainReason = '+1 LIFE — discovery bonus';
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        animation: 'fade-in 0.3s ease-out',
      }}
      data-testid="run-round-interstitial"
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        {/* Round label */}
        <p
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'var(--text-sm)',
            letterSpacing: '0.08em',
            color: 'var(--color-surface-400)',
            textTransform: 'uppercase',
            animation: 'slide-up 0.25s ease-out 0s both',
          }}
        >
          Round {roundNumber}
        </p>

        {/* Verdict */}
        <h2
          style={{
            fontFamily: 'var(--font-family-display)',
            fontSize: 'clamp(1.5rem, 6vw, 2.5rem)',
            fontWeight: 900,
            letterSpacing: '0.06em',
            color: won ? 'var(--color-success)' : 'var(--color-danger)',
            textShadow: won
              ? '0 0 24px rgba(74, 222, 128, 0.4)'
              : '0 0 24px rgba(248, 113, 113, 0.4)',
            animation: 'slide-up 0.25s ease-out 0.15s both',
          }}
        >
          {won ? 'VICTORY' : 'DEFEAT'}
        </h2>

        {/* Lives row */}
        <div
          className="flex items-center gap-2"
          style={{ animation: 'slide-up 0.25s ease-out 0.3s both' }}
          data-testid="interstitial-lives"
        >
          {Array.from({ length: livesToShow }, (_, i) => {
            const isActive = i < livesAfter;
            const isNewlyGained = gainedLife && i === livesAfter - 1;
            return (
              <span
                key={i}
                style={{
                  fontSize: 'var(--text-lg)',
                  color: isActive ? 'var(--color-danger)' : 'var(--color-surface-600)',
                  textShadow: isActive ? '0 0 8px var(--color-danger)' : undefined,
                  display: 'inline-block',
                  transform: isNewlyGained ? 'scale(1.4)' : 'scale(1)',
                  transition: 'transform 0.3s ease-out, color 0.3s, text-shadow 0.3s',
                }}
              >
                {'\u2764'}
              </span>
            );
          })}
        </div>

        {/* Life-gain callout */}
        {lifeGainReason && (
          <p
            data-testid="life-gain-callout"
            style={{
              fontFamily: 'var(--font-family-display)',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--color-success)',
              textShadow: '0 0 12px rgba(74, 222, 128, 0.5)',
              animation: 'slide-up 0.25s ease-out 0.35s both',
            }}
          >
            {lifeGainReason}
          </p>
        )}

        {/* Streak progress (only if not just triggered) */}
        {showStreakProgress && (
          <p
            data-testid="streak-progress"
            style={{
              fontFamily: 'var(--font-family-display)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-surface-300)',
              letterSpacing: '0.03em',
              animation: 'slide-up 0.25s ease-out 0.4s both',
            }}
          >
            {'\uD83D\uDD25'} {streakShown}-win streak — {roundsToStreak} more for a life
          </p>
        )}

        {/* Flux breakdown */}
        {fluxEarned.total > 0 && (
          <div
            data-testid="flux-breakdown"
            style={{ animation: 'slide-up 0.25s ease-out 0.45s both' }}
            className="flex flex-col items-center gap-0.5"
          >
            <p
              style={{
                fontFamily: 'var(--font-family-display)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color: 'var(--color-accent-400)',
              }}
            >
              +{fluxEarned.total} FLUX
            </p>
            <div
              className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5"
              style={{
                fontFamily: 'var(--font-family-display)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-surface-400)',
                letterSpacing: '0.02em',
              }}
            >
              {fluxEarned.win > 0 && <span>win +{fluxEarned.win}</span>}
              {fluxEarned.discovery > 0 && <span>discovery +{fluxEarned.discovery}</span>}
              {fluxEarned.milestone > 0 && <span>milestone +{fluxEarned.milestone}</span>}
            </div>
          </div>
        )}

        {/* Discoveries this round */}
        {discoveriesThisRound > 0 && (
          <p
            data-testid="discoveries-this-round"
            style={{
              fontFamily: 'var(--font-family-display)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-accent-300)',
              letterSpacing: '0.03em',
              animation: 'slide-up 0.25s ease-out 0.5s both',
            }}
          >
            {'\u2605'} {discoveriesThisRound}{' '}
            {discoveriesThisRound === 1 ? 'discovery' : 'discoveries'} this round
          </p>
        )}

        {/* Continue button */}
        <button
          onClick={onContinue}
          className="mt-4 rounded-lg px-8 py-3 font-bold text-surface-900"
          style={{
            background: won
              ? 'linear-gradient(to bottom, var(--color-success), var(--color-success-dark, #16a34a))'
              : 'linear-gradient(to bottom, var(--color-accent-400), var(--color-accent-500))',
            fontFamily: 'var(--font-family-display)',
            letterSpacing: '0.04em',
            boxShadow: 'var(--shadow-button)',
            animation: 'slide-up 0.25s ease-out 0.55s both',
          }}
        >
          {livesAfter === 0 ? 'SEE RESULTS' : 'CONTINUE'}
        </button>
      </div>
    </div>
  );
}
