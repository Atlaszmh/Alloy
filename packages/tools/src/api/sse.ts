import { useEffect, useRef, useState } from 'react';
import { api } from './client.js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface ProgressData {
  progress: number;
  completed: number;
  total: number;
  status: string;
}

export function useSimulationProgress(runId: string | null) {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) return;

    const connect = () => {
      const es = new EventSource(`${BASE_URL}/api/simulations/${runId}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data: ProgressData = JSON.parse(event.data);
        setProgress(data);
        if (data.status === 'complete' || data.status === 'failed' || data.status === 'cancelled') {
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
        pollRef.current = setInterval(async () => {
          try {
            const run = await api.simulations.get(runId);
            setProgress({
              progress: run.progress,
              completed: Math.round(run.progress * run.match_count),
              total: run.match_count,
              status: run.status,
            });
            if (run.status !== 'running') {
              clearInterval(pollRef.current!);
              pollRef.current = null;
            }
          } catch {
            clearInterval(pollRef.current!);
            pollRef.current = null;
          }
        }, 2000);
      };
    };

    connect();
    return () => {
      eventSourceRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [runId]);

  return progress;
}
