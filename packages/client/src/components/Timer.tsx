import { useCountdown } from '@/hooks/useCountdown';

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
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      {/* Number */}
      <div
        className={`stat-number text-lg ${textColor} ${pulseClass}`}
      >
        {seconds}s
      </div>

      {/* Progress bar */}
      <div
        className="h-1 overflow-hidden rounded-full bg-surface-600"
        style={{ width: 48 }}
      >
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: barColor,
            boxShadow: isUrgent ? `0 0 6px ${barColor}` : undefined,
          }}
        />
      </div>
    </div>
  );
}
