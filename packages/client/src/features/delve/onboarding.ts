import { useDelveStore } from '@/stores/delveStore';
import { useUIStore } from '@/stores/uiStore';

/**
 * The screens that teach their main action on a first visit (the pad-first spec, 6), each with
 * the one line it shows over its footer while its main prompt pulses.
 */
export const ONBOARDING = {
  loadout: 'Equip what is better: ▲ marks an upgrade as it comes, and salvage turns the rest into materials.',
  skills: "Open a move's editor to change its kind, form and elements; apply when the chain reads right.",
  forge: 'Pick a pattern, then its flux, metal and lines, and forge the item.',
  quests: 'Claim a finished quest for its rewards; track one to keep it on screen in the dive.',
  stop: 'Take one power-up, then choose your road: deeper, or home with the haul.',
} as const;

/** The stop's line on a boons stop (the boons spec, 6); its seen key stays `stop`. */
export const BOON_HINT =
  'Take a boon: it lasts the dive. Then choose your road: deeper, or home with the haul.';

/** A screen with a first-visit hint. */
export type OnboardingId = keyof typeof ONBOARDING;

/**
 * A screen's first-visit hint: its line while this device hasn't done the screen's main action
 * (`uiStore.seen`), never on a guided save (Hesta teaches it) nor where `active` is false (the
 * pause's read-only hub). `done()` marks the action done, guided or not, so what the guided start
 * taught counts.
 */
export function useOnboarding(
  id: OnboardingId,
  active = true,
): { hint: string | undefined; done: () => void } {
  const seen = useUIStore((s) => s.seen.includes(id));
  const guided = useDelveStore((s) => s.profile.tutorial !== null);
  return {
    hint: active && !seen && !guided ? ONBOARDING[id] : undefined,
    done: () => useUIStore.getState().markSeen(id),
  };
}
