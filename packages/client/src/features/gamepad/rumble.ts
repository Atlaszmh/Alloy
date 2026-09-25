import { firstPad } from './gamepad';

export type RumbleKind = 'dodge' | 'perfect' | 'hurt';

const EFFECTS: Record<RumbleKind, { duration: number; strong: number; weak: number }[]> = {
  dodge: [{ duration: 60, strong: 0, weak: 0.35 }],
  perfect: [
    { duration: 90, strong: 0.9, weak: 0.6 },
    { duration: 90, strong: 0.9, weak: 0.6 },
  ],
  hurt: [{ duration: 120, strong: 0.8, weak: 0.3 }],
};

/** Shake the controller, if one is connected and supports it. Never throws. */
export function rumble(kind: RumbleKind): void {
  const actuator = firstPad()?.vibrationActuator;
  if (!actuator?.playEffect) return;
  EFFECTS[kind].forEach((e, i) => {
    actuator
      .playEffect?.('dual-rumble', {
        startDelay: i * 150,
        duration: e.duration,
        strongMagnitude: e.strong,
        weakMagnitude: e.weak,
      })
      ?.catch(() => {});
  });
}
