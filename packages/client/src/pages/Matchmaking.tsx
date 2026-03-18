import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useAuthStore } from '@/stores/authStore';
import { useEffect } from 'react';

export function Matchmaking() {
  const navigate = useNavigate();
  const startLocalMatch = useMatchStore((s) => s.startLocalMatch);
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const playerId = useAuthStore((s) => s.playerId);

  useEffect(() => {
    if (!playerId) loginAsGuest();
  }, [playerId, loginAsGuest]);

  const handlePlayVsAI = (aiTier: 1 | 2 | 3 | 4 | 5) => {
    try {
      const seed = Math.floor(Math.random() * 999999);
      startLocalMatch(seed, 'ranked', aiTier);
      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}/draft`);
    } catch (err) {
      console.error('Failed to start match:', err);
      alert('Failed to start match: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-2xl font-bold text-accent-400">Choose Opponent</h2>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {([1, 2, 3, 4, 5] as const).map((tier) => (
          <button
            key={tier}
            onClick={() => handlePlayVsAI(tier)}
            className="rounded-lg bg-surface-600 px-6 py-3 text-left font-medium text-white transition-colors hover:bg-surface-500"
          >
            <span className="text-accent-400">Tier {tier}</span>
            <span className="ml-2 text-sm text-surface-400">
              {tier === 1 ? 'Random' : tier === 2 ? 'Basic' : tier === 3 ? 'Standard' : tier === 4 ? 'Advanced' : 'Expert'}
            </span>
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate('/')}
        className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
      >
        Back
      </button>
    </div>
  );
}
