import { useEffect, useRef } from 'react';
import { soundManager } from '@/shared/utils/sound-manager';

/**
 * Unlocks the Web Audio context on the first user interaction.
 * Must be called once at the app root level.
 */
export function useAudioUnlock(): void {
  const unlocked = useRef(false);

  useEffect(() => {
    if (unlocked.current) return;

    const unlock = () => {
      if (unlocked.current) return;
      unlocked.current = true;
      soundManager.preload();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };

    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, []);
}
