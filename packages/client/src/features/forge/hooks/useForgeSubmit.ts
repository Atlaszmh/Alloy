import { getSupabase } from '@/shared/utils/supabase';
import type { Loadout } from '@alloy/engine';

interface ForgeSubmitOptions {
  matchId: string;
  round: number;
}

export function useForgeSubmit({ matchId, round }: ForgeSubmitOptions) {
  const submitBuild = async (loadout: Loadout) => {
    const supabase = getSupabase();

    const { data, error } = await supabase.functions.invoke('forge-submit', {
      body: {
        matchId,
        round,
        build: {
          weapon: loadout.weapon,
          armor: loadout.armor,
        },
      },
    });

    if (error) {
      console.error('Forge submit failed:', error);
      return false;
    }

    return true;
  };

  return { submitBuild };
}
