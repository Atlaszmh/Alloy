import { useParams, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/shared/utils/supabase';

export function MatchEntry() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'error'>('loading');

  useEffect(() => {
    if (!code) {
      setError('No match code provided');
      setStatus('error');
      return;
    }

    // AI matches go straight to draft
    if (code.startsWith('ai-')) {
      navigate(`/match/${code}/draft`, { replace: true });
      return;
    }

    let cancelled = false;

    const joinOrResume = async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Online features are not available');
        setStatus('error');
        return;
      }

      try {
        // First try to fetch state (we may already be a participant)
        const { data: { session } } = await supabase.auth.getSession();
        const jwt = session?.access_token;

        if (jwt) {
          const baseUrl = import.meta.env.VITE_SUPABASE_URL;
          const res = await fetch(
            `${baseUrl}/functions/v1/match-state?roomCode=${encodeURIComponent(code)}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${jwt}`,
                'Content-Type': 'application/json',
              },
            },
          );

          if (res.ok) {
            const data = await res.json();
            const phase = data.state?.phase?.kind ?? 'draft';
            if (!cancelled) {
              navigate(`/match/${code}/${phase}`, { replace: true });
            }
            return;
          }
        }

        // Not a participant yet, try to join
        const { data, error: fnError } = await supabase.functions.invoke('match-join', {
          body: { roomCode: code },
        });

        if (cancelled) return;

        if (fnError) {
          setError(fnError.message);
          setStatus('error');
          return;
        }

        const phase = data?.phase ?? 'draft';
        navigate(`/match/${code}/${phase}`, { replace: true });
      } catch (err) {
        if (cancelled) return;
        setError('Failed to join match: ' + (err instanceof Error ? err.message : String(err)));
        setStatus('error');
      }
    };

    joinOrResume();

    return () => {
      cancelled = true;
    };
  }, [code, navigate]);

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
        <h2 className="text-2xl font-bold text-accent-400">Unable to Join Match</h2>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={() => navigate('/queue')}
          className="rounded-lg bg-surface-700 px-6 py-2 text-sm text-surface-400 hover:bg-surface-600"
        >
          Back to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-6">
      <h2 className="text-2xl font-bold text-accent-400">Joining Match...</h2>
      <p className="animate-pulse text-sm text-surface-400">Please wait</p>
    </div>
  );
}
