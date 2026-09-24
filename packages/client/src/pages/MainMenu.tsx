import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { isDiveActive, profilePower } from '@alloy/engine';
import { useUIStore } from '@/stores/uiStore';
import { useDelveStore } from '@/stores/delveStore';
import { getDelveRegistry } from '@/features/delve/registry';
import { formatNumber } from '@/features/delve/format';

export function MainMenu() {
  const navigate = useNavigate();
  const { devMode, toggleDevMode } = useUIStore();
  const profile = useDelveStore((s) => s.profile);
  const registry = getDelveRegistry();
  const power = useMemo(() => profilePower(registry, profile), [registry, profile]);
  const legendaries = Object.keys(profile.codex).length;
  const totalLegendaries = registry.getDelveData().legendaries.length;
  const active = isDiveActive(profile);
  const veteran = profile.stats.dives > 0;

  return (
    <div
      className="page-enter flex h-full min-h-0 flex-col items-center gap-9 overflow-y-auto p-6"
      style={{ justifyContent: 'safe center' }}
      data-screen-section="main-menu-root"
    >
      {/* Title with atmospheric glow */}
      <div className="relative text-center" data-screen-section="main-menu-title">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 blur-3xl"
          style={{
            width: '80%',
            maxWidth: 300,
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
          Delve. Loot. Forge. Repeat.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3" data-screen-section="main-menu-actions">
        {/* Delve — the loot crawler */}
        <button
          data-primary-action="delve"
          data-testid="menu-delve"
          onClick={() => navigate(active ? '/delve/run' : '/delve')}
          className="relative overflow-hidden rounded-lg bg-gradient-to-b from-accent-400 to-accent-500 px-6 py-4 text-surface-900 active:translate-y-px active:scale-[0.98]"
          style={{
            fontFamily: 'var(--font-family-display)',
            boxShadow:
              '0 4px 16px rgba(212, 168, 52, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.15)',
          }}
        >
          <span className="block text-2xl font-bold tracking-[0.1em]">
            {active ? 'RESUME DIVE' : 'DELVE'}
          </span>
          <span className="block text-xs font-semibold tracking-wide opacity-75">
            {veteran
              ? `Deepest ${profile.bestDepth} · Power ${formatNumber(power)} · ★ ${legendaries}/${totalLegendaries}`
              : 'Fight monsters · hunt legendary gear'}
          </span>
        </button>

        {/* Classic mode */}
        <button
          onClick={() => navigate('/queue')}
          className="rounded-lg border border-surface-500 bg-surface-700 px-5 py-3 text-white transition-all hover:border-surface-400 hover:bg-surface-600 active:translate-y-px active:scale-[0.98]"
          style={{
            fontFamily: 'var(--font-family-display)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            letterSpacing: '0.03em',
          }}
        >
          <span className="block font-semibold">Play Arena</span>
          <span className="block text-[11px] text-surface-300">
            Classic draft &amp; duel · AI or PvP
          </span>
        </button>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Gems', path: '/gems' },
            { label: 'Ranks', path: '/leaderboard' },
            { label: 'Profile', path: '/profile' },
          ].map(({ label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className="rounded-lg border border-surface-600 bg-surface-800 px-2 py-2.5 text-sm font-semibold text-surface-300 transition-all hover:border-surface-500 hover:bg-surface-700 active:translate-y-px active:scale-[0.98]"
              style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Dev Mode toggle */}
        <button
          onClick={toggleDevMode}
          className={`rounded-lg border px-5 py-2 text-sm font-medium transition-all active:translate-y-px ${
            devMode
              ? 'border-green-500/40 bg-green-500/10 text-green-400'
              : 'border-surface-600 bg-surface-800 text-surface-400 hover:border-surface-500 hover:bg-surface-700'
          }`}
          style={{ fontFamily: 'var(--font-family-display)', letterSpacing: '0.03em' }}
        >
          {devMode ? '● Dev Mode On' : 'Dev Mode'}
        </button>
      </div>
    </div>
  );
}
