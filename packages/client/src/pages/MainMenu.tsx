import { useNavigate } from 'react-router';

export function MainMenu() {
  const navigate = useNavigate();

  return (
    <div className="page-enter flex h-full flex-col items-center justify-center gap-10 p-6">
      {/* Title with atmospheric glow */}
      <div className="relative text-center">
        {/* Background glow */}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 blur-3xl"
          style={{
            width: 300,
            height: 200,
            background: 'radial-gradient(ellipse, rgba(212, 168, 52, 0.4), transparent 70%)',
          }}
        />
        <h1
          className="relative text-6xl font-bold tracking-[0.08em]"
          style={{
            fontFamily: 'var(--font-family-display)',
            color: 'var(--color-accent-400)',
            textShadow: '0 0 40px rgba(212, 168, 52, 0.3), 0 2px 4px rgba(0, 0, 0, 0.5)',
          }}
        >
          ALLOY
        </h1>
        <p
          className="relative mt-2 text-sm tracking-widest"
          style={{ color: 'var(--color-bronze-400)', fontFamily: 'var(--font-family-body)' }}
        >
          Forge. Fight. Prevail.
        </p>
      </div>

      {/* Buttons — vertical stack */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {/* Play button spans full width */}
        <button
          onClick={() => navigate('/queue')}
          className="rounded-lg bg-gradient-to-b from-accent-400 to-accent-500 px-6 py-4 text-lg font-bold tracking-wide text-surface-900 active:translate-y-px active:scale-[0.98]"
          style={{
            fontFamily: 'var(--font-family-display)',
            boxShadow: '0 4px 16px rgba(212, 168, 52, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
            letterSpacing: '0.06em',
          }}
        >
          PLAY
        </button>

        {[
          { label: 'Recipe Book', path: '/recipes' },
          { label: 'Collection', path: '/collection' },
          { label: 'Leaderboard', path: '/leaderboard' },
          { label: 'Profile', path: '/profile' },
        ].map(({ label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="rounded-lg border border-surface-500 bg-surface-700 px-5 py-3 font-semibold text-white transition-all hover:border-surface-400 hover:bg-surface-600 active:translate-y-px active:scale-[0.98]"
            style={{
              fontFamily: 'var(--font-family-display)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.03em',
            }}
          >
            {label}
          </button>
        ))}

        <button
          onClick={() => navigate('/settings')}
          className="rounded-lg border border-surface-600 bg-surface-800 px-5 py-3 font-medium text-surface-300 transition-all hover:border-surface-500 hover:bg-surface-700 active:translate-y-px"
          style={{
            fontFamily: 'var(--font-family-display)',
            letterSpacing: '0.03em',
          }}
        >
          Settings
        </button>
      </div>
    </div>
  );
}
