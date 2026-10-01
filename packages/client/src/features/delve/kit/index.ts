// The forge kit's public surface. Step 1·0 ships the types and a stub useUiScale; 1B and 1D fill in the rest.
export type * from './types';

/** Stub (step 1·0): 1B replaces it with the real hook reading the computed scales. */
export function useUiScale(): { ui: number; hud: number } {
  return { ui: 1, hud: 1 };
}
