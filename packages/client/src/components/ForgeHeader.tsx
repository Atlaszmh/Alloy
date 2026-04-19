import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import type { DerivedStats } from '@alloy/engine';
import { HapticButton } from '@/components/HapticButton';
import { Timer } from '@/components/Timer';

interface ForgeHeaderProps {
  round: number;
  stats: DerivedStats | null;
  timerDurationMs?: number;
  onTimerExpire?: () => void;
  onDone: () => void;
  baseStatSelectors?: ReactNode;
}

const DISPLAY_FONT = 'var(--font-family-display)';

export function ForgeHeader({
  round,
  stats,
  timerDurationMs,
  onTimerExpire,
  onDone,
  baseStatSelectors,
}: ForgeHeaderProps) {
  const showTimer = timerDurationMs !== undefined && onTimerExpire !== undefined;
  const navigate = useNavigate();

  return (
    <div
      className="shrink-0"
      data-screen-section="forge-header"
      style={{
        backgroundColor: 'var(--color-surface-900)',
        borderBottom: '1px solid var(--color-surface-600)',
      }}
    >
      {/* Row 1: Header bar */}
      <div className="flex items-center gap-2 px-3 py-1" style={{ minHeight: 'var(--text-lg)' }}>
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 700,
            fontSize: 'var(--text-md)',
            letterSpacing: '0.04em',
            color: 'var(--color-accent-500)',
          }}
        >
          FORGE PHASE
        </span>

        {/* Round pill */}
        <span
          className="rounded-full px-1.5"
          style={{
            fontFamily: DISPLAY_FONT,
            fontSize: 'var(--text-xs)',
            lineHeight: 1.5,
            color: 'var(--color-bronze-light)',
            backgroundColor: 'var(--color-surface-600)',
            border: '1px solid var(--color-surface-500)',
          }}
        >
          R{round}
        </span>

        {/* Timer — push to the right side (omitted in online run since it's async) */}
        {showTimer && (
          <div className="ml-auto">
            <Timer durationMs={timerDurationMs} onExpire={onTimerExpire} />
          </div>
        )}

        {/* Gem Library shortcut */}
        <button
          onClick={() => navigate('/gems')}
          className={`text-xs text-surface-400 hover:text-accent-400 ${showTimer ? '' : 'ml-auto'}`}
          style={{ fontFamily: 'var(--font-family-body)' }}
        >
          Gem Library
        </button>

        {/* Done button */}
        <HapticButton
          variant="primary"
          size="sm"
          onClick={onDone}
          data-primary-action="done-forging"
          className="min-h-[36px]"
        >
          DONE
        </HapticButton>
      </div>

      {/* Row 2: Stats row (flux moved inline into the Flux Actions block) */}
      <div
        className="flex items-center justify-center gap-3 px-3 py-1"
      >
        <StatItem label="HP" value={stats?.maxHP ?? 0} color="var(--color-success)" />
        <StatItem label="DMG" value={stats?.physicalDamage ?? 0} color="white" />
        <StatItem
          label="ARM"
          value={`${stats?.armor ?? 0}%`}
          color="var(--color-teal-500)"
        />
        <StatItem
          label="CRT"
          value={`${stats?.critChance ?? 0}%`}
          color={(stats?.critChance ?? 0) === 0 ? 'var(--color-danger)' : 'white'}
        />
      </div>

      {/* Row 3: Optional base stat selectors */}
      {baseStatSelectors}
    </div>
  );
}

function StatItem({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <span className="inline-flex items-baseline gap-0.5">
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontSize: 'var(--text-2xs)',
          textTransform: 'uppercase',
          color: 'var(--color-surface-300)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: DISPLAY_FONT,
          fontWeight: 700,
          fontSize: 'var(--text-xs)',
          color,
        }}
      >
        {value}
      </span>
    </span>
  );
}
