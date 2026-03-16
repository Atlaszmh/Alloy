import { useEffect, useRef } from 'react';
import { getSupabase } from '@/shared/utils/supabase';

interface DraftSyncOptions {
  matchId: string;
  onOpponentPick: (orbUid: string, pickOrder: number) => void;
  onTimerSync: (timerEnd: number) => void;
  onPhaseChange: (phase: string, data: unknown) => void;
}

export function useDraftSync({ matchId, onOpponentPick, onTimerSync, onPhaseChange }: DraftSyncOptions) {
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>['channel']>>(undefined);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel(`match:${matchId}`);

    channel
      .on('broadcast', { event: 'draft:pick' }, (payload: any) => {
        onOpponentPick(payload.orbUid, payload.pickOrder);
      })
      .on('broadcast', { event: 'draft:timer_sync' }, (payload: any) => {
        onTimerSync(payload.timerEnd);
      })
      .on('broadcast', { event: 'phase:forge' }, (payload: any) => {
        onPhaseChange('forge', payload);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [matchId, onOpponentPick, onTimerSync, onPhaseChange]);

  const sendPick = async (orbUid: string, playerIndex: number) => {
    const supabase = getSupabase();
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
