import { useEffect, useRef } from 'react';
import { getSupabase } from '@/shared/utils/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface DraftSyncOptions {
  matchId: string;
  onOpponentPick: (orbUid: string, pickOrder: number) => void;
  onTimerSync: (timerEnd: number) => void;
  onPhaseChange: (phase: string, data: unknown) => void;
}

export function useDraftSync({ matchId, onOpponentPick, onTimerSync, onPhaseChange }: DraftSyncOptions) {
  const channelRef = useRef<RealtimeChannel | undefined>(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[DraftSync] Offline mode — no real-time sync');
      return;
    }

    const channel = supabase.channel(`match:${matchId}`);

    channel
      .on('broadcast', { event: 'draft:pick' }, (payload: any) => {
        onOpponentPick(payload.payload.orbUid, payload.payload.pickOrder);
      })
      .on('broadcast', { event: 'draft:timer_sync' }, (payload: any) => {
        onTimerSync(payload.payload.timerEnd);
      })
      .on('broadcast', { event: 'phase:forge' }, (payload: any) => {
        onPhaseChange('forge', payload.payload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [matchId, onOpponentPick, onTimerSync, onPhaseChange]);

  const sendPick = async (orbUid: string, playerIndex: number) => {
    const supabase = getSupabase();
    if (!supabase) {
      console.warn('[DraftSync] Offline mode — cannot send pick');
      return false;
    }

    // Call edge function for server validation
    const { error } = await supabase.functions.invoke('draft-pick', {
      body: { matchId, orbUid },
    });
    if (error) {
      console.error('Draft pick failed:', error);
      return false;
    }
    return true;
  };

  return { sendPick };
}
