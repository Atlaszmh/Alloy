import { useEffect, useRef } from 'react';
import { useCountdown } from '@/hooks/useCountdown';
import { playSound } from '@/shared/utils/sound-manager';

interface TimerProps {
  durationMs: number;
  onExpire?: () => void;
  paused?: boolean;
  className?: string;
}

export function Timer({ durationMs, onExpire, paused = false, className = '' }: TimerProps) {
  const remaining = useCountdown(durationMs, onExpire, paused);
  const seconds = Math.ceil(remaining / 1000);
  const totalSeconds = Math.ceil(durationMs / 1000);
  const progress = remaining / durationMs;
  const prevSecondsRef = useRef(seconds);

  // Timer tick sounds for the last 10 seconds
  useEffect(() => {
    if (seconds !== prevSecondsRef.current && seconds <= 10 && seconds > 0) {
      playSound(seconds <= 3 ? 'timerUrgent' : 'timerTick');
    }
    prevSecondsRef.current = seconds;
  }, [seconds]);

  // Tiered urgency
  const isUrgent = seconds <= 5;
  const isWarning = seconds <= 10 && seconds > 5;

  const barColor = isUrgent
    ? 'var(--color-danger)'
    : isWarning
      ? 'var(--color-warning)'
      : 'var(--color-accent-500)';

  const textColor = isUrgent
    ? 'text-danger'
    : isWarning
      ? 'text-warning'
      : 'text-accent-400';

  const pulseClass = isUrgent
    ? 'animate-[timer-pulse_0.4s_ease-in-out_infinite]'
    : isWarning
      ? 'animate-[timer-pulse_0.8s_ease-in-out_infinite]'
      : '';

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {/* Label + countdown */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] tracking-wide" style={{ color: 'var(--color-bronze-400)' }}>
          Drag gems down · tap twice to pick
        </span>
        <span
          className={`stat-number text-sm font-bold ${textColor} ${pulseClass}`}
          style={{ fontFamily: 'var(--font-family-display)', minWidth: 28, textAlign: 'right' }}
        >
          {seconds}s
        </span>
      </div>

      {/* Full-width progress bar */}
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-600"
      >
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: barColor,
            boxShadow: isUrgent ? `0 0 8px ${barColor}` : undefined,
          }}
        />
      </div>
    </div>
  );
}
