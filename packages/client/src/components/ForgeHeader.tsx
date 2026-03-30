import type { ReactNode } from 'react';
import { HapticButton } from '@/components/HapticButton';
import { Timer } from '@/components/Timer';

interface ForgeHeaderProps {
  round: 1 | 2 | 3;
  flux: number;
  maxFlux: number;
  stats: { maxHP: number; physicalDamage: number; armor: number; critChance: number };
  timerDurationMs: number;
  onTimerExpire: () => void;
  onDone: () => void;
  baseStatSelectors?: ReactNode;
}

const DISPLAY_FONT = 'var(--font-family-display)';

export function ForgeHeader({
  round,
  flux,
  maxFlux,
  stats,
  timerDurationMs,
  onTimerExpire,
  onDone,
  baseStatSelectors,
}: ForgeHeaderProps) {
  const fluxEmpty = flux === 0;
  const fluxLow = flux > 0 && flux <= 2;

  return (
    <div
      className="shrink-0"
      style={{
        backgroundColor: 'var(--color-surface-900)',
        borderBottom: '1px solid var(--color-surface-600)',
      }}
    >
      {/* Row 1: Header bar */}
      <div className="flex items-center gap-2 px-3 py-1" style={{ minHeight: 28 }}>
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 700,
            fontSize: 14,
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
            fontSize: 10,
            lineHeight: '18px',
            color: 'var(--color-bronze-light)',
            backgroundColor: 'var(--color-surface-600)',
            border: '1px solid var(--color-surface-500)',
          }}
        >
          R{round}
        </span>

        {/* Timer — push to the right side */}
        <div className="ml-auto">
          <Timer durationMs={timerDurationMs} onExpire={onTimerExpire} />
        </div>

        {/* Done button */}
        <HapticButton variant="primary" size="sm" onClick={onDone}>
          DONE
        </HapticButton>
      </div>

      {/* Row 2: Flux bar */}
      <div
        className={`flex flex-col items-center py-1 ${fluxEmpty ? 'animate-[timer-pulse_0.8s_ease-in-out_infinite]' : ''}`}
        style={{ minHeight: 40 }}
      >
        {/* Lightning bolts */}
        <div className="flex items-center gap-1">
          {Array.from({ length: maxFlux }, (_, i) => {
            const filled = i < flux;
            const shouldPulse = fluxLow && filled;
            return (
              <span
                key={i}
                className={shouldPulse ? 'animate-[timer-pulse_1.2s_ease-in-out_infinite]' : ''}
                style={{
                  fontSize: 18,
                  color: filled ? 'var(--color-warning)' : 'var(--color-surface-600)',
                  textShadow: filled ? '0 0 6px var(--color-warning)' : undefined,
                }}
              >
                ⚡
              </span>
            );
          })}
        </div>

        {/* Flux label */}
        <span
          style={{
            fontFamily: DISPLAY_FONT,
            fontWeight: 700,
            fontSize: 12,
            color: fluxEmpty ? 'var(--color-danger)' : 'var(--color-surface-300)',
          }}
        >
          {flux} / {maxFlux} FLUX
        </span>
      </div>

      {/* Row 3: Stats row */}
      <div
        className="flex items-center justify-center gap-3 px-3 py-1"
        style={{ minHeight: 24 }}
      >
        <StatItem label="HP" value={stats.maxHP} color="var(--color-success)" />
        <StatItem label="DMG" value={stats.physicalDamage} color="white" />
        <StatItem
          label="ARM"
          value={`${Math.round(stats.armor * 100)}%`}
          color="var(--color-teal-500)"
        />
        <StatItem
          label="CRT"
          value={`${Math.round(stats.critChance * 100)}%`}
          color={stats.critChance === 0 ? 'var(--color-danger)' : 'white'}
        />
      </div>

      {/* Row 4: Optional base stat selectors */}
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
          fontSize: 9,
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
          fontSize: 11,
          color,
        }}
      >
        {value}
      </span>
    </span>
  );
}
