import { useRunStore } from '@/stores/runStore';

export function RunLivesDisplay() {
  const lives = useRunStore((s) => s.lives);
  const maxDisplay = Math.max(lives, 5);

  return (
    <div data-testid="run-lives-display" className="flex items-center gap-1">
      {Array.from({ length: maxDisplay }, (_, i) => {
        const isFilled = i < lives;
        return (
          <span
            key={i}
            style={{
              fontSize: 'var(--text-md)',
              color: isFilled ? 'var(--color-danger)' : 'var(--color-surface-600)',
              textShadow: isFilled ? '0 0 6px var(--color-danger)' : undefined,
              transition: 'color 0.3s, text-shadow 0.3s',
            }}
          >
            {'\u2764'}
          </span>
        );
      })}
      <span
        data-testid="run-lives-count"
        data-lives={lives}
        style={{
          fontFamily: 'var(--font-family-display)',
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          color: lives <= 1 ? 'var(--color-danger)' : 'var(--color-surface-300)',
          marginLeft: 'var(--gap-xs)',
        }}
      >
        {lives} {lives === 1 ? 'life' : 'lives'}
      </span>
    </div>
  );
}
