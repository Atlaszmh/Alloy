import { useState, useEffect, useRef } from 'react';
import type { MatchGateway } from '@/gateway/types';
import { getSupabase } from '@/shared/utils/supabase';

interface UseDisconnectTimerResult {
  isDisconnected: boolean;
  secondsLeft: number;
}

const RECONNECT_TIMEOUT_SECONDS = 60;

export function useDisconnectTimer(gateway: MatchGateway): UseDisconnectTimerResult {
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RECONNECT_TIMEOUT_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const roomCode = gateway.code;

  useEffect(() => {
    const unsubscribe = gateway.onEvent((event) => {
      if (event.kind === 'opponent_disconnected') {
        setIsDisconnected(true);
        setSecondsLeft(RECONNECT_TIMEOUT_SECONDS);

        // Start countdown
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              clearInterval(timerRef.current);
              // Forfeit — opponent timed out
              const supabase = getSupabase();
              if (supabase) {
                supabase.functions.invoke('forfeit', {
                  body: { roomCode },
                });
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (event.kind === 'opponent_reconnected') {
        setIsDisconnected(false);
        setSecondsLeft(RECONNECT_TIMEOUT_SECONDS);
        clearInterval(timerRef.current);
      }
    });

    return () => {
      unsubscribe();
      clearInterval(timerRef.current);
    };
  }, [gateway, roomCode]);

  return { isDisconnected, secondsLeft };
}
