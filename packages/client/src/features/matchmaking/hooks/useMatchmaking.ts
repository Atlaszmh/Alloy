import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '@/shared/utils/supabase';
import { useAuthStore } from '@/stores/authStore';

type QueueStatus = 'idle' | 'queued' | 'matched' | 'error';

interface UseMatchmakingResult {
  status: QueueStatus;
  matchId: string | null;
  roomCode: string | null;
  queueTime: number; // seconds
  offerAi: boolean;
  joinQueue: () => Promise<void>;
  leaveQueue: () => Promise<void>;
}

export function useMatchmaking(): UseMatchmakingResult {
  const [status, setStatus] = useState<QueueStatus>('idle');
  const [matchId, setMatchId] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [queueTime, setQueueTime] = useState(0);
  const [offerAi, setOfferAi] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getSupabase>>['channel']> | null>(null);
  const playerId = useAuthStore((s) => s.playerId);

  // Track queue time and offer AI after 60 seconds
  useEffect(() => {
    if (status === 'queued') {
      setQueueTime(0);
      setOfferAi(false);
      timerRef.current = setInterval(() => {
        setQueueTime((t) => {
          const next = t + 1;
          if (next >= 60) setOfferAi(true);
          return next;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Clean up channel subscription on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (channelRef.current) {
        const supabase = getSupabase();
        if (supabase) {
          supabase.removeChannel(channelRef.current);
        }
        channelRef.current = null;
      }
    };
  }, []);

  const joinQueue = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[Matchmaking] Offline mode — cannot join queue');
      setStatus('error');
      return;
    }

    setStatus('queued');

    // Subscribe to personal channel for match_found events
    if (playerId) {
      const channel = supabase.channel(`user:${playerId}`);
      channel
        .on('broadcast', { event: 'match_found' }, (payload) => {
          const data = payload.payload as { matchId?: string; roomCode?: string } | undefined;
          if (data?.matchId) setMatchId(data.matchId);
          if (data?.roomCode) setRoomCode(data.roomCode);
          setStatus('matched');
          // Clean up channel after match found
          supabase.removeChannel(channel);
          channelRef.current = null;
        })
        .subscribe();
      channelRef.current = channel;
    }

    const { data, error } = await supabase.functions.invoke('matchmaking', {
      body: { action: 'join' },
    });

    if (error) {
      setStatus('error');
      // Clean up channel on error
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    const result = data as { status: string; matchId?: string; roomCode?: string };
    if (result.status === 'matched' && result.matchId) {
      setMatchId(result.matchId);
      setRoomCode(result.roomCode ?? null);
      setStatus('matched');
      // Clean up channel since we already got the match
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    }
    // Otherwise stay in 'queued' status — match will come via broadcast
  }, [playerId]);

  const leaveQueue = useCallback(async () => {
    const supabase = getSupabase();

    // Clean up channel
    if (channelRef.current && supabase) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (supabase) {
      await supabase.functions.invoke('matchmaking', {
        body: { action: 'leave' },
      });
    }

    setStatus('idle');
    setMatchId(null);
    setRoomCode(null);
    setQueueTime(0);
    setOfferAi(false);
  }, []);

  return { status, matchId, roomCode, queueTime, offerAi, joinQueue, leaveQueue };
}
