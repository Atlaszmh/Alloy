import { useNavigate } from 'react-router';
import { useMatchStore } from '@/stores/matchStore';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState } from 'react';
import { getSupabase, isOnline } from '@/shared/utils/supabase';
import { useMatchmaking } from '@/features/matchmaking/hooks/useMatchmaking';

type View = 'menu' | 'ai-select' | 'finding-match' | 'waiting-for-friend' | 'join-match';

export function Matchmaking() {
  const navigate = useNavigate();
  const startLocalMatch = useMatchStore((s) => s.startLocalMatch);
  const initAuth = useAuthStore((s) => s.initAuth);
  const playerId = useAuthStore((s) => s.playerId);

  const [view, setView] = useState<View>('menu');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const online = isOnline();

  const {
    status: queueStatus,
    roomCode: matchRoomCode,
    queueTime,
    offerAi,
    joinQueue,
    leaveQueue,
  } = useMatchmaking();

  useEffect(() => {
    if (!playerId) initAuth();
  }, [playerId, initAuth]);

  // Navigate to match when queue finds one
  useEffect(() => {
    if (queueStatus === 'matched' && matchRoomCode) {
      navigate(`/match/${matchRoomCode}`);
    }
  }, [queueStatus, matchRoomCode, navigate]);

  // Listen for match_started when waiting for friend
  useEffect(() => {
    if (view !== 'waiting-for-friend' || !roomCode) return;

    const supabase = getSupabase();
    if (!supabase) return;

    const channel = supabase.channel(`match:${roomCode}`);
    channel
      .on('broadcast', { event: 'match_started' }, () => {
        navigate(`/match/${roomCode}`);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, roomCode, navigate]);

  const handlePlayVsAI = (aiTier: 1 | 2 | 3 | 4 | 5) => {
    try {
      const seed = Math.floor(Math.random() * 999999);
      startLocalMatch(seed, 'ranked', aiTier);
      const code = 'ai-' + Math.random().toString(36).substring(2, 8);
      navigate(`/match/${code}`);
    } catch (err) {
      console.error('Failed to start match:', err);
      setError('Failed to start match: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleFindMatch = async () => {
    setView('finding-match');
    setError(null);
    await joinQueue();
  };

  const handleCancelQueue = async () => {
    await leaveQueue();
    setView('menu');
  };

  const handlePlayAiWhileWaiting = () => {
    // Leave the queue and start an AI match
    leaveQueue();
    handlePlayVsAI(3);
  };

  const handleCreateMatch = async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('match-create', {
        body: { mode: 'unranked' },
      });

      if (fnError) {
        setError(fnError.message);
        setLoading(false);
        return;
      }

      const code = data?.roomCode;
      if (!code) {
        setError('No room code returned');
        setLoading(false);
        return;
      }

      setRoomCode(code);
      setView('waiting-for-friend');
    } catch (err) {
      setError('Failed to create match: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMatch = async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    const code = inputCode.trim().toUpperCase();
    if (!code) {
      setError('Please enter a room code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('match-join', {
        body: { roomCode: code },
      });

      if (fnError) {
        setError(fnError.message);
        setLoading(false);
        return;
      }

      navigate(`/match/${code}`);
    } catch (err) {
      setError('Failed to join match: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/match/${roomCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text for manual copy
    }
  };

  // --- VIEWS ---

  if (view === 'ai-select') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Choose AI Tier</h2>

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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={() => { setView('menu'); setError(null); }}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
        >
          Back
        </button>
      </div>
    );
  }

  if (view === 'finding-match') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Find Match</h2>

        <div className="flex flex-col items-center gap-3">
          <p className="animate-pulse text-lg text-white">
            Searching for opponent... {queueTime}s
          </p>

          {queueStatus === 'error' && (
            <p className="text-sm text-red-400">Failed to join queue. Please try again.</p>
          )}

          {offerAi && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-surface-500 bg-surface-700 p-4">
              <p className="text-sm text-surface-300">
                No opponents found yet. Play vs AI while you wait?
              </p>
              <button
                onClick={handlePlayAiWhileWaiting}
                className="rounded-lg bg-accent-600 px-6 py-3 font-medium text-white transition-colors hover:bg-accent-500"
              >
                Play vs AI
              </button>
            </div>
          )}
        </div>

        <button
          onClick={handleCancelQueue}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (view === 'waiting-for-friend') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Waiting for Opponent</h2>

        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-surface-400">Share this room code with a friend:</p>
          <div className="rounded-lg bg-surface-600 px-8 py-4 text-3xl font-mono font-bold tracking-widest text-white">
            {roomCode}
          </div>
          <button
            onClick={handleCopyLink}
            className="rounded-lg bg-surface-600 px-4 py-2 text-sm text-accent-400 transition-colors hover:bg-surface-500"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>

        <p className="animate-pulse text-sm text-surface-400">Waiting...</p>

        <button
          onClick={() => { setView('menu'); setRoomCode(''); setError(null); }}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (view === 'join-match') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Join Match</h2>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <input
            type="text"
            placeholder="Enter room code"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            className="rounded-lg bg-surface-600 px-4 py-3 text-center font-mono text-lg tracking-widest text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-accent-400"
            maxLength={8}
          />
          <button
            onClick={handleJoinMatch}
            disabled={loading || !inputCode.trim()}
            className="rounded-lg bg-accent-600 px-6 py-3 font-medium text-white transition-colors hover:bg-accent-500 disabled:opacity-50"
          >
            {loading ? 'Joining...' : 'Join'}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={() => { setView('menu'); setError(null); setInputCode(''); }}
          className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
        >
          Back
        </button>
      </div>
    );
  }

  // Default: menu view
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-2xl font-bold text-accent-400">Play</h2>

      <div className="flex w-full max-w-xs flex-col gap-3">
        <button
          onClick={() => setView('ai-select')}
          className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white transition-colors hover:bg-surface-500"
        >
          Play vs AI
        </button>

        {online && (
          <>
            <button
              onClick={handleFindMatch}
              className="rounded-lg bg-accent-600 px-6 py-3 font-medium text-white transition-colors hover:bg-accent-500"
            >
              Find Match
            </button>

            <button
              onClick={handleCreateMatch}
              disabled={loading}
              className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white transition-colors hover:bg-surface-500 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Match'}
            </button>

            <button
              onClick={() => { setView('join-match'); setError(null); }}
              className="rounded-lg bg-surface-600 px-6 py-3 font-medium text-white transition-colors hover:bg-surface-500"
            >
              Join Match
            </button>
          </>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={() => navigate('/')}
        className="mt-4 rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
      >
        Back
      </button>
    </div>
  );
}
