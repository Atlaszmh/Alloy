import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '@/shared/utils/supabase';

type QueueStatus = 'idle' | 'queued' | 'matched' | 'error';

interface UseMatchmakingResult {
  status: QueueStatus;
  matchId: string | null;
  queueTime: number; // seconds
  joinQueue: () => Promise<void>;
  leaveQueue: () => Promise<void>;
}

export function useMatchmaking(): UseMatchmakingResult {
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [queueTime, setQueueTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Track queue time
  useEffect(() => {
    if (status === 'queued') {
      setQueueTime(0);
      timerRef.current = setInterval(() => {
        setQueueTime((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  const joinQueue = useCallback(async () => {
    const supabase = getSupabase();

    setStatus('queued');

    const { data, error } = await supabase.functions.invoke('matchmaking', {
      body: { action: 'join' },
    });

    if (error) {
      setStatus('error');
      return;
    }

    const result = data as { status: string; matchId?: string };
    if (result.status === 'matched' && result.matchId) {
      setMatchId(result.matchId);
      setStatus('matched');
    }
    // Otherwise stay in 'queued' status — match will come via broadcast
  }, []);

  const leaveQueue = useCallback(async () => {
    const supabase = getSupabase();

    await supabase.functions.invoke('matchmaking', {
      body: { action: 'leave' },
    });

    setStatus('idle');
    setMatchId(null);
    setQueueTime(0);
  }, []);

  return { status, matchId, queueTime, joinQueue, leaveQueue };
}
